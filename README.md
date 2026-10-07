# Worn Gundidj CMS

Client and case management for Worn Gundidj Aboriginal Co-Operative — SEWB, AOD,
Justice, Cultural Strengthening, Disability/NDIS and First Peoples Home Ownership.

**This system holds personal health information.** It is covered by the Privacy
Act 1988 and the Australian Privacy Principles. All client data is stored in
Australia (Firestore, `australia-southeast1` — Sydney). Read
[Data and privacy](#data-and-privacy) before working on it.

---

## How it is built

A single-page application delivered as one HTML file. There is no build step and
no framework — `index.html` contains the markup, styles and all application
logic, and is deployed to Netlify as a static file.

| Layer | Technology |
|---|---|
| Hosting / CDN | Netlify (static) |
| Database | Cloud Firestore — Sydney |
| Authentication | Firebase Auth (email + password, optional SMS MFA) |
| File storage | Firebase Cloud Storage |
| Offline | Service worker + `localStorage`, syncing when connectivity returns |

The Firebase SDK is **self-hosted** in `vendor/firebase/` rather than loaded from
a CDN, so the Content Security Policy can stay tight and the app keeps working if
a CDN is unreachable.

## Repository layout

```
index.html                  The entire application
service-worker.js           Offline cache. Bump CACHE_NAME on every deploy
netlify.toml                Security headers and Content Security Policy

firebase.json               Firebase CLI config
.firebaserc                 Firebase project alias
firestore.rules             Database rules — CURRENTLY DEPLOYED
firestore.rules.strict      Database rules — role-based, NOT yet deployed
storage.rules               File rules — CURRENTLY DEPLOYED
storage.rules.strict        File rules — role-based, NOT yet deployed

functions/                  Cloud Functions that set role custom claims (not deployed)
scripts/                    One-off operational scripts
vendor/firebase/            Self-hosted Firebase SDK (compat build)

SECURITY-DEPLOY.md          How to roll out the strict rules safely
```

The `.strict` rule files are the hardened, role-aware versions. **Do not publish
them until the Cloud Functions in `functions/` are deployed and every staff
member has signed out and back in**, or managers will lose access. See
`SECURITY-DEPLOY.md`.

## Deploying

A deploy is three independent things. Netlify handles the app; the rules and
functions are deployed separately and do not happen automatically.

**1 — The application.** Merging to `main` triggers a Netlify build. Before
merging, bump `CACHE_NAME` in `service-worker.js` (for example `wg-cms-v67` →
`v68`) **and** `APP_VERSION` in `index.html` to match. Skipping this is the most
common cause of staff running an old build after a deploy. The version shows
under Sign Out, so anyone can check which build they have; a hard refresh
(Ctrl+Shift+R) picks up the latest.

**2 — Security rules.** Firebase Console → Firestore Database → Rules → paste
`firestore.rules` → Publish. Same for Storage with `storage.rules`. **Copy the
existing rules to a text file first** — that copy is the only rollback.

Verify immediately afterwards that anonymous access is still refused:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://firestore.googleapis.com/v1/projects/worn-gundidj-cms/databases/(default)/documents/teams/worngundidj/clients?pageSize=1"
# must print 403
```

Anything other than `403` means client records are readable without signing in.
Restore the previous rules immediately.

**3 — Cloud Functions.** Not currently deployed. Follow `SECURITY-DEPLOY.md`.

## Roles

| Role | Key | Can |
|---|---|---|
| System Manager | `sysmanager` | Everything, including Settings and Staff Accounts |
| Admin | `admin` | Manage clients, notes, reports |
| Supervisor | `supervisor` | Manage clients, notes, reports |
| Case Worker | `worker` | Day-to-day casework |
| Reception | `reception` | Front desk, walk-ins, appointments |

Roles sync across devices through the `staff` collection, so a role belongs to
the person rather than the browser they signed in on.

> **These roles are enforced in the browser only.** The deployed rules grant any
> signed-in staff account read and write access to every collection. Role-based
> access becomes a real security boundary only once the Cloud Functions and
> `.strict` rules are deployed. Do not describe the system as enforcing least
> privilege until then.

## Working on the code

`index.html` is around 900 KB and is edited in place. Serve the directory over
HTTP — opening the file directly breaks the service worker and Firebase auth:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Two conventions worth knowing before changing anything date-related or
funding-related:

**Dates.** Use `today()` / `localISO()` / `isoDate()`. Never build a calendar
date with `toISOString()` — it converts to UTC, and in Australian time zones
local midnight falls on the previous UTC day. That shifted the whole calendar by
a day and booked appointments on the wrong date. `toISOString()` is correct only
for genuine timestamps (audit entries, `created`).

**Episodes of care.** Only activity *explicitly* recorded against a program
counts toward the funding target: a case note whose Session Type is that
program, or time logged against it. Notes left as `GENERAL` and unlabelled time
are recorded but never counted, and First Peoples Home Ownership is excluded.
These figures are used for funding acquittal — never infer a program from
activity type or contact mode.

**Program structure.** SEWB is the umbrella program; AOD, Justice and Cultural
Strengthening sit under it. NDIS/Disability and First Peoples Home Ownership are
standalone. Every client — open or closed — is a SEWB client unless their only
programs are the standalone ones. This is enforced in one place,
`applySewbUmbrella()`, which every path that creates or saves a client calls.
Add any new client-creation path through it. Being SEWB is not the same as
earning a SEWB episode of care: episodes still need explicitly SEWB-typed
contacts, and AOD and Justice keep their own funding reports.

**Goals and outcomes.** A goal is a structured record: domain, starting score,
target and review date, re-scored at each review on one 0–10 scale rated with
the client (0 = not at all where I want to be, 10 = exactly where I want to be).
The starting score locks once a goal has been re-scored. The board Outcomes
report is de-identified and suppresses any group of fewer than 5 clients
(`SMALL_CELL`); keep that rule in any new outcome report.

**Closing a file is the end of an episode.** `closeClient()` opens the
end-of-episode review: final goal scores and outcomes, exit reason, referrals
made and exit feedback. It can be skipped only with a recorded reason.
Reopening a file starts a new episode (`episodeStart`).

**File completeness** is defined once, in `fileCompleteness()`. The AOD fields
checked for VADC are in `AOD_VADC_FIELDS` — keep that list in step with the
VADC pre-flight validation.

**Home Risk Assessment.** Every file has one (`homeRiskStatus()`). It expires
after 3 months, or sooner if the review date says so, and is re-triggered when
the address changes. Booking a home visit without a current assessment warns
and is audited; an assessment that says "No home visits" blocks the booking.

**CorePlus import** (Reports page) logs attended appointments as time, in
minutes, on existing files only — open or closed. The program comes from the
Appointment Type, never the Client Group. Every entry carries an `importKey`,
so re-importing an export never double-logs, and a deleted imported entry is
remembered so it doesn't come back.

**Time entries.** Time reaches the tracker four ways: Log Time, a calendar
event, a case note (only when the worker enters minutes — the box starts
blank), or the CorePlus import. Each entry records its `source`. Reports →
Review & remove time entries lets a manager remove wrong entries; removal is a
tracked delete and is audited.

**Client feedback.** Four plain-language questions, due after intake and at
mid-episode, and asked at exit through the review. The worker sends them from
their own email or phone and records the reply on the file. Messages carry the
client's first name only and no links.

## Data and privacy

- Client records never leave Australia. Firestore is pinned to Sydney and cannot
  be moved after creation.
- Case notes appear **only in individual client reports**, never in program or
  other aggregate reports. Program reports may show note *counts*, but never
  note text, follow-ups or time-log descriptions. Any new aggregate report must
  follow this — `programReportNotesPointer()` is the standard replacement.
- Unsaved note drafts (autosaved while a session note is being written) stay
  on the device, per worker and per client, and are never uploaded. They
  survive the 15-minute inactivity sign-out, are deleted by a deliberate Sign
  Out (after a warning), and expire after 7 days. Attachments are not kept.
- Never paste real client data into commits, issues, pull requests or logs.
- The audit log is append-only. It cannot be edited or deleted by anyone,
  including a System Manager — "Clear audit log" only clears the local view.
- Exports are encrypted. Without the passphrase they cannot be recovered, so it
  belongs in the organisation's password manager.
- When testing against production, verify by HTTP status code only. Do not
  retrieve client records.

## Known gaps

Tracked so they are not quietly forgotten:

- Server-side role enforcement is not deployed (`functions/` + `.strict` rules).
- Firebase App Check is registered but not enforced.
- MFA is available but not required for privileged accounts.
- Feedback requests are not sent automatically, and there is no public form
  for clients to answer online — both need a server-side component (email/SMS
  provider and a locked-down response endpoint).
- No independent penetration test has been carried out.
- A few minor settings (noticeboards, admin notes, reminders, organisation
  details) are still stored per-device and do not sync.

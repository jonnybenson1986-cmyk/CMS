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
no framework — `site/index.html` contains the markup, styles and all application
logic, and is deployed to Netlify as a static file.

| Layer | Technology |
|---|---|
| Hosting / CDN | Netlify (static) |
| Database | Cloud Firestore — Sydney |
| Authentication | Firebase Auth (email + password, optional SMS MFA) |
| File storage | Firebase Cloud Storage |
| Offline | Service worker + `localStorage`, syncing when connectivity returns |

The Firebase SDK is **self-hosted** in `site/vendor/firebase/` rather than loaded from
a CDN, so the Content Security Policy can stay tight and the app keeps working if
a CDN is unreachable.

## Repository layout

Only `site/` is published to the website (`publish = "site"` in netlify.toml);
everything else stays in the repository.

```
site/                       ← the website (all Netlify serves)
  index.html                The entire application
  service-worker.js         Offline cache. Bump CACHE_NAME on every deploy
  intake.html               Client's own intake form (opened from a texted link)
  intake/                   Intake form field list + logo, shared with the CMS
  data-health.js            Data Health schema + scoring (what a client file must hold)
  vpr.js                    Vulnerable Persons Register rules (four criteria, consent, revalidation)
  consent.html              The client's own consent form, opened from a link (/c#…)
  consent/consent-text.js   The consent wording (informed consent, choices, rights) — one place
  forms/wg-forms.css        The look of the client forms (the Emergency Contacts sheet's style)
  forms/signing.js          The signature pad (finger, stylus, mouse) and the "who is signing" block
  auth-redirect.html        Where Microsoft returns after Outlook sign-in
  handbook/                 SEWB Participant Handbook (PDF)
  vendor/firebase/          Self-hosted Firebase SDK (compat build)
  vendor/msal/              Self-hosted Microsoft sign-in library (Outlook)

netlify.toml                Publish folder, security headers, CSP, short links
firebase.json               Firebase CLI config
.firebaserc                 Firebase project alias
firestore.rules             Database rules — CURRENTLY DEPLOYED
firestore.rules.strict      Database rules — role-based, NOT yet deployed
storage.rules               File rules — CURRENTLY DEPLOYED
storage.rules.strict        File rules — role-based, NOT yet deployed

functions/                  Cloud Functions that set role custom claims (not deployed)
functions-sms/              Automatic text service (handbook + intake links) and its tests
scripts/                    One-off operational scripts
tests/rules/                Firestore and Storage rules tests (run by the GitHub workflow)
tests/browser/              End-to-end browser checks against a fake cloud (synthetic data)
tests/unit/                 Unit tests for site/data-health.js, site/vpr.js and site/teams.js (node --test)
.github/workflows/          Tests and publishes the Firestore rules

docs/TEAMS.md               Teams: Worn Gundidj, the Spare team and the Test team
docs/DEPLOY-FIREBASE.md     Publishing rules / text service from GitHub
docs/SECURITY-DEPLOY.md     How to roll out the strict rules safely
docs/PRIVACY-ASSESSMENT.md  Privacy law assessment: findings, what changed, what the organisation must do
docs/SMS-SETUP.md           Automatic texts: provider, budget, go-live
```

The `.strict` rule files are the hardened, role-aware versions. **Do not publish
them until the Cloud Functions in `functions/` are deployed and every staff
member has signed out and back in**, or managers will lose access. See
`docs/SECURITY-DEPLOY.md`.

## Deploying

A deploy is three independent things. Netlify handles the app; the rules and
functions are deployed separately and do not happen automatically.

**1 — The application.** Merging to `main` triggers a Netlify build. Before
merging, bump `CACHE_NAME` in `site/service-worker.js` (for example `wg-cms-v67` →
`v68`) **and** `APP_VERSION` in `site/index.html` to match. Skipping this is the most
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

**3 — Cloud Functions.** Not currently deployed. Follow `docs/SECURITY-DEPLOY.md`.

## ⚖️ Conflict of interest

* **Declaring (every worker):** client file → **⚖️ Conflict of interest** → *Declare a
  conflict of interest*. Connection (family or kinship, friend, community or cultural,
  work or business, past relationship, other), nature (actual / potential / perceived),
  the interest in their own words, and what it applies to (whole file or one program).
  A worker can only declare for themselves and sees only their own declarations.
* **The register (System Manager, Admin, Supervisor only):** Admin → **Conflict of
  Interest Register** — open / managed / closed tabs, a badge for ones waiting for
  review, *Allocated against advice*, and Print. Managers can also record one for a worker.
* **How it is managed** (set by a manager or supervisor, never by the person it is
  about — the security rules enforce this, and record who changed it):
  *Don't allocate this client to them* (the Assign workers and Key worker windows warn,
  and the register flags it) and *Hide this client's file from them* (applies to
  managers too). Notes and a status (open → managed → closed).
* A declaration can't be edited or deleted once made; close it when it no longer applies.
* Stored in `teams/<team>/coi` (rules: `validCoi`). Under the live rules any team member
  could technically read the collection — the app shows the register to managers and
  supervisors only; the strict rules enforce it once roles are in the sign-in token.

## 🏢 Teams (Worn Gundidj · Spare team · Test team)

Three teams share the system and are kept apart: each has its own clients,
notes, staff list, settings, files and audit log, and an account can only open
the teams it has been put in. **Full guide: [docs/TEAMS.md](docs/TEAMS.md).**

* **Worn Gundidj** — its records are exactly where they were; nothing moved.
  **Spare team** — empty, ready for another team. **Test team** — practice and
  training with made-up people only (orange banner).
* The teams are listed in `site/teams.js`. A page works in one team from load to
  reload (`ACTIVE_TEAM`): it sets the cloud path (`teams/<team>/…`) and which
  copy on the device is used, so records can't be mixed between teams.
* **Who can open what** is the document `members/<account id>`
  (`{ teams: [...] }`), checked by `firestore.rules` on every read and write
  and by `storage.rules` for files. The owner's account can open every team and
  manages the list in **Settings → 🏢 Teams** (tick teams, "can add staff", lock).
* **Moving in:** accounts from before teams are treated as Worn Gundidj and are
  listed the next time they sign in. When everyone is listed the owner presses
  **Lock**; after that an unlisted sign-in opens nothing.
* Client form links from another team carry the team: `/i#test.<link>`.
  Worn Gundidj links are unchanged.
* **By hand after release:** publish `storage.rules` in the Firebase console
  (Storage → Rules); it asks once to let Storage rules read Firestore — say yes.

## Outlook calendar sync

Each worker can put the CMS appointments booked for them into their own
Outlook calendar (one-way, CMS → Outlook; 30 days back to 6 months ahead).
Events are matched by a hidden id, so re-syncing updates rather than
duplicates, and appointments deleted in the CMS are removed. Only events the
CMS created are touched. They are marked Private, show the client's first
name and initial only, and carry no notes.

* Microsoft's sign-in library (MSAL 4.30, LTS) is **self-hosted** in
  `site/vendor/msal/` — the old alcdn.msauth.net CDN now returns 404.
* Microsoft returns the sign-in popup to `site/auth-redirect.html`, a blank page
  served **without** Cross-Origin-Opener-Policy. The app page uses
  `same-origin-allow-popups` (set for `/` and `/index.html` in netlify.toml).
  Either header on the return page, or `same-origin` on the app page, cuts
  the popup off and sign-in never finishes.
* Set-up (System Manager, once — also shown in Settings): one Azure app
  registration; Authentication → **Single-page application** redirect URI
  `https://<cms-address>/auth-redirect.html`; API permissions → Microsoft
  Graph → delegated `Calendars.ReadWrite` → Grant admin consent; paste the
  Application (client) ID and Directory (tenant) ID in Settings. They are
  shared with all staff via `appConfig/outlook`, mirrored to
  `staff/outlookSetup` (readable under the rules already published), so staff
  get them even before the newer rules are published.
  Staff then use **Connect Outlook / Sync to Outlook** on the Calendar page.
* Each worker connects once per computer. The connection belongs to the CMS
  user who made it — on a shared computer the next worker is never shown (or
  synced into) someone else's Outlook.
* **🩺 Check** (Calendar page and Settings) runs every step — set-up entered and
  shared, sign-in component, return page and its header, this worker's
  connection, Microsoft access, calendar permission, appointments to sync — and
  says in plain words which one fails and what to do.

## 🗄️ Archiving referrals

Referral Holding Bay → **🗄️ Archive** on any referral, or **Archive finished**
for all client-created and declined ones at once. Archived referrals leave the
Holding Bay (and its counters and "new referral" reminders) but are kept —
**Archived** lists them with who archived them and when, and **↩️ Restore**
puts one back. A referral still in progress asks before archiving. Archiving
and restoring are written to the referral's action log and the audit log. The
red ✕ still deletes permanently.

## ✍️ Writing tools

* **Session / case notes** (Log Session — also used by *Add note* and *Log time*)
  have a full editor: **Edit / Insert / Format / Table** menus; undo/redo;
  special characters (incl. letters used in Aboriginal languages, e.g. ŋ ṯ ḏ);
  date/time stamps; paragraph styles (headings, quote); font and size; bold,
  italic, underline, strikethrough, super/subscript; text and highlight colour;
  alignment; bullet and numbered lists; indent; tables (insert, add/delete
  rows and columns); pictures (attached to the session); clear formatting;
  UPPER/lower/Sentence case; word count. Spell check is Australian English.
* The original text box stays in the page, hidden, holding a **plain-text
  copy** — so drafts, validation, voice input, reports, exports, search and
  texts work unchanged. The formatted version is saved as `note.html` after
  `rteSanitize` (a short allow-list of tags and styles; scripts, images, links
  and event handlers are removed), and is sanitised again whenever shown.
  Pasting from Word or a web page keeps formatting but is cleaned the same way.
* **Every other text box** shows a small writing-tools bar when you click in:
  undo/redo, date/time, special characters, bullets, numbering, change case
  (Aa) and a word count, with Australian spell check. (Those boxes are plain
  text, so only plain-text tools are offered.) Not on the chat message box.

## 📷 Pasting pictures

* **Session notes (editor):** paste (Ctrl+V, right-click → Paste, or the 📋
  Paste button), drag in, or add with the 🖼 picture button (camera on a phone)
  — the **picture appears in the notes** where the cursor is, straight away,
  and is attached to the session / client's Files. Cut, Copy and Paste buttons
  are on the toolbar and in Edit; copying text with pictures inside the notes
  copies the pictures too. The saved note stores only a reference
  (`<img data-att="…">`, no address); the picture is filled in from that
  client's own attached file when shown, so a note can't load anything else.
* **Follow-up box:** paste a screenshot or copied photo (Ctrl+V / Cmd+V) — it is attached to the session (and the
  client's Files) and a `[📷 Picture n: …]` marker goes into the note where you
  pasted. Copied text still pastes normally. Attached pictures show as
  thumbnails before you save.
* **Files tab:** paste a picture to upload it straight to the client's files.
* Notes show their pictures as thumbnails; a picture opens full size **over**
  the client file (Esc closes the picture, not the file).

## 🔗 Merging duplicate client files

Managers see **possible duplicate client files** at the top of the Clients page
(same REF number, a file listed twice, or the same name with the same — or a
missing — date of birth), or use a file's **Actions → Merge with another file**.

* The file with the most information (details plus case notes, time and
  appointments) is chosen to keep — you can pick the other one.
* The preview shows exactly what happens: everything linked to the other file
  (case notes, time entries, appointments, tasks, walk-ins, intake forms, the
  referral link, automatic handbook texts) **moves** to the kept file; blank
  details are **filled in**; lists (services, goals, attachments…) are
  **combined**; the earliest start date, the higher risk level, restricted
  access and an open file win automatically; any other real difference (e.g.
  two phone numbers) is yours to choose.
* The other file is then removed for everyone (a tracked delete) and the kept
  file records `mergedFrom`. Audited. "Not the same person" stops a pair being
  suggested again.
* Cause of the duplicates: converting the same referral twice made a second
  file with the same REF number. Converting again now opens the existing file.

## 📲 Client intake form by link

A worker can send a client a link to fill in their own SEWB intake on their
phone or computer: client file → **Intake** tab → **📲 Intake form by link**.

* What's already on file is **filled in** for them. The questions are in
  `site/intake/intake-fields.js`, shared by the client page (`site/intake.html`, served at
  `/i`) and the CMS. Self-harm, family violence, court orders and safety at home
  are deliberately **not** on it — workers ask those in person.
* Send it as an automatic text (one SMS), from the worker's own phone, by
  email, or copy the link. The link works for 3, 7 or 14 days and can be
  cancelled at any time.
* The client's answers **save as they go** — they can stop and come back with
  the same link. Before sending they check every answer and tick a declaration.
* When it comes back: a toast, a card on the **Dashboard**, a banner on the
  Intake tab and a line under *Needs attention*. **Review** shows each answer
  next to what's on file; tick the ones to add (blank answers are unticked; services
  are only ever added). Applying opens the Intake tab to check with the client
  and Save. Audited by count only.
* **Security** (`intakeForms` / `intakeLinks` in `firestore.rules`): the link
  carries a random 128-bit id after `#` (never sent to the web server). When a
  date of birth is on file the form's id is SHA-256(link + ":" + DOB), so the
  link alone doesn't open it. A signed-out visitor can only open a form whose id
  they know — never list — only before it expires, can change only the intake
  answers, and can send it once, **signed** (see below). Tested against the
  Firestore emulator (`tests/rules`).
* **Signing.** The last step is *Sign your form*: a signature box that takes a
  finger, a stylus or a mouse (`site/forms/signing.js`), or — for anyone who
  can't draw one — a typed name. They can also sign for someone else as a
  parent, guardian or authorised representative, and name a support person or
  interpreter. The signature is a small PNG (a few KB) sent with the form; the
  rules refuse a submit without a well-formed one. The worker sees it in the
  review, it is kept on the file (`intakeSignature`) and printed with the intake.
  **📱 Open on this device** opens the link here, to hand a phone or tablet to the client.

## ✍️ Consent form by link (informed consent)

client file → **Intake** tab → *Consent* card → **✍️ Send / sign a consent form**,
or the **✍️ Consent forms** section of the file.

* The client's page (`site/consent.html`, served at `/c`) first explains what
  **informed consent** means (told · understand · your choice · you can change
  your mind, and who can sign for someone under 18 or who can't decide), then
  asks them to tap Yes or No on five choices — one is needed to give support, four
  are their own — then a **sharing section** (below), **when we must or may share
  without consent, including mandatory reporting**, their rights, five things to
  confirm, and a place to sign. Nothing is pre-ticked. A
  **🔊 Read this form to me** button reads the wording aloud on the phone.
* **Sharing with other people (third parties):** two lists — **professionals and
  services** (GP, NDIS provider, housing…) and **people in my life** (family,
  carer, Elder…). The client says Yes or No to each; for a Yes they name up to
  five people or services, tick *what* may be shared (contact and appointments,
  plan, health, progress notes, referrals, safety), say *why*, and whether that
  person may also tell Worn Gundidj things — then choose how long it lasts (6
  months, 12 months, or until they change it). The section explains their rights
  first: it's their choice, they choose what, only what is needed, other services
  have their own privacy rules, they can see and change it any time, and it ends
  on its own. The names are never kept on the phone.
* **Mandatory reporting:** a plain-English section says that, whatever the client
  ticks, some laws mean we must report (child abuse, sexual offences against a
  child under 16, NDIS serious incidents, court orders) or may share (a serious
  threat; family violence and child information sharing), and that we will tell
  them first where it is safe. They must tick that they understand it. **It
  describes the law in general terms — have management or a lawyer check it.**
* When a form is filed the record keeps who may be shared with, what, why and an
  end date; the file shows a **🤝 Who we may share information with** card and warns
  when that consent has ended or ends within 30 days. Earlier (v1) forms stay valid.
* The form is saved in **two writes** (the sharing list, then the signed answers)
  because Firestore rules cap how much one write can carry; the rules require the
  sharing to be saved before the form can be sent.
* **The wording is a plain-English draft** in `site/consent/consent-text.js`
  (`WG_CONSENT`). Worn Gundidj's management must approve it before it goes to
  clients. Change `VERSION` when it changes — every signed form records the
  version it was signed under.
* Send it by copy, text from the worker's phone, **email from the worker's own
  Outlook** (the Email page; no time is logged for it), or **📱 Open on this
  device** to hand a phone or tablet to the client. The link works 3, 7 or 14 days
  and asks for the client's date of birth (when one is on file).
* The client gets their own copy to save or print when they send it.
* When it comes back: a message, a card on the Dashboard, a line on the Intake.
  **Check and file it** shows who signed (and warns if the name isn't the
  client's), the signature and each choice. Filing puts a **signed record on the
  profile** (`consentRecords`: printable, counts as the signed consent document
  for Data Health) and fills in the intake's consent ticks from their choices.
  A later form replaces the ticks; earlier signed forms stay on file.
* Rules: `consentLinks` / `consentForms` in `firestore.rules` (and `.strict`),
  same pattern as the intake. The client can send only the answer keys in
  `consent-text.js`, once, signed. **Publish the new rules before sending links**
  (the deploy workflow does it when this is merged to `main`).
* Printed intake and signed consent use the look of the *Emergency Contacts &
  Supports* sheet (`site/forms/wg-forms.css` for the client pages).

## Publishing and texts

* `.github/workflows/firebase-deploy.yml` tests the rules (both files) and the
  text service on every pull request, and **publishes `firestore.rules` when
  merged to main**. Run it by hand to also deploy the SMS text service. Set-up,
  costs and go-live checklist: **docs/DEPLOY-FIREBASE.md**.
* Texts are plain characters within 160 = **one SMS** each (`/hb` and `/i` short
  links in netlify.toml). The text service stops at **$10 a month**
  (`SMS_MONTHLY_BUDGET`) and hands texts to workers' phones until the 1st;
  Settings → Automatic texts shows the month's spend.

## 💡 Ideas button

A light-globe button floats at the bottom right of every page (above the
phone menu bar; behind open windows, so it never covers a Save button). Any
staff member can send the System Manager an idea for improving the CMS — a
category, the idea (up to 2,000 characters, voice typing works) and,
automatically, the screen they were on. It warns, without blocking, if an idea
names a client or carries a phone number or email address.

* The System Manager's globe shows how many ideas are **New**; it opens to the
  **Inbox** (filters: Open / New / Done & not now / All), where each idea gets a
  status — Thinking about it, Planned, Done, Not now — and an optional reply.
* Staff see their ideas, status and any reply under **My ideas**.
* Stored in `ideas` (publish `firestore.rules`): anyone signed in can add one,
  only as themselves and only as New; updates can change only the review
  fields; nothing is ever deleted. Strict rules: only the System Manager reads
  them all and reviews; others read only their own.
* Until the rules are published, an idea is delivered to the System Manager
  as a chat message instead; if nothing can be reached it waits on the device
  and sends itself later. Sending and reviewing are audited (category and
  status only, never the idea text).

## Forgotten passwords

The sign-in page has a **Forgot password?** link. Firebase emails the person a
one-time link to set a new password on its own secure page; nobody else sees
the password. The reply is the same whether or not an account exists, so the
form can't be used to find out who has one. Customise the email in Firebase
Console → Authentication → Templates → Password reset (sender name, reply-to,
wording). Add the CMS web address under Authentication → Settings → Authorised
domains so the email's "Continue" button returns to the CMS.

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

`site/index.html` is around 1.3 MB and is edited in place. Serve the `site/`
folder over HTTP — opening the file directly breaks the service worker and Firebase auth:

```bash
python3 -m http.server 8000 --directory site   # then open http://localhost:8000
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
program, or time logged against it. Notes left as `GENERAL` (or blank) and
time left as "Not program-specific" count **once, toward SEWB** — the umbrella
program — never toward AOD or Justice as well (that would count one contact up
to three times), and not for NDIS- or Home Ownership-only clients. General time
on a day that already has a counted contact for the client is the same contact.
First Peoples Home Ownership is excluded. These figures are used for funding
acquittal — never infer AOD, Justice etc. from activity type or contact mode.

**Program structure.** SEWB is the umbrella program; AOD, Justice and Cultural
Strengthening sit under it. NDIS/Disability and First Peoples Home Ownership are
standalone. Every client — open or closed — is a SEWB client unless their only
programs are the standalone ones. This is enforced in one place,
`applySewbUmbrella()`, which every path that creates or saves a client calls.
Add any new client-creation path through it. Being SEWB is not the same as
earning a SEWB episode of care: episodes still need explicitly SEWB-typed
contacts, and AOD and Justice keep their own funding reports.

**Client profile.** A client's file opens on an Overview (last contact, notes,
time, goals, what needs attention, contact details, upcoming appointments).
Every other section is in one **Section** dropdown, grouped, with counts —
not a scrolling tab strip. Add note and Log time are one click; Edit, Assign
workers, Restrict access and Close sit in an **Actions** menu. **Add to
program** enrols a client in another program from the file: programs defined
once in `PROFILE_PROGRAMS`; AOD, Justice and Cultural also enrol them in SEWB
(the umbrella), NDIS and Home Ownership stand alone. It only adds a flag —
existing records are untouched — and is audited and kept in the file's
`programHistory`. Removing a program is still done in Edit, deliberately.

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

**SEWB Participant Handbook.** `site/handbook/SEWB-Participant-Handbook.pdf` is a
public document served with the app. When an intake is saved with a mobile
number and "Safe to leave calls/texts?" is Yes, the worker is offered a
ready-written text with a link to it (a text can't carry the PDF itself). It
is sent from the worker's own phone — the CMS has no SMS gateway — and each
send is recorded on the file and audited, with the number masked. It also
appears on every client's Files tab, can be recorded as given in person, and
an open file without it is flagged by the completeness check. Reports →
Handbook send-out works through existing clients who haven't had it. To
update the handbook, replace the PDF at the same path; links already sent
keep working. The service worker never caches it.

**Automatic handbook texts (optional).** A Cloud Function in `functions-sms/`
can send the handbook text itself — from Firebase through an SMS provider —
instead of the worker's phone. The app only asks (a client id in the
`smsOutbox` collection); the function re-checks staff, consent, mobile,
duplicates and an hourly cap from the client's own file, sends, and writes
the result back. It is off until a System Manager turns on Settings →
Automatic texts, and needs the setup in `docs/SMS-SETUP.md` first. Deploy only
`functions:sms` — never plain `--only functions`.

When it is on, saving an intake sends the text with no prompt, and the CMS
follows it: the worker is told when it has gone. If the function hasn't sent
it within a minute (not deployed, provider down), the provider refuses it, or
Firebase refuses the request (rules not published), a banner hands it back to
the worker — "Send it now" opens the text ready to send from their phone — so
the client leaves intake with the handbook either way. The banner never
replaces an open window. If the function sends it later anyway, it skips a
number that already has it.

The current handbook (October 2026) is a 12-page scan with no text layer;
the PDF is titled "SEWB Participant Handbook" so phones show the name.

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
  Until it is, within a team the roles (who sees the registers, who can manage a
  conflict of interest, restricted or hidden client files) are applied by the app only.
  `functions/` and `scripts/bootstrap-sysmanager.js` are still written for one team.
- `storage.rules` is published by hand (Firebase console); uploaded files are only
  separated by team once that is done. The team **Lock** is a manual step too (`docs/TEAMS.md`).
- Firebase App Check is registered but not enforced.
- MFA is available but not required for privileged accounts.
- Feedback requests are sent from the worker's own phone. The handbook text
  can be automatic, but only after the SMS function is set up and deployed
  (`docs/SMS-SETUP.md`).
- Feedback requests are not sent automatically, and there is no public form
  for clients to answer online — both need a server-side component (email/SMS
  provider and a locked-down response endpoint).
- No independent penetration test has been carried out.
- A few minor settings (noticeboards, admin notes, reminders, organisation
  details) are still stored per-device and do not sync.

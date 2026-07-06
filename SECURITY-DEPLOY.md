# Security deploy guide — roles, strict rules & audit immutability

This closes audit findings **#2** (any staff account can touch everything),
**#3** (role checks / note-lock are browser-only) and **#7** (mutable audit
log). Follow the phases **in order** — each is safe on its own, and the strict
rules are only published at the end, after roles exist.

Everything referenced here is in this repo:

| File | What it is |
|---|---|
| `functions/index.js` | Cloud Functions: `setUserRole`, `listStaff`, `onNewUser` (default role) |
| `scripts/bootstrap-sysmanager.js` | One-time script to grant the FIRST sysmanager |
| `firestore.rules` / `storage.rules` | Baseline rules (signed-in staff only) — publish any time |
| `firestore.rules.strict` / `storage.rules.strict` | Claims-based strict rules — publish in Phase 4 ONLY |
| `firebase.json`, `.firebaserc` | Deploy config (project `worn-gundidj-cms`, region Sydney) |

---

## Phase 0 — prerequisites (10 min)

1. **Blaze plan**: Firebase Console → ⚙️ → Usage & billing → upgrade
   `worn-gundidj-cms` to Blaze (Cloud Functions require it; role functions cost
   effectively $0 at this usage).
2. **Firebase CLI** on the developer's machine:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

## Phase 1 — deploy the functions (15 min)

```bash
cd <this repo>
cd functions && npm install && cd ..
firebase deploy --only functions
```

Expected output: `setUserRole`, `listStaff`, `onNewUser` deployed to
`australia-southeast1`.

From now on, **every new Firebase account automatically gets the `worker`
role** — least privilege by default.

## Phase 2 — bootstrap the first sysmanager (10 min)

`setUserRole` only obeys an existing sysmanager, so the first one is granted
directly with owner credentials:

1. Firebase Console → Project settings → **Service accounts** → *Generate new
   private key* → save as `serviceAccount.json`. **Never commit this file.**
2. ```bash
   npm install firebase-admin
   node scripts/bootstrap-sysmanager.js serviceAccount.json jonnybenson1986@gmail.com "Jon Benson"
   ```
3. **Delete `serviceAccount.json`.**
4. Sign out and back in — the token now carries `role: sysmanager`.

> The `"Jon Benson"` argument matters: rules match workers to clients by the
> **display name used inside the CMS**, so the name claim must be exactly the
> name that appears in Settings → Workers.

## Phase 3 — assign everyone else's role (15 min)

For each staff member, run from the browser console while signed in as the
sysmanager (or wire a small admin UI later):

```js
const fn = firebase.app().functions('australia-southeast1');
await fn.httpsCallable('setUserRole')({ email: 'jade@org.au', role: 'worker', name: 'Jade Atkinson' });
```

Roles: `sysmanager` · `admin` · `supervisor` · `worker` · `reception`.
Check the result with `httpsCallable('listStaff')({})`.
**Each person must sign out/in once** to pick up their role.

The app already prefers the token's role over the local profile at login, so
after this phase a devtools edit of localStorage can no longer escalate
privileges.

## Phase 4 — publish the strict rules (10 min) ⚠️ order matters

Only after Phases 1–3 are done and staff have re-logged-in:

```bash
cp firestore.rules.strict firestore.rules
cp storage.rules.strict  storage.rules
firebase deploy --only firestore:rules,storage
```

(Or paste the `.strict` files into Console → Rules → Publish.)

**What changes for users:** nothing visible day-to-day. What's now enforced
server-side:

- deleting clients/files/referrals → managers only; deleting notes → sysmanager only
- editing someone else's case note → blocked (own notes still editable, matching the app's 24-h window)
- audit log → append-only for everyone; in-app "Clear audit log" now only clears the local view, the cloud record is permanent
- roles → readable, never writable from the browser

## Phase 5 — verify (10 min)

Sign in as a **worker** account, open devtools, and confirm these are DENIED:

```js
const t = firebase.firestore().collection('teams').doc('worngundidj');
await t.collection('clients').doc('<some-id>').delete();          // ❌ permission-denied
await t.collection('auditlog').doc('<some-id>').update({worker:'x'}); // ❌ permission-denied
await t.collection('roles').doc('<my-uid>').set({role:'sysmanager'}); // ❌ permission-denied
```

…and that normal use (open clients, write a note, sync) still works. Then sign
in as the sysmanager and confirm client delete works.

## Rollback

If anything locks staff out, re-publish the baseline immediately (Console →
Rules → paste `firestore.rules` baseline → Publish). Rules changes take effect
in about a minute and lose no data.

## Known limitations (accepted for Stage 1)

- **Reads are still team-wide** — any signed-in staff can read all clients.
  Fixing that (Stage 2, documented at the bottom of `firestore.rules.strict`)
  first requires the app to query `where('assignedWorkers','array-contains',…)`
  instead of listening to the whole collection.
- The login audit entry's IP backfill no longer replicates to the cloud copy
  (append-only); the original entry is preserved as first written.
- Name claims must match CMS display names exactly — if a worker is renamed in
  Settings, re-run `setUserRole` with the new name.

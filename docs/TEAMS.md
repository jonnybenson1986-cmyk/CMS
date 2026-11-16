# 🏢 Teams — one system, separate teams

The CMS holds three teams. Each has **its own** clients, notes, time, referrals,
calendar, staff list, settings, files and audit log. Nothing is shared between
them, and an account can only open the teams it has been put in.

| Team | What it is for |
|---|---|
| **Worn Gundidj** | The Worn Gundidj team's own records — everything that was in the CMS before teams. Nothing was moved or changed. |
| **Spare team** | An empty team, ready for another team to use. |
| **Test team** | For trying things out and training. **Made-up people only — never real client information.** It has an orange banner so it can't be mistaken for the real thing. |

The list of teams is in `site/teams.js`.

## What staff see

* The team's name is at the bottom of the side menu.
* Staff in one team see nothing different. They sign in and their team opens.
* An account in more than one team gets a **Switch** button next to the team
  name. Switching closes the first team on that device (its client records are
  cleared from the device, as at sign-out) and opens the other. No password
  again.
* A device remembers the team it last opened. If someone from another team
  signs in on it, the CMS opens *their* team instead — they are never shown the
  other team's records.

## What the owner does — Settings → 🏢 Teams

Only the owner's account (the organisation's System Manager account) sees this card.

* **The list** shows every account and which teams it can open. Tick or untick
  a team to change it. Untick every team to shut an account out completely.
* **Can add staff** makes someone a team manager: they can add new staff
  accounts to their own team. (Only the owner can change teams or remove access.)
* **To add a new person to a team:** switch to that team → Settings → Staff
  Accounts → Add. The new account belongs to that team only.
* **To let an existing account use another team as well** (for example a Worn
  Gundidj worker who should practise in the Test team): tick that team for them.
* **Removing a staff member** (Staff Accounts → 🗑️) also takes their sign-in out
  of the team when the owner does it.

### Moving in, then locking

Accounts that existed before teams have no team recorded yet. So that nobody
is locked out on the day this is released:

1. **Moving in (now).** A sign-in with no team recorded is treated as Worn
   Gundidj staff — exactly what it was before — and is added to the list the
   next time it signs in. It can never open the Spare or Test team.
2. **Lock.** When the Teams card shows everyone has signed in, press
   **🔒 Lock: listed accounts only**. From then on a sign-in that is not in the
   list opens nothing at all. The card names anyone who has not signed in yet,
   so you can see who locking would shut out (you can tick them in afterwards).
   You can unlock again.

Lock it once everyone is listed — until then, an old sign-in nobody remembers
would still open Worn Gundidj.

## Links sent to clients

Intake and consent links made in Worn Gundidj are unchanged (`/i#…`, `/c#…`), so
links already sent keep working. Links made in another team carry the team
(`/i#test.…`). A Test team form shows "Practice form (Test team)" to whoever
opens it.

## What keeps the teams apart

* **Security rules** (`firestore.rules`): every read and write of
  `teams/<team>/…` checks the account's membership (`members/<account id>`).
  This is enforced by Google's servers, not by the app, and is tested for every
  collection and both rule files (`tests/rules`). These rules are published
  automatically when the change is merged.
* **Files** (`storage.rules`): the same test, for uploaded files.
  **These are published by hand** — see below.
* **On a device**: each team has its own copy, under its own keys, so one
  team's records can never be mixed into, or uploaded to, another's.

## One-off steps after release

1. **Publish the file rules by hand** (uploaded files are not covered until you do):
   Firebase Console → Storage → Rules → paste the contents of `storage.rules` →
   **Publish**. It will ask once for permission for Storage rules to read
   Firestore — say yes (it needs to look up team membership).
   Do **not** publish the `.strict` files.
2. **Texts from the Test or Spare team** (only if automatic texts are ever turned
   on there): redeploy the text service so its intake links carry the team —
   Actions → "Firebase: test & publish" → Run workflow → tick "Also deploy the
   SMS text service". Worn Gundidj texts are not affected either way.
3. **Lock** when everyone is listed (above).

## Things to know

* The three teams share the look, wording and forms of the CMS (logo, privacy
  policy, consent wording, handbook). If the Spare team goes to a team that
  needs its own name or branding, that is a further change.
* Each team has its own settings: Outlook set-up, automatic texts (off until
  switched on, with its own monthly budget), privacy contact, policies.
* Renaming a team or adding a fourth: `site/teams.js`, and the team list in
  `validMember()` in both `firestore.rules` files (the tests check they match).
* The owner is named in the rules (`isOwner()`) and in the app (`OWNER_EMAILS`);
  the tests check they are the same account.

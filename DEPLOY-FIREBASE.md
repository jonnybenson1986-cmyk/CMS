# Publishing to Firebase — and going live with texts

Firestore rules (and, when you choose, the SMS text service) are published by
GitHub, not by hand: **`.github/workflows/firebase-deploy.yml`**.

| When | What happens |
|---|---|
| A pull request changes the rules | The rules tests run (both rule files, Firestore emulator) and the text-service tests. A red ✗ means don't merge. |
| It is **merged to main** | The tests run again, then `firestore.rules` is **published** to `worn-gundidj-cms`. |
| You run it by hand with *Also deploy the SMS text service* ticked | The rules are published **and** the SMS function (`functions:sms` only). |

Nothing is published until step 1 is done — until then the "Publish" step fails
with a clear message and nothing changes.

## 1. Let GitHub publish (once — about 5 minutes)

1. Google Cloud Console → project **worn-gundidj-cms** → *IAM & Admin → Service
   Accounts* → **Create service account** named `github-deploy`.
2. Give it these roles:
   * **Firebase Rules Admin** — enough to publish the rules.
   * For the SMS text service as well: **Cloud Functions Admin**, **Service
     Account User**, **Secret Manager Admin**, **Artifact Registry
     Administrator**, **Cloud Build Editor**.
3. Open the account → *Keys → Add key → Create new key → JSON*. A file downloads.
4. GitHub → the CMS repository → *Settings → Secrets and variables → Actions →
   New repository secret*: name **`FIREBASE_SERVICE_ACCOUNT`**, value = the
   whole contents of that file. Then **delete the downloaded file**.
   Never paste it into chat, email, or a document.
5. (Recommended) *Settings → Environments → production → Required reviewers*:
   add yourself, so every publish waits for your OK.

**Publish now:** GitHub → *Actions* → **Firebase: test & publish** → *Run
workflow* (leave the SMS box unticked). When it's green, the rules are live:
the shared Outlook set-up, the 💡 Ideas inbox, automatic texts and the
client intake links all start working. Check *Firebase Console → Firestore →
Rules* shows today's date.

**Rolling back:** Firebase Console → Firestore → Rules keeps every published
version — pick the previous one and *Publish*. Or revert the commit on GitHub;
the workflow publishes the reverted rules.

## 2. Costs — checked before going live (October 2026)

| | Cost | Notes |
|---|---|---|
| **ClickSend SMS (Australia)** | about **7.2c per SMS + GST + a carrier fee** on the smallest (*Boost*) tier | Prepaid credit, **$20 minimum top-up**, no monthly fee. Its pricing page shows carrier fees but not the amount — the CMS assumes **10c per SMS all-in**. |
| Twilio (alternative) | US$0.0515 per SMS part + carrier fees | Billed in US dollars, plus a number rental. |
| Firebase Blaze plan | **$0** at our size | Required for Cloud Functions. Our use is well inside the free allowances: the text function runs once per text, and Firestore reads/writes are tiny. |
| Netlify | unchanged | The handbook PDF and intake page are static files. |

**Every text is one SMS.** The texts are written in plain characters and kept
to 160 of them: `https://<site>/hb` for the handbook and `https://<site>/i#…`
for intake links. (The old handbook text used a "—" dash, which made it
**4 SMS** — 4× the cost. That's fixed.)

**$10 a month ≈ 100 texts.** That covers a handbook text and an intake link
for about 50 new clients a month.

### The $10/month budget — three layers

1. **Hard cap in the text service:** `SMS_MONTHLY_BUDGET = 10` (AUD) at
   `SMS_COST_PER_PART = 0.10`. When this month's texts reach $10, the service
   **stops sending** until the 1st (Melbourne time). The CMS then hands each
   text to the worker's own phone, so nobody misses out. *Settings →
   Automatic texts* shows this month's texts and spend against the budget.
2. **Prepaid credit at ClickSend:** top up **$20** (the minimum — about 2
   months at the cap) and **leave auto top-up OFF**. Even a bug can't spend
   more than the credit.
3. **Google Cloud budget alert:** Google Cloud Console → *Billing → Budgets &
   alerts → Create budget* → project `worn-gundidj-cms`, amount **$10**,
   alerts at 50%, 90% and 100% to your email. (This warns; it doesn't stop
   spending. Layers 1–2 stop it.)

To change the cap later: set the GitHub variable `SMS_MONTHLY_BUDGET` (step 4)
and run the workflow with the SMS box ticked.

## 3. SMS provider account (ClickSend)

Sign up at clicksend.com (Australian), add **$20 credit**, **turn auto top-up
off**. *Developers → API Credentials*: note the **username** and **API key**.
Under *SMS → Settings*, choose a sender: a leased number (clients can reply) or
a sender name such as "WornGundidj". Australia now requires sender names to be
registered — ask ClickSend. Check its terms say messages and logs are stored in
Australia (APP 8, cross-border disclosure).

## 4. Text-service settings in GitHub (no secrets in the code)

GitHub → *Settings → Secrets and variables → Actions*:

* **Secrets** (hidden): `SMS_USERNAME`, `SMS_API_KEY` — from step 3.
* **Variables** (visible):

| Variable | Value |
|---|---|
| `HANDBOOK_URL` | `https://candid-trifle-167698.netlify.app/hb` |
| `APP_URL` | `https://candid-trifle-167698.netlify.app` |
| `SMS_FROM` | your sender number or registered name |
| `SMS_PROVIDER` | `clicksend` |
| `SMS_MONTHLY_BUDGET` | `10` |
| `SMS_COST_PER_PART` | `0.10` |

## 5. Go live

1. Firebase Console → upgrade to **Blaze** (needed for Cloud Functions); set the
   $10 budget alert from step 2.
2. GitHub → *Actions* → **Firebase: test & publish** → *Run workflow* → tick
   **Also deploy the SMS text service** → *Run*.
3. **Test with your own phone first** (SMS-SETUP.md, step 9): a "TEST" client
   with your mobile and "Safe to leave calls/texts? = Yes".
   * Turn on *Settings → Automatic texts*, save the intake → the handbook text
     arrives (one SMS), and Settings shows 1 text ≈ $0.10.
   * On the Intake tab → **📲 Intake form by link** → *Create the link* →
     *Text it automatically* → open the text on your phone, fill it in, send →
     it appears on the Dashboard → *Review* → *Add the ticked answers*.
4. Close the test client. You're live.

## What stays manual

* Nothing is ever deployed from the other functions codebase (`functions/`,
  role management) — see SECURITY-DEPLOY.md. The workflow only ever runs
  `--only firestore:rules` and `--only functions:sms`.
* `firestore.rules.strict` is tested on every change but **not** published —
  it needs the role functions first (SECURITY-DEPLOY.md).

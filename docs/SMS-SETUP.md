# Texts (handbook, intake links, two-way texts with clients) — setup guide

> **Easiest route:** DEPLOY-FIREBASE.md — GitHub publishes the rules and the
> text service for you, with the $10/month budget built in. The manual steps
> below still work.

The CMS can send the SEWB Participant Handbook text itself, from Firebase,
with no staff phone involved. Three things are needed that only the
organisation can do: an **SMS provider account**, the **Firebase Blaze plan**,
and **deploying the function**. Nothing is sent until you finish step 9, so
it is safe to merge the code first.

## How it works

1. A worker saves an intake with a mobile number and "Safe to leave
   calls/texts?" = **Yes**.
2. The CMS adds a request to the `smsOutbox` collection — just the client's
   id and who asked. It never contains a phone number or message.
3. The Cloud Function `sendHandbookSms` (Sydney) picks it up and checks, from
   the client's own file: the requester is in the staff directory, the client
   agreed to texts, the number is an Australian mobile, the handbook hasn't
   already gone to that number, and fewer than 150 texts went out this hour.
4. If all pass, it sends the text through the provider and writes the result
   back (sent / not sent and why). The client's file and the audit log show it.

Browsers cannot write results, change a request, or choose the number or
wording — the Firestore rules and the function enforce that.

## Cost and privacy — read first

* **Cost:** ClickSend is about 7.2c per SMS + GST + a carrier fee (smallest
  tier, checked October 2026) — allow **10c**. Every text is written to fit in
  **one SMS**. The service stops itself at **$10 a month** (SMS_MONTHLY_BUDGET)
  and hands texts to workers' phones until the 1st. Firebase's Blaze plan is
  pay-as-you-go; this function's own usage is free at our size. Details and
  the three budget layers: DEPLOY-FIREBASE.md, section 2.
* **Privacy:** the provider receives the client's mobile number and first
  name. Use an Australian provider such as **ClickSend** and confirm in its
  terms where messages and logs are stored. If a provider stores data
  overseas, that is a cross-border disclosure under APP 8 and needs to be
  covered by your privacy policy and consent wording.
* **Consent:** the CMS only texts clients whose intake says "Safe to leave
  calls/texts? = Yes". Keep it that way.
* **Sender name:** Australia regulates alphanumeric sender names (e.g.
  "WornGundidj") — ask the provider whether it must be registered. A text
  from a number the provider leases you also lets clients reply.

## Steps

**1. Upgrade Firebase to Blaze.** Firebase Console → project
`worn-gundidj-cms` → the plan name bottom-left → *Upgrade* → Blaze. Add a
**$10/month** budget alert when prompted. Cloud Functions require Blaze.

**2. Create the SMS provider account** (ClickSend shown). Sign up, add **$20**
credit (the minimum) and **turn auto top-up off**,
then *Developers → API Credentials*: note the **username** and **API key**.
Choose a sender number (or sender name) under *SMS → Settings*.

**3. Install the Firebase tools** on a computer: install Node.js 20+, then
`npm install -g firebase-tools` and `firebase login` (use the Google account
that owns the project).

**4. Get the code and install it.**
```
git clone https://github.com/jonnybenson1986-cmyk/CMS.git
cd CMS
cd functions-sms && npm install && cd ..
```

**5. Store the provider credentials as secrets** (they are never written to
the code or the repository):
```
firebase functions:secrets:set SMS_USERNAME
firebase functions:secrets:set SMS_API_KEY
```
Paste each value when asked.

**6. Set the settings.** Create the file `functions-sms/.env.worn-gundidj-cms`
(it is git-ignored) containing:
```
SMS_PROVIDER=clicksend
SMS_FROM=<your sender number or registered name>
HANDBOOK_URL=https://<your-cms-address>/hb
APP_URL=https://<your-cms-address>
SMS_MONTHLY_BUDGET=10
SMS_COST_PER_PART=0.10
```
`HANDBOOK_URL` is the short link to the handbook (`/hb`, set up in
netlify.toml) — open it in a browser to check it loads. The short links keep
each text to one SMS. (Use `twilio` instead of `clicksend`
if you chose Twilio: then SMS_USERNAME is the Account SID and SMS_API_KEY the
Auth Token.)

**7. Publish the new Firestore rules.** Firebase Console → Firestore Database
→ Rules → paste the contents of `firestore.rules` → Publish. (Copy the old
rules to a text file first — that is your rollback.) Then confirm client data
is still private: the README's `curl` check must print `403`.

**8. Deploy the function — this one only:**
```
firebase deploy --only functions:sms
```
Never run plain `firebase deploy --only functions`: the other function set
(`functions/`, role management) must stay undeployed until SECURITY-DEPLOY.md
is followed.

**9. Test with a staff phone before real clients.**
 a. In the CMS go to **Settings → 📱 Automatic texts** and tick *Send the
    handbook text automatically* (System Manager only).
 b. Create a client called "TEST — your name". On the **Intake** tab enter
    *your own* mobile number, set "Safe to leave calls/texts?" to **Yes**, and
    press **Save Intake**.
 c. Within about a minute your phone should receive the text, and the
    Intake tab should say "Handbook sent … by automatic text". Open the link
    on the text to check the handbook loads.
 d. Close the test client file when you're done.
If nothing arrives, Settings shows "waited more than 3 minutes" — see
Troubleshooting. To go back to manual sending at any time, untick the box.

**10. Send to existing clients.** Reports → **Handbook send-out** →
*Send automatically to all N ready*. Clients without a mobile, without
consent, or who already have it are skipped.

## Two-way texts with clients (Twilio)

Workers can text a client from the **💬 Texts** section of the client's file and see the whole
conversation there: the automatic handbook and intake-link texts, their own texts, and the client's
replies. A reply goes to the client's **Key Worker** as an alert on their Dashboard. A reply from a
number that isn't on exactly one client's file goes to **Unmatched texts** on the Dashboard of
managers and supervisors, who put it on the right file or dismiss it.

> **Not SendGrid.** SendGrid (owned by Twilio) only sends email. Texts go through **Twilio
> Programmable Messaging**: a separate Twilio account and login, even if you already use SendGrid.

### How it works
* **Sending:** the CMS adds a request to `smsOutbox` with `kind: "message"`, the client's id and
  the words. It never includes a phone number. The text service reads the number from the client's
  file and checks everything it checks for the handbook: staff directory, "Safe to leave
  calls/texts? = Yes", an Australian mobile, the hourly cap and the monthly budget. It also checks
  that the client hasn't replied STOP and that the text is at most 4 SMS (640 characters). Then it
  sends the text from your Twilio number and writes the result back.
* **Replies:** Twilio sends each reply to the Cloud Function `receiveSms`. The function checks
  **Twilio's signature**, so only Twilio can post replies. It matches the number to a client: first
  the client most recently texted at that number, then the one client on file with that mobile
  (open files first). It keeps the reply in `teams/{team}/smsInbox`. The words, number and time can
  never be changed or deleted from the CMS. Staff can only mark a reply seen, dismiss an unmatched
  one, or put an unmatched one on a file.
* **STOP / START:** a reply of just `STOP` (or UNSUBSCRIBE, CANCEL, END, QUIT) switches texts to
  that number off. Nothing more is sent, automatic or by a worker, until the client replies
  `START`. The file shows "replied STOP".
* **Audit log:** each text sent or received is logged with who and when, but not the words.

### Cost and privacy
* **Twilio prices** are in US dollars. Check them at twilio.com → Pricing → SMS → Australia before
  you start. When this was written, an Australian mobile number cost about US$6.50 a month, an
  outgoing SMS about US$0.05 per part, and incoming texts a small charge each. Twilio adds GST for
  Australian accounts.
* **Budget:** workers' texts count towards the same **monthly budget** as the handbook texts. The
  default is $10, which is about 100 texts. Raise `SMS_MONTHLY_BUDGET` (for example to `50`) before
  turning two-way texts on. Incoming texts are not counted in the budget, so watch Twilio's own
  usage page too.
* **Privacy:** Twilio is a US company. The client's mobile number, first name and **the words of
  each text** pass through Twilio and are kept in its logs. That is a cross-border disclosure under
  **APP 8**. Your privacy policy and consent wording must cover it, and management should approve it
  before you go live. Twilio lets you set a message-log retention period and redact message bodies:
  Console → Messaging → Settings.
* **Who can see texts:** the conversation is shown on the client's file, so the same people who can
  open the file can see it. Restricted files and files hidden because of a conflict of interest stay
  hidden in the CMS. As with case notes, the cloud copy is readable by anyone signed in to the team.

### Steps (after steps 1–8 above)
**T1. Twilio account.** Sign up at twilio.com, add credit and turn auto-recharge off. A **trial**
account can only text numbers you have verified, which is fine for testing. Note the **Account
SID** and **Auth Token** from the Console home page.

**T2. Buy an Australian mobile number.** Console → Phone Numbers → Buy a number → Country
*Australia*, capability *SMS* → a **mobile** number. Twilio asks for a **regulatory bundle**: the
organisation's business details and proof of an Australian address. Approval can take a few days.
A sender *name* (like "WornGundidj") cannot receive replies, so use the number.

**T3. Point the text service at Twilio.** Store the Twilio login as the two secrets (step 5):
`SMS_USERNAME` = Account SID, `SMS_API_KEY` = Auth Token. Then set, in `.env.worn-gundidj-cms` or
as the GitHub variables in DEPLOY-FIREBASE.md:
```
SMS_PROVIDER=twilio
SMS_FROM=+614XXXXXXXX          # the Twilio number, in +61 format
SMS_MONTHLY_BUDGET=50          # suggested once workers text clients
```
Deploy (`firebase deploy --only functions:sms`, or the GitHub action with the SMS box ticked). The
deploy prints the address of **receiveSms**, something like
`https://australia-southeast1-worn-gundidj-cms.cloudfunctions.net/receiveSms` or a `…run.app`
address.

**T4. Tell the text service its address.** Set `SMS_WEBHOOK_URL` to exactly that address, without
anything after it, and deploy again. Twilio signs the exact address it calls, so the two must match.

**T5. Send replies to it.** Twilio Console → Phone Numbers → Manage → Active numbers → your number
→ *Messaging configuration* → **A message comes in** → *Webhook*, method **HTTP POST**, URL:
```
<the receiveSms address>?team=worngundidj
```
(The Spare or Test team would use `?team=spare` or `?team=test` on its own number.) If the number is
in a Twilio *Messaging Service*, set the incoming-message webhook on the Messaging Service instead.
Save.

**T6. Publish the new Firestore rules** (step 7): they add `smsInbox` and `smsOptOut` and allow
the `message` kind.

**T7. Turn it on and test with staff phones.** In the CMS, Settings → 📱 Automatic texts → tick
**💬 Two-way texts with clients (Twilio)** (System Manager only). Open a "TEST — your name" client
with *your own* mobile and "Safe to leave calls/texts?" = Yes. Go to **💬 Texts**, write a text and
press **Send text**: it should arrive within seconds and show "✓ Sent". Reply from your phone: the
reply should appear in the conversation, and the client's Key Worker should see it on their
Dashboard. Then text the number from a phone that isn't on any file: it should appear under
**Unmatched texts**. Finally reply `STOP`, check the file says texts are off, then reply `START`.

### Troubleshooting two-way texts
* **Replies never arrive.** Twilio Console → Monitor → Logs → Errors.
  * **403**: the signature didn't match. `SMS_WEBHOOK_URL` must be exactly the address in step T5,
    without `?team=…`, and `SMS_API_KEY` must be the current Auth Token. Redeploy after changing
    either.
  * **404**: `SMS_PROVIDER` isn't `twilio`.
  * **"Forbidden" from Google**: the function isn't public. Firebase Console → Functions →
    receiveSms → Permissions → allow `allUsers` to invoke it. An organisation policy may block
    this; if so, ask whoever manages your Google Cloud.
* **"The client replied STOP"** when sending: the client has to reply START. Twilio itself may also
  block numbers that replied STOP; that shows as a provider error.
* **"Not sent — SMS provider error … 21608"**: a trial account can only text verified numbers.
* **To stop two-way texts:** untick the box in Settings. Workers can no longer send, and replies are
  still kept. To stop receiving as well, remove the webhook from the Twilio number.

## Turning it off
Settings → untick *Send the handbook text automatically*. The CMS goes back
to opening the worker's own phone. To stop the function completely:
`firebase functions:delete sendHandbookSms --region australia-southeast1`.

## Troubleshooting
* **"waited more than 3 minutes"** — the function isn't deployed, or crashed.
  Firebase Console → Functions → `sendHandbookSms` → Logs.
* **"HANDBOOK_URL is not set"** — step 6 was skipped; redeploy after creating
  the `.env` file.
* **"SMS provider error … 401"** — wrong username/API key; re-run step 5 and
  redeploy.
* **"SMS provider error … insufficient credit"** — top up the provider
  account. Failed requests can be retried with *Send automatically* on the
  client's file.
* **"Monthly SMS budget of $10.00 reached"** — working as designed: texts go
  from workers' phones until the 1st. Settings → Automatic texts shows the
  month's spend. To raise the cap, change `SMS_MONTHLY_BUDGET` and redeploy.
* **"Requested by an account that is not in the staff directory"** — the
  staff rule isn't published, or the person's profile has no email. See the
  README (Roles) and Settings → Staff Accounts.

## Developer notes
* Logic is in `functions-sms/lib.js` and `handler.js`; unit tests:
  `cd functions-sms && node --test` (no Firebase or network needed).
* Hourly cap: `HOURLY_CAP` in `lib.js`.
* Kinds: `message` (a worker's two-way text — the only kind that carries words; see “Two-way texts”), `handbook`, and `intake` (with the `linkId` of a client intake
  link — the function checks the link belongs to that client, is still open
  and hasn't been texted already). New kinds should follow the same pattern:
  the browser asks, the function decides from the record.
* Cost: `smsParts()` in `lib.js` counts billed SMS parts (GSM 160 / UCS-2 70);
  every template is fitted to one part. Spend per month is kept on
  `teams/{team}/smsUsage/{yyyy-mm}` (staff can read it; only the function writes).
* Replies: `receiveSms` in `index.js` → `handleInbound` (`handler.js`) → `processInbound`,
  `validTwilioSignature`, `optOutWord` (`lib.js`). Tests: `test/handler.test.js` (end to end, with
  signatures) and `test/lib.test.js`. The CMS side is tested by `tests/browser/texts.cjs`, which also
  checks the CMS counts SMS parts exactly like `lib.js`.

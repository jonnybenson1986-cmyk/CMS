# Automatic texts (handbook + intake links) — setup guide

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
* Two kinds: `handbook`, and `intake` (with the `linkId` of a client intake
  link — the function checks the link belongs to that client, is still open
  and hasn't been texted already). New kinds should follow the same pattern:
  the browser asks, the function decides from the record.
* Cost: `smsParts()` in `lib.js` counts billed SMS parts (GSM 160 / UCS-2 70);
  every template is fitted to one part. Spend per month is kept on
  `teams/{team}/smsUsage/{yyyy-mm}` (staff can read it; only the function writes).

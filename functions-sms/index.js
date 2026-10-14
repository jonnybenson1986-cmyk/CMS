// Worn Gundidj CMS — automatic handbook text (Cloud Function, codebase "sms").
//
// Deploy ONLY this codebase:   firebase deploy --only functions:sms
// (Never plain "--only functions" — the other codebase holds role functions
// that must not go live yet; see SECURITY-DEPLOY.md.)  Setup: SMS-SETUP.md.
//
// The app writes { kind:'handbook', clientId, requestedBy, requestedByName,
// requestedAt } to teams/{team}/smsOutbox. This function claims the request,
// decides from the client's own record whether to send (lib.js), sends it
// through the SMS provider, then writes the result back onto the same outbox
// document and to the audit log. Firestore rules stop browsers from changing
// an outbox document after creating it — only this code can.

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const lib = require('./lib');
const { handleOutbox } = require('./handler');

admin.initializeApp();
const REGION = 'australia-southeast1';          // same region as Firestore (Sydney)

const SMS_PROVIDER = defineString('SMS_PROVIDER', { default: 'clicksend' });
const HANDBOOK_URL = defineString('HANDBOOK_URL');  // e.g. https://<your-cms-site>/handbook/SEWB-Participant-Handbook.pdf
const SMS_FROM = defineString('SMS_FROM');          // sender number or registered sender name
const SMS_USERNAME = defineSecret('SMS_USERNAME');
const SMS_API_KEY = defineSecret('SMS_API_KEY');

exports.sendHandbookSms = onDocumentCreated(
  { document: 'teams/{teamId}/smsOutbox/{id}', region: REGION, secrets: [SMS_USERNAME, SMS_API_KEY], retry: false },
  (event) => handleOutbox(event.data, event.params.teamId, {
    db: admin.firestore(), auth: admin.auth(), handbookUrl: HANDBOOK_URL.value(), provider: SMS_PROVIDER.value(),
    send: (to, body) => lib.sendViaProvider(SMS_PROVIDER.value(),
      { username: SMS_USERNAME.value(), apiKey: SMS_API_KEY.value(), from: SMS_FROM.value() }, to, body),
  }));

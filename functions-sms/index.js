// Worn Gundidj CMS — automatic texts: the handbook, and intake-form links (Cloud Function, codebase "sms").
//
// Deploy ONLY this codebase:   firebase deploy --only functions:sms
// (Never plain "--only functions" — the other codebase holds role functions
// that must not go live yet; see docs/SECURITY-DEPLOY.md.)  Setup: docs/SMS-SETUP.md.
//
// The app writes { kind:'handbook'|'intake', clientId, requestedBy, requestedByName,
// requestedAt, linkId? } to teams/{team}/smsOutbox. This function claims the request,
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
const HANDBOOK_URL = defineString('HANDBOOK_URL');  // short link: https://<your-cms-site>/hb  (netlify.toml)
const APP_URL = defineString('APP_URL', { default: '' });   // https://<your-cms-site> — intake links are APP_URL/i#<link>
// Spending cap: once this month's texts reach the budget, automatic texts stop
// until the 1st (Melbourne time) and the CMS hands them to the worker's phone.
const SMS_MONTHLY_BUDGET = defineString('SMS_MONTHLY_BUDGET', { default: '10' });    // AUD
const SMS_COST_PER_PART = defineString('SMS_COST_PER_PART', { default: '0.10' });    // AUD per SMS, incl. GST + carrier fee
const SMS_FROM = defineString('SMS_FROM');          // sender number or registered sender name
const SMS_USERNAME = defineSecret('SMS_USERNAME');
const SMS_API_KEY = defineSecret('SMS_API_KEY');

exports.sendHandbookSms = onDocumentCreated(
  { document: 'teams/{teamId}/smsOutbox/{id}', region: REGION, secrets: [SMS_USERNAME, SMS_API_KEY], retry: false },
  (event) => handleOutbox(event.data, event.params.teamId, {
    db: admin.firestore(), auth: admin.auth(), handbookUrl: HANDBOOK_URL.value(), provider: SMS_PROVIDER.value(),
    appUrl: APP_URL.value() || (() => { try { return new URL(HANDBOOK_URL.value()).origin; } catch (_) { return ''; } })(),
    monthlyBudget: Number(SMS_MONTHLY_BUDGET.value()), costPerPart: Number(SMS_COST_PER_PART.value()),
    increment: (n) => admin.firestore.FieldValue.increment(n),
    send: (to, body) => lib.sendViaProvider(SMS_PROVIDER.value(),
      { username: SMS_USERNAME.value(), apiKey: SMS_API_KEY.value(), from: SMS_FROM.value() }, to, body),
  }));

// Worn Gundidj CMS — server-side handbook text. Pure logic, no Firebase
// imports, so it can be tested on its own (see test/). index.js wires it to
// Firestore and the SMS provider.
//
// The browser never supplies a phone number or any message text. It only asks
// "send the handbook to client X". Everything else is decided here, from the
// client's own record:
//   • the requester must be a signed-in account listed in the staff directory
//   • the client must have said it's safe to leave texts ("Yes" on intake)
//   • the number must be an Australian mobile
//   • the handbook goes once per number
//   • a cap on texts per hour limits the damage of any misuse or bug

const ORG_PHONE = '(03) 5561 5315';
const HOURLY_CAP = 150;

// Australian mobile → 04xxxxxxxx, or '' if it can't take a text.
function auMobile(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('614')) d = '0' + d.slice(2);
  if (d.length === 9 && d.startsWith('4')) d = '0' + d;
  return /^04\d{8}$/.test(d) ? d : '';
}
const toE164 = m => '+61' + m.slice(1);
const maskPhone = m => (m ? m.slice(0, 4) + ' ••• ' + m.slice(-3) : '');

// First name only, letters/spaces/hyphens/apostrophes, at most 30 characters —
// whatever is on file, the text can't carry anything else.
function firstName(client) {
  const raw = String(client.preferredName || client.fullName || '').replace(/<[^>]*>/g, ' ').replace(/"[^"]*"/g, ' ').trim().split(/\s+/)[0] || '';
  const clean = raw.replace(/[^A-Za-zÀ-ÿ'\-]/g, '').slice(0, 30);
  return clean || 'there';
}
function handbookMessage(client, handbookUrl) {
  return `Hi ${firstName(client)}, welcome to Worn Gundidj SEWB. Here is your Participant Handbook — it explains your rights, how we work with you and who to contact: ${handbookUrl} Any questions, call us on ${ORG_PHONE}.`;
}

// Decide and (if allowed) send. deps are injected so this runs without
// Firebase or a real provider in tests.
//   req  — the outbox document: { kind, clientId, requestedBy }
//   deps — { handbookUrl, getRequesterEmail(uid), getStaffEmails(), getClient(id),
//            alreadySent(clientId, mobile), sentInLastHour(), send(e164, body) }
async function processRequest(req, deps) {
  const out = (status, reason, extra) => Object.assign({ status, reason: reason || '' }, extra || {});
  if (!req || req.kind !== 'handbook') return out('skipped', 'Unknown request type');
  if (!deps.handbookUrl || !/^https:\/\//.test(deps.handbookUrl)) return out('failed', 'HANDBOOK_URL is not set on the function');
  const email = String((await deps.getRequesterEmail(req.requestedBy)) || '').toLowerCase();
  const staff = await deps.getStaffEmails();
  if (!email || !staff.has(email)) return out('skipped', 'Requested by an account that is not in the staff directory');
  const client = await deps.getClient(req.clientId);
  if (!client) return out('skipped', 'Client file not found');
  if (client.ifSafeContact !== 'Yes') return out('skipped', 'Client has not agreed to texts ("Safe to leave calls/texts?" is not Yes)');
  const mobile = auMobile(client.phone);
  if (!mobile) return out('skipped', 'No Australian mobile number on the client file');
  if (await deps.alreadySent(req.clientId, mobile)) return out('skipped', 'Handbook already sent to this number', { to: maskPhone(mobile) });
  if ((await deps.sentInLastHour()) >= HOURLY_CAP) return out('failed', `Hourly limit of ${HOURLY_CAP} texts reached — try again later`, { to: maskPhone(mobile) });
  try {
    const providerId = await deps.send(toE164(mobile), handbookMessage(client, deps.handbookUrl));
    return out('sent', '', { to: maskPhone(mobile), toFull: mobile, providerId: String(providerId || '') });
  } catch (e) {
    return out('failed', 'SMS provider error: ' + String(e && e.message || e).slice(0, 200), { to: maskPhone(mobile) });
  }
}

// ---- SMS providers ----------------------------------------------------------
// Both are plain HTTPS calls. Credentials come from Firebase secrets.
//   clicksend — Australian provider. SMS_USERNAME = account username, SMS_API_KEY = API key.
//   twilio    — SMS_USERNAME = Account SID, SMS_API_KEY = Auth Token.
// SMS_FROM is the sender: a number on the account, or a registered sender name.
function providerRequest(provider, { username, apiKey, from }, to, body) {
  const auth = 'Basic ' + Buffer.from(`${username}:${apiKey}`).toString('base64');
  if (provider === 'clicksend') {
    return { url: 'https://rest.clicksend.com/v3/sms/send', init: { method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ source: 'wg-cms', from, to, body }] }) } };
  }
  if (provider === 'twilio') {
    return { url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(username)}/Messages.json`, init: { method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString() } };
  }
  throw new Error(`Unknown SMS_PROVIDER "${provider}" (use clicksend or twilio)`);
}
async function sendViaProvider(provider, creds, to, body, fetchImpl) {
  const { url, init } = providerRequest(provider, creds, to, body);
  const res = await (fetchImpl || fetch)(url, init);
  let data = {}; try { data = await res.json(); } catch (_) {}
  if (provider === 'clicksend') {
    const m = data && data.data && data.data.messages && data.data.messages[0];
    if (!res.ok || data.response_code !== 'SUCCESS' || !m || m.status !== 'SUCCESS') throw new Error(`ClickSend ${res.status}: ${(m && m.status) || data.response_code || data.response_msg || 'unknown'}`);
    return m.message_id;
  }
  if (!res.ok || !data.sid) throw new Error(`Twilio ${res.status}: ${data.message || 'unknown'}`);
  return data.sid;
}

module.exports = { auMobile, toE164, maskPhone, firstName, handbookMessage, processRequest, providerRequest, sendViaProvider, HOURLY_CAP };

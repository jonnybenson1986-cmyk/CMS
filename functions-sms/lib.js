// Worn Gundidj CMS — server-side texts (the SEWB Participant Handbook, and the
// link to a client's own intake form). Pure logic, no Firebase imports, so it
// can be tested on its own (see test/). index.js wires it to Firestore and the
// SMS provider.
//
// The browser never supplies a phone number or any message text. It only asks
// "send the handbook / the intake link to client X". Everything else is
// decided here, from the client's own record:
//   • the requester must be a signed-in account listed in the staff directory
//   • the client must have said it's safe to leave texts ("Yes" on intake)
//   • the number must be an Australian mobile
//   • the handbook goes once per number; an intake link once per link
//   • a cap on texts per hour limits the damage of any misuse or bug
//   • a MONTHLY BUDGET (default $10) stops all automatic texts once reached —
//     the CMS then hands the text back to the worker's own phone
//
// Cost: every text is written in plain GSM characters and kept to 160 of them,
// so it is billed as ONE SMS. (A single "—" or curly quote switches a text to
// UCS-2, where one SMS holds only 70 characters — the old handbook text cost 4.)

const ORG_PHONE = '(03) 5561 5315';
const HOURLY_CAP = 150;
const DEFAULT_MONTHLY_BUDGET = 10;      // AUD
const DEFAULT_COST_PER_PART = 0.10;     // AUD per SMS part — ClickSend ≈7.2¢ + GST + carrier fee, rounded up

// Australian mobile → 04xxxxxxxx, or '' if it can't take a text.
function auMobile(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('614')) d = '0' + d.slice(2);
  if (d.length === 9 && d.startsWith('4')) d = '0' + d;
  return /^04\d{8}$/.test(d) ? d : '';
}
const toE164 = m => '+61' + m.slice(1);
const maskPhone = m => (m ? m.slice(0, 4) + ' ••• ' + m.slice(-3) : '');

// ---- SMS length / cost -------------------------------------------------------
// GSM 03.38 basic set; the extension set (^{}\[~]|€ and form feed) costs 2.
const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';
// Typographic characters that would force UCS-2 → their plain equivalents.
function toGsm(text) {
  return String(text || '')
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-').replace(/\u2026/g, '...').replace(/[\u00A0\u2007\u202F]/g, ' ')
    .split('').filter(ch => GSM_BASIC.includes(ch) || GSM_EXT.includes(ch)).join('');
}
// How many billed SMS parts a text takes.
function smsParts(text) {
  const s = String(text || '');
  const gsm = s.split('').every(ch => GSM_BASIC.includes(ch) || GSM_EXT.includes(ch));
  if (gsm) {
    const len = s.split('').reduce((n, ch) => n + (GSM_EXT.includes(ch) ? 2 : 1), 0);
    return len <= 160 ? 1 : Math.ceil(len / 153);
  }
  const len = [...s].length;
  return len <= 70 ? 1 : Math.ceil(len / 67);
}

// First name only, letters/spaces/hyphens/apostrophes — whatever is on file,
// the text can't carry anything else. Accents are dropped (they would cost UCS-2).
function firstName(client, max) {
  const raw = String(client.preferredName || client.fullName || '').replace(/<[^>]*>/g, ' ').replace(/"[^"]*"/g, ' ').trim().split(/\s+/)[0] || '';
  const clean = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z'\-]/g, '').slice(0, max || 20);
  return clean || 'there';
}
// The first template that fits in one SMS (160 GSM characters).
function _fit(variants) {
  for (const v of variants) { const t = toGsm(v); if (smsParts(t) === 1) return t; }
  return toGsm(variants[variants.length - 1]);
}
function handbookMessage(client, handbookUrl) {
  const n = firstName(client), s = firstName(client, 10);
  return _fit([
    `Hi ${n}, welcome to Worn Gundidj SEWB. Your Participant Handbook: ${handbookUrl} Questions? Call ${ORG_PHONE}`,
    `Hi ${s}, your Worn Gundidj SEWB handbook: ${handbookUrl} Questions? ${ORG_PHONE}`,
    `Worn Gundidj SEWB handbook: ${handbookUrl} Questions? ${ORG_PHONE}`,
  ]);
}
function intakeMessage(client, linkUrl, days) {
  const n = firstName(client), s = firstName(client, 10), d = Math.max(1, Math.round(days || 7));
  return _fit([
    `Hi ${n}, please fill in your Worn Gundidj SEWB intake form: ${linkUrl} (works ${d} days). Questions? ${ORG_PHONE}`,
    `Hi ${s}, your Worn Gundidj intake form: ${linkUrl} (works ${d} days). Questions? ${ORG_PHONE}`,
    `Worn Gundidj intake form: ${linkUrl} Questions? ${ORG_PHONE}`,
  ]);
}
const money = v => '$' + (Math.round(v * 100) / 100).toFixed(2);

// Decide and (if allowed) send. deps are injected so this runs without
// Firebase or a real provider in tests.
//   req  — the outbox document: { kind: 'handbook'|'intake', clientId, requestedBy, linkId? }
//   deps — { handbookUrl, appUrl, monthlyBudget, costPerPart,
//            getRequesterEmail(uid), getStaffEmails(), getClient(id),
//            alreadySent(clientId, mobile), sentInLastHour(), monthSpend() → $ so far this month,
//            getIntakeForm(linkId) → { clientId, status, expiresAtMs }, alreadySentLink(linkId),
//            send(e164, body) }
async function processRequest(req, deps) {
  const out = (status, reason, extra) => Object.assign({ status, reason: reason || '' }, extra || {});
  const kind = req && req.kind;
  if (kind !== 'handbook' && kind !== 'intake') return out('skipped', 'Unknown request type');
  if (kind === 'handbook' && (!deps.handbookUrl || !/^https:\/\//.test(deps.handbookUrl))) return out('failed', 'HANDBOOK_URL is not set on the function');
  if (kind === 'intake' && (!deps.appUrl || !/^https:\/\//.test(deps.appUrl))) return out('failed', 'APP_URL is not set on the function');
  const email = String((await deps.getRequesterEmail(req.requestedBy)) || '').toLowerCase();
  const staff = await deps.getStaffEmails();
  if (!email || !staff.has(email)) return out('skipped', 'Requested by an account that is not in the staff directory');
  const client = await deps.getClient(req.clientId);
  if (!client) return out('skipped', 'Client file not found');
  if (client.ifSafeContact !== 'Yes') return out('skipped', 'Client has not agreed to texts ("Safe to leave calls/texts?" is not Yes)');
  const mobile = auMobile(client.phone);
  if (!mobile) return out('skipped', 'No Australian mobile number on the client file');

  let body;
  if (kind === 'handbook') {
    if (await deps.alreadySent(req.clientId, mobile)) return out('skipped', 'Handbook already sent to this number', { to: maskPhone(mobile) });
    body = handbookMessage(client, deps.handbookUrl);
  } else {
    const linkId = String(req.linkId || '');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(linkId)) return out('skipped', 'No intake link in the request');
    const form = await deps.getIntakeForm(linkId);
    if (!form || form.clientId !== req.clientId) return out('skipped', 'Intake link not found for this client');
    if (form.status !== 'open' && form.status !== 'draft') return out('skipped', 'Intake form already completed or cancelled');
    const msLeft = Number(form.expiresAtMs || 0) - Date.now();
    if (!(msLeft > 0)) return out('skipped', 'Intake link has expired');
    if (await deps.alreadySentLink(linkId)) return out('skipped', 'This intake link was already texted', { to: maskPhone(mobile) });
    body = intakeMessage(client, String(deps.appUrl).replace(/\/+$/, '') + '/i#' + linkId, Math.ceil(msLeft / 864e5));
  }

  const parts = smsParts(body);
  const price = Number(deps.costPerPart) > 0 ? Number(deps.costPerPart) : DEFAULT_COST_PER_PART;
  const budget = Number(deps.monthlyBudget) > 0 ? Number(deps.monthlyBudget) : DEFAULT_MONTHLY_BUDGET;
  const cost = parts * price;
  const spent = Number(await deps.monthSpend()) || 0;
  if (spent + cost > budget + 1e-9) return out('skipped', `Monthly SMS budget of ${money(budget)} reached (${money(spent)} used) - send it from your phone instead`, { to: maskPhone(mobile) });
  if ((await deps.sentInLastHour()) >= HOURLY_CAP) return out('failed', `Hourly limit of ${HOURLY_CAP} texts reached - try again later`, { to: maskPhone(mobile) });
  try {
    const providerId = await deps.send(toE164(mobile), body);
    return out('sent', '', { to: maskPhone(mobile), toFull: mobile, providerId: String(providerId || ''), parts, cost: Math.round(cost * 10000) / 10000 });
  } catch (e) {
    return out('failed', 'SMS provider error: ' + String(e && e.message || e).slice(0, 200), { to: maskPhone(mobile) });
  }
}

// "2026-10" in Melbourne time — the budget month.
function budgetMonth(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit' }).format(d || new Date()).slice(0, 7);
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

module.exports = { auMobile, toE164, maskPhone, firstName, handbookMessage, intakeMessage, toGsm, smsParts, budgetMonth, processRequest, providerRequest, sendViaProvider,
  HOURLY_CAP, DEFAULT_MONTHLY_BUDGET, DEFAULT_COST_PER_PART };

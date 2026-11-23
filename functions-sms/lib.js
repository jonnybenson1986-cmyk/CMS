// Worn Gundidj CMS — server-side texts (the SEWB Participant Handbook, the
// link to a client's own intake form, and two-way texts a worker writes on the
// client's file), plus replies coming back from the client (Twilio).
// Pure logic, no Firebase imports, so it can be tested on its own (see test/).
// index.js wires it to Firestore and the SMS provider.
//
// The browser never supplies a phone number. It asks "send the handbook / the
// intake link / this message to client X". For the handbook and intake link
// the message is written here; for a worker's message only its words come from
// the browser. Everything else is decided here, from the client's own record:
//   • the requester must be a signed-in account listed in the staff directory
//   • the client must have said it's safe to leave texts ("Yes" on intake)
//   • the number must be an Australian mobile
//   • the handbook goes once per number; an intake link once per link
//   • a client who replied STOP gets no more texts (until they reply START)
//   • a worker's message is at most MESSAGE_MAX_PARTS SMS long
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
const MESSAGE_MAX_CHARS = 640;          // a worker's message (the Firestore rules allow the same)
const MESSAGE_MAX_PARTS = 4;            // …and at most this many billed SMS
const INBOUND_MAX_CHARS = 1600;         // a reply is kept up to this length (Twilio's own limit)

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
// A worker's message: typographic quotes/dashes made plain (they would make the text cost 2-3x as
// much), other characters kept, spaces tidied. Emoji etc. are kept — the text is then billed as UCS-2.
function normaliseMessage(text) {
  return String(text || '')
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-').replace(/\u2026/g, '...').replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
// How many billed SMS parts a text takes.
function smsParts(text) {
  const s = String(text || '');
  const gsm = s.split('').every(ch => GSM_BASIC.includes(ch) || GSM_EXT.includes(ch));
  if (gsm) {
    const len = s.split('').reduce((n, ch) => n + (GSM_EXT.includes(ch) ? 2 : 1), 0);
    return len <= 160 ? 1 : Math.ceil(len / 153);
  }
  const len = s.length;          // UCS-2 is billed in 16-bit units: an emoji counts as 2
  return len <= 70 ? 1 : Math.ceil(len / 67);
}

// First name only, letters/spaces/hyphens/apostrophes — whatever is on file,
// the text can't carry anything else. Accents are dropped (they would cost UCS-2).
// Client names are recorded surname first ("Burns Jason"): the preferred name if there is one, else the
// name after a comma ("Burns, Jason"), else the second word. Same rule as site/index.html clientGivenName.
const _nameWords = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/"[^"]*"/g, ' ').trim().split(/\s+/).filter(Boolean);
function givenName(client) {
  const pref = _nameWords(client.preferredName)[0]; if (pref) return pref;
  const full = String(client.fullName || '');
  if (full.includes(',')) { const after = _nameWords(full.slice(full.indexOf(',') + 1).replace(/,/g, ' '))[0]; if (after) return after; }
  const w = _nameWords(full.replace(/,/g, ' '));
  return w.length >= 2 ? w[1] : (w[0] || '');
}
function firstName(client, max) {
  const raw = givenName(client || {});
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
    `Hi ${n}, welcome to Worn Gundidj. Your Participant Handbook: ${handbookUrl} Questions? Call ${ORG_PHONE}`,
    `Hi ${s}, your Worn Gundidj handbook: ${handbookUrl} Questions? ${ORG_PHONE}`,
    `Worn Gundidj handbook: ${handbookUrl} Questions? ${ORG_PHONE}`,
  ]);
}
function intakeMessage(client, linkUrl, days) {
  const n = firstName(client), s = firstName(client, 10), d = Math.max(1, Math.round(days || 7));
  return _fit([
    `Hi ${n}, please fill in your Worn Gundidj intake form: ${linkUrl} (works ${d} days). Questions? ${ORG_PHONE}`,
    `Hi ${s}, your Worn Gundidj intake form: ${linkUrl} (works ${d} days). Questions? ${ORG_PHONE}`,
    `Worn Gundidj intake form: ${linkUrl} Questions? ${ORG_PHONE}`,
  ]);
}
const money = v => '$' + (Math.round(v * 100) / 100).toFixed(2);
// Several teams share the CMS. A link for a team other than Worn Gundidj carries the team:
// /i#<team>.<link id>  (Worn Gundidj links stay /i#<link id>). Must agree with site/teams.js
// linkPart() — a test checks.
const teamLinkPart = (teamId, linkId) => (!teamId || teamId === 'worngundidj' || !/^[a-z0-9]{2,24}$/.test(String(teamId))) ? linkId : teamId + '.' + linkId;

// Decide and (if allowed) send. deps are injected so this runs without
// Firebase or a real provider in tests.
//   req  — the outbox document: { kind: 'handbook'|'intake'|'message', clientId, requestedBy, linkId?, body? }
//   deps — { handbookUrl, appUrl, monthlyBudget, costPerPart,
//            getRequesterEmail(uid), getStaffEmails(), getClient(id),
//            alreadySent(clientId, mobile), sentInLastHour(), monthSpend() → $ so far this month,
//            getIntakeForm(linkId) → { clientId, status, expiresAtMs }, alreadySentLink(linkId),
//            isOptedOut(mobile) → true if they replied STOP, send(e164, body) }
async function processRequest(req, deps) {
  const out = (status, reason, extra) => Object.assign({ status, reason: reason || '' }, extra || {});
  const kind = req && req.kind;
  if (kind !== 'handbook' && kind !== 'intake' && kind !== 'message') return out('skipped', 'Unknown request type');
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
  if (deps.isOptedOut && await deps.isOptedOut(mobile)) return out('skipped', 'The client replied STOP - texts to this number are switched off until they reply START', { to: maskPhone(mobile) });

  let body;
  if (kind === 'message') {
    body = normaliseMessage(req.body);
    if (!body) return out('skipped', 'The message is empty');
    if (body.length > MESSAGE_MAX_CHARS || smsParts(body) > MESSAGE_MAX_PARTS) return out('skipped', `The message is too long (at most ${MESSAGE_MAX_PARTS} SMS)`, { to: maskPhone(mobile) });
  } else if (kind === 'handbook') {
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
    body = intakeMessage(client, String(deps.appUrl).replace(/\/+$/, '') + '/i#' + teamLinkPart(deps.teamId, linkId), Math.ceil(msLeft / 864e5));
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
    return out('sent', '', { to: maskPhone(mobile), toFull: mobile, providerId: String(providerId || ''), parts, cost: Math.round(cost * 10000) / 10000, message: body });
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

// ---- Replies (Twilio → receiveSms) ------------------------------------------------
// Twilio signs every webhook: base64(HMAC-SHA1(auth token, the exact URL + each POST field name
// and value, sorted by name)). https://www.twilio.com/docs/usage/webhooks/webhooks-security
function twilioSignature(authToken, url, params) {
  const crypto = require('crypto');
  const data = Object.keys(params || {}).sort().reduce((acc, k) => {
    const v = params[k];
    return acc + (Array.isArray(v) ? v.slice().sort().map(x => k + x).join('') : k + (v == null ? '' : String(v)));
  }, String(url || ''));
  return crypto.createHmac('sha1', String(authToken || '')).update(Buffer.from(data, 'utf-8')).digest('base64');
}
// True when the signature matches any of the URLs the request may have been sent to.
function validTwilioSignature(authToken, urls, params, signature) {
  const crypto = require('crypto');
  if (!authToken || !signature) return false;
  const got = Buffer.from(String(signature));
  return (urls || []).filter(Boolean).some(u => { const want = Buffer.from(twilioSignature(authToken, u, params)); return want.length === got.length && crypto.timingSafeEqual(want, got); });
}
// STOP / START words (the whole reply, any case). "Yes", "No" etc. are ordinary replies.
function optOutWord(body) {
  const w = String(body || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT'].includes(w)) return 'stop';
  if (['START', 'UNSTOP', 'OPTIN'].includes(w)) return 'start';
  return '';
}
// Any number → E.164-ish for display/storage: Australian mobiles as 04xxxxxxxx, others as given.
function inboundNumber(v) { const m = auMobile(v); return m || String(v || '').replace(/[^\d+]/g, '').slice(0, 20); }

// Work out which client a reply is from, and the record to keep.
//   p    — Twilio's POST fields: { MessageSid, From, To, Body, NumMedia }
//   deps — { lastTextTo(mobile) → [{ clientId, at }] (texts we sent to that number),
//            clientsWithMobile(mobile) → [{ id, status }] (clients whose phone is that number),
//            clientHasMobile(clientId, mobile) → bool }
// Matching: the client we last texted at that number (if it's still their number); otherwise the one
// client on file with that mobile (active files first). If it can't be told apart, it is left
// unmatched (with the possible clients) for a manager to assign.
async function processInbound(p, deps) {
  const sid = String(p.MessageSid || p.SmsSid || '');
  if (!/^[A-Za-z0-9]{10,64}$/.test(sid)) return { error: 'No message id' };
  const mobile = auMobile(p.From), fromFull = inboundNumber(p.From);
  const body = String(p.Body || '').replace(/\r\n?/g, '\n').slice(0, INBOUND_MAX_CHARS);
  let clientId = '', matchedBy = '', candidates = [];
  if (mobile) {
    const sentTo = (await deps.lastTextTo(mobile) || []).filter(x => x && x.clientId).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    for (const x of sentTo) { if (await deps.clientHasMobile(x.clientId, mobile)) { clientId = x.clientId; matchedBy = 'last-text'; break; } }
    if (!clientId) {
      const all = await deps.clientsWithMobile(mobile) || [];
      const active = all.filter(c => (c.status || 'active') === 'active');
      const pick = active.length ? active : all;
      if (pick.length === 1) { clientId = pick[0].id; matchedBy = 'phone'; }
      else candidates = pick.map(c => c.id).slice(0, 5);
    }
  }
  return {
    id: sid,
    doc: { providerId: sid, from: mobile ? maskPhone(mobile) : fromFull, fromFull, to: String(p.To || '').slice(0, 20), body,
      numMedia: Math.max(0, Math.min(10, parseInt(p.NumMedia, 10) || 0)), receivedAt: new Date().toISOString(),
      clientId, matchedBy, candidates, status: 'new', optOut: optOutWord(body) },
  };
}

module.exports = { givenName, normaliseMessage, twilioSignature, validTwilioSignature, optOutWord, inboundNumber, processInbound, MESSAGE_MAX_CHARS, MESSAGE_MAX_PARTS, INBOUND_MAX_CHARS, teamLinkPart, auMobile, toE164, maskPhone, firstName, handbookMessage, intakeMessage, toGsm, smsParts, budgetMonth, processRequest, providerRequest, sendViaProvider,
  HOURLY_CAP, DEFAULT_MONTHLY_BUDGET, DEFAULT_COST_PER_PART };

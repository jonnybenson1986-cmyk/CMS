// The outbox handler, with Firestore/Auth/provider passed in (env) so it can
// be exercised end to end in tests without Firebase. index.js supplies the
// real ones.
const lib = require('./lib');

// env: { db, auth, handbookUrl, appUrl, monthlyBudget, costPerPart, provider, increment(n), send(to, body) }
async function handleOutbox(snap, teamId, env) {
  if (!snap) return null;
  const ref = snap.ref, db = env.db;
  const team = db.collection('teams').doc(teamId);

  // Claim it exactly once (events can be delivered more than once).
  const claimed = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists || cur.get('status')) return false;
    tx.update(ref, { status: 'sending', claimedAt: new Date().toISOString() });
    return true;
  });
  if (!claimed) return null;

  const req = snap.data();
  const month = lib.budgetMonth();
  const usageRef = team.collection('smsUsage').doc(month);
  const result = await lib.processRequest(req, {
    teamId, handbookUrl: env.handbookUrl, appUrl: env.appUrl, monthlyBudget: env.monthlyBudget, costPerPart: env.costPerPart,
    getRequesterEmail: async (uid) => { try { return (await env.auth.getUser(String(uid || ''))).email || ''; } catch (_) { return ''; } },
    getStaffEmails: async () => {
      const d = await team.collection('staff').doc('list').get();
      return new Set(((d.exists && d.get('list')) || []).map(s => String(s.email || '').trim().toLowerCase()).filter(Boolean));
    },
    getClient: async (id) => { const d = await team.collection('clients').doc(String(id || '')).get(); return d.exists ? d.data() : null; },
    alreadySent: async (clientId, mobile) => {
      const q = await team.collection('smsOutbox').where('clientId', '==', clientId).where('status', '==', 'sent').where('toFull', '==', mobile).limit(1).get();
      if (!q.empty) return true;
      const c = await team.collection('clients').doc(clientId).get();
      return ((c.exists && c.get('handbookSent')) || []).some(h => h && h.toFull === mobile);
    },
    // Only sent texts carry sentAt, so a single-field range query (no custom index needed) counts them.
    sentInLastHour: async () => {
      const since = new Date(Date.now() - 3600 * 1000).toISOString();
      return (await team.collection('smsOutbox').where('sentAt', '>=', since).count().get()).data().count;
    },
    // Spend so far this month, kept on teams/{team}/smsUsage/{yyyy-mm} (staff can read it, only this code writes it).
    monthSpend: async () => { const u = await usageRef.get(); return u.exists ? Number(u.get('cost') || 0) : 0; },
    getIntakeForm: async (linkId) => {
      const q = await team.collection('intakeForms').where('linkId', '==', linkId).limit(1).get();
      if (q.empty) return null;
      const f = q.docs[0].data(), exp = f.expiresAt;
      return { clientId: f.clientId, status: f.status, expiresAtMs: exp && exp.toMillis ? exp.toMillis() : Date.parse(f.expiresAtIso || '') || 0 };
    },
    alreadySentLink: async (linkId) => !(await team.collection('smsOutbox').where('linkId', '==', linkId).where('status', '==', 'sent').limit(1).get()).empty,
    isOptedOut: async (mobile) => (await team.collection('smsOptOut').doc(mobile).get()).exists,
    send: env.send,
  });

  const now = new Date().toISOString();
  await ref.update(Object.assign({ status: result.status, reason: result.reason, to: result.to || '', toFull: result.toFull || '',
    providerId: result.providerId || '', processedAt: now }, result.status === 'sent' ? { sentAt: now, parts: result.parts, cost: result.cost, message: result.message || '' } : {}));
  if (result.status === 'sent') {
    await usageRef.set({ month, sent: env.increment(1), parts: env.increment(result.parts), cost: env.increment(result.cost),
      budget: Number(env.monthlyBudget) || lib.DEFAULT_MONTHLY_BUDGET, costPerPart: Number(env.costPerPart) || lib.DEFAULT_COST_PER_PART, updatedAt: now }, { merge: true });
  } else if (/budget/i.test(result.reason)) {
    await usageRef.set({ month, budgetReachedAt: now, budget: Number(env.monthlyBudget) || lib.DEFAULT_MONTHLY_BUDGET }, { merge: true });
  }
  await team.collection('auditlog').add({
    ts: now, worker: req.requestedByName || 'system', role: '', page: 'cloud-function', server: true,
    action: req.kind === 'message' ? (result.status === 'sent' ? 'Text message sent' : 'Text message not sent')
      : (req.kind === 'intake' ? 'Intake form link' : 'Handbook') + (result.status === 'sent' ? ' texted (automatic)' : ' text not sent (automatic)'),
    detail: `${result.to ? result.to + ' — ' : ''}${result.status === 'sent' ? 'sent by ' + env.provider : result.reason}`,
    clientId: String(req.clientId || ''),
  });
  return result;
}
// ---- Replies: Twilio's webhook (receiveSms) ----------------------------------------
// env: { db, authToken, webhookUrl, provider }. req/res are Express-style.
// The team is ?team=<id> on the webhook URL (each team's Twilio number points at its own URL);
// Twilio's signature covers the whole URL, so it cannot be changed by anyone without the auth token.
const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
function signatureUrls(req, configured) {
  const orig = String(req.originalUrl || req.url || '/'), q = orig.includes('?') ? orig.slice(orig.indexOf('?')) : '';
  const host = (req.get && (req.get('x-forwarded-host') || req.get('host'))) || '';
  const urls = [];
  if (configured) urls.push(configured.includes('?') ? configured : configured.replace(/\/+$/, '') + q);
  if (host) urls.push('https://' + host + orig);
  return urls;
}
async function handleInbound(req, res, env) {
  const send = (code, body, type) => { res.status(code); if (type) res.set('Content-Type', type); return res.send(body); };
  if (req.method !== 'POST') return send(405, 'Method not allowed');
  if (env.provider !== 'twilio') return send(404, 'Replies are only received with SMS_PROVIDER=twilio');
  const params = req.body && typeof req.body === 'object' ? req.body : {};
  if (!lib.validTwilioSignature(env.authToken, signatureUrls(req, env.webhookUrl), params, req.get && req.get('x-twilio-signature'))) return send(403, 'Bad signature');
  const teamId = String((req.query && req.query.team) || 'worngundidj');
  if (!/^[a-z0-9]{2,24}$/.test(teamId)) return send(400, 'Bad team');
  const team = env.db.collection('teams').doc(teamId);

  const got = await lib.processInbound(params, {
    // Texts we sent to that number (one equality filter, so no custom index is needed).
    lastTextTo: async (mobile) => (await team.collection('smsOutbox').where('toFull', '==', mobile).limit(50).get()).docs
      .map(d => ({ clientId: d.get('clientId'), at: d.get('sentAt') || d.get('processedAt') || '' })),
    clientHasMobile: async (id, mobile) => { const c = await team.collection('clients').doc(String(id)).get(); return c.exists && lib.auMobile(c.get('phone')) === mobile; },
    // Phone numbers are stored as typed, so they are compared after tidying. Only the phone and status are read.
    clientsWithMobile: async (mobile) => (await team.collection('clients').select('phone', 'status').get()).docs
      .filter(d => lib.auMobile(d.get('phone')) === mobile).map(d => ({ id: d.id, status: d.get('status') || 'active' })),
  });
  if (got.error) return send(400, got.error);

  const ref = team.collection('smsInbox').doc(got.id);
  if ((await ref.get()).exists) return send(200, TWIML_EMPTY, 'text/xml');      // Twilio retried: already kept
  await ref.set(got.doc);
  const mobile = lib.auMobile(got.doc.fromFull);
  if (mobile && got.doc.optOut === 'stop') await team.collection('smsOptOut').doc(mobile).set({ mobile, at: got.doc.receivedAt, via: 'Replied STOP', clientId: got.doc.clientId });
  if (mobile && got.doc.optOut === 'start') await team.collection('smsOptOut').doc(mobile).delete();
  await team.collection('auditlog').add({
    ts: got.doc.receivedAt, worker: 'system', role: '', page: 'cloud-function', server: true,
    action: got.doc.optOut === 'stop' ? 'Text received - client replied STOP (texts switched off)' : got.doc.optOut === 'start' ? 'Text received - client replied START (texts back on)' : 'Text received',
    detail: `${got.doc.from} - ${got.doc.clientId ? 'matched to the client (' + (got.doc.matchedBy === 'last-text' ? 'last text sent to this number' : 'phone number on file') + ')' : 'not matched to a client - waiting for a manager'}`,
    clientId: got.doc.clientId || '',
  });
  return send(200, TWIML_EMPTY, 'text/xml');       // an empty reply: Twilio sends nothing back to the client
}
module.exports = { handleOutbox, handleInbound, signatureUrls, TWIML_EMPTY };

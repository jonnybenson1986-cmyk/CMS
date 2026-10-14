// The outbox handler, with Firestore/Auth/provider passed in (env) so it can
// be exercised end to end in tests without Firebase. index.js supplies the
// real ones.
const lib = require('./lib');

// env: { db, auth, handbookUrl, provider, send(to, body) }
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
  const result = await lib.processRequest(req, {
    handbookUrl: env.handbookUrl,
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
    send: env.send,
  });

  const now = new Date().toISOString();
  await ref.update(Object.assign({ status: result.status, reason: result.reason, to: result.to || '', toFull: result.toFull || '',
    providerId: result.providerId || '', processedAt: now }, result.status === 'sent' ? { sentAt: now } : {}));
  await team.collection('auditlog').add({
    ts: now, worker: req.requestedByName || 'system', role: '', page: 'cloud-function', server: true,
    action: result.status === 'sent' ? 'Handbook texted (automatic)' : 'Handbook text not sent (automatic)',
    detail: `${result.to ? result.to + ' — ' : ''}${result.status === 'sent' ? 'sent by ' + env.provider : result.reason}`,
    clientId: String(req.clientId || ''),
  });
  return result;
}
module.exports = { handleOutbox };

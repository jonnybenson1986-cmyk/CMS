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
    handbookUrl: env.handbookUrl, appUrl: env.appUrl, monthlyBudget: env.monthlyBudget, costPerPart: env.costPerPart,
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
    send: env.send,
  });

  const now = new Date().toISOString();
  await ref.update(Object.assign({ status: result.status, reason: result.reason, to: result.to || '', toFull: result.toFull || '',
    providerId: result.providerId || '', processedAt: now }, result.status === 'sent' ? { sentAt: now, parts: result.parts, cost: result.cost } : {}));
  if (result.status === 'sent') {
    await usageRef.set({ month, sent: env.increment(1), parts: env.increment(result.parts), cost: env.increment(result.cost),
      budget: Number(env.monthlyBudget) || lib.DEFAULT_MONTHLY_BUDGET, costPerPart: Number(env.costPerPart) || lib.DEFAULT_COST_PER_PART, updatedAt: now }, { merge: true });
  } else if (/budget/i.test(result.reason)) {
    await usageRef.set({ month, budgetReachedAt: now, budget: Number(env.monthlyBudget) || lib.DEFAULT_MONTHLY_BUDGET }, { merge: true });
  }
  await team.collection('auditlog').add({
    ts: now, worker: req.requestedByName || 'system', role: '', page: 'cloud-function', server: true,
    action: (req.kind === 'intake' ? 'Intake form link' : 'Handbook') + (result.status === 'sent' ? ' texted (automatic)' : ' text not sent (automatic)'),
    detail: `${result.to ? result.to + ' — ' : ''}${result.status === 'sent' ? 'sent by ' + env.provider : result.reason}`,
    clientId: String(req.clientId || ''),
  });
  return result;
}
module.exports = { handleOutbox };

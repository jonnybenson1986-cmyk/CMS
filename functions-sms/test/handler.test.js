// End-to-end test of the outbox handler against an in-memory Firestore.
// Run: cd functions-sms && node --test     (no Firebase, no network)
const test = require('node:test');
const assert = require('node:assert');
const { handleOutbox } = require('../handler');
const lib = require('../lib');

function memoryFirestore() {
  const store = new Map();
  const snap = (path) => { const d = store.get(path); return { exists: !!d, id: path.split('/').pop(), ref: docRef(path), data: () => d && { ...d }, get: (k) => (d ? d[k] : undefined) }; };
  const docRef = (path) => ({ path, get: async () => snap(path), collection: (n) => colRef(path + '/' + n),
    update: async (d) => { if (!store.has(path)) throw new Error('no doc ' + path); store.set(path, { ...store.get(path), ...d }); } });
  const colRef = (path, filters = [], lim = Infinity) => {
    const docs = () => [...store.keys()].filter(k => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1).map(snap)
      .filter(s => filters.every(([f, op, v]) => (op === '==' ? s.get(f) === v : s.get(f) !== undefined && s.get(f) >= v))).slice(0, lim);
    return { doc: (id) => docRef(path + '/' + id), where: (f, op, v) => colRef(path, [...filters, [f, op, v]], lim), limit: (n) => colRef(path, filters, n),
      add: async (d) => { const id = 'a' + store.size; store.set(path + '/' + id, d); return docRef(path + '/' + id); },
      get: async () => { const d = docs(); return { empty: !d.length, docs: d, size: d.length }; },
      count: () => ({ get: async () => ({ data: () => ({ count: docs().length }) }) }) };
  };
  return { store, snap, db: { collection: (n) => colRef(n), runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, d) => r.update(d) }) } };
}

test('outbox request → text sent once, results written back and audited', async () => {
  const { store, snap, db } = memoryFirestore();
  const T = 'teams/worngundidj';
  store.set(T + '/staff/list', { list: [{ email: 'jon.benson@worngundidj.org.au', role: 'sysmanager' }] });
  store.set(T + '/clients/c1', { fullName: 'Jordan Citizen', preferredName: 'Jordy', phone: '0491 570 156', ifSafeContact: 'Yes' });
  store.set(T + '/clients/c2', { fullName: 'Riley Tester', phone: '0491 570 157', ifSafeContact: 'No' });
  const sent = [];
  const env = { db, provider: 'clicksend', handbookUrl: 'https://cms.example.org/handbook/SEWB-Participant-Handbook.pdf',
    auth: { getUser: async (uid) => { const u = { u1: 'jon.benson@worngundidj.org.au', u2: 'stranger@example.com' }[uid]; if (!u) throw new Error('none'); return { email: u }; } },
    send: async (to, body) => { sent.push({ to, body }); return 'MSG' + sent.length; } };
  const fire = async (id, data) => { store.set(T + '/smsOutbox/' + id, data); await handleOutbox(snap(T + '/smsOutbox/' + id), 'worngundidj', env); return store.get(T + '/smsOutbox/' + id); };
  const audits = () => [...store.keys()].filter(k => k.startsWith(T + '/auditlog/')).map(k => store.get(k));

  let o = await fire('r1', { kind: 'handbook', clientId: 'c1', requestedBy: 'u1', requestedByName: 'Jon Benson' });
  assert.equal(o.status, 'sent'); assert.equal(o.to, '0491 ••• 156'); assert.equal(o.providerId, 'MSG1'); assert.ok(o.sentAt);
  assert.equal(sent.length, 1); assert.equal(sent[0].to, '+61491570156'); assert.match(sent[0].body, /^Hi Jordy,/);
  assert.ok(audits().some(a => a.action === 'Handbook texted (automatic)' && /0491 ••• 156/.test(a.detail) && !/0491570156/.test(a.detail) && a.worker === 'Jon Benson'));

  o = await fire('r2', { kind: 'handbook', clientId: 'c1', requestedBy: 'u1' });           // same client & number again
  assert.equal(o.status, 'skipped'); assert.match(o.reason, /already sent/); assert.equal(sent.length, 1);

  await handleOutbox(snap(T + '/smsOutbox/r1'), 'worngundidj', env);                     // event delivered twice
  assert.equal(sent.length, 1);

  assert.equal((await fire('r3', { kind: 'handbook', clientId: 'c2', requestedBy: 'u1' })).status, 'skipped');   // no consent
  assert.equal((await fire('r4', { kind: 'handbook', clientId: 'c1', requestedBy: 'u2' })).status, 'skipped');   // not staff
  assert.equal((await fire('r5', { kind: 'handbook', clientId: 'nope', requestedBy: 'u1' })).status, 'skipped'); // no such file
  assert.equal(sent.length, 1);
  assert.ok(audits().some(a => a.action === 'Handbook text not sent (automatic)'));
});

test('hourly cap counts texts sent in the last hour', async () => {
  const { store, snap, db } = memoryFirestore();
  const T = 'teams/worngundidj';
  store.set(T + '/staff/list', { list: [{ email: 'a@b.org' }] });
  store.set(T + '/clients/c1', { fullName: 'A B', phone: '0491570156', ifSafeContact: 'Yes' });
  const recent = new Date().toISOString();
  for (let i = 0; i < lib.HOURLY_CAP; i++) store.set(`${T}/smsOutbox/old${i}`, { status: 'sent', sentAt: recent, clientId: 'x' + i, toFull: '04' });
  let n = 0; const env = { db, provider: 'clicksend', handbookUrl: 'https://x.org/h.pdf', auth: { getUser: async () => ({ email: 'a@b.org' }) }, send: async () => { n++; return 'M'; } };
  store.set(T + '/smsOutbox/new', { kind: 'handbook', clientId: 'c1', requestedBy: 'u' });
  await handleOutbox(snap(T + '/smsOutbox/new'), 'worngundidj', env);
  assert.equal(store.get(T + '/smsOutbox/new').status, 'failed'); assert.equal(n, 0);
});

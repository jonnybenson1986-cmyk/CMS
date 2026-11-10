// Unit tests for the Data Health engine and schema (site/data-health.js).
// Run: node --test tests/unit/data-health.test.js        Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../../site/data-health.js');
const DH = globalThis.WG_DATA_HEALTH;

// Stand-ins for the CMS helpers the schema calls.
const helpers = (over = {}) => Object.assign({
  goalIsMeasurable: g => !!g && g.baseline != null && g.target != null,
  goalReviewOverdue: g => !!g && !g.outcome && !!g.reviewDate && g.reviewDate < '2026-06-01',
  homeRiskStatus: c => (c.homeRisk && c.homeRisk.date ? { ok: true, msg: 'Current' } : { ok: false, msg: 'No home risk assessment on file' }),
  hasHandbook: c => !!(c.handbookSent && c.handbookSent.length),
}, over);
const score = (c, o = {}) => DH.compute(c, Object.assign({ helpers: helpers() }, o));

const FULL = {
  id: 'x', fullName: 'Jordan Citizen', dob: '1985-03-14', gender: 'Female', atsi: 'Yes — Aboriginal', phone: '0491 570 156',
  ifSafeContact: 'Yes', ifEc1name: 'Pat Example', email: 'j@example.com', mob: 'Gunditjmara', languages: 'English', gp: 'Dr Example',
  keyWorker: 'Sam Worker', riskLevel: 'low', referralSource: 'Self', homeRisk: { date: '2026-05-01' },
  intakeSavedAt: '2026-05-01T10:00', ifConsentSigned: true, ifConsentDate: '2026-05-01', ifHousing: ['Private rental'], ifEmployment: ['Employed'], ifHasChildren: 'No',
  goalPlan: [{ id: 'g', title: 'Feel settled', baseline: 3, target: 8, reviewDate: '2026-12-01' }],
  handbookSent: [{ at: '2026-05-01' }], attachments: [{ name: 'scan001.pdf', docType: 'consent' }],
};

test('schema is well formed: unique ids, known levels, exactly one rule each', () => {
  const ids = new Set(), rules = ['has', 'anyOf', 'allOf', 'doc', 'test', 'ratio'];
  for (const sec of DH.SCHEMA) {
    assert.ok(sec.id && sec.label && sec.items.length, `section ${sec.id}`);
    for (const it of sec.items) {
      assert.ok(!ids.has(it.id), `duplicate id ${it.id}`); ids.add(it.id);
      assert.ok(DH.WEIGHTS[it.level] > 0, `${it.id}: level "${it.level}"`);
      assert.equal(rules.filter(r => it[r] != null).length, 1, `${it.id}: needs exactly one rule`);
      if (it.doc) assert.ok(DH.DOC_TYPES.some(t => t.key === it.doc), `${it.id}: unknown document type ${it.doc}`);
    }
  }
});

test('no record → unavailable, score null (never a made-up number)', () => {
  for (const v of [undefined, null, 'x']) { const r = DH.compute(v); assert.equal(r.status, 'unavailable'); assert.equal(r.score, null); }
});

test('an empty file scores 0; a complete file scores 100; in between is in between', () => {
  const empty = score({}); assert.equal(empty.score, 0); assert.equal(empty.band.key, 'poor');
  const full = score(FULL); assert.equal(full.score, 100, JSON.stringify(full.missing.map(i => i.id))); assert.equal(full.band.key, 'excellent'); assert.deepEqual(full.missing, []);
  const part = score({ ...FULL, dob: '', email: '' });
  assert.ok(part.score > 0 && part.score < 100); assert.deepEqual(part.missing.map(i => i.id), ['dob', 'email']);   // heaviest first
});

test('score is an integer 0–100 = earned ÷ possible, and weights follow the level', () => {
  const r = score({ ...FULL, dob: '', email: '' });
  assert.equal(r.score, Math.round(r.earned / r.possible * 100));
  assert.equal(r.possible - r.earned, DH.WEIGHTS.critical + DH.WEIGHTS.recommended);
  assert.ok(Number.isInteger(r.score));
});

test('critical gaps cost more than recommended gaps', () => {
  assert.ok(score({ ...FULL, dob: '' }).score < score({ ...FULL, email: '' }).score);
});

test('conditional blocks only count for the clients they apply to', () => {
  const base = score(FULL);
  assert.ok(!base.sections.some(s => s.id === 'aod'));
  const aod = score({ ...FULL, aod: true });
  assert.ok(aod.sections.some(s => s.id === 'aod')); assert.ok(aod.possible > base.possible); assert.ok(aod.score < 100);
  assert.equal(score({ ...FULL, aod: true, aodPrimary: 'Alcohol', aodTreatment: 'Counselling', aodStage: 'Action' }).score, 100);
  // safety plan: only medium / high risk
  assert.ok(!score(FULL).sections.find(s => s.id === 'care').items.some(i => i.id === 'safetyPlan'));
  const hi = score({ ...FULL, riskLevel: 'high' });
  assert.equal(hi.missing[0].id, 'safetyPlan'); assert.equal(score({ ...FULL, riskLevel: 'high', sfDate: '2026-05-02' }).score, 100);
  // children: only when "children in care" is Yes
  const kids = score({ ...FULL, ifHasChildren: 'Yes' });
  assert.deepEqual(kids.missing.map(i => i.id).sort(), ['childrenList', 'safeHome']);
  // closed files gain a closure block
  assert.ok(score({ ...FULL, status: 'closed' }).sections.some(s => s.id === 'closure'));
});

test('part-credit: SEWB domains assessed 4 of 8 earns half that item', () => {
  const r = score({ ...FULL, sewb: true, sewbGoals: 'x', sewbDomains: [3, 4, 2, 5, 0, 0, 0, 0] });
  const it = r.sections.find(s => s.id === 'sewb').items.find(i => i.id === 'sewbDomains');
  assert.equal(it.fraction, 0.5); assert.equal(it.ok, false);
  assert.equal(r.possible - r.earned, DH.WEIGHTS.required * 0.5);
});

test('documents: a typed file counts; older files are recognised by name; others do not', () => {
  const doc = c => score(c).sections.find(s => s.id === 'documents').items.find(i => i.id === 'docConsent').ok;
  assert.equal(doc({ ...FULL, attachments: [] }), false);
  assert.equal(doc({ ...FULL, attachments: [{ name: 'photo.jpg' }] }), false);
  assert.equal(doc({ ...FULL, attachments: [{ name: 'Signed Consent Form.pdf' }] }), true);
  assert.equal(doc({ ...FULL, attachments: [{ name: 'Signed Consent Form.pdf', docType: 'other' }] }), false);   // a worker's choice beats the name
  assert.equal(DH.docTypeOf({ name: 'idea.pdf' }), ''); assert.equal(DH.docTypeOf({ name: 'client_id.pdf' }), 'id');
  const ndis = score({ ...FULL, disability: true, ndis: '430000000', dis: { primary: 'x' } });
  assert.deepEqual(ndis.missing.map(i => i.id), ['docNdisPlan']);
});

test('"filled in" means non-blank: spaces, empty lists and false do not count', () => {
  for (const v of ['', '   ', [], {}, null, undefined, false]) assert.equal(DH.filled(v), false, JSON.stringify(v));
  for (const v of ['a', ['a'], true, 0, 3]) assert.equal(DH.filled(v), true, JSON.stringify(v));
});

test('a check that cannot run is left out and reported — it never crashes or guesses', () => {
  const r = DH.compute(FULL, { helpers: {} });                       // no CMS helpers at all
  assert.equal(r.status, 'ok'); assert.ok(r.errors.some(e => e.id === 'homeRisk')); assert.ok(r.errors.some(e => e.id === 'handbook'));
  assert.ok(!r.sections.flatMap(s => s.items).some(i => i.id === 'homeRisk'));
  assert.equal(r.score, 100);                                        // scored on what could be checked
});

test('the schema scales: a new field is one line, weights can be changed, no engine change', () => {
  const schema = [{ id: 's', label: 'S', items: [
    { id: 'a', label: 'A', level: 'required', has: 'a' },
    { id: 'b', label: 'B', level: 'recommended', has: 'nested.b' },
    { id: 'c', label: 'C', level: 'required', allOf: ['a', 'c'], when: 'needsC' },
  ] }];
  assert.equal(DH.compute({ a: 1 }, { schema }).score, 67);
  assert.equal(DH.compute({ a: 1, nested: { b: 'x' } }, { schema }).score, 100);
  assert.equal(DH.compute({ a: 1, nested: { b: 'x' }, needsC: true }, { schema }).score, 60);
  assert.equal(DH.compute({ a: 1 }, { schema, weights: { required: 1, recommended: 1 } }).score, 50);
  assert.equal(DH.compute({}, { schema: [{ id: 's', label: 'S', when: 'never', items: schema[0].items }] }).status, 'empty');
  assert.ok(DH.compute({}, { schema: [{ id: 's', label: 'S', items: [{ id: 'z', label: 'Z', level: 'nope', has: 'z' }] }] }).errors.length);
});

test('bands: 90+ excellent, 70+ good, 40+ needs work, below incomplete', () => {
  assert.deepEqual([100, 90, 89, 70, 69, 40, 39, 0].map(n => DH.bandFor(n).key), ['excellent', 'excellent', 'good', 'good', 'fair', 'fair', 'poor', 'poor']);
  assert.equal(DH.bandFor(null), null);
});

test('banner flags: one entry per group, merged labels, in the given order', () => {
  const c = { ...FULL, dob: '', gender: '', aod: true, referralSource: '', goalPlan: [] };
  const f = DH.flags(score(c), c, { helpers: helpers(), groupOrder: ['intake', 'demo', 'consent', 'goals', 'vadc'], mergePrefix: { demo: 'Missing: ', vadc: 'AOD / VADC: ' } });
  assert.deepEqual(f, [
    { group: 'demo', label: 'Missing: date of birth, gender', tab: 'intake' },
    { group: 'goals', label: 'No goals recorded', tab: 'goals' },
    { group: 'vadc', label: 'AOD / VADC: Principal drug of concern, Treatment type, Referral source', tab: 'aod' },
  ]);
});

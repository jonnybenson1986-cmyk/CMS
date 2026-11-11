// Unit tests for site/vpr.js — the Vulnerable Persons Register rules.
// Run: node --test tests/unit/vpr.test.js     (synthetic data only)
const test = require('node:test'), assert = require('node:assert');
require('../../site/vpr.js');
const V = globalThis.WG_VPR;
const full = o => Object.assign({ c1: 'Yes', c2: 'Yes', c3: 'Yes', consent: 'Yes', consentMethod: 'verbal', consentDate: '2026-11-01', consentBy: 'Sam Worker' }, o);

test('there are exactly four criteria, the fourth being consent', () => {
  assert.deepStrictEqual(V.CRITERIA.map(c => c.key), ['c1', 'c2', 'c3', 'c4']);
  assert.match(V.CRITERIA[3].label, /consent/i);
});
test('all four met → eligible; any one missing → not', () => {
  assert.strictEqual(V.eligible(full()), true);
  for (const k of ['c1', 'c2', 'c3']) { assert.strictEqual(V.eligible(full({ [k]: 'No' })), false, k + ' No'); assert.strictEqual(V.eligible(full({ [k]: '' })), false, k + ' blank'); }
  assert.strictEqual(V.eligible(full({ consent: '' })), false);
  assert.strictEqual(V.eligible(full({ consent: 'No' })), false);
  assert.strictEqual(V.eligible(full({ consent: 'Withdrawn' })), false);
  assert.strictEqual(V.eligible({}), false);
  assert.strictEqual(V.eligible(null), false);
});
test('consent needs evidence: how, when and who', () => {
  assert.deepStrictEqual(V.consentEvidence(full()), { ok: true, missing: [] });
  assert.deepStrictEqual(V.consentEvidence(full({ consentMethod: '' })).missing, ['how consent was given']);
  assert.deepStrictEqual(V.consentEvidence(full({ consentDate: '' })).missing, ['date of consent']);
  assert.deepStrictEqual(V.consentEvidence(full({ consentBy: '  ' })).missing, ['who obtained consent']);
  assert.strictEqual(V.consentEvidence(full({ consentMethod: 'made-up' })).ok, false);
});
test('an authorised representative must be named', () => {
  assert.strictEqual(V.eligible(full({ consentMethod: 'representative' })), false);
  assert.strictEqual(V.eligible(full({ consentMethod: 'representative', repName: 'Pat Guardian' })), true);
});
test('on the register only while the file is open', () => {
  assert.strictEqual(V.onRegister({ status: 'active', vpr: full() }), true);
  assert.strictEqual(V.onRegister({ vpr: full() }), true);                       // no status = open
  assert.strictEqual(V.onRegister({ status: 'closed', vpr: full() }), false);
  assert.strictEqual(V.onRegister({ status: 'active' }), false);
  assert.strictEqual(V.onRegister(null), false);
});
test('the reason for coming off is in plain words', () => {
  assert.strictEqual(V.offReason({ status: 'closed', vpr: full() }), 'File closed');
  assert.strictEqual(V.offReason({ status: 'active', vpr: full({ consent: 'Withdrawn' }) }), 'Consent withdrawn');
  assert.match(V.offReason({ status: 'active', vpr: full({ c3: 'No' }) }), /^Criteria not met: 3 \(assessed as not met\)$/);
  assert.strictEqual(V.offReason({ status: 'active', vpr: full() }), '');
});
test('screened = at least one of criteria 1–3 answered', () => {
  assert.strictEqual(V.screened({}), false);
  assert.strictEqual(V.screened({ consent: 'Yes' }), false);
  assert.strictEqual(V.screened({ c2: 'No' }), true);
});
test('revalidation falls due on 30 April and 31 October', () => {
  assert.strictEqual(V.revalidationDates('2026-11-11').next, '2027-04-30');
  assert.strictEqual(V.revalidationDates('2026-11-11').prev, '2026-10-31');
  assert.strictEqual(V.revalidationDates('2026-04-30').next, '2026-04-30');      // due today is still "next"
  assert.strictEqual(V.revalidationDates('2026-05-01').next, '2026-10-31');
  assert.strictEqual(V.revalidationDates('2026-01-10').prev, '2025-10-31');
  assert.strictEqual(V.revalidationDates('2026-11-11').windowStart, '2027-03-30');
});
test('status: verified → re-validate one month before → unverified once missed', () => {
  const v = { listedAt: '2026-06-10T09:00' };
  assert.strictEqual(V.validationStatus(v, '2026-06-10'), 'verified');
  assert.strictEqual(V.validationStatus(v, '2026-09-29'), 'verified');
  assert.strictEqual(V.validationStatus(v, '2026-09-30'), 'revalidate');          // window opens
  assert.strictEqual(V.validationStatus(v, '2026-10-31'), 'revalidate');          // last day
  assert.strictEqual(V.validationStatus(v, '2026-11-01'), 'unverified');          // missed
  const done = { listedAt: '2026-06-10T09:00', lastValidated: '2026-10-12' };
  assert.strictEqual(V.validationStatus(done, '2026-10-20'), 'verified');
  assert.strictEqual(V.validationStatus(done, '2026-11-11'), 'verified');
  assert.strictEqual(V.validationStatus(done, '2027-03-30'), 'revalidate');
  assert.strictEqual(V.validationStatus(done, '2027-05-01'), 'unverified');
});
test('a record listed today is verified whatever the date', () => {
  for (const d of ['2026-01-15', '2026-04-10', '2026-04-30', '2026-05-01', '2026-10-05', '2026-12-31']) assert.strictEqual(V.validationStatus({ listedAt: d + 'T10:00' }, d), 'verified', d);
});
test('considerations read as one line, ignoring values that are not on the list', () => {
  assert.strictEqual(V.considerationsText({ considerations: { mobility: ['Wheelchair'], equipment: ['Oxygen', 'Pets', 'Not a real option'] } }), 'Mobility: Wheelchair; Equipment, critical medication and pets: Oxygen, Pets');
  assert.strictEqual(V.considerationsText({}), '');
  assert.strictEqual(V.considerationsText(null), '');
});
test('the lists match the guidance', () => {
  assert.strictEqual(V.WORKER_CHECKLIST.length, 4);
  assert.deepStrictEqual(V.CONSENT_METHODS.map(m => m.key), ['written', 'verbal', 'representative']);
  assert.deepStrictEqual(V.CONSIDERATIONS.map(g => g.items.length), [5, 5, 8, 8]);
  assert.strictEqual(V.COMMENT_PROMPTS.length, 4);
});

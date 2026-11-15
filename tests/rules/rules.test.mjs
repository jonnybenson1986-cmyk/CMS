// Firestore rules tests — run against the real Firestore emulator, for BOTH
// rule files. Run:  cd tests/rules && npm ci && npm test
// (CI runs this before publishing the rules — .github/workflows/firebase-deploy.yml)
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, Timestamp } from 'firebase/firestore';
import { createRequire } from 'node:module';
import fs from 'node:fs';
let pass = 0, fail = 0;
const check = async (name, p) => { try { await p; pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '-', e.message.slice(0, 160)); } };
const RULES = { 'live.rules': '../../firestore.rules', 'strict.rules': '../../firestore.rules.strict' };
// The keys a client may write must be exactly the intake questions.
createRequire(import.meta.url)('../../site/intake/intake-fields.js');
const KEYS = globalThis.WG_INTAKE.KEYS;
for (const file of Object.keys(RULES)) {
  const src = fs.readFileSync(new URL(RULES[file], import.meta.url), 'utf8');
  const ruleKeys = (src.match(/answers\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  await check(file + ': intake rule keys match site/intake/intake-fields.js', JSON.stringify(ruleKeys) === JSON.stringify(KEYS) ? Promise.resolve() : Promise.reject(new Error('rule keys differ from intake-fields.js')));
}
// ...and the consent form's answers must be exactly the consent wording's keys; a signature must use signing.js's keys.
createRequire(import.meta.url)('../../site/consent/consent-text.js');
createRequire(import.meta.url)('../../site/forms/signing.js');
for (const file of Object.keys(RULES)) {
  const src = fs.readFileSync(new URL(RULES[file], import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('match /teams/{teamId}/consentForms/'));
  const ruleKeys = (block.match(/answers\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  await check(file + ': consent rule keys match site/consent/consent-text.js', JSON.stringify(ruleKeys) === JSON.stringify(globalThis.WG_CONSENT.KEYS) ? Promise.resolve() : Promise.reject(new Error('rule keys differ from consent-text.js')));
  const sigKeys = (src.match(/function validSignature[\s\S]*?s\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  await check(file + ': signature rule keys match site/forms/signing.js', JSON.stringify(sigKeys) === JSON.stringify(globalThis.WG_SIGN.SIG_KEYS) ? Promise.resolve() : Promise.reject(new Error('signature keys differ from signing.js')));
}
for (const file of Object.keys(RULES)) {
  const env = await initializeTestEnvironment({ projectId: 'demo-wg-' + file.split('.')[0], firestore: { rules: fs.readFileSync(new URL(RULES[file], import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 } });
  const T = 'teams/worngundidj';
  const sys = env.authenticatedContext('u-sys', { email: 'jon@x.org', role: 'sysmanager' }).firestore();
  const wkr = env.authenticatedContext('u-wkr', { email: 'w@x.org', role: 'worker' }).firestore();
  const anon = env.unauthenticatedContext().firestore();
  // An ANONYMOUS Firebase session (what anyone could get if Anonymous sign-in were ever switched on).
  const anonUser = env.authenticatedContext('u-anon', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await env.withSecurityRulesDisabled(async ctx => { const d = ctx.firestore();
    await setDoc(doc(d, 'teams/worngundidj/clients/seed'), { id: 'seed', fullName: 'Synthetic Person' });
    await setDoc(doc(d, 'teams/worngundidj/notes/seed'), { id: 'seed', clientId: 'seed', text: 'x' }); });
  for (const col of ['clients', 'notes', 'timelogs', 'referrals', 'calevents', 'walkins', 'staff', 'smsOutbox', 'intakeForms', 'consentForms', 'consentLinks', 'auditlog']) {
    await check(file + `: an anonymous session cannot read ${col}`, assertFails(getDocs(collection(anonUser, 'teams/worngundidj/' + col))));
  }
  await check(file + ': an anonymous session cannot read a client by id', assertFails(getDoc(doc(anonUser, 'teams/worngundidj/clients/seed'))));
  await check(file + ': an anonymous session cannot write a client', assertFails(setDoc(doc(anonUser, 'teams/worngundidj/clients/evil'), { id: 'evil', fullName: 'x' })));
  await check(file + ': an anonymous session cannot request a text', assertFails(setDoc(doc(anonUser, 'teams/worngundidj/smsOutbox/a1'), { kind: 'handbook', clientId: 'seed', requestedBy: 'u-anon', requestedByName: 'x', requestedAt: '2026-10-14T10:00:00Z' })));
  await check(file + ': a signed-out visitor cannot read or list clients', Promise.all([assertFails(getDoc(doc(anon, 'teams/worngundidj/clients/seed'))), assertFails(getDocs(collection(anon, 'teams/worngundidj/clients')))]));
  const ok = { kind: 'handbook', clientId: 'c1', requestedBy: 'u-wkr', requestedByName: 'Sam', requestedAt: '2026-10-14T10:00:00Z' };
  const f = file + ':';
  await check(f + ' staff can request a handbook text for a client', assertSucceeds(setDoc(doc(wkr, T + '/smsOutbox/r1'), ok)));
  await check(f + ' cannot request as someone else (requestedBy must be own uid)', assertFails(setDoc(doc(wkr, T + '/smsOutbox/r2'), { ...ok, requestedBy: 'u-sys' })));
  await check(f + ' cannot slip in a phone number', assertFails(setDoc(doc(wkr, T + '/smsOutbox/r3'), { ...ok, to: '+61400000000' })));
  await check(f + ' cannot slip in message text', assertFails(setDoc(doc(wkr, T + '/smsOutbox/r4'), { ...ok, body: 'spam' })));
  await check(f + ' cannot pre-mark a request as sent', assertFails(setDoc(doc(wkr, T + '/smsOutbox/r5'), { ...ok, status: 'sent' })));
  await check(f + ' only kind "handbook" is accepted', assertFails(setDoc(doc(wkr, T + '/smsOutbox/r6'), { ...ok, kind: 'other' })));
  await check(f + ' cannot change a request after creating it', assertFails(updateDoc(doc(wkr, T + '/smsOutbox/r1'), { status: 'sent' })));
  await check(f + ' cannot delete a request', assertFails(deleteDoc(doc(wkr, T + '/smsOutbox/r1'))));
  await check(f + ' signed-out cannot request', assertFails(setDoc(doc(anon, T + '/smsOutbox/r7'), { ...ok, requestedBy: 'x' })));
  await check(f + ' signed-out cannot read the outbox', assertFails(getDoc(doc(anon, T + '/smsOutbox/r1'))));
  await check(f + ' staff can read the outbox', assertSucceeds(getDoc(doc(wkr, T + '/smsOutbox/r1'))));
  await check(f + ' the app\'s own addDoc shape is accepted', assertSucceeds(addDoc(collection(sys, T + '/smsOutbox'), { ...ok, requestedBy: 'u-sys' })));
  await check(f + ' System Manager can switch automatic texts on', assertSucceeds(setDoc(doc(sys, T + '/smsConfig/settings'), { autoHandbook: true, updatedBy: 'Jon', updatedAt: 'x' })));
  if (file === 'strict.rules') await check(f + ' (strict) a worker cannot switch it', assertFails(setDoc(doc(wkr, T + '/smsConfig/settings'), { autoHandbook: false })));
  await check(f + ' signed-out cannot read the switch', assertFails(getDoc(doc(anon, T + '/smsConfig/settings'))));
  await check(f + ' staff can read the shared Outlook set-up', assertSucceeds(getDoc(doc(wkr, T + '/appConfig/outlook'))));
  await check(f + ' System Manager can save the shared Outlook set-up', assertSucceeds(setDoc(doc(sys, T + '/appConfig/outlook'), { clientId: 'b7fba3e9-1f06-4a44-85de-b1718f821df6' })));
  if (file === 'strict.rules') await check(f + ' (strict) a worker cannot change the Outlook set-up', assertFails(setDoc(doc(wkr, T + '/appConfig/outlook'), { clientId: 'x' })));
  await check(f + ' signed-out cannot read the Outlook set-up', assertFails(getDoc(doc(anon, T + '/appConfig/outlook'))));
  // 💡 ideas
  const idea = { text: 'Log time from the calendar', category: 'A new feature', page: 'Calendar', submittedBy: 'u-wkr', submittedByName: 'Sam', submittedRole: 'worker', createdAt: '2026-10-18T10:00:00Z', status: 'new' };
  await check(f + ' staff can send an idea as themselves', assertSucceeds(setDoc(doc(wkr, T + '/ideas/i1'), idea)));
  await check(f + ' the app\'s own addDoc shape is accepted', assertSucceeds(addDoc(collection(wkr, T + '/ideas'), idea)));
  await check(f + ' cannot send an idea as someone else', assertFails(setDoc(doc(wkr, T + '/ideas/i2'), { ...idea, submittedBy: 'u-sys' })));
  await check(f + ' cannot send an idea pre-marked as done', assertFails(setDoc(doc(wkr, T + '/ideas/i3'), { ...idea, status: 'done' })));
  await check(f + ' cannot add extra fields to an idea', assertFails(setDoc(doc(wkr, T + '/ideas/i4'), { ...idea, clientId: 'c1' })));
  await check(f + ' an empty idea is refused', assertFails(setDoc(doc(wkr, T + '/ideas/i5'), { ...idea, text: '' })));
  await check(f + ' an idea over 2000 characters is refused', assertFails(setDoc(doc(wkr, T + '/ideas/i6'), { ...idea, text: 'x'.repeat(2001) })));
  await check(f + ' signed-out cannot send or read ideas', Promise.all([assertFails(setDoc(doc(anon, T + '/ideas/i7'), { ...idea, submittedBy: 'x' })), assertFails(getDoc(doc(anon, T + '/ideas/i1')))]));
  await check(f + ' the sender can read their own idea', assertSucceeds(getDoc(doc(wkr, T + '/ideas/i1'))));
  await check(f + ' the System Manager can read it and set status + reply', Promise.all([assertSucceeds(getDoc(doc(sys, T + '/ideas/i1'))), assertSucceeds(updateDoc(doc(sys, T + '/ideas/i1'), { status: 'planned', response: 'Great idea', reviewedBy: 'Jon', reviewedAt: 'x' }))]));
  await check(f + ' a review cannot rewrite the idea itself', assertFails(updateDoc(doc(sys, T + '/ideas/i1'), { text: 'changed' })));
  await check(f + ' a review cannot set an unknown status', assertFails(updateDoc(doc(sys, T + '/ideas/i1'), { status: 'deleted' })));
  await check(f + ' ideas can never be deleted', assertFails(deleteDoc(doc(sys, T + '/ideas/i1'))));
  if (file === 'strict.rules') {
    await setDoc(doc(sys, T + '/ideas/s1'), { ...idea, submittedBy: 'u-sys', submittedByName: 'Jon' });
    await check(f + ' (strict) a worker cannot read someone else\'s idea', assertFails(getDoc(doc(wkr, T + '/ideas/s1'))));
    await check(f + ' (strict) a worker cannot review ideas', assertFails(updateDoc(doc(wkr, T + '/ideas/i1'), { status: 'done' })));
  }
  // ── client intake forms (signed-out client) ──
  const later = Timestamp.fromDate(new Date(Date.now() + 7 * 864e5)), past = Timestamp.fromDate(new Date(Date.now() - 1000));
  const form = { linkId: 'L1nkL1nkL1nkL1nkL1nk', clientId: 'c1', status: 'open', expiresAt: later, answers: { fullName: 'Jordan Citizen', phone: '0491570156' }, createdBy: 'u-wkr' };
  const CL = 'C0nsentC0nsentC0nsent1';
  const cform = { linkId: CL, clientId: 'c1', status: 'open', expiresAt: later, version: '2026-11 v1', createdBy: 'u-wkr', needsDob: true };
  await check(f + ' staff can create an intake link + form', Promise.all([
    assertSucceeds(setDoc(doc(wkr, T + '/intakeLinks/L1nkL1nkL1nkL1nkL1nk'), { status: 'open', expiresAt: later, needsDob: true })),
    assertSucceeds(setDoc(doc(wkr, T + '/intakeForms/F1'), form))]));
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, T + '/intakeForms/F2'), { ...form, linkId: 'x2', expiresAt: past });
    await setDoc(doc(d, T + '/intakeForms/F3'), { ...form, linkId: 'x3', status: 'cancelled' });
    await setDoc(doc(d, T + '/intakeForms/F4'), { ...form, linkId: 'x4' });
    await setDoc(doc(d, T + '/intakeForms/F5'), { ...form, linkId: 'x5' }); await setDoc(doc(d, T + '/intakeForms/F6'), { ...form, linkId: 'x6' });
    for (const n of [2, 3, 4, 5, 6, 7, 8]) await setDoc(doc(d, T + '/consentForms/CF' + n), { ...cform, linkId: 'cx' + n });
    await setDoc(doc(d, T + '/consentForms/CFX'), { ...cform, linkId: 'cxx', expiresAt: past });
    await setDoc(doc(d, T + '/consentForms/CFC'), { ...cform, linkId: 'cxc', status: 'cancelled' }); });
  await check(f + ' a signed-out visitor cannot create links or forms', Promise.all([
    assertFails(setDoc(doc(anon, T + '/intakeLinks/Zzzzzzzzzzzzzzzzzzzz'), { status: 'open', expiresAt: later })),
    assertFails(setDoc(doc(anon, T + '/intakeForms/F9'), form))]));
  await check(f + ' the link page can read the link status (no personal details)', assertSucceeds(getDoc(doc(anon, T + '/intakeLinks/L1nkL1nkL1nkL1nkL1nk'))));
  await check(f + ' signed-out cannot LIST links or forms', Promise.all([assertFails(getDocs(collection(anon, T + '/intakeForms'))), assertFails(getDocs(collection(anon, T + '/intakeLinks')))]));
  await check(f + ' the client can open their own form by its id', assertSucceeds(getDoc(doc(anon, T + '/intakeForms/F1'))));
  await check(f + ' an expired form cannot be opened', assertFails(getDoc(doc(anon, T + '/intakeForms/F2'))));
  await check(f + ' a cancelled form cannot be opened', assertFails(getDoc(doc(anon, T + '/intakeForms/F3'))));
  await check(f + ' the client can save answers as a draft', assertSucceeds(updateDoc(doc(anon, T + '/intakeForms/F1'), { answers: { fullName: 'Jordan Citizen', mob: 'Gunditjmara', ifServices: ['yarnElder'] }, status: 'draft', savedAt: 'x', step: 2 })));
  await check(f + ' the client cannot add answers outside the intake questions', assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), { answers: { fullName: 'x', riskLevel: 'low' } })));
  await check(f + ' the client cannot move the form to another client or extend it', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), { clientId: 'c2' })),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), { expiresAt: Timestamp.fromDate(new Date(Date.now() + 365 * 864e5)) }))]));
  await check(f + ' the client cannot mark it applied/cancelled', assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), { status: 'applied' })));
  await check(f + ' submitting needs the declaration ticked', assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), { status: 'submitted', submittedAt: 'x' })));
  const omit = (o, k) => { const c = { ...o }; delete c[k]; return c; };
  const PNG = 'data:image/png;base64,' + 'iVBORw0KGgo='.repeat(40);
  const sigDrawn = { method: 'drawn', name: 'Jordan Citizen', image: PNG, at: '2026-11-12T01:02:03.000Z', role: 'self' };
  const sigTyped = { method: 'typed', name: 'Jordan Citizen', at: '2026-11-12T01:02:03.000Z', role: 'self' };
  const submit = (sig, extra) => ({ answers: { fullName: 'Jordan Citizen', declaration: true }, status: 'submitted', submittedAt: 'x', ...(sig ? { signature: sig } : {}), ...extra });
  await check(f + ' submitting the intake needs a signature (declaration alone is not enough)', assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit(null))));
  await check(f + ' a draft save cannot carry a signature', assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), { answers: { fullName: 'x' }, status: 'draft', signature: sigTyped })));
  await check(f + ' a signature must be well formed (no extra keys, name required, real PNG, size limit, representative needs a relationship)', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigTyped, extra: 'x' }))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigTyped, name: '' }))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigTyped, name: 'x'.repeat(121) }))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigTyped, method: 'scribble' }))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigDrawn, image: 'data:text/html;base64,PHNjcmlwdD4=' }))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigDrawn, image: 'javascript:alert(1)' }))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigDrawn, image: 'data:image/png;base64,' + 'A'.repeat(90000) }))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit(omit(sigDrawn, 'image')))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigTyped, image: PNG }))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigTyped, role: 'representative' }))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigTyped, role: 'boss' }))),
    assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), submit({ ...sigTyped, supportPerson: 'x'.repeat(121) })))]));
  await check(f + ' the client can submit (declaration ticked, signed on screen)', assertSucceeds(updateDoc(doc(anon, T + '/intakeForms/F1'), submit(sigDrawn))));
  await check(f + ' ...or with a typed name, or signing for someone else (with their relationship and a support person)', Promise.all([
    assertSucceeds(updateDoc(doc(anon, T + '/intakeForms/F5'), submit(sigTyped))),
    assertSucceeds(updateDoc(doc(anon, T + '/intakeForms/F6'), submit({ ...sigDrawn, role: 'representative', relationship: 'mother', supportPerson: 'Interpreter' })))]));
  await check(f + ' after submitting it is locked to the client', assertFails(updateDoc(doc(anon, T + '/intakeForms/F1'), { answers: { fullName: 'Changed', declaration: true }, status: 'draft' })));
  await check(f + ' ...but the client can still see it was sent', assertSucceeds(getDoc(doc(anon, T + '/intakeForms/F1'))));
  await check(f + ' an expired form cannot be changed', assertFails(updateDoc(doc(anon, T + '/intakeForms/F2'), { answers: { fullName: 'x' }, status: 'draft' })));
  await check(f + ' staff can read and mark it applied; nobody can delete', Promise.all([
    assertSucceeds(getDocs(collection(wkr, T + '/intakeForms'))),
    assertSucceeds(updateDoc(doc(wkr, T + '/intakeForms/F1'), { status: 'applied', appliedBy: 'Sam' })),
    assertFails(deleteDoc(doc(sys, T + '/intakeForms/F4')))]));
  await check(f + ' staff can ask for an intake-link text', assertSucceeds(addDoc(collection(wkr, T + '/smsOutbox'), { kind: 'intake', clientId: 'c1', linkId: 'L1nkL1nkL1nkL1nkL1nk', requestedBy: 'u-wkr', requestedByName: 'Sam', requestedAt: 'x' })));
  await check(f + ' an intake-link text needs a real link id', assertFails(addDoc(collection(wkr, T + '/smsOutbox'), { kind: 'intake', clientId: 'c1', linkId: 'short', requestedBy: 'u-wkr', requestedByName: 'Sam', requestedAt: 'x' })));
  await check(f + ' staff can read SMS usage; nobody can write it from a browser', Promise.all([
    assertSucceeds(getDoc(doc(wkr, T + '/smsUsage/2026-10'))), assertFails(setDoc(doc(sys, T + '/smsUsage/2026-10'), { cost: 0 }))]));
  // ── client consent forms (signed-out client) ──
  const ans = { collect: 'Yes', programs: 'Yes', audit: 'No', external: 'No', video: 'Yes', transport: 'No', understood: true, questions: true, voluntary: true, change: true };
  const csubmit = (over, sig, drop) => ({ answers: (a => { (drop || []).forEach(k => delete a[k]); return a; })({ ...ans, ...(over || {}) }), signature: sig === undefined ? sigDrawn : sig, version: '2026-11 v1', status: 'submitted', submittedAt: '2026-11-12T01:02:03.000Z' });
  await check(f + ' staff can create a consent link + form', Promise.all([
    assertSucceeds(setDoc(doc(wkr, T + '/consentLinks/' + CL), { status: 'open', expiresAt: later, needsDob: true })),
    assertSucceeds(setDoc(doc(wkr, T + '/consentForms/CF1'), cform))]));
  await check(f + ' a signed-out visitor cannot create consent links or forms', Promise.all([
    assertFails(setDoc(doc(anon, T + '/consentLinks/Zzzzzzzzzzzzzzzzzzzz'), { status: 'open', expiresAt: later })),
    assertFails(setDoc(doc(anon, T + '/consentForms/CF9'), cform))]));
  await check(f + ' the consent page can read the link status (no personal details)', assertSucceeds(getDoc(doc(anon, T + '/consentLinks/' + CL))));
  await check(f + ' signed-out cannot LIST consent links or forms', Promise.all([assertFails(getDocs(collection(anon, T + '/consentForms'))), assertFails(getDocs(collection(anon, T + '/consentLinks')))]));
  await check(f + ' the client can open their own consent form by its id; an expired or cancelled one cannot be opened', Promise.all([
    assertSucceeds(getDoc(doc(anon, T + '/consentForms/CF1'))), assertFails(getDoc(doc(anon, T + '/consentForms/CFX'))), assertFails(getDoc(doc(anon, T + '/consentForms/CFC')))]));
  await check(f + ' an anonymous Firebase session is not staff for consent forms', Promise.all([assertFails(getDocs(collection(anonUser, T + '/consentForms'))), assertFails(setDoc(doc(anonUser, T + '/consentForms/CFA'), cform))]));
  await check(f + ' consent: the client can submit once, signed and with every answer', assertSucceeds(updateDoc(doc(anon, T + '/consentForms/CF1'), csubmit())));
  await check(f + ' consent: ...or with a typed name, or a representative', Promise.all([
    assertSucceeds(updateDoc(doc(anon, T + '/consentForms/CF2'), csubmit({}, sigTyped))),
    assertSucceeds(updateDoc(doc(anon, T + '/consentForms/CF3'), csubmit({}, { ...sigDrawn, role: 'representative', relationship: 'guardian' })))]));
  await check(f + ' consent: after sending it is locked to the client, but they can still see it was sent', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF1'), csubmit({ video: 'No' }))), assertSucceeds(getDoc(doc(anon, T + '/consentForms/CF1')))]));
  await check(f + ' consent: an expired or cancelled form cannot be changed', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/consentForms/CFX'), csubmit())), assertFails(updateDoc(doc(anon, T + '/consentForms/CFC'), csubmit()))]));
  await check(f + ' consent: it must be signed', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF4'), { answers: ans, version: 'v', status: 'submitted', submittedAt: 'x' })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF4'), csubmit({}, { method: 'typed', name: '', at: 'x', role: 'self' }))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF4'), csubmit({}, { ...sigDrawn, image: 'data:image/svg+xml;base64,PHN2Zz4=' })))]));
  await check(f + ' consent: every answer is needed — the core consent must be Yes, the rest Yes or No, all four confirmations ticked', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), csubmit({ collect: 'No' }))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), csubmit({ programs: 'Maybe' }))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), csubmit({}, undefined, ['external']))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), csubmit({ understood: false }))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), csubmit({}, undefined, ['change']))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), csubmit({ riskLevel: 'low' })))]));
  await check(f + ' consent: nothing else can be changed (client, expiry, status, who it was for)', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { clientId: 'c2' })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { expiresAt: Timestamp.fromDate(new Date(Date.now() + 365 * 864e5)) })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { status: 'applied' })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { ...csubmit(), clientId: 'c2' })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { ...csubmit(), appliedBy: 'me' }))]));
  await check(f + ' consent: the client cannot save a draft', assertFails(updateDoc(doc(anon, T + '/consentForms/CF7'), { answers: { collect: 'Yes' }, status: 'open' })));
  await check(f + ' consent: staff can read, list and mark it applied; nobody can delete', Promise.all([
    assertSucceeds(getDocs(collection(wkr, T + '/consentForms'))),
    assertSucceeds(updateDoc(doc(wkr, T + '/consentForms/CF1'), { status: 'applied', appliedBy: 'Sam' })),
    assertSucceeds(updateDoc(doc(wkr, T + '/consentLinks/' + CL), { status: 'applied' })),
    assertFails(deleteDoc(doc(sys, T + '/consentForms/CF8'))), assertFails(deleteDoc(doc(sys, T + '/consentLinks/' + CL)))]));
  await check(f + ' existing collections still work (clients)', assertSucceeds(setDoc(doc(wkr, T + '/clients/c1'), { fullName: 'x' })));
  await env.cleanup();
}
console.log(`RESULT: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);

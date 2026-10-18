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
createRequire(import.meta.url)('../../intake/intake-fields.js');
const KEYS = globalThis.WG_INTAKE.KEYS;
for (const file of Object.keys(RULES)) {
  const src = fs.readFileSync(new URL(RULES[file], import.meta.url), 'utf8');
  const ruleKeys = (src.match(/answers\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  await check(file + ': intake rule keys match intake/intake-fields.js', JSON.stringify(ruleKeys) === JSON.stringify(KEYS) ? Promise.resolve() : Promise.reject(new Error('rule keys differ from intake-fields.js')));
}
for (const file of Object.keys(RULES)) {
  const env = await initializeTestEnvironment({ projectId: 'demo-wg-' + file.split('.')[0], firestore: { rules: fs.readFileSync(new URL(RULES[file], import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 } });
  const T = 'teams/worngundidj';
  const sys = env.authenticatedContext('u-sys', { email: 'jon@x.org', role: 'sysmanager' }).firestore();
  const wkr = env.authenticatedContext('u-wkr', { email: 'w@x.org', role: 'worker' }).firestore();
  const anon = env.unauthenticatedContext().firestore();
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
  await check(f + ' staff can create an intake link + form', Promise.all([
    assertSucceeds(setDoc(doc(wkr, T + '/intakeLinks/L1nkL1nkL1nkL1nkL1nk'), { status: 'open', expiresAt: later, needsDob: true })),
    assertSucceeds(setDoc(doc(wkr, T + '/intakeForms/F1'), form))]));
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, T + '/intakeForms/F2'), { ...form, linkId: 'x2', expiresAt: past });
    await setDoc(doc(d, T + '/intakeForms/F3'), { ...form, linkId: 'x3', status: 'cancelled' });
    await setDoc(doc(d, T + '/intakeForms/F4'), { ...form, linkId: 'x4' }); });
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
  await check(f + ' the client can submit (declaration ticked)', assertSucceeds(updateDoc(doc(anon, T + '/intakeForms/F1'), { answers: { fullName: 'Jordan Citizen', declaration: true }, status: 'submitted', submittedAt: 'x' })));
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
  await check(f + ' existing collections still work (clients)', assertSucceeds(setDoc(doc(wkr, T + '/clients/c1'), { fullName: 'x' })));
  await env.cleanup();
}
console.log(`RESULT: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);

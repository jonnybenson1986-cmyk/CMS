// Firestore rules tests — run against the real Firestore emulator, for BOTH
// rule files. Run:  cd tests/rules && npm ci && npm test
// (CI runs this before publishing the rules — .github/workflows/firebase-deploy.yml)
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore';
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
  const ruleKeys = (src.match(/function validConsentAnswers[\s\S]*?a\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  await check(file + ': consent rule keys match site/consent/consent-text.js', JSON.stringify(ruleKeys) === JSON.stringify(globalThis.WG_CONSENT.KEYS) ? Promise.resolve() : Promise.reject(new Error('rule keys differ from consent-text.js')));
  const grab = re => (src.match(re) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  const same = (a, b, msg) => JSON.stringify(a) === JSON.stringify(b) ? Promise.resolve() : Promise.reject(new Error(msg));
  await check(file + ': sharing rule keys (who, what, why…) match site/consent/consent-text.js', Promise.all([
    same(grab(/function validParty[\s\S]*?m\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/), globalThis.WG_CONSENT.SHARE_PARTY_KEYS, 'party keys differ'),
    same(grab(/function validSharing[\s\S]*?s\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/), globalThis.WG_CONSENT.SHARE_KEYS, 'sharing keys differ'),
    same(grab(/m\.what\.hasOnly\(\[([^\]]*)\]\)/), globalThis.WG_CONSENT.SHARE_WHAT.map(x => x[0]), '"what" codes differ')]));
  const sigKeys = (src.match(/function validSignature[\s\S]*?s\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  await check(file + ': signature rule keys match site/forms/signing.js', JSON.stringify(sigKeys) === JSON.stringify(globalThis.WG_SIGN.SIG_KEYS) ? Promise.resolve() : Promise.reject(new Error('signature keys differ from signing.js')));
}
// ...and a conflict of interest declaration's keys and lists must be the app's.
{
  const app = fs.readFileSync(new URL('../../site/index.html', import.meta.url), 'utf8');
  const keysOf = re => ((app.match(re) || [, ''])[1].match(/\['([A-Za-z]+)'/g) || []).map(x => x.slice(2, -1));
  const appLists = { connection: keysOf(/const COI_CONNECTION = \[(.*)\];/), nature: keysOf(/const COI_NATURE = \[(.*)\];/), status: keysOf(/const COI_STATUS = \[(.*)\];/), manage: keysOf(/const COI_MANAGE = \[([\s\S]*?)\];\n/) };
  for (const file of Object.keys(RULES)) {
    const src = fs.readFileSync(new URL(RULES[file], import.meta.url), 'utf8'), fn = (src.match(/function validCoi[\s\S]*?\n    }/) || [''])[0];
    const list = re => (fn.match(re) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
    const ok = JSON.stringify(list(/d\.connection in \[([^\]]*)\]/)) === JSON.stringify(appLists.connection) && JSON.stringify(list(/d\.nature in \[([^\]]*)\]/)) === JSON.stringify(appLists.nature)
      && JSON.stringify(list(/d\.status in \[([^\]]*)\]/)) === JSON.stringify(appLists.status) && JSON.stringify(list(/d\.manage\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/)) === JSON.stringify(appLists.manage) && appLists.connection.length === 6;
    await check(file + ': conflict of interest lists in the rules match the app (connection, nature, status, how it is managed)', ok ? Promise.resolve() : Promise.reject(new Error(JSON.stringify(appLists))));
  }
}
// ...and the teams an account can be put in must be exactly site/teams.js.
const TEAMS = createRequire(import.meta.url)('../../site/teams.js');
for (const file of Object.keys(RULES)) {
  const src = fs.readFileSync(new URL(RULES[file], import.meta.url), 'utf8');
  const ids = (src.match(/m\.teams\.hasOnly\(\[([^\]]*)\]\)/) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  await check(file + ': team ids in the rules match site/teams.js', JSON.stringify(ids) === JSON.stringify(TEAMS.IDS) && src.includes("t == '" + TEAMS.DEFAULT + "' && wgOpen()") ? Promise.resolve() : Promise.reject(new Error('team ids differ from teams.js')));
  const appOwners = (fs.readFileSync(new URL('../../site/index.html', import.meta.url), 'utf8').match(/const OWNER_EMAILS = \[([^\]]*)\]/) || [, ''])[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  const ruleOwner = (src.match(/function isOwner\(\)[^\n]*request\.auth\.token\.email == '([^']+)'/) || [])[1];
  const storageSrc = fs.readFileSync(new URL(file.startsWith('strict') ? '../../storage.rules.strict' : '../../storage.rules', import.meta.url), 'utf8');
  await check(file + ': the owner in the rules is the owner in the app — and the file rules (storage) use the same owner and the same team test', appOwners.length === 1 && appOwners[0] === ruleOwner
    && storageSrc.includes("request.auth.token.email == '" + ruleOwner + "'") && storageSrc.includes("t == '" + TEAMS.DEFAULT + "' && !firestore.exists(/databases/(default)/documents/platform/lock)")
    && storageSrc.includes('members/$(request.auth.uid)).data.teams') && !/allow (read|write)[^;]*if signedIn\(\)/.test(storageSrc.split('\n').filter(l => !l.trim().startsWith('//')).join('\n'))
    ? Promise.resolve() : Promise.reject(new Error('owner / storage rules differ: ' + appOwners + ' vs ' + ruleOwner)));
  await check(file + ': every team rule checks the team (no rule left on "any signed-in account")', (() => { const body = src.slice(src.indexOf('match /teams/{teamId}/'), src.indexOf('// ── Team membership'));
    const loose = body.split('\n').filter(l => !l.trim().startsWith('//') && /signedIn\(\)|hasRole\(\)|isMgr\(\)|isSys\(\)/.test(l)); return loose.length ? Promise.reject(new Error('not team-checked: ' + loose[0].trim())) : Promise.resolve(); })());
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
  const PNG = 'data:image/png;base64,' + 'iVBORw0KGgo='.repeat(40);
  const sigDrawn = { method: 'drawn', name: 'Jordan Citizen', image: PNG, at: '2026-11-12T01:02:03.000Z', role: 'self' };
  const sigTyped = { method: 'typed', name: 'Jordan Citizen', at: '2026-11-12T01:02:03.000Z', role: 'self' };
  const ans = { collect: 'Yes', programs: 'Yes', audit: 'No', video: 'Yes', transport: 'No', understood: true, questions: true, voluntary: true, limits: true, change: true };
  const party = (o) => ({ name: 'Dr Sam Example', role: 'GP', contact: '03 5550 0000', what: ['contact', 'plan'], why: 'So my GP knows about my counselling', back: 'Yes', ...(o || {}) });
  const shareYes = { pro: 'Yes', per: 'Yes', length: 'm12', pro1: party(), per1: party({ name: 'Pat Citizen', role: 'mother', what: ['contact'], back: 'No' }) };
  const shareNo = { pro: 'No', per: 'No' };
  const cform = { linkId: CL, clientId: 'c1', status: 'open', expiresAt: later, version: '2026-11 v2', createdBy: 'u-wkr', needsDob: true };
  await check(f + ' staff can create an intake link + form', Promise.all([
    assertSucceeds(setDoc(doc(wkr, T + '/intakeLinks/L1nkL1nkL1nkL1nkL1nk'), { status: 'open', expiresAt: later, needsDob: true })),
    assertSucceeds(setDoc(doc(wkr, T + '/intakeForms/F1'), form))]));
  await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
    await setDoc(doc(d, T + '/intakeForms/F2'), { ...form, linkId: 'x2', expiresAt: past });
    await setDoc(doc(d, T + '/intakeForms/F3'), { ...form, linkId: 'x3', status: 'cancelled' });
    await setDoc(doc(d, T + '/intakeForms/F4'), { ...form, linkId: 'x4' });
    await setDoc(doc(d, T + '/intakeForms/F5'), { ...form, linkId: 'x5' }); await setDoc(doc(d, T + '/intakeForms/F6'), { ...form, linkId: 'x6' });
    for (const n of [2, 3, 4, 5, 6, 7, 8]) await setDoc(doc(d, T + '/consentForms/CF' + n), { ...cform, linkId: 'cx' + n, sharing: shareYes });
    for (const n of [9, 10, 11, 12, 13, 14, 15]) await setDoc(doc(d, T + '/consentForms/CF' + n), { ...cform, linkId: 'cx' + n });
    await setDoc(doc(d, T + '/consentForms/CFNS'), { ...cform, linkId: 'cxns' });
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
  // Two writes: the sharing section, then the answers + signature (which sends it).
  const sendWith = (over, sig, drop) => ({ answers: (a => { (drop || []).forEach(k => delete a[k]); return a; })({ ...ans, ...(over || {}) }), signature: sig === undefined ? sigDrawn : sig, version: '2026-11 v2', status: 'submitted', submittedAt: '2026-11-12T01:02:03.000Z' });
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
  // sending needs the sharing to be saved first
  await check(f + ' consent: it cannot be sent until the sharing section has been saved', assertFails(updateDoc(doc(anon, T + '/consentForms/CFNS'), sendWith())));
  await check(f + ' consent: the client saves the sharing section first, then sends once, signed and with every answer', (async () => {
    await assertSucceeds(updateDoc(doc(anon, T + '/consentForms/CF1'), { sharing: shareYes }));
    await assertSucceeds(updateDoc(doc(anon, T + '/consentForms/CF1'), { sharing: shareYes }));
    await assertSucceeds(updateDoc(doc(anon, T + '/consentForms/CF1'), sendWith()));
  })());
  await check(f + ' consent: ...or with a typed name, or a representative', Promise.all([
    assertSucceeds(updateDoc(doc(anon, T + '/consentForms/CF2'), sendWith({}, sigTyped))),
    assertSucceeds(updateDoc(doc(anon, T + '/consentForms/CF3'), sendWith({}, { ...sigDrawn, role: 'representative', relationship: 'guardian' })))]));
  await check(f + ' consent: after sending it is locked to the client (answers and sharing), but they can still see it was sent', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF1'), sendWith({ video: 'No' }))), assertFails(updateDoc(doc(anon, T + '/consentForms/CF1'), { sharing: shareNo })), assertSucceeds(getDoc(doc(anon, T + '/consentForms/CF1')))]));
  await check(f + ' consent: an expired or cancelled form cannot be changed', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/consentForms/CFX'), sendWith())), assertFails(updateDoc(doc(anon, T + '/consentForms/CFC'), sendWith())),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CFX'), { sharing: shareNo })), assertFails(updateDoc(doc(anon, T + '/consentForms/CFC'), { sharing: shareNo }))]));
  await check(f + ' consent: it must be signed', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF4'), { answers: ans, version: 'v', status: 'submitted', submittedAt: 'x' })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF4'), sendWith({}, { method: 'typed', name: '', at: 'x', role: 'self' }))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF4'), sendWith({}, { ...sigDrawn, image: 'data:image/svg+xml;base64,PHN2Zz4=' })))]));
  await check(f + ' consent: every answer is needed — the core consent must be Yes, the rest Yes or No, and all five confirmations (including the law / mandatory reporting) ticked', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), sendWith({ collect: 'No' }))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), sendWith({ programs: 'Maybe' }))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), sendWith({}, undefined, ['video']))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), sendWith({ understood: false }))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), sendWith({ limits: false }))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), sendWith({}, undefined, ['limits']))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), sendWith({}, undefined, ['change']))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), sendWith({ external: 'No' }))),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF5'), sendWith({ riskLevel: 'low' })))]));
  await check(f + ' consent: nothing else can be changed (client, expiry, status, who it was for)', Promise.all([
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { clientId: 'c2' })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { expiresAt: Timestamp.fromDate(new Date(Date.now() + 365 * 864e5)) })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { status: 'applied' })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { ...sendWith(), clientId: 'c2' })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { ...sendWith(), appliedBy: 'me' })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { sharing: shareYes, clientId: 'c2' })),
    assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { sharing: shareYes, status: 'submitted' }))]));
  await check(f + ' consent: the client cannot change the sharing in the same write that sends the form', assertFails(updateDoc(doc(anon, T + '/consentForms/CF6'), { ...sendWith(), sharing: shareNo })));
  await check(f + ' consent: the client cannot save a draft of the answers', assertFails(updateDoc(doc(anon, T + '/consentForms/CF7'), { answers: { collect: 'Yes' }, status: 'open' })));
  // the sharing section
  const share = (sh, n) => updateDoc(doc(anon, T + '/consentForms/CF' + n), { sharing: sh });
  await check(f + ' consent: the client must say what they want about sharing, and may say nobody', Promise.all([
    assertFails(share({}, 9)), assertSucceeds(share(shareNo, 10))]));
  await check(f + ' consent: sharing — "Yes" needs a named person, "No" cannot carry people, a length is needed only when sharing', Promise.all([
    assertFails(share({ pro: 'Yes', per: 'No', length: 'm6' }, 9)),
    assertFails(share({ pro: 'No', per: 'No', pro1: party() }, 9)),
    assertFails(share({ pro: 'Yes', per: 'No', pro1: party() }, 9)),
    assertFails(share({ pro: 'No', per: 'No', length: 'm6' }, 9)),
    assertFails(share({ pro: 'Yes', per: 'No', length: 'forever', pro1: party() }, 9)),
    assertFails(share({ pro: 'Maybe', per: 'No' }, 9))]));
  await check(f + ' consent: sharing — each person needs a name, something ticked, and a yes/no on "they can tell us things"; unknown fields and codes are refused', Promise.all([
    assertFails(share({ ...shareYes, pro1: party({ name: '' }) }, 11)),
    assertFails(share({ ...shareYes, pro1: party({ name: 'x'.repeat(121) }) }, 11)),
    assertFails(share({ ...shareYes, pro1: party({ what: [] }) }, 11)),
    assertFails(share({ ...shareYes, pro1: party({ what: ['contact', 'passwords'] }) }, 11)),
    assertFails(share({ ...shareYes, pro1: party({ what: 'contact' }) }, 11)),
    assertFails(share({ ...shareYes, pro1: party({ what: ['contact', 'contact', 'contact', 'contact', 'contact', 'contact', 'contact'] }) }, 11)),
    assertFails(share({ ...shareYes, pro1: party({ back: 'Maybe' }) }, 11)),
    assertFails(share({ ...shareYes, pro1: party({ why: 'x'.repeat(301) }) }, 11)),
    assertFails(share({ ...shareYes, pro1: party({ role: 'x'.repeat(121) }) }, 11)),
    assertFails(share({ ...shareYes, pro1: party({ contact: 7 }) }, 11)),
    assertFails(share({ ...shareYes, pro1: { ...party(), admin: true } }, 11)),
    assertFails(share({ ...shareYes, pro6: party() }, 11)),
    assertFails(share({ ...shareYes, extra: 'x' }, 11))]));
  await check(f + ' consent: sharing — up to five of each, with the optional role, contact and reason left out', Promise.all([
    assertSucceeds(share({ pro: 'Yes', per: 'Yes', length: 'until', pro1: party(), pro2: party({ name: 'B' }), pro3: party({ name: 'C' }), pro4: party({ name: 'D' }), pro5: party({ name: 'E' }),
      per1: { name: 'Pat', what: ['safety'], back: 'No' }, per2: { name: 'Lee', what: ['contact', 'plan', 'health', 'notes', 'referrals', 'safety'], back: 'Yes' } }, 12)),
    assertSucceeds(share({ pro: 'No', per: 'Yes', length: 'm6', per1: party({ name: 'Aunty Pat', role: 'Elder' }) }, 13))]));
  const full = n => party({ name: 'N' + n + ' ' + 'x'.repeat(100), role: 'r'.repeat(120), contact: 'c'.repeat(120), why: 'w'.repeat(300), what: ['contact', 'plan', 'health', 'notes', 'referrals', 'safety'] });
  await check(f + ' consent: the biggest sharing list that is allowed — five professionals and five people, every field full — goes through (the rules have a 1000-expression limit)', assertSucceeds(share({ pro: 'Yes', per: 'Yes', length: 'm12',
    pro1: full(1), pro2: full(2), pro3: full(3), pro4: full(4), pro5: full(5), per1: full(6), per2: full(7), per3: full(8), per4: full(9), per5: full(10) }, 14)));
  await check(f + ' consent: ...and then the biggest form can be sent, drawn signature and all', assertSucceeds(updateDoc(doc(anon, T + '/consentForms/CF14'), sendWith())));
  await check(f + ' consent: ...but not a sixth person, or a name with a line break', Promise.all([
    assertFails(share({ pro: 'Yes', per: 'No', length: 'm6', pro1: party(), pro6: party() }, 15)),
    assertFails(share({ pro: 'Yes', per: 'No', length: 'm6', pro1: party({ name: 'a\nb' }) }, 15))]));
  await check(f + ' consent: sharing cannot be slipped into the intake form', assertFails(updateDoc(doc(anon, T + '/intakeForms/F5'), { sharing: shareYes, status: 'draft', answers: { fullName: 'x' } })));
  await check(f + ' consent: staff can read, list and mark it applied; nobody can delete', Promise.all([
    assertSucceeds(getDocs(collection(wkr, T + '/consentForms'))),
    assertSucceeds(updateDoc(doc(wkr, T + '/consentForms/CF1'), { status: 'applied', appliedBy: 'Sam' })),
    assertSucceeds(updateDoc(doc(wkr, T + '/consentLinks/' + CL), { status: 'applied' })),
    assertFails(deleteDoc(doc(sys, T + '/consentForms/CF8'))), assertFails(deleteDoc(doc(sys, T + '/consentLinks/' + CL)))]));
  await check(f + ' existing collections still work (clients)', assertSucceeds(setDoc(doc(wkr, T + '/clients/c1'), { fullName: 'x' })));


  // ══════════ ⚖️ conflict of interest declarations ══════════
  { const strict = file.startsWith('strict');
    const sup = env.authenticatedContext('u-sup', { email: 'sup@x.org', role: 'supervisor', name: 'Sup' }).firestore();
    const C = T + '/coi/';
    const decl = (id, o) => ({ id, clientId: 'c1', personName: 'Wendy Worker', personEmail: 'w@x.org', connection: 'family', nature: 'potential', program: '', interest: 'The client is my cousin.',
      declaredBy: 'Wendy Worker', declaredByEmail: 'w@x.org', declaredByUid: 'u-wkr', declaredAt: '2026-11-17T01:00:00.000Z', status: 'open', ...(o || {}) });
    const review = (o) => ({ manage: { noAllocate: true, hideFile: true }, managedNotes: 'Allocated to another worker.', status: 'managed', reviewedBy: 'Sup', reviewedAt: '2026-11-17T02:00:00.000Z', updatedBy: 'sup@x.org', updatedAt: '2026-11-17T02:00:00.000Z', ...(o || {}) });
    await check(f + ' conflict of interest: a worker can declare their own, as open with nothing yet about how it is managed', assertSucceeds(setDoc(doc(wkr, C + 'coi1'), decl('coi1'))));
    await check(f + ' conflict of interest: …but cannot decide how their own is managed, or mark it managed, or pass it off as someone else’s', Promise.all([
      assertFails(setDoc(doc(wkr, C + 'coi2'), decl('coi2', { manage: { noAllocate: false, hideFile: false } }))),
      assertFails(setDoc(doc(wkr, C + 'coi2'), decl('coi2', { status: 'managed' }))),
      assertFails(setDoc(doc(wkr, C + 'coi2'), decl('coi2', { managedNotes: 'fine' }))),
      assertFails(setDoc(doc(wkr, C + 'coi2'), decl('coi2', { declaredByUid: 'u-sys' }))),
      assertFails(setDoc(doc(wkr, C + 'coi2'), decl('coi2', { declaredByEmail: 'jon@x.org' }))),
      assertFails(setDoc(doc(wkr, C + 'coi2'), decl('coi3')))]));
    await check(f + ' conflict of interest: a declaration must be complete and use the known lists', Promise.all([
      assertFails(setDoc(doc(wkr, C + 'coi4'), decl('coi4', { interest: '' }))), assertFails(setDoc(doc(wkr, C + 'coi4'), decl('coi4', { interest: 'x'.repeat(1001) }))),
      assertFails(setDoc(doc(wkr, C + 'coi4'), decl('coi4', { nature: 'huge' }))), assertFails(setDoc(doc(wkr, C + 'coi4'), decl('coi4', { connection: 'enemy' }))),
      assertFails(setDoc(doc(wkr, C + 'coi4'), decl('coi4', { status: 'deleted' }))), assertFails(setDoc(doc(wkr, C + 'coi4'), decl('coi4', { clientId: '' }))),
      assertFails(setDoc(doc(wkr, C + 'coi4'), decl('coi4', { personEmail: 'not an email' }))), assertFails(setDoc(doc(wkr, C + 'coi4'), decl('coi4', { extra: 1 })))]));
    await check(f + ' conflict of interest: a manager or supervisor records how it is managed — and who did is recorded as their own account', Promise.all([
      assertSucceeds(updateDoc(doc(sup, C + 'coi1'), review())), assertFails(updateDoc(doc(sys, C + 'coi1'), review({ updatedBy: 'someone@else.org' })))]));
    await check(f + ' conflict of interest: the person it is about can never change how it is managed (not even to close it)', Promise.all([
      assertFails(updateDoc(doc(wkr, C + 'coi1'), review({ manage: { noAllocate: false, hideFile: false }, updatedBy: 'w@x.org' }))),
      assertFails(updateDoc(doc(wkr, C + 'coi1'), { status: 'closed', updatedBy: 'w@x.org', updatedAt: 'x' }))]));
    await check(f + ' conflict of interest: the declaration itself can’t be changed by anyone, and nobody can delete one', Promise.all([
      assertFails(updateDoc(doc(sys, C + 'coi1'), { interest: 'Nothing to see', updatedBy: 'jon@x.org', updatedAt: 'x' })),
      assertFails(updateDoc(doc(sys, C + 'coi1'), { personEmail: 'other@x.org', updatedBy: 'jon@x.org', updatedAt: 'x' })),
      assertFails(updateDoc(doc(sys, C + 'coi1'), { declaredAt: '2020-01-01', updatedBy: 'jon@x.org', updatedAt: 'x' })),
      assertFails(deleteDoc(doc(sys, C + 'coi1'))), assertFails(deleteDoc(doc(wkr, C + 'coi1')))]));
    await check(f + ' conflict of interest: a manager’s own declaration is managed by someone else', (async () => {
      await assertSucceeds(setDoc(doc(sys, C + 'coi5'), decl('coi5', { personName: 'Jon', personEmail: 'jon@x.org', declaredBy: 'Jon', declaredByEmail: 'jon@x.org', declaredByUid: 'u-sys' })));
      await assertFails(updateDoc(doc(sys, C + 'coi5'), review({ updatedBy: 'jon@x.org' })));
      await assertSucceeds(updateDoc(doc(sup, C + 'coi5'), review()));
    })());
    await check(f + ' conflict of interest: a manager can record one for a worker, including how it is managed', assertSucceeds(setDoc(doc(sys, C + 'coi6'),
      decl('coi6', { declaredBy: 'Jon', declaredByEmail: 'jon@x.org', declaredByUid: 'u-sys', ...review({ updatedBy: 'jon@x.org' }) }))));
    await check(f + ' conflict of interest: the person and who declared it can read it' + (strict ? '' : ' (the live rules let the team read the register; the app shows it to managers and supervisors only)'), Promise.all([
      assertSucceeds(getDocs(query(collection(wkr, T + '/coi'), where('personEmail', '==', 'w@x.org')))), assertSucceeds(getDocs(query(collection(wkr, T + '/coi'), where('declaredByUid', '==', 'u-wkr')))),
      assertSucceeds(getDocs(collection(sup, T + '/coi'))), assertSucceeds(getDocs(collection(sys, T + '/coi')))]));
    if (strict) {
      await check(f + ' conflict of interest (strict): only managers and supervisors can read the whole register — a worker cannot, or read someone else’s', Promise.all([
        assertFails(getDocs(collection(wkr, T + '/coi'))), assertFails(getDoc(doc(wkr, C + 'coi5')))]));
      await check(f + ' conflict of interest (strict): a worker cannot record one about someone else', assertFails(setDoc(doc(wkr, C + 'coi7'), decl('coi7', { personName: 'Sam', personEmail: 'sam@x.org' }))));
    }
    await check(f + ' conflict of interest: a signed-out visitor or an anonymous session gets nothing', Promise.all([
      assertFails(getDocs(collection(anon, T + '/coi'))), assertFails(getDoc(doc(anonUser, C + 'coi1'))), assertFails(setDoc(doc(anon, C + 'coi9'), decl('coi9')))]));
  }

  // ══════════ TEAMS (multi-tenancy) ══════════
  // Worn Gundidj, a spare team and a test team: an account only reaches the teams it belongs to.
  const OWNER = 'jon.benson@worngundidj.org.au';
  const as = (uid, email, role) => env.authenticatedContext(uid, { email, role: role || 'worker', name: uid }).firestore();
  const owner = as('u-owner', OWNER, 'sysmanager');
  const wgM = as('t-wg', 'wg@x.org'), testM = as('t-test', 'test@x.org'), spareM = as('t-spare', 'spare@x.org'), bothM = as('t-both', 'both@x.org');
  const mgr = as('t-mgr', 'mgr@x.org', 'sysmanager'), none = as('t-none', 'none@x.org'), fresh = as('t-fresh', 'fresh@x.org'), fresh2 = as('t-fresh2', 'fresh2@x.org');
  const fakeOwner = as('t-fake', 'jon.benson@worngundidj.org.au.evil.example');
  const M = uid => 'members/' + uid, mem = (teams, email, o) => ({ teams, email, addedBy: OWNER, addedAt: '2026-11-16T01:00:00.000Z', ...(o || {}) });
  const TT = 'teams/test', TS = 'teams/spare';
  await check(f + ' teams: the owner can put accounts in teams (and make a team manager)', Promise.all([
    assertSucceeds(setDoc(doc(owner, M('t-wg')), mem(['worngundidj'], 'wg@x.org'))),
    assertSucceeds(setDoc(doc(owner, M('t-test')), mem(['test'], 'test@x.org'))),
    assertSucceeds(setDoc(doc(owner, M('t-spare')), mem(['spare'], 'spare@x.org'))),
    assertSucceeds(setDoc(doc(owner, M('t-both')), mem(['worngundidj', 'test'], 'both@x.org'))),
    assertSucceeds(setDoc(doc(owner, M('t-mgr')), mem(['test'], 'mgr@x.org', { manager: true, name: 'Test Manager' }))),
    assertSucceeds(setDoc(doc(owner, M('t-none')), mem([], 'none@x.org')))]));
  await check(f + ' teams: the owner cannot invent a team, or add stray fields', Promise.all([
    assertFails(setDoc(doc(owner, M('t-x1')), mem(['otherorg'], 'x@x.org'))),
    assertFails(setDoc(doc(owner, M('t-x1')), mem(['test'], 'x@x.org', { role: 'sysmanager' }))),
    assertFails(setDoc(doc(owner, M('t-x1')), { teams: 'test', email: 'x@x.org' })),
    assertFails(setDoc(doc(owner, M('t-x1')), { teams: ['test'] }))]));
  // each team's members can work in their own team…
  const client = n => ({ id: n, fullName: 'Synthetic ' + n });
  await check(f + ' teams: members of each team can read and write their own team’s records', Promise.all([
    assertSucceeds(setDoc(doc(wgM, T + '/clients/tw1'), client('tw1'))), assertSucceeds(getDocs(collection(wgM, T + '/clients'))),
    assertSucceeds(setDoc(doc(testM, TT + '/clients/tt1'), client('tt1'))), assertSucceeds(getDocs(collection(testM, TT + '/clients'))),
    assertSucceeds(setDoc(doc(spareM, TS + '/clients/ts1'), client('ts1'))), assertSucceeds(getDocs(collection(spareM, TS + '/notes'))),
    assertSucceeds(setDoc(doc(testM, TT + '/notes/n1'), { id: 'n1', clientId: 'tt1', text: 'x', worker: 't-test' })),
    assertSucceeds(setDoc(doc(testM, TT + '/auditlog/a1'), { id: 'a1', action: 'x', ts: '2026-11-16T01:00:00Z' })),
    assertSucceeds(setDoc(doc(testM, TT + '/smsOutbox/s1'), { kind: 'handbook', clientId: 'tt1', requestedBy: 't-test', requestedByName: 'T', requestedAt: '2026-11-16T01:00:00Z' }))]));
  // …and nobody else's
  const others = [['a Worn Gundidj account', wgM, [TT, TS]], ['a Test team account', testM, [T, TS]], ['a Spare team account', spareM, [T, TT]], ['an account removed from every team', none, [T, TT, TS]]];
  for (const [who, ctx, teams] of others) for (const tp of teams) {
    await check(f + ` teams: ${who} cannot read, list or write ${tp}`, Promise.all([
      ...['clients', 'notes', 'timelogs', 'referrals', 'staff', 'auditlog', 'calevents', 'walkins', 'intakeForms', 'consentForms', 'smsOutbox', 'appConfig', 'userAccess', 'chatMsgs', 'ideas', 'workersList', 'policies', 'fpho', 'resources', 'smsConfig', 'smsUsage', 'roles', 'workflowTasks', 'chatConvs', 'coi']
        .map(c => assertFails(getDocs(collection(ctx, tp + '/' + c)))),
      assertFails(getDoc(doc(ctx, tp + '/clients/tt1'))), assertFails(getDoc(doc(ctx, tp + '/clients/seed'))),
      assertFails(setDoc(doc(ctx, tp + '/clients/evil'), client('evil'))), assertFails(setDoc(doc(ctx, tp + '/notes/evil'), { id: 'evil', text: 'x' })),
      assertFails(setDoc(doc(ctx, tp + '/auditlog/evil'), { id: 'evil', action: 'x' })), assertFails(setDoc(doc(ctx, tp + '/staff/list'), { list: [] })),
      assertFails(setDoc(doc(ctx, tp + '/intakeLinks/Zzzzzzzzzzzzzzzzzzzz'), { status: 'open', expiresAt: later })),
      assertFails(setDoc(doc(ctx, tp + '/smsOutbox/evil'), { kind: 'handbook', clientId: 'c', requestedBy: 't-wg', requestedByName: 'x', requestedAt: 'x' }))]));
  }
  await check(f + ' teams: an account in two teams can use both, and still not the third', Promise.all([
    assertSucceeds(getDocs(collection(bothM, T + '/clients'))), assertSucceeds(getDocs(collection(bothM, TT + '/clients'))), assertFails(getDocs(collection(bothM, TS + '/clients')))]));
  await check(f + ' teams: the owner can use every team', Promise.all([
    assertSucceeds(getDocs(collection(owner, T + '/clients'))), assertSucceeds(getDocs(collection(owner, TT + '/clients'))), assertSucceeds(setDoc(doc(owner, TS + '/clients/o1'), client('o1')))]));
  await check(f + ' teams: an email that merely starts with the owner’s is not the owner', Promise.all([
    assertFails(getDocs(collection(fakeOwner, TT + '/clients'))), assertFails(getDocs(collection(fakeOwner, 'members'))), assertFails(setDoc(doc(fakeOwner, M('t-fake')), mem(['test'], 'jon.benson@worngundidj.org.au.evil.example')))]));
  await check(f + ' teams: a team that does not exist is closed to everyone but the owner', Promise.all([
    assertFails(getDocs(collection(wgM, 'teams/other/clients'))), assertFails(setDoc(doc(testM, 'teams/other/clients/x'), client('x')))]));
  // a client's own form link only works in its own team
  await check(f + ' teams: a client form made in the Test team is opened by its own id there — and staff of another team cannot list or read it', (async () => {
    await assertSucceeds(setDoc(doc(testM, TT + '/consentLinks/TestTeamL1nkTestTeam'), { status: 'open', expiresAt: later, needsDob: false }));
    await assertSucceeds(setDoc(doc(testM, TT + '/consentForms/TF1'), { ...cform, linkId: 'TestTeamL1nkTestTeam' }));
    await assertSucceeds(getDoc(doc(anon, TT + '/consentLinks/TestTeamL1nkTestTeam')));
    await assertSucceeds(getDoc(doc(anon, TT + '/consentForms/TF1')));
    await assertSucceeds(updateDoc(doc(anon, TT + '/consentForms/TF1'), { sharing: shareNo }));
    await assertSucceeds(updateDoc(doc(anon, TT + '/consentForms/TF1'), sendWith()));
    await assertFails(getDocs(collection(wgM, TT + '/consentForms')));
    await assertFails(updateDoc(doc(wgM, TT + '/consentForms/TF1'), { status: 'applied' }));
    await assertSucceeds(updateDoc(doc(testM, TT + '/consentForms/TF1'), { status: 'applied', appliedBy: 'T' }));
  })());
  // membership records
  await check(f + ' teams: an account can read its own membership, and nobody else’s; only the owner can list them', Promise.all([
    assertSucceeds(getDoc(doc(testM, M('t-test')))), assertFails(getDoc(doc(testM, M('t-wg')))), assertFails(getDocs(collection(testM, 'members'))),
    assertFails(getDocs(collection(mgr, 'members'))), assertSucceeds(getDocs(collection(owner, 'members'))), assertFails(getDoc(doc(anon, M('t-test')))), assertFails(getDoc(doc(anonUser, M('u-anon'))))]));
  await check(f + ' teams: nobody can put themselves in another team, make themselves a manager, or change anyone’s teams', Promise.all([
    assertFails(setDoc(doc(testM, M('t-test')), mem(['test', 'worngundidj'], 'test@x.org'))),
    assertFails(updateDoc(doc(testM, M('t-test')), { teams: ['worngundidj'] })),
    assertFails(updateDoc(doc(testM, M('t-test')), { manager: true })),
    assertFails(updateDoc(doc(mgr, M('t-mgr')), { teams: ['test', 'worngundidj'] })),
    assertFails(updateDoc(doc(mgr, M('t-test')), { teams: [] })),
    assertFails(deleteDoc(doc(testM, M('t-test')))), assertFails(deleteDoc(doc(mgr, M('t-test')))),
    assertFails(setDoc(doc(none, M('t-none')), mem(['worngundidj'], 'none@x.org')))]));
  await check(f + ' teams: a team manager can add a NEW account to their own team only — not another team, not as a manager, not two teams', Promise.all([
    assertSucceeds(setDoc(doc(mgr, M('t-new1')), mem(['test'], 'new1@x.org', { addedBy: 'mgr@x.org', name: 'New One' }))),
    assertFails(setDoc(doc(mgr, M('t-new2')), mem(['worngundidj'], 'new2@x.org'))),
    assertFails(setDoc(doc(mgr, M('t-new2')), mem(['test', 'spare'], 'new2@x.org'))),
    assertFails(setDoc(doc(mgr, M('t-new2')), mem(['test'], 'new2@x.org', { manager: true }))),
    assertFails(setDoc(doc(mgr, M('t-new2')), mem([], 'new2@x.org')))]));
  await check(f + ' teams: someone who is not a manager cannot add accounts', Promise.all([
    assertFails(setDoc(doc(testM, M('t-new3')), mem(['test'], 'new3@x.org'))), assertFails(setDoc(doc(wgM, M('t-new3')), mem(['worngundidj'], 'new3@x.org')))]));
  await check(f + ' teams: the owner can move an account, take it out of every team, and remove the entry', (async () => {
    await assertSucceeds(setDoc(doc(owner, M('t-move')), mem(['test'], 'move@x.org')));
    const mv = as('t-move', 'move@x.org');
    await assertSucceeds(getDocs(collection(mv, TT + '/clients'))); await assertFails(getDocs(collection(mv, TS + '/clients')));
    await assertSucceeds(updateDoc(doc(owner, M('t-move')), { teams: ['spare'], updatedBy: OWNER, updatedAt: '2026-11-16T02:00:00.000Z' }));
    await assertFails(getDocs(collection(mv, TT + '/clients'))); await assertSucceeds(getDocs(collection(mv, TS + '/clients')));
    await assertSucceeds(updateDoc(doc(owner, M('t-move')), { teams: [] }));
    await assertFails(getDocs(collection(mv, TS + '/clients'))); await assertFails(getDocs(collection(mv, T + '/clients')));
    await assertSucceeds(deleteDoc(doc(owner, M('t-move'))));
  })());
  // moving in: accounts from before teams
  await check(f + ' teams: an account from before teams (no membership yet) still works as Worn Gundidj — and cannot reach the other teams', Promise.all([
    assertSucceeds(getDocs(collection(fresh, T + '/clients'))), assertSucceeds(setDoc(doc(fresh, T + '/clients/fr1'), client('fr1'))),
    assertFails(getDocs(collection(fresh, TT + '/clients'))), assertFails(getDocs(collection(fresh, TS + '/clients'))), assertFails(setDoc(doc(fresh, TT + '/clients/fr1'), client('fr1')))]));
  await check(f + ' teams: it can record its own membership as Worn Gundidj — but not as another team, as a manager, for someone else, or under another email', Promise.all([
    assertFails(setDoc(doc(fresh, M('t-fresh')), mem(['test'], 'fresh@x.org'))),
    assertFails(setDoc(doc(fresh, M('t-fresh')), mem(['worngundidj', 'test'], 'fresh@x.org'))),
    assertFails(setDoc(doc(fresh, M('t-fresh')), mem(['worngundidj'], 'fresh@x.org', { manager: true }))),
    assertFails(setDoc(doc(fresh, M('t-fresh')), mem(['worngundidj'], 'someoneelse@x.org'))),
    assertFails(setDoc(doc(fresh, M('t-other')), mem(['worngundidj'], 'fresh@x.org')))]).then(() => assertSucceeds(setDoc(doc(fresh, M('t-fresh')), mem(['worngundidj'], 'fresh@x.org', { addedBy: 'fresh@x.org' })))));
  await check(f + ' teams: …after which it is an ordinary Worn Gundidj member', Promise.all([assertSucceeds(getDocs(collection(fresh, T + '/clients'))), assertFails(getDocs(collection(fresh, TT + '/clients'))), assertFails(updateDoc(doc(fresh, M('t-fresh')), { teams: ['test'] }))]));
  // the lock — last, because it shuts out every account that has no membership
  await check(f + ' teams: only the owner can lock (or unlock) — and anyone signed in can see whether it is locked', Promise.all([
    assertFails(setDoc(doc(wgM, 'platform/lock'), { lockedBy: 'x', lockedAt: 'x' })), assertFails(setDoc(doc(mgr, 'platform/lock'), { lockedBy: 'x', lockedAt: 'x' })),
    assertFails(setDoc(doc(owner, 'platform/other'), { lockedBy: 'x', lockedAt: 'x' })), assertFails(setDoc(doc(owner, 'platform/lock'), { lockedBy: 'x', lockedAt: 'x', extra: 1 })),
    assertSucceeds(getDoc(doc(testM, 'platform/lock'))), assertFails(getDoc(doc(anon, 'platform/lock')))]));
  await check(f + ' teams: once the owner locks it, an account with no membership gets nothing and can no longer add itself; members and the owner carry on', (async () => {
    await assertSucceeds(getDocs(collection(fresh2, T + '/clients')));
    await assertSucceeds(setDoc(doc(owner, 'platform/lock'), { lockedBy: OWNER, lockedAt: '2026-11-16T03:00:00.000Z' }));
    await assertFails(getDocs(collection(fresh2, T + '/clients'))); await assertFails(getDoc(doc(fresh2, T + '/clients/seed')));
    await assertFails(setDoc(doc(fresh2, T + '/clients/late'), client('late')));
    await assertFails(setDoc(doc(fresh2, M('t-fresh2')), mem(['worngundidj'], 'fresh2@x.org')));
    await assertFails(getDocs(collection(wkr, T + '/clients')));                                   // the older test accounts have no membership either
    await assertSucceeds(getDocs(collection(wgM, T + '/clients'))); await assertSucceeds(getDocs(collection(fresh, T + '/clients')));
    await assertSucceeds(getDocs(collection(testM, TT + '/clients'))); await assertSucceeds(getDocs(collection(owner, T + '/clients')));
    await assertSucceeds(getDoc(doc(anon, T + '/consentLinks/' + CL)));                             // a client's own link still opens
    await assertFails(deleteDoc(doc(wgM, 'platform/lock')));
    await assertSucceeds(setDoc(doc(owner, M('t-fresh2')), mem(['worngundidj'], 'fresh2@x.org')));  // the owner lets them in
    await assertSucceeds(getDocs(collection(fresh2, T + '/clients')));
    await assertSucceeds(deleteDoc(doc(owner, 'platform/lock')));                                   // and can unlock in an emergency
    await assertSucceeds(getDocs(collection(wkr, T + '/clients')));
  })());
  await env.cleanup();
}
console.log(`RESULT: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);

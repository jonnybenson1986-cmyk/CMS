// File (Cloud Storage) rules tests — teams. Run against the Storage + Firestore emulators, for BOTH
// rule files:  cd tests/rules && npm ci && npm test
// A team's files live under teams/<team>/… and an account may only reach the teams it belongs to
// (the Firestore document members/{uid} — the same test firestore.rules uses). Synthetic data only.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import fs from 'node:fs';
let pass = 0, fail = 0;
const check = async (name, p) => { try { await p; pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '-', String(e && e.message).slice(0, 160)); } };
const RULES = { 'storage.rules': '../../storage.rules', 'storage.rules.strict': '../../storage.rules.strict' };
const OWNER = 'jon.benson@worngundidj.org.au', BYTES = new Uint8Array([1, 2, 3, 4]);
for (const file of Object.keys(RULES)) {
  // The Storage emulator looks membership up in the Firestore emulator of the project the emulators were
  // started with (npm test: demo-wg-rules), so both rule files use that project, cleared in between.
  const env = await initializeTestEnvironment({ projectId: 'demo-wg-rules',
    storage: { rules: fs.readFileSync(new URL(RULES[file], import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
    firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 } });
  const f = file + ':';
  await env.clearFirestore(); await env.clearStorage();
  const as = (uid, email, role) => env.authenticatedContext(uid, { email, role: role || 'worker', name: uid });
  const owner = as('s-owner', OWNER, 'sysmanager'), wg = as('s-wg', 'wg@x.org'), tst = as('s-test', 'test@x.org'), both = as('s-both', 'both@x.org', 'supervisor'), none = as('s-none', 'none@x.org'), old = as('s-old', 'old@x.org');
  const anon = env.unauthenticatedContext(), anonUser = env.authenticatedContext('s-anon', { firebase: { sign_in_provider: 'anonymous' } });
  await env.withSecurityRulesDisabled(async ctx => { const d = ctx.firestore();
    await setDoc(doc(d, 'members/s-wg'), { teams: ['worngundidj'], email: 'wg@x.org' });
    await setDoc(doc(d, 'members/s-test'), { teams: ['test'], email: 'test@x.org' });
    await setDoc(doc(d, 'members/s-both'), { teams: ['worngundidj', 'test'], email: 'both@x.org' });
    await setDoc(doc(d, 'members/s-none'), { teams: [], email: 'none@x.org' });
    const st = ctx.storage();
    for (const t of ['worngundidj', 'test', 'spare']) await uploadBytes(ref(st, `teams/${t}/clients/c1/seed.txt`), BYTES, { contentType: 'text/plain' });
  });
  const file_ = (ctx, team, name) => ref(ctx.storage(), `teams/${team}/clients/c1/${name || 'seed.txt'}`);
  const up = (ctx, team, name) => uploadBytes(file_(ctx, team, name), BYTES, { contentType: 'text/plain' });
  await check(f + ' each team’s members can read and add their own team’s files', Promise.all([
    assertSucceeds(getBytes(file_(wg, 'worngundidj'))), assertSucceeds(up(wg, 'worngundidj', 'a.txt')),
    assertSucceeds(getBytes(file_(tst, 'test'))), assertSucceeds(up(tst, 'test', 'a.txt'))]));
  await check(f + ' a Worn Gundidj account cannot read or add files in the Test or Spare team', Promise.all([
    assertFails(getBytes(file_(wg, 'test'))), assertFails(getBytes(file_(wg, 'spare'))), assertFails(up(wg, 'test', 'x.txt')), assertFails(up(wg, 'spare', 'x.txt'))]));
  await check(f + ' a Test team account cannot read or add files in Worn Gundidj or the Spare team', Promise.all([
    assertFails(getBytes(file_(tst, 'worngundidj'))), assertFails(getBytes(file_(tst, 'spare'))), assertFails(up(tst, 'worngundidj', 'x.txt')), assertFails(deleteObject(file_(tst, 'worngundidj')))]));
  await check(f + ' an account in two teams reaches both, not the third', Promise.all([
    assertSucceeds(getBytes(file_(both, 'worngundidj'))), assertSucceeds(getBytes(file_(both, 'test'))), assertFails(getBytes(file_(both, 'spare')))]));
  await check(f + ' the owner reaches every team', Promise.all([assertSucceeds(getBytes(file_(owner, 'worngundidj'))), assertSucceeds(getBytes(file_(owner, 'test'))), assertSucceeds(up(owner, 'spare', 'o.txt'))]));
  await check(f + ' an account taken out of every team, a signed-out visitor and an anonymous session reach nothing', Promise.all([
    assertFails(getBytes(file_(none, 'worngundidj'))), assertFails(getBytes(file_(none, 'test'))), assertFails(up(none, 'worngundidj', 'x.txt')),
    assertFails(getBytes(file_(anon, 'worngundidj'))), assertFails(up(anon, 'test', 'x.txt')), assertFails(getBytes(file_(anonUser, 'worngundidj')))]));
  await check(f + ' files outside teams/… cannot be read or written by anyone', Promise.all([
    assertFails(uploadBytes(ref(wg.storage(), 'other/x.txt'), BYTES)), assertFails(getBytes(ref(owner.storage(), 'other/x.txt')))]));
  await check(f + ' an account from before teams (no membership yet) still reaches Worn Gundidj’s files — and no other team’s', Promise.all([
    assertSucceeds(getBytes(file_(old, 'worngundidj'))), assertSucceeds(up(old, 'worngundidj', 'old.txt')), assertFails(getBytes(file_(old, 'test'))), assertFails(up(old, 'spare', 'x.txt'))]));
  await check(f + ' once the owner has locked, an account with no membership reaches no files; members carry on', (async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'platform/lock'), { lockedBy: OWNER, lockedAt: 'x' }));
    await assertFails(getBytes(file_(old, 'worngundidj'))); await assertFails(up(old, 'worngundidj', 'late.txt'));
    await assertSucceeds(getBytes(file_(wg, 'worngundidj'))); await assertSucceeds(getBytes(file_(tst, 'test'))); await assertSucceeds(getBytes(file_(owner, 'spare')));
    await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), 'platform/lock')));
    await assertSucceeds(getBytes(file_(old, 'worngundidj')));
  })());
  await env.cleanup();
}
console.log(`RESULT: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);

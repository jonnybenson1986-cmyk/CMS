// QA — teams (multi-tenancy) in the CMS: Worn Gundidj, a spare team and a test team.
// Each team's records, staff list and device copy are kept apart; an account only opens the teams
// it belongs to; the owner can open all, switch between them, manage who is in which, and lock.
// The fake cloud (fakecloud.js) applies the same team rule as firestore.rules, and logs refusals.
// Synthetic people only.
const {start}=require('./harness.cjs');
const OWNER='jon.benson@worngundidj.org.au', SAM='sam.worker@worngundidj.org.au', TESS='tess.tester@example.org';
const SEED=new Function('w',`
  w('clients','wg1',{id:'wg1',fullName:'Jordan Citizen',status:'active',sewb:true,dob:'1985-03-14',created:'2026-09-01T09:00'});
  w('notes','n1',{id:'n1',clientId:'wg1',date:'2026-09-02',text:'Synthetic note',worker:'Jon Benson',created:'2026-09-02T09:00'});
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED});
  const W=ms=>p.waitForTimeout(ms||300);
  const st=()=>p.evaluate(()=>({ team:ACTIVE_TEAM, chip:(document.getElementById('team-chip')||{}).innerText||'', sw:!!document.getElementById('team-switch-btn'), banner:!!document.getElementById('team-banner'),
    names:clients.map(c=>c.fullName), notes:notes.length, user:currentUser&&currentUser.email, role:currentUser&&currentUser.role, authed:document.body.classList.contains('app-authed'), dev:localStorage.getItem('wg_active_team'),
    login:!!document.getElementById('login-email'), err:(document.getElementById('login-error')||{}).textContent||'' }));
  const cloud=path=>p.evaluate(x=>window.__cloud.read(x),path);
  const refused=()=>p.evaluate(()=>window.__cloud.refused.filter(r=>/^teams\//.test(r.path)));
  const signOut=async()=>{ await p.evaluate(()=>logout()); await W(600); };
  const signIn=async(email,wait)=>{ await p.fill('#login-email',email); await p.fill('#login-pass','x'); await p.click('#login-btn'); await W(wait||2600); };
  const ls=k=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),k);
  const audits=re=>p.evaluate(re=>auditLog.filter(a=>new RegExp(re).test(a.action)).map(a=>a.detail),re);

  // ---- the owner, on a device that has only ever been Worn Gundidj ----
  let s=await st();
  ok('T1 the owner opens Worn Gundidj as before: its clients are there, the side menu names the team, and there is no test banner', s.team==='worngundidj' && s.names.join()==='Jordan Citizen' && /Worn Gundidj/.test(s.chip) && !s.banner && s.role==='sysmanager', JSON.stringify(s));
  ok('T2 an account in more than one team gets a Switch button (the owner is in all three)', s.sw && await p.evaluate(()=>myTeams.join()==='worngundidj,spare,test'));
  await p.evaluate(()=>showPage('settings')); await W(700);
  const card=await p.evaluate(()=>{ const c=document.getElementById('teams-card'); return c?c.innerText:''; });
  ok('T3 Settings has a Teams card for the owner: the three teams, what each is for, and that it is still "moving in" (not locked)', /Worn Gundidj/.test(card) && /Spare team/.test(card) && /Test team/.test(card) && /Made-up people only/i.test(card) && /Moving in/.test(card) && await p.evaluate(()=>!!document.getElementById('teams-lock-btn')), card.slice(0,300));
  ok('T4 …and it names the staff who have not signed in since teams were added (they would be shut out by locking now)', /Not signed in since teams were added \(1\): Sam Worker/.test(card), card.slice(-400));
  await p.evaluate(()=>openTeamSwitcher()); await W(200);
  ok('T5 the switcher lists the teams this account can open, with the open one marked', await p.evaluate(()=>{ const b=[...document.querySelectorAll('#team-switch-list button')]; return b.length===3 && b[0].disabled && /open now/.test(b[0].innerText) && !b[2].disabled; }));

  // ---- switching to the Test team ----
  await p.click('#team-switch-list button[data-team="test"]'); await W(3200);
  s=await st();
  ok('T6 switching reloads into the Test team without asking for the password again', s.team==='test' && s.authed && s.user===OWNER && s.dev==='test' && !s.login, JSON.stringify(s));
  ok('T7 the Test team is empty — none of Worn Gundidj\'s clients or notes — and says so loudly: a banner and an orange team name', s.names.length===0 && s.notes===0 && s.banner && /Test team/.test(s.chip) && /TEST TEAM/.test(await p.innerText('#team-banner')) && /made-up people/i.test(await p.innerText('#team-banner')), JSON.stringify(s));
  ok('T8 Worn Gundidj\'s client records were cleared from this device when the team was changed (as at sign-out)', JSON.stringify(await ls('sewb_cms_clients'))==='[]' && JSON.stringify(await ls('sewb_cms_notes'))==='[]');
  ok('T9 the switch is in Worn Gundidj\'s audit log', (await cloud('teams/worngundidj/auditlog')) && Object.values(await cloud('teams/worngundidj/auditlog')).some(a=>a.action==='Switched team' && /Worn Gundidj → Test team/.test(a.detail)));
  // a record made in the Test team stays in the Test team
  await p.evaluate(()=>{ clients.push({id:'tt1',fullName:'Practice Person',status:'active',sewb:true,created:now()}); saveAll(); }); await W(900);
  const tC=await cloud('teams/test/clients'), wC=await cloud('teams/worngundidj/clients');
  ok('T10 a client added in the Test team is saved under the Test team in the cloud — not in Worn Gundidj', !!tC.tt1 && !wC.tt1 && Object.keys(wC).join()==='wg1', JSON.stringify({t:Object.keys(tC),w:Object.keys(wC)}));
  ok('T11 …and in the Test team\'s own copy on the device, apart from Worn Gundidj\'s', ((await ls('sewb_cms_test__clients'))||[]).some(c=>c.id==='tt1') && !((await ls('sewb_cms_clients'))||[]).some(c=>c.id==='tt1'));
  // links to a client's own form carry the team
  const links=await p.evaluate(()=>({i:intakeLinkUrl('AbCdEfGhIjKlMnOpQrStUv'), c:consentLinkUrl('AbCdEfGhIjKlMnOpQrStUv')}));
  ok('T12 a client form link made in the Test team carries the team (/i#test.… and /c#test.…)', /\/i#test\.AbCdEfGhIjKlMnOpQrStUv$/.test(links.i) && /\/c#test\.AbCdEfGhIjKlMnOpQrStUv$/.test(links.c), JSON.stringify(links));
  // a new staff account made here belongs to the Test team only
  await p.evaluate(()=>{ showPage('settings'); openAddStaffModal(); }); await W(300);
  await p.fill('#sa-name','Tess Tester'); await p.fill('#sa-email',TESS); await p.fill('#sa-pass','Synthetic-Pass-1'); await p.selectOption('#sa-role','worker');
  await p.evaluate(()=>handleModalSave()); await W(1200);
  const mem=await cloud('members'), tStaff=(await cloud('teams/test/staff')).list, wStaff=(await cloud('teams/worngundidj/staff')).list;
  ok('T13 a staff account added while in the Test team is put in the Test team only', mem['uid-'+TESS] && mem['uid-'+TESS].teams.join()==='test' && mem['uid-'+TESS].email===TESS && !('manager' in mem['uid-'+TESS]), JSON.stringify(mem['uid-'+TESS]));
  ok('T14 …it is on the Test team\'s staff list, and Worn Gundidj\'s staff list is untouched', tStaff && tStaff.list.some(x=>x.email===TESS) && !wStaff.list.some(x=>x.email===TESS) && wStaff.list.length===2, JSON.stringify({t:tStaff&&tStaff.list.map(x=>x.email),w:wStaff.list.map(x=>x.email)}));
  ok('T15 the Teams card lists the new account under Test team', await (async()=>{ await W(600); return p.evaluate(e=>{ const r=document.querySelector('#teams-table tr[data-uid="uid-'+e+'"]'); return !!r && r.querySelector('.tm-team[data-team="test"]').checked && !r.querySelector('.tm-team[data-team="worngundidj"]').checked; },TESS); })());

  // ---- a Test team account: only ever the Test team ----
  await signOut(); await p.evaluate(()=>{ window.__cloud.refused.length=0; });
  ok('T16 the sign-in page says which team this device last opened', /This device last opened: Test team/.test(await p.innerText('#main')));
  await signIn(TESS,2000); s=await st();
  ok('T17 a Test team account opens the Test team: its practice client, no Worn Gundidj client, no Switch button, the banner', s.team==='test' && s.user===TESS && s.names.join()==='Practice Person' && !s.sw && s.banner, JSON.stringify(s));
  ok('T18 …the app never even asked for another team\'s records', (await refused()).length===0, JSON.stringify(await refused()));
  ok('T19 …and reaching for them is refused (the same rule as the live security rules)', await p.evaluate(async()=>{ const tries=[firebase.firestore().collection('teams/worngundidj/clients').get(), firebase.firestore().collection('teams/worngundidj/clients').doc('wg1').get(), firebase.firestore().collection('teams/spare/clients').get(), firebase.firestore().collection('teams/worngundidj/clients').doc('evil').set({id:'evil'}), firebase.firestore().collection('members').get(), firebase.firestore().collection('members').doc('uid-tess.tester@example.org').update({teams:['test','worngundidj']})];
    const r=await Promise.all(tries.map(t=>t.then(()=>'ok',e=>e.code))); return r.every(x=>x==='permission-denied'); }));
  await p.evaluate(()=>showPage('settings')); await W(500);
  ok('T20 the Teams card is for the owner only', await p.evaluate(()=>!document.getElementById('teams-card')));

  // ---- a Worn Gundidj account from before teams, on a device last used for the Test team ----
  await signOut(); await p.evaluate(()=>{ window.__cloud.refused.length=0; });
  await signIn(SAM,3400); s=await st();
  ok('T21 a Worn Gundidj account signing in on that device is taken to Worn Gundidj (the page reloads into it) — it sees Worn Gundidj\'s client and nothing from the Test team', s.team==='worngundidj' && s.user===SAM && s.names.join()==='Jordan Citizen' && !s.banner && !s.sw && s.dev==='worngundidj' && s.role==='worker', JSON.stringify(s));
  ok('T22 its membership is recorded as Worn Gundidj the first time it signs in (so the owner can see who has moved across)', await (async()=>{ const m=(await cloud('members'))['uid-'+SAM]; return m && m.teams.join()==='worngundidj' && m.email===SAM && !('manager' in m); })());
  ok('T23 …and it cannot reach the Test team', (await refused()).length===0 && await p.evaluate(async()=>(await firebase.firestore().collection('teams/test/clients').get().then(()=>'ok',e=>e.code))==='permission-denied'));
  ok('T24 a Worn Gundidj form link is unchanged (/i#… with no team in it), so links already sent keep working', await p.evaluate(()=>/\/i#AbCdEfGhIjKlMnOpQrStUv$/.test(intakeLinkUrl('AbCdEfGhIjKlMnOpQrStUv')) && /\/c#AbCdEfGhIjKlMnOpQrStUv$/.test(consentLinkUrl('AbCdEfGhIjKlMnOpQrStUv'))));
  // Sam cannot add accounts once outside the moving-in rule… but in Worn Gundidj (not locked) nothing changes for a manager
  // ---- a Test team account on a Worn Gundidj device ----
  await signOut(); await signIn(TESS,3400); s=await st();
  ok('T25 a Test team account signing in on a Worn Gundidj device is taken to the Test team — never shown Worn Gundidj', s.team==='test' && s.user===TESS && s.names.join()==='Practice Person' && s.banner, JSON.stringify(s));

  // ---- the owner manages who is in which team ----
  await signOut(); await signIn(OWNER,2200); s=await st();
  ok('T26 the owner comes back to the team the device last opened, and can switch', s.team==='test' && s.sw, JSON.stringify(s));
  await p.evaluate(()=>showPage('settings')); await W(900);
  ok('T27 the Teams card now lists both accounts with their teams', await p.evaluate(({SAM,TESS})=>{ const a=document.querySelector('#teams-table tr[data-uid="uid-'+SAM+'"]'), b=document.querySelector('#teams-table tr[data-uid="uid-'+TESS+'"]');
    return !!a && !!b && a.querySelector('.tm-team[data-team="worngundidj"]').checked && !a.querySelector('.tm-team[data-team="test"]').checked && b.querySelector('.tm-team[data-team="test"]').checked; },{SAM,TESS}));
  await p.check(`#teams-table tr[data-uid="uid-${SAM}"] .tm-team[data-team="test"]`); await W(600);
  ok('T28 ticking a team gives the account that team as well — saved, and written to the audit log', await (async()=>{ const m=(await cloud('members'))['uid-'+SAM]; return m.teams.join()==='worngundidj,test' && m.updatedBy===OWNER && (await audits('^Team access changed$')).some(d=>/sam\.worker.*Worn Gundidj → Worn Gundidj, Test team/.test(d)); })());
  await p.check(`#teams-table tr[data-uid="uid-${TESS}"] .tm-mgr`); await W(500);
  ok('T29 "Can add staff" makes an account a team manager', (await cloud('members'))['uid-'+TESS].manager===true);
  // lock
  await p.click('#teams-lock-btn'); await W(600);
  ok('T30 locking is recorded, shown, and audited', !!(await cloud('platform')).lock && (await cloud('platform')).lock.lockedBy===OWNER && /Locked/.test(await p.innerText('#teams-lock')) && (await audits('^Teams locked$')).length===1);
  await signOut(); await signIn('stranger@example.org',1800); s=await st();
  ok('T31 once locked, a sign-in that is not in the list opens nothing: it is told to ask to be added, and is signed out', s.login && !s.authed && /not been added to a team/.test(s.err) && /can now see it in Settings → Teams/.test(s.err) && await p.evaluate(()=>!firebase.auth().currentUser), JSON.stringify(s));
  ok('T32 …it leaves only a request — an entry with NO teams, which opens nothing', await (async()=>{ const m=(await cloud('members'))['uid-stranger@example.org']; return !!m && Array.isArray(m.teams) && m.teams.length===0 && m.email==='stranger@example.org' && !('manager' in m); })());
  await signIn('stranger@example.org',1800); s=await st();
  ok('T32a …and trying again still opens nothing', s.login && !s.authed && /not been added to a team/.test(s.err), JSON.stringify(s));
  await signIn(OWNER,2200); await p.evaluate(()=>showPage('settings')); await W(900);
  ok('T32b the owner sees the request in the Teams list: "Asked to be added", no team ticked', await p.evaluate(()=>{ const r=document.querySelector('#teams-table tr[data-uid="uid-stranger@example.org"]'); return !!r && /Asked to be added/.test(r.innerText) && !r.querySelector('.tm-team:checked'); }));
  await p.check('#teams-table tr[data-uid="uid-stranger@example.org"] .tm-team[data-team="test"]'); await W(600);
  await signOut(); await signIn('stranger@example.org',2600); s=await st();
  ok('T32c once the owner ticks a team, that account can sign in — to that team only', s.authed && s.team==='test' && s.user==='stranger@example.org' && !s.sw && s.names.join()==='Practice Person' && await p.evaluate(async()=>(await firebase.firestore().collection('teams/worngundidj/clients').get().then(()=>'ok',e=>e.code))==='permission-denied'), JSON.stringify(s));
  await signOut();
  // an account in two teams
  await signIn(SAM,2400); s=await st();
  ok('T33 an account ticked into two teams gets the Switch button, and opens only those two', s.user===SAM && s.sw && await p.evaluate(()=>myTeams.join()==='worngundidj,test') && s.team==='test', JSON.stringify(s));
  // a team manager can add staff to their own team, when locked
  await signOut(); await signIn(TESS,2200);
  await p.evaluate(()=>{ currentUser.role='sysmanager'; showPage('settings'); openAddStaffModal(); }); await W(300);
  await p.fill('#sa-name','Nia Newstart'); await p.fill('#sa-email','nia.newstart@example.org'); await p.fill('#sa-pass','Synthetic-Pass-2'); await p.evaluate(()=>handleModalSave()); await W(1200);
  ok('T34 a team manager can add a new account to their own team (and only that team)', await (async()=>{ const m=(await cloud('members'))['uid-nia.newstart@example.org']; return m && m.teams.join()==='test' && m.addedBy===TESS; })());
  // someone who is not a manager cannot, outside Worn Gundidj / once locked
  await signOut(); await signIn(SAM,2400);
  await p.evaluate(()=>{ currentUser.role='sysmanager'; showPage('settings'); openAddStaffModal(); }); await W(300);
  await p.fill('#sa-name','Olly Outsider'); await p.fill('#sa-email','olly.outsider@example.org'); await p.fill('#sa-pass','Synthetic-Pass-3'); await p.evaluate(()=>handleModalSave()); await W(700);
  ok('T35 someone not ticked as "can add staff" is told so — and no sign-in is created', /Only the owner, or someone they have ticked/.test(await p.evaluate(()=>(document.getElementById('sa-error')||{}).textContent||'')) && !(await p.evaluate(()=>(window.__created||[]).includes('olly.outsider@example.org'))) && !(await cloud('members'))['uid-olly.outsider@example.org']);
  await p.evaluate(()=>closeModal());
  // taking an account out of every team
  await signOut(); await signIn(OWNER,2200); await p.evaluate(()=>showPage('settings')); await W(900);
  await p.uncheck(`#teams-table tr[data-uid="uid-${TESS}"] .tm-team[data-team="test"]`); await W(600);
  ok('T36 unticking every team shuts the account out (after a confirmation), and the list says so', (await cloud('members'))['uid-'+TESS].teams.length===0 && /No team — cannot open anything/.test(await p.innerText(`#teams-table tr[data-uid="uid-${TESS}"]`)));
  await signOut(); await signIn(TESS,1800); s=await st();
  ok('T37 …its next sign-in opens nothing', s.login && !s.authed && /not been added to a team/.test(s.err), JSON.stringify(s));
  // unlock, and the spare team
  await signIn(OWNER,2200); await p.evaluate(()=>showPage('settings')); await W(900);
  await p.click('#teams-unlock-btn'); await W(500);
  ok('T38 the owner can unlock again', !(await cloud('platform')).lock && /Moving in/.test(await p.innerText('#teams-lock')));
  await p.evaluate(()=>openTeamSwitcher()); await W(200); await p.click('#team-switch-list button[data-team="spare"]'); await W(3200); s=await st();
  ok('T39 the Spare team is its own empty team: no clients, no banner, its own name', s.team==='spare' && s.names.length===0 && !s.banner && /Spare team/.test(s.chip) && s.authed, JSON.stringify(s));
  ok('T40 nothing from another team was ever uploaded into it', Object.keys(await cloud('teams/spare/clients')).length===0 && Object.keys(await cloud('teams/spare/notes')).length===0 && Object.keys(await cloud('teams/test/clients')).join()==='tt1' && Object.keys(await cloud('teams/worngundidj/clients')).join()==='wg1');
  await p.evaluate(()=>openTeamSwitcher()); await W(200); await p.click('#team-switch-list button[data-team="worngundidj"]'); await W(3200); s=await st();
  ok('T41 back in Worn Gundidj, its records are read again from the cloud — untouched', s.team==='worngundidj' && s.names.join()==='Jordan Citizen' && s.notes===1 && !s.banner, JSON.stringify(s));

  // ---- the day of release: the site updates a few minutes before the new rules are published ----
  await signOut();
  await p.evaluate(()=>{ window.__cloud.remove('members','uid-sam.worker@worngundidj.org.au'); window.__cloud.oldRules(true); });
  await signIn(SAM,2200); s=await st();
  ok('T42 before the new rules are published (membership cannot be read yet) Worn Gundidj staff sign in and work exactly as before — nobody is locked out by the order of release', s.team==='worngundidj' && s.authed && s.user===SAM && s.names.join()==='Jordan Citizen', JSON.stringify(s));
  await signOut(); await p.evaluate(()=>window.__cloud.oldRules(false));
  await done('TEAMS (MULTI-TENANCY)');
})().catch(e=>{ console.error(e); process.exit(1); });

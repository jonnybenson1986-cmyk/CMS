// QA — VPR screening at intake: all four criteria on the intake, automatic add to the register,
// and the alert to System Managers, admins and supervisors. Synthetic people only.
const {start}=require('./harness.cjs');
const SEED=new Function('w',`
  w('staff','list',{list:[{email:'jon.benson@worngundidj.org.au',name:'Jon Benson',role:'sysmanager'},{email:'sam.worker@worngundidj.org.au',name:'Sam Worker',role:'worker'},{email:'sue.supervisor@worngundidj.org.au',name:'Sue Supervisor',role:'supervisor'}]});
  w('clients','a',{id:'a',fullName:'Jordan Citizen',status:'active',sewb:true,dob:'1941-03-14',address:'1 Example Road, Sampleton VIC 3000',phone:'0491 570 156',created:'2026-09-01T09:00'});
  w('clients','b',{id:'b',fullName:'Alex Sample',status:'active',sewb:true,dob:'1950-07-02',created:'2026-01-01T09:00'});
  w('clients','x',{id:'x',fullName:'Casey <img src=x onerror=window.__xss=1> Example',status:'active',sewb:true,created:'2026-01-01T09:00',
    vpr:{c1:'Yes',c2:'Yes',c3:'Yes',consent:'Yes',consentMethod:'written',consentDate:'2026-11-01',consentBy:'Sam Worker',listed:true,listedAt:'2026-11-01T10:00',alert:{at:'2026-11-01T10:00',by:'<b>Sam</b>',why:'All four criteria met at intake'}}});
  w('clients','z',{id:'z',fullName:'Drew Closed',status:'closed',closedDate:'2026-05-01',sewb:true,created:'2025-01-01T09:00'});
`);
const signIn=async(p,email)=>{ await p.evaluate(()=>logout('user')); await p.waitForTimeout(900); await p.fill('#login-email',email); await p.fill('#login-pass','x'); await p.click('#login-btn'); await p.waitForTimeout(1800); };
(async()=>{
  const {p,ok,done}=await start({seed:SEED, email:'sam.worker@worngundidj.org.au'});
  const T=ms=>p.waitForTimeout(ms||300);
  const st=id=>p.evaluate(id=>{ const c=clients.find(x=>x.id===id), v=c.vpr; return v?{on:vprOnRegister(c),c:[v.c1,v.c2,v.c3],consent:v.consent,method:v.consentMethod,date:v.consentDate,by:v.consentBy,alert:v.alert||null,ackBy:v.ackBy||'',hist:(v.history||[]).map(h=>h.action),today:today()}:null; },id);
  const audits=re=>p.evaluate(re=>auditLog.filter(a=>new RegExp(re).test(a.action)).length,re);
  const toasts=()=>p.evaluate(()=>window.__toasts.join(' | '));
  const result=()=>p.evaluate(()=>document.getElementById('ifv-result')?.innerText||'');
  const save=async()=>{ await p.click('.save-bar .btn-primary'); await T(500); };

  // ---- a worker screens at intake ----
  ok('I0 signed in as a worker (not a manager or supervisor)', await p.evaluate(()=>currentUser.role==='worker' && !vprPageAllowed()));
  await p.evaluate(()=>openClientProfile('a','intake')); await T();
  const card=await p.evaluate(()=>({crit:[...document.querySelectorAll('#ifv-box .ifv-crit')].map(d=>d.dataset.crit), radios:document.querySelectorAll('#ifv-box input[type=radio]').length, fields:['ifv-consent','ifv-consentMethod','ifv-consentDate','ifv-consentBy','ifv-repName','if-emergencyPlan','if-emergencyAssist','if-emergencyHelp'].every(i=>!!document.getElementById(i)), txt:document.getElementById('ifv-box').innerText}));
  ok('I1 the intake has the VPR screening: all four criteria, each with its definition, plus the three planning questions', card.crit.join()==='c1,c2,c3,c4' && card.radios===9 && card.fields && /Frail and\/or physically or cognitively impaired/.test(card.txt) && /extra time or help/.test(card.txt) && /Consents to be on the VPR/.test(card.txt) && /does not guarantee assistance/.test(card.txt));
  ok('I2 it starts as "Not screened yet", and says what happens when all four are met', /Not screened yet/.test(await result()) && /System Managers, admins and supervisors are notified/.test(card.txt));
  for (const k of ['c1','c2','c3']) await p.check(`input[name="ifv-${k}"][value="Yes"]`);
  ok('I3 three criteria ticked → the result updates straight away: 3 of 4, consent still needed', /3 of 4 criteria met/.test(await result()) && /4 \(consent not recorded\)/.test(await result()), await result());
  await save();
  let s=await st('a');
  ok('I4 saved with three criteria: screening kept, NOT on the register, nobody notified', s && !s.on && s.c.join()==='Yes,Yes,Yes' && !s.alert && s.hist.includes('Screened at intake') && !/added to the Vulnerable Persons Register/.test(await toasts()), JSON.stringify(s));
  await p.evaluate(()=>switchProfileTab('intake','a')); await T();
  ok('I5 the answers are still there when the intake is reopened', await p.evaluate(()=>['c1','c2','c3'].every(k=>document.querySelector(`input[name="ifv-${k}"]:checked`)?.value==='Yes')));
  await p.selectOption('#ifv-consent','Yes'); await T(100);
  const auto=await p.evaluate(()=>({d:document.getElementById('ifv-consentDate').value,by:document.getElementById('ifv-consentBy').value,t:today()}));
  ok('I6 choosing "Yes — consents" fills in today and the worker; without how it was given it is still 3 of 4', auto.d===auto.t && auto.by==='Sam Worker' && /3 of 4/.test(await result()) && /how consent was given/.test(await result()), JSON.stringify(auto)+' '+await result());
  await p.selectOption('#ifv-consentMethod','verbal'); await T(100);
  ok('I7 all four met → it says they will be added on save and who will be notified', await p.evaluate(()=>!!document.getElementById('ifv-all4')) && /will be added to the Vulnerable Persons Register when you save/.test(await result()) && /System Managers, admins and supervisors will be notified/.test(await result()), await result());
  await save();
  s=await st('a');
  ok('I8 saving the intake adds them to the register automatically', s.on && s.consent==='Yes' && s.method==='verbal' && s.date===s.today && s.by==='Sam Worker' && s.hist.includes('Added to the register'), JSON.stringify(s));
  ok('I9 …tells the worker, and raises the alert for managers and supervisors', /Jordan Citizen meets all four criteria — added to the Vulnerable Persons Register\. Managers and supervisors have been notified/.test(await toasts()) && s.alert && s.alert.by==='Sam Worker' && /at intake/.test(s.alert.why) && s.hist.includes('Managers and supervisors notified') && await audits('^VPR: added to register$')===1 && await audits('^VPR: managers and supervisors notified$')===1, JSON.stringify(s.alert));
  ok('I10 the file now shows them as on the register (header chip and intake)', await p.evaluate(()=>!!document.getElementById('pf-vpr')) && await (async()=>{ await p.evaluate(()=>switchProfileTab('intake','a')); await T(); return p.evaluate(()=>/is on the Vulnerable Persons Register/.test(document.getElementById('ifv-result').innerText) && /On the Vulnerable Persons Register since/.test(document.querySelector('.vpr-intake-status').innerText)); })());
  const h0=(await st('a')).hist.length;
  await p.evaluate(()=>{ saveIntake('a',true); saveIntake('a',true); }); await T(200);
  ok('I11 autosave with nothing changed adds no history and no second alert', (await st('a')).hist.length===h0 && await audits('^VPR: added to register$')===1);
  ok('I12 the screening on screen can never be written to a different client', await p.evaluate(()=>{ const b=clients.find(x=>x.id==='b'); return vprIntakeCollect(b)===null && !b.vpr; }));
  ok('I13 the worker gets no register alerts (the register is for managers and supervisors)', await p.evaluate(()=>{ showPage('dashboard'); return vprAlerts().length===0 && !document.getElementById('vpr-alerts') && document.getElementById('vpr-nav-badge').style.display==='none'; }));
  await p.evaluate(()=>openClientProfile('b','intake')); await T();
  await p.selectOption('#if-emergencyPlan','Yes'); await save();
  ok('I14 an intake saved with no screening answers does not start a VPR record', await p.evaluate(()=>{ const b=clients.find(x=>x.id==='b'); return !b.vpr && b.ifEmergencyPlan==='Yes'; }));
  await p.evaluate(()=>{ window.__reports.length=0; printIntake('a'); });
  ok('I15 the printed intake shows they are on the register and the consent', await p.evaluate(()=>{ const r=window.__reports.join(''); return /On the Vulnerable Persons Register since/.test(r) && /Vulnerable Persons Register consent<\/td><td>given — verbal consent/.test(r); }));

  // ---- the System Manager is notified ----
  await signIn(p,'jon.benson@worngundidj.org.au');
  const jon=await p.evaluate(()=>({role:currentUser.role, badge:document.getElementById('vpr-nav-badge').textContent, shown:document.getElementById('vpr-nav-badge').style.display!=='none', rows:[...document.querySelectorAll('#vpr-alerts .vpr-alert-row')].map(r=>r.dataset.id), txt:document.getElementById('vpr-alerts')?.innerText||'', xss:!!window.__xss, img:!!document.querySelector('#vpr-alerts img[src="x"]'), b:!!document.querySelector('#vpr-alerts b')}));
  ok('I16 System Manager: the dashboard lists who was added, when and by whom, and the menu shows a red count', jon.role==='sysmanager' && jon.shown && jon.badge==='2' && jon.rows.includes('a') && jon.rows.includes('x') && /Jordan Citizen/.test(jon.txt) && /by Sam Worker/.test(jon.txt) && /All four criteria met at intake/.test(jon.txt), JSON.stringify({badge:jon.badge,rows:jon.rows}));
  ok('I17 …and a message pops up at sign-in naming the person and the worker', /Jordan Citizen was added to the Vulnerable Persons Register by Sam Worker/.test(await toasts()));
  ok('I18 names and details in the alert are shown as text', !jon.xss && !jon.img && !jon.b && /<b>Sam<\/b>/.test(jon.txt));
  await p.evaluate(()=>showPage('vpr')); await T();
  ok('I19 the register marks them "New" with a Seen button', await p.evaluate(()=>!!document.querySelector('.vpr-row[data-id=a] .vpr-new') && [...document.querySelectorAll('.vpr-row[data-id=a] .btn')].some(b=>/Seen/.test(b.textContent))));

  // ---- a supervisor is notified too, and marks it as seen ----
  await signIn(p,'sue.supervisor@worngundidj.org.au');
  ok('I20 Supervisor: sees the same alert on the dashboard and the menu count', await p.evaluate(()=>currentUser.role==='supervisor' && document.getElementById('vpr-nav-badge').textContent==='2' && !!document.querySelector('#vpr-alerts .vpr-alert-row[data-id=a]')));
  await p.click('#vpr-alerts .vpr-alert-row[data-id=a] .btn-primary'); await T(400);
  s=await st('a');
  ok('I21 "✓ Seen" clears it and records who saw it', !s.alert && s.ackBy==='Sue Supervisor' && s.hist.includes('Seen by supervisor') && s.on && await audits('^VPR: addition marked as seen$')===1 && await p.evaluate(()=>!document.querySelector('#vpr-alerts .vpr-alert-row[data-id=a]') && document.getElementById('vpr-nav-badge').textContent==='1'), JSON.stringify(s));
  await p.click('#vpr-alerts .vpr-alert-row[data-id=x] .btn-primary'); await T(400);
  ok('I22 when the last one is seen the card and the count go away', await p.evaluate(()=>!document.getElementById('vpr-alerts') && document.getElementById('vpr-nav-badge').style.display==='none'));
  await signIn(p,'jon.benson@worngundidj.org.au');
  ok('I23 once one manager or supervisor has seen it, the others are no longer alerted', await p.evaluate(()=>vprAlerts().length===0 && !document.getElementById('vpr-alerts')));

  // ---- coming off again, and a closed file ----
  await p.evaluate(()=>openClientProfile('a','intake')); await T();
  await p.check('input[name="ifv-c3"][value="No"]'); await T(100);
  ok('I24 changing a criterion to No on the intake shows 3 of 4 at once', /3 of 4 criteria met/.test(await result()) && /3 \(assessed as not met\)/.test(await result()));
  await save(); s=await st('a');
  ok('I25 …and saving takes them off the register (records kept)', !s.on && s.c.join()==='Yes,Yes,No' && s.consent==='Yes' && s.hist.includes('Removed from the register') && /removed from the Vulnerable Persons Register — records kept/.test(await toasts()));
  ok('I26 someone who comes off before being seen leaves no alert behind', await p.evaluate(()=>{ const b=clients.find(x=>x.id==='b'); b.vpr={c1:'Yes',c2:'Yes',c3:'Yes',consent:'Yes',consentMethod:'verbal',consentDate:today(),consentBy:'Jon Benson'}; const a1=vprSync(b); const had=!!b.vpr.alert; b.vpr.c1='No'; const a2=vprSync(b); return a1==='added' && had && a2==='removed' && !b.vpr.alert && vprAlerts().length===0; }));
  await p.evaluate(()=>{ closeModal(); openClientProfile('z','intake'); }); await T();
  for (const k of ['c1','c2','c3']) await p.check(`input[name="ifv-${k}"][value="Yes"]`);
  await p.selectOption('#ifv-consent','Yes'); await p.selectOption('#ifv-consentMethod','written'); await T(100);
  const zr=await result(); await save();
  ok('I27 a closed file: all four can be recorded, but they are not added and nobody is alerted', /This file is closed, so they are not added/.test(zr) && await p.evaluate(()=>{ const z=clients.find(x=>x.id==='z'); return !!z.vpr && z.vpr.c1==='Yes' && !vprOnRegister(z) && !z.vpr.alert && !z.vpr.listed; }), zr);
  ok('I28 every client-file section still opens', (await p.evaluate(()=>{ const out=[]; ['a','z'].forEach(id=>{ openClientProfile(id); [...document.querySelectorAll('#profile-section option')].forEach(o=>{ try{ switchProfileTab(o.value,id); }catch(e){ out.push(id+'/'+o.value+': '+e.message); } }); }); return out; })).length===0);
  await done('VPR SCREENING AT INTAKE');
  process.exit(0);
})();

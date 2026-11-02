// QA — Family Violence session type, reported under SEWB and counted toward SEWB targets.
const {start}=require('./harness.cjs');
(async()=>{
  const day=n=>{ const t=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne'}).format(new Date()); const d=new Date(t+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
  const D=[day(-90),day(-70),day(-50),day(-30),day(-5)];   // 5 contacts over ~12 weeks = one episode of care
  const {p,ok,done}=await start({seed:new Function('w',`
    w('clients','a',{id:'a',fullName:'Jordan Citizen',status:'active',sewb:true,dob:'1985-03-14',created:'2026-01-01T09:00'});
    w('clients','b',{id:'b',fullName:'Alex Sample',status:'active',sewb:true,dob:'1990-07-02',created:'2026-01-01T09:00'});
    w('clients','c',{id:'c',fullName:'Casey Example',status:'active',aod:true,sewb:true,dob:'1990-07-02',created:'2026-01-01T09:00'});
    ${JSON.stringify(D)}.forEach((d,i)=>{
      w('notes','fv'+i,{id:'fv'+i,clientId:'a',type:'familyviolence',created:d+'T10:00:00',worker:'Jon Benson',text:'FV support'});
      w('notes','aod'+i,{id:'aod'+i,clientId:'c',type:'aod',created:d+'T10:00:00',worker:'Jon Benson',text:'AOD'}); });
  `)});
  // 1. form option
  await p.evaluate(()=>openSessionModal('b')); await p.waitForTimeout(250);
  const opt=await p.evaluate(()=>{ const o=document.querySelector('#sm-type option[value=familyviolence]'); return o&&o.textContent; });
  ok('F1 Log Session → Session Type offers FAMILY VIOLENCE (right after SEWB)', opt==='FAMILY VIOLENCE' && await p.evaluate(()=>{ const v=[...document.querySelectorAll('#sm-type option')].map(o=>o.value); return v.indexOf('familyviolence')===v.indexOf('sewb')+1; }), opt);
  // 2. log one through the form, with time
  await p.selectOption('#sm-type','familyviolence');
  await p.evaluate(()=>{ rteSetContent('sm-text','','Safety planning, referred to FV service.'); const el=document.getElementById('sm-text'); el.value='Safety planning, referred to FV service.'; el.dispatchEvent(new Event('input',{bubbles:true})); });
  await p.fill('#sm-duration','45'); await p.click('#modal-container .modal-footer .btn-primary'); await p.waitForTimeout(600);
  const saved=await p.evaluate(()=>({ n:notes.filter(x=>x.clientId==='b').map(x=>x.type), t:timeLogs.filter(x=>x.clientId==='b').map(x=>({p:timeLogProgram(x),eoc:eocProgramOf(timeLogProgram(x)),m:x.minutes})) }));
  ok('F2 the session saves as a Family Violence note, and its 45 min counts to SEWB', saved.n[0]==='familyviolence' && saved.t[0].p==='familyviolence' && saved.t[0].eoc==='sewb' && +saved.t[0].m===45, JSON.stringify(saved));
  // 3. counting toward SEWB
  const eoc=await p.evaluate(()=>({ a:clientEpisodeStats('a','sewb'), b:clientEpisodeStats('b','sewb'), cS:clientEpisodeStats('c','sewb'), cA:clientEpisodeStats('c','aod') }));
  ok('F3 five Family Violence contacts over 12 weeks complete a SEWB episode of care', eoc.a.totalContacts===5 && eoc.a.completeEpisodes===1, JSON.stringify(eoc.a));
  ok('F4 the new Family Violence session counts as a SEWB contact (once, not twice with its time)', eoc.b.totalContacts===1, JSON.stringify(eoc.b));
  ok('F5 other programs are unchanged: AOD contacts still count to AOD, not SEWB', eoc.cA.completeEpisodes===1 && eoc.cS.totalContacts===0, JSON.stringify({aod:eoc.cA.completeEpisodes,sewb:eoc.cS.totalContacts}));
  const fs_=await p.evaluate(()=>{ const s=fundingProgramStats('sewb'); const r=s.rows.find(x=>x.client.id==='a'); return { inc:!!r, ep:r&&r.completeEpisodes, tot:s.totalEpisodes }; });
  ok('F6 SEWB funding figures include the Family Violence episode', fs_.inc && fs_.ep===1 && fs_.tot>=1, JSON.stringify(fs_));
  // also a time entry logged directly to Family Violence (no note)
  const t2=await p.evaluate(()=>{ const before=clientEpisodeStats('b','sewb').totalContacts;
    timeLogs.push({id:'tx',clientId:'b',date:today(),minutes:30,program:'familyviolence',worker:'Jon Benson'}); const fv=clientEpisodeStats('b','sewb').totalContacts;
    timeLogs.pop(); timeLogs.push({id:'ty',clientId:'b',date:today(),minutes:30,program:'sewb',worker:'Jon Benson'}); const sewb=clientEpisodeStats('b','sewb').totalContacts; timeLogs.pop();
    return {before,fv,sewb}; });
  ok('F7 Log Time with program Family Violence counts toward SEWB exactly as SEWB time does', t2.fv===t2.sewb && t2.fv===t2.before+1, JSON.stringify(t2));
  ok('F8 Log Time offers Family Violence as a program', await p.evaluate(()=>{ closeModal(); openTimeModal('b'); const o=document.querySelector('#tm-program option[value=familyviolence]') || document.querySelector('#sm-type option[value=familyviolence]'); closeModal(); return !!o; }));
  // 4. client file + reports
  await p.evaluate(()=>openClientProfile('a','sewb')); await p.waitForTimeout(250);
  const tab=await p.textContent('#profile-tab-content');
  ok('F9 the client file\'s SEWB section has a Family Violence Notes card (counted as SEWB) with an Add button', /Family Violence Notes/.test(tab) && /counted as SEWB/.test(tab) && /FV support/.test(tab) && /Add Family Violence Note/.test(tab));
  await p.click('button:has-text("Add Family Violence Note")'); await p.waitForTimeout(250);
  ok('F10 "Add Family Violence Note" opens Log Session with Family Violence chosen', (await p.inputValue('#sm-type'))==='familyviolence');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.evaluate(()=>{ window.__reports=[]; openReport(buildSEWBProgramReport('2000-01-01','2100-01-01')); }); await p.waitForTimeout(200);
  let r=(await p.evaluate(()=>window.__reports.join(''))).replace(/\s+/g,' ');
  ok('F11 SEWB Program Report shows Family Violence contacts (total and by client)', /Family Violence Contacts/.test(r) && /<h2>Family Violence \(SEWB\)<\/h2>/.test(r) && /Jordan Citizen<\/td><td>5</.test(r) && /<strong>6<\/strong>/.test(r), (r.match(/Family Violence \(SEWB\).{0,500}/)||[''])[0]);
  await p.evaluate(()=>{ window.__reports=[]; openQuickReport('sewb','a'); }); await p.waitForTimeout(200);
  r=await p.evaluate(()=>window.__reports.join(''));
  ok('F12 the client\'s SEWB report lists their Family Violence notes', /Family Violence \|/.test(r) && /FV support/.test(r) && /SEWB Case Notes \(5\)/.test(r));
  // 5. labels and filters
  await p.evaluate(()=>{ closeModal(); showPage('sessions'); }); await p.waitForTimeout(300);
  ok('F13 Session Log has a FAMILY VIOLENCE filter', await p.evaluate(()=>/FAMILY VIOLENCE/.test(document.getElementById('sf-familyviolence')?.textContent||'')));
  await p.evaluate(()=>showPage('notes')); await p.waitForTimeout(300);
  ok('F14 All Case Notes labels them "family violence" and has a chip for it', await p.evaluate(()=>/family violence/i.test(document.getElementById('main').innerText) && !!document.querySelector('.notes-type-chip[data-t=familyviolence]')));
  await p.evaluate(()=>showPage('sewb')); await p.waitForTimeout(300);
  ok('F15 the SEWB page shows the Family Violence count under SEWB Notes', /\+ 6 Family Violence/.test(await p.textContent('#main')));
  await done('FAMILY VIOLENCE (SEWB)'); process.exit(0);
})();

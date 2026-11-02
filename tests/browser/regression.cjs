// Regression for the counting rules and recent features around Log Session.
const {start}=require('./harness.cjs');
(async()=>{
  const day=n=>{ const t=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne'}).format(new Date()); const d=new Date(t+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
  const D=[day(-90),day(-70),day(-50),day(-30),day(-5)];
  const {p,ok,done}=await start({seed:new Function('w',`
    w('workersList','list',{list:['Jon Benson','Sam Worker']});
    w('clients','g',{id:'g',fullName:'General Person',status:'active',sewb:true,created:'2026-01-01T09:00'});
    w('clients','n',{id:'n',fullName:'Ndis Only',status:'active',disability:true,created:'2026-01-01T09:00'});
    w('clients','m',{id:'m',fullName:'Mens Group',status:'active',sewb:true,mensgroup:true,created:'2026-01-01T09:00'});
    ${JSON.stringify(D)}.forEach((d,i)=>{
      w('notes','g'+i,{id:'g'+i,clientId:'g',type:'general',created:d+'T10:00:00',worker:'Jon Benson',text:'gen'});
      w('notes','n'+i,{id:'n'+i,clientId:'n',type:'general',created:d+'T10:00:00',worker:'Jon Benson',text:'gen'});
      w('notes','m'+i,{id:'m'+i,clientId:'m',type:'mensgroup',created:d+'T10:00:00',worker:'Jon Benson',text:'mg'}); });
  `)});
  const r=await p.evaluate(()=>({ g:clientEpisodeStats('g','sewb').completeEpisodes, n:clientEpisodeStats('n','sewb').totalContacts, mS:clientEpisodeStats('m','sewb').totalContacts, mM:clientEpisodeStats('m','mensgroup').completeEpisodes }));
  ok('R1 GENERAL contacts still count toward SEWB for a SEWB client', r.g===1, JSON.stringify(r));
  ok('R2 …but not for an NDIS-only client', r.n===0, JSON.stringify(r));
  ok('R3 Men\'s Group stays its own program (not added to SEWB)', r.mS===0 && r.mM===1, JSON.stringify(r));
  await p.evaluate(()=>openClientProfile('g','overview')); await p.waitForTimeout(200);
  ok('R4 the file header has the single Log session button', await p.evaluate(()=>[...document.querySelectorAll('.pf-actions button')].some(b=>/Log session/.test(b.textContent)) && ![...document.querySelectorAll('.pf-actions button')].some(b=>/Add note/.test(b.textContent))));
  await p.click('.pf-actions button:has-text("Log session")'); await p.waitForTimeout(250);
  const types=await p.evaluate(()=>[...document.querySelectorAll('#sm-type option')].map(o=>o.value+'='+o.textContent).join(', '));
  ok('R5 Session Type list: GENERAL, SEWB, FAMILY VIOLENCE, AOD, JUSTICE, CULTURAL, MEN\'S GROUP, DISABILITY, WORK FOUNDATIONS', types==="general=GENERAL, sewb=SEWB, familyviolence=FAMILY VIOLENCE, aod=AOD, justice=JUSTICE, cultural=CULTURAL, mensgroup=MEN'S GROUP, disability=DISABILITY, workfoundations=WORK FOUNDATIONS", types);
  await p.selectOption('#sm-worker2','Sam Worker');
  await p.evaluate(()=>{ rteSetContent('sm-text','','Joint.'); const el=document.getElementById('sm-text'); el.value='Joint.'; el.dispatchEvent(new Event('input',{bubbles:true})); });
  await p.click('#modal-container .modal-footer .btn-primary'); await p.waitForTimeout(500);
  ok('R6 second worker still saves, and you\'re returned to the file', await p.evaluate(()=>notes.some(n=>n.text==='Joint.'&&n.worker2==='Sam Worker') && !!document.getElementById('profile-section')));
  ok('R7 Outlook helpers present (my appointments, today / this week)', await p.evaluate(()=>typeof outlookRange==='function' && outlookRange('today').from===today() && typeof isMyWorkerName==='function' && isMyWorkerName('jon.benson')));
  await done('REGRESSION'); process.exit(0);
})();

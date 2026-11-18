// QA — Reports and the Key Worker rule: a report for a worker covers only the clients where they are
// the CURRENT Key Worker (not clients they have only seen or written about), with every record on those
// clients. Workers can only report on their own Key Worker clients; managers and supervisors can pick.
// Synthetic people only.
const {start}=require('./harness.cjs');
const JON='jon.benson@worngundidj.org.au', SAM='sam.worker@worngundidj.org.au', SUE='sue.supervisor@worngundidj.org.au';
const SEED=new Function('w',`
  w('staff','list',{list:[{email:'${JON}',name:'Jon Benson',role:'sysmanager'},{email:'${SAM}',name:'Sam Worker',role:'worker'},{email:'${SUE}',name:'Sue Supervisor',role:'supervisor'}]});
  w('clients','a',{id:'a',fullName:'Jordan Citizen',status:'active',sewb:true,keyWorker:'Sam Worker',created:'2026-09-01T09:00'});
  w('clients','b',{id:'b',fullName:'Alex Sample',status:'active',sewb:true,keyWorker:'Jon Benson',created:'2026-09-01T09:00'});
  w('clients','c',{id:'c',fullName:'Casey Example',status:'closed',aod:true,keyWorker:'Sam Worker',created:'2026-05-01T09:00'});
  w('clients','d',{id:'d',fullName:'Drew Person',status:'active',sewb:true,keyWorker:'Sue Supervisor',created:'2026-09-01T09:00'});
  const d=new Date(); d.setDate(d.getDate()-5); const day=d.toISOString().slice(0,10);
  w('notes','n1',{id:'n1',clientId:'a',type:'sewb',worker:'Sam Worker',text:'Sam on Jordan',created:day+'T10:00',date:day});
  w('notes','n2',{id:'n2',clientId:'b',type:'sewb',worker:'Sam Worker',text:'Sam covering for Jon on Alex',created:day+'T11:00',date:day});
  w('notes','n3',{id:'n3',clientId:'a',type:'sewb',worker:'Jon Benson',text:'Jon on Jordan',created:day+'T12:00',date:day});
  w('timelogs','t1',{id:'t1',clientId:'a',worker:'Sam Worker',date:day,minutes:60,activity:'Client Session'});
  w('timelogs','t2',{id:'t2',clientId:'b',worker:'Sam Worker',date:day,minutes:30,activity:'Client Session'});
  w('timelogs','t3',{id:'t3',clientId:'a',worker:'Jon Benson',date:day,minutes:45,activity:'Client Session'});
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED});
  const W=ms=>p.waitForTimeout(ms||350);
  const alerts=[]; p.on('dialog',d=>alerts.push(d.message()));
  const scope=(o)=>p.evaluate(o=>withReportFilters(()=>({ c:clients.map(x=>x.id).sort().join(), n:notes.map(x=>x.id).sort().join(), t:timeLogs.map(x=>x.id).sort().join(), label:_rptFilterLabel }), o||{}),o||{});
  const signAs=async email=>{ await p.evaluate(()=>logout()); await W(700); await p.fill('#login-email',email); await p.fill('#login-pass','x'); await p.click('#login-btn'); await W(2200); await p.evaluate(()=>{ _rptFilter=null; showPage('reports'); }); await W(400); };

  // ---- a manager ----
  await p.evaluate(()=>{ _rptFilter=null; showPage('reports'); }); await W(400);
  ok('R1 a manager gets a "Key worker" filter (all clients, or one key worker) and the rule is explained on the page', await p.evaluate(()=>{ const s=document.getElementById('rpt-worker'); return !!s && /All clients/.test(s.options[0].text) && [...s.options].some(o=>o.value==='Sam Worker') && !document.getElementById('rpt-mine') && /Key worker rule/.test(document.getElementById('rpt-rule').innerText); }));
  let s0=await scope();
  ok('R2 with no key worker chosen, a manager\'s report covers every client and record', s0.c==='a,b,c,d' && s0.n==='n1,n2,n3' && s0.t==='t1,t2,t3', JSON.stringify(s0));
  await p.selectOption('#rpt-worker','Sam Worker'); await W(300);
  let s1=await scope();
  ok('R3 key worker = Sam: only the clients where Sam is the Key Worker now (Jordan, and closed Casey) — NOT Alex, whom Sam only had contact with', s1.c==='a,c', JSON.stringify(s1));
  ok('R4 …and every record on those clients, whoever wrote it (Jon\'s note and time on Jordan count; Sam\'s note and time on Alex do not)', s1.n==='n1,n3' && s1.t==='t1,t3', JSON.stringify(s1));
  ok('R5 the report says whose clients it covers', /Key Worker: Sam Worker/.test(s1.label) && /Key Worker: Sam Worker/.test(await p.innerText('#rpt-filter-summary')), s1.label);
  await p.evaluate(()=>{ clients.find(c=>c.id==='b').keyWorker='Sam Worker'; clients.find(c=>c.id==='a').keyWorker='Jon Benson'; });
  let s2=await scope();
  ok('R6 it follows the Key Worker at the moment: reassign Alex to Sam and Jordan to Jon, and the report changes with it', s2.c==='b,c' && s2.n==='n2' && s2.t==='t2', JSON.stringify(s2));
  await p.evaluate(()=>{ clients.find(c=>c.id==='b').keyWorker='Jon Benson'; clients.find(c=>c.id==='a').keyWorker='Sam Worker'; });
  await p.evaluate(()=>{ window.__reports.length=0; generateProgramReport('sewb'); }); await W(300);
  const pr=await p.evaluate(()=>window.__reports.join(''));
  ok('R7 a program report run for Sam lists Sam\'s Key Worker client (Jordan), not Alex or Drew', /Jordan Citizen/.test(pr) && !/Alex Sample/.test(pr) && !/Drew Person/.test(pr));
  await p.evaluate(()=>{ coiList.push({id:'coiX',clientId:'d',personEmail:'jon.benson@worngundidj.org.au',personName:'Jon Benson',status:'managed',manage:{hideFile:true}}); rptSet('worker',''); }); await W(200);
  let s3=await scope();
  ok('R8 a client whose file is hidden from the manager (conflict of interest) is left out of their reports', s3.c==='a,b,c' && !/Drew Person/.test(await p.evaluate(()=>document.getElementById('rpt-clientf').innerText)), JSON.stringify(s3));
  await p.evaluate(()=>{ coiList=coiList.filter(x=>x.id!=='coiX'); });

  // ---- a worker ----
  await signAs(SAM);
  const ui=await p.evaluate(()=>({ sel:!!document.getElementById('rpt-worker'), mine:(document.getElementById('rpt-mine')||{}).innerText||'', cf:[...document.getElementById('rpt-clientf').options].map(o=>o.text).join('|'), cs:[...document.getElementById('rpt-client-select').options].map(o=>o.text).join('|'), rule:document.getElementById('rpt-rule').innerText }));
  ok('R9 a worker has no key-worker choice — the page says "My clients — where I am the Key Worker"', !ui.sel && /My clients — where I am the Key Worker \(2\)/.test(ui.mine) && /Your reports always cover only your own Key Worker clients/.test(ui.rule), JSON.stringify(ui));
  ok('R10 the client lists offer only their own Key Worker clients', /Jordan Citizen/.test(ui.cf) && /Casey Example/.test(ui.cf) && !/Alex Sample|Drew Person/.test(ui.cf) && /Jordan Citizen/.test(ui.cs) && !/Alex Sample|Drew Person/.test(ui.cs), JSON.stringify(ui));
  let s4=await scope();
  ok('R11 every report a worker runs covers only their own Key Worker clients, with all records on them', s4.c==='a,c' && s4.n==='n1,n3' && s4.t==='t1,t3' && /My clients \(Key Worker: Sam Worker\)/.test(s4.label), JSON.stringify(s4));
  await p.evaluate(()=>{ reportFilter().worker='Jon Benson'; });
  let s5=await scope();
  ok('R12 …even if the filter is altered to name someone else', s5.c==='a,c', JSON.stringify(s5));
  await p.evaluate(()=>{ reportFilter().worker=''; });
  let s6=await scope({datesOnly:true});
  ok('R13 funding (episode-of-care) reports are limited to their own clients too', s6.c==='a,c', JSON.stringify(s6));
  { const r=await p.evaluate(()=>{ const card=[...document.querySelectorAll('.report-card')].find(c=>/^SEWB Program Report$/.test(c.querySelector('.rc-title')?.textContent||'')); return { badge:card?card.querySelector('.rc-badge').textContent.trim():'', mine:reportScopeClients().filter(c=>c.sewb).length, all:clients.filter(c=>c.sewb).length }; });
    ok('R14 the report cards count only their own clients (SEWB card = their SEWB clients, fewer than the whole team\'s)', r.badge===r.mine+' clients' && r.mine<r.all, JSON.stringify(r)); }
  alerts.length=0;
  await p.evaluate(()=>{ window.__reports.length=0; const s=document.getElementById('rpt-client-select'); const o=document.createElement('option'); o.value='b'; o.text='Alex Sample'; s.appendChild(o); s.value='b'; generateReport('full'); }); await W(200);
  ok('R15 a worker cannot run a single-client report on someone else\'s client, even by forcing the choice', await p.evaluate(()=>window.__reports.length===0) && alerts.some(m=>/only run reports on clients where you are the Key Worker/.test(m)), JSON.stringify(alerts));
  await p.evaluate(()=>{ window.__reports.length=0; document.getElementById('rpt-client-select').value='a'; generateReport('full'); }); await W(200);
  ok('R16 …and can on their own Key Worker client', await p.evaluate(()=>window.__reports.length===1 && /Jordan Citizen/.test(window.__reports[0])));
  await p.evaluate(()=>{ reportFilter().clientId='d'; reportFilter().report='client-full'; window.__reports.length=0; document.getElementById('rpt-report').value='client-full'; }); alerts.length=0;
  await p.evaluate(()=>runSelectedReport()); await W(200);
  ok('R17 the "Full client report" from the filter bar is held to the same rule', await p.evaluate(()=>window.__reports.length===0) && alerts.some(m=>/only run reports on clients where you are the Key Worker/.test(m)));
  await p.evaluate(()=>{ reportFilter().clientId=''; });
  ok('R18 the time review list shows only time on their own Key Worker clients', await p.evaluate(()=>timeReviewEntries().map(t=>t.id).sort().join()==='t1,t3'));

  // ---- a supervisor ----
  await signAs(SUE);
  let s7=await scope();
  ok('R19 a supervisor is not limited: all clients, and can pick a key worker', s7.c==='a,b,c,d' && await p.evaluate(()=>!!document.getElementById('rpt-worker')), JSON.stringify(s7));
  await done('REPORTS — KEY WORKER RULE');
})().catch(e=>{ console.error(e); process.exit(1); });

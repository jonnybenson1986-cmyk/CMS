// QA — Settings → Remove a worker's name (System Manager): finds everywhere a name appears and removes
// it where that's safe — the worker list (shared, so a stale device can't put it back), "second worker"
// on joint sessions, assigned workers — and, only if ticked, time logged under the name. Case notes keep
// their author; Key Worker is changed in the file. Synthetic people only ("Vince Haberfield" is made up here).
const {start}=require('./harness.cjs');
const T='teams/worngundidj/';
const SEED=new Function('w',`
  w('workersList','list',{list:['Jon Benson','Jade Atkinson','Brett Clarke','Vince Haberfield']});
  w('clients','a',{id:'a',fullName:'Citizen Jordan',status:'active',sewb:true,keyWorker:'Jon Benson',assignedWorkers:['Jon Benson','Vince Haberfield'],created:'2026-07-01T09:00'});
  w('clients','b',{id:'b',fullName:'Sample Alex',status:'active',sewb:true,keyWorker:'Vince Haberfield',created:'2026-07-01T09:00'});
  w('notes','n1',{id:'n1',clientId:'a',type:'sewb',worker:'Jon Benson',worker2:'Vince Haberfield',text:'Synthetic joint session',created:'2026-10-01T10:00'});
  w('notes','n2',{id:'n2',clientId:'b',type:'sewb',worker:'Vince Haberfield',text:'Synthetic note written by Vince',created:'2026-10-02T10:00'});
  w('timelogs','t1',{id:'t1',clientId:'a',worker:'Jon Benson',worker2:'Vince Haberfield',date:'2026-10-01',minutes:90,activity:'Client Session',fromNoteId:'n1',source:'Case note'});
  w('timelogs','t2',{id:'t2',clientId:'b',worker:'Vince Haberfield',date:'2026-10-02',minutes:30,activity:'Client Session',fromNoteId:'n2',source:'Case note'});
  w('timelogs','t3',{id:'t3',clientId:'a',worker:'Jon Benson',date:'2026-10-03',minutes:60,activity:'Client Session'});
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED});
  const W=ms=>p.waitForTimeout(ms||350);
  const cloud=path=>p.evaluate(path=>window.__cloud.read(path),T+path);
  const byWorker=()=>p.evaluate(()=>{ const d=document.createElement('div'); d.innerHTML=buildActivityReport('2026-01-01','2026-12-31'); return [...d.querySelectorAll('table')[0].querySelectorAll('tr')].slice(1).map(r=>r.cells[0].innerText+'='+r.cells[1].innerText); });

  ok('W0 before: the Activity report lists Vince as a worker (2h 0m — 90 min joint + 30 min his own)', (await byWorker()).includes('Vince Haberfield=2h 0m'), JSON.stringify(await byWorker()));
  await p.evaluate(()=>showPage('settings')); await W(400);
  ok('W1 the System Manager has "Remove a worker’s name" in Settings, listing every name found', await p.evaluate(()=>!!document.getElementById('rw-card') && [...document.getElementById('rw-name').options].some(o=>o.value==='Vince Haberfield')));
  await p.selectOption('#rw-name','Vince Haberfield'); await W(300);
  const body=await p.innerText('#rw-body');
  ok('W2 it shows everywhere the name is: worker list, 1 joint session (second worker), 1 time entry logged under him, 1 assigned file, Key Worker on 1 file, 1 note he wrote',
    /off the worker list/.test(body) && /1 joint session time entry and 1 note where Vince Haberfield is the second worker/.test(body) && /Remove 1 time entry logged under Vince Haberfield \(0h 30m\)/.test(body)
    && /assigned workers of 1 client file/.test(body) && /Key Worker on 1 client file/.test(body) && /Sample Alex/.test(body) && /Wrote 1 case note — kept/.test(body), body);
  ok('W3 safe removals are ticked; removing time logged under him is NOT ticked unless chosen', await p.evaluate(()=>document.getElementById('rw-list').checked && document.getElementById('rw-second').checked && document.getElementById('rw-assigned').checked && !document.getElementById('rw-maintime').checked));
  await p.click('#rw-go'); await W(700);
  const s1=await p.evaluate(()=>({ n1:notes.find(n=>n.id==='n1'), t1:timeLogs.find(t=>t.id==='t1'), t2:!!timeLogs.find(t=>t.id==='t2'), n2:notes.find(n=>n.id==='n2').worker, aw:clients.find(c=>c.id==='a').assignedWorkers, kw:clients.find(c=>c.id==='b').keyWorker, list:workersList.slice() }));
  ok('W4 his name is off the joint session (note and time); the 90 minutes stay with Jon', !s1.n1.worker2 && !s1.t1.worker2 && s1.t1.worker==='Jon Benson' && s1.t1.minutes===90, JSON.stringify(s1));
  ok('W5 off the assigned workers and the worker list; the note he wrote keeps his name; Key Worker left for the manager to change', JSON.stringify(s1.aw)==='["Jon Benson"]' && !s1.list.includes('Vince Haberfield') && s1.n2==='Vince Haberfield' && s1.kw==='Vince Haberfield' && s1.t2, JSON.stringify(s1));
  const cl=await cloud('workersList'), cn=await cloud('notes'), ct=await cloud('timelogs');
  ok('W6 the cloud has it too: worker list without him, his name on the removed list, joint records changed', !cl.list.list.includes('Vince Haberfield') && cl.removed.names.includes('Vince Haberfield') && !cn.n1.worker2 && !ct.t1.worker2, JSON.stringify(cl));
  ok('W7 recorded in the audit log', await p.evaluate(()=>auditLog.some(a=>a.action==='Worker name removed' && /Vince Haberfield/.test(a.detail))));
  ok('W8 the report now shows only his own 30 minutes (not the joint session)', (await byWorker()).includes('Vince Haberfield=0h 30m'), JSON.stringify(await byWorker()));
  // now remove the time logged under him too
  await p.selectOption('#rw-name','Vince Haberfield'); await W(300);
  await p.check('#rw-maintime'); await p.click('#rw-go'); await W(700);
  ok('W9 ticking "Remove time logged under him" removes that entry (tracked: it can\'t come back) — he is gone from the report', !(await p.evaluate(()=>timeLogs.some(t=>t.id==='t2'))) && !(await byWorker()).some(r=>/Vince/.test(r)) && !!((await cloud('timelogs')).t2||{})._deleted , JSON.stringify(await byWorker()));
  ok('W10 the note he wrote is still there', await p.evaluate(()=>notes.some(n=>n.id==='n2' && n.worker==='Vince Haberfield')));
  // he is no longer offered anywhere
  await p.evaluate(()=>openSessionModal('a')); await W(500);
  ok('W11 he is no longer offered as a second worker', await p.evaluate(()=>![...document.getElementById('sm-worker2').options].some(o=>/Vince/.test(o.text))));
  await p.evaluate(()=>{ closeModal(); openAssignWorkersModal('a'); }); await W(300);
  ok('W12 …or in Assign workers', await p.evaluate(()=>![...document.querySelectorAll('.aw-worker')].some(i=>/Vince/.test(i.value))));
  await p.evaluate(()=>closeModal());
  // a device still on an older version writes the old list back
  await p.evaluate(()=>window.__cloud.write('teams/worngundidj/workersList','list',{list:['Jon Benson','Jade Atkinson','Brett Clarke','Vince Haberfield']})); await W(500);
  ok('W13 if an out-of-date device puts the old list back, he stays removed', await p.evaluate(()=>!workersList.includes('Vince Haberfield')));
  await p.reload(); await W(2500);
  ok('W14 …and after reloading', await p.evaluate(()=>!workersList.includes('Vince Haberfield')));
  // typing the name back in on purpose brings it back
  await p.evaluate(()=>openSessionModal('a')); await W(500);
  await p.evaluate(()=>{ const s=document.getElementById('sm-worker2'); s.value='__add__'; s.dispatchEvent(new Event('change')); document.getElementById('sm-worker2-new').value='Vince Haberfield'; addWorkerFromInput('sm-worker2','sm-worker2-new'); }); await W(400);
  ok('W15 typing the name in again on purpose brings it back (and off the removed list)', await p.evaluate(()=>workersList.includes('Vince Haberfield') && !_isRemovedWorker('Vince Haberfield')) && !(await cloud('workersList')).removed.names.includes('Vince Haberfield'));
  await p.evaluate(()=>closeModal());
  // only the System Manager
  await p.evaluate(()=>logout()); await W(700); await p.fill('#login-email','sam.worker@worngundidj.org.au'); await p.fill('#login-pass','x'); await p.click('#login-btn'); await W(2200);
  await p.evaluate(()=>showPage('settings')); await W(300);
  ok('W16 other staff don\'t have the tool', await p.evaluate(()=>!document.getElementById('rw-card')));
  await done("REMOVE A WORKER'S NAME");
})().catch(e=>{ console.error(e); process.exit(1); });

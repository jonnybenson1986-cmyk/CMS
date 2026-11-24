// QA — Men's Group sessions count toward SEWB episodes of care and the SEWB target, exactly like a
// SEWB (or Family Violence) session — including sessions recorded before the change. Synthetic people only.
const {start}=require('./harness.cjs');
const SEED=new Function('w',`
  // five Men's Group sessions over 12+ weeks, in July–October 2026 (recorded "before the change")
  w('clients','m',{id:'m',fullName:'Group Only',status:'active',sewb:true,mensgroup:true,keyWorker:'Jon Benson',created:'2026-07-01T09:00'});
  // a participant whose SEWB tick was never set (only the Men's Group tick)
  w('clients','n',{id:'n',fullName:'Untick Sewb',status:'active',mensgroup:true,keyWorker:'Jon Benson',created:'2026-07-01T09:00'});
  // mixed: 3 SEWB + 2 Men's Group sessions
  w('clients','x',{id:'x',fullName:'Mixed Person',status:'active',sewb:true,mensgroup:true,keyWorker:'Jon Benson',created:'2026-07-01T09:00'});
  // the same five sessions as SEWB, for comparison
  w('clients','s',{id:'s',fullName:'Sewb Only',status:'active',sewb:true,keyWorker:'Jon Benson',created:'2026-07-01T09:00'});
  const days=[0,21,42,63,85];
  days.forEach((d,i)=>{ const dt=new Date(Date.UTC(2026,6,10)+d*864e5).toISOString().slice(0,10);
    w('notes','m'+i,{id:'m'+i,clientId:'m',type:'mensgroup',worker:'Jon Benson',text:'x',created:dt+'T10:00'});
    w('timelogs','tm'+i,{id:'tm'+i,clientId:'m',worker:'Jon Benson',date:dt,minutes:120,fromNoteId:'m'+i});
    w('notes','n'+i,{id:'n'+i,clientId:'n',type:'mensgroup',worker:'Jon Benson',text:'x',created:dt+'T10:00'});
    w('notes','x'+i,{id:'x'+i,clientId:'x',type:i<3?'sewb':'mensgroup',worker:'Jon Benson',text:'x',created:dt+'T10:00'});
    w('notes','s'+i,{id:'s'+i,clientId:'s',type:'sewb',worker:'Jon Benson',text:'x',created:dt+'T10:00'});
  });
  // time logged straight to the Men's Group program (no note)
  w('clients','t',{id:'t',fullName:'Time Only',status:'active',sewb:true,mensgroup:true,keyWorker:'Jon Benson',created:'2026-07-01T09:00'});
  days.forEach((d,i)=>{ const dt=new Date(Date.UTC(2026,6,10)+d*864e5).toISOString().slice(0,10);
    w('timelogs','tt'+i,{id:'tt'+i,clientId:'t',worker:'Jon Benson',date:dt,minutes:60,program:'mensgroup',activity:'Group'}); });
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED});
  const st=id=>p.evaluate(id=>{ const s=clientEpisodeStats(id,'sewb'); return { c:s.totalContacts, e:s.completeEpisodes }; },id);
  const m=await st('m'), s=await st('s');
  ok('E1 five Men\'s Group sessions over 12 weeks make one completed SEWB episode — the same as five SEWB sessions', m.c===5 && m.e===1 && s.c===5 && s.e===1, JSON.stringify({m,s}));
  ok('E2 a session\'s note and its linked time count once (5 contacts, not 10)', m.c===5);
  ok('E3 sessions recorded before the change count (retrospective — worked out from the records)', m.e===1);
  const x=await st('x');
  ok('E4 SEWB and Men\'s Group sessions add up together (3 + 2 = one episode)', x.c===5 && x.e===1, JSON.stringify(x));
  const t=await st('t');
  ok('E5 time logged straight to the Men\'s Group program counts too', t.c===5 && t.e===1, JSON.stringify(t));
  const k=await p.evaluate(()=>{ const f=fundingProgramStats('sewb'); return { names:f.rows.map(r=>r.client.fullName+':'+r.completeEpisodes).sort(), total:f.totalEpisodes, kpiAll:fundingKPI(['sewb','aod','justice']).episodesAll }; });
  ok('E6 a participant with only the Men\'s Group tick still appears in the SEWB funding figures', k.names.includes('Untick Sewb:1'), JSON.stringify(k));
  ok('E7 the SEWB target counts them: 5 completed episodes (4 with Men\'s Group sessions + the SEWB-only one)', k.total===5 && k.kpiAll===5, JSON.stringify(k));
  const rep=await p.evaluate(()=>{ const h=buildSEWBProgramReport('2026-07-01','2026-12-31'); const f=buildFundingReport('sewb'); return { mg:/Men's Group \(SEWB\)/.test(h) && /Men's Group Contacts/.test(h), def:/Family Violence and Men's Group sessions count as SEWB/.test(f) }; });
  ok('E8 the SEWB Program Report shows Men\'s Group contacts (counted as SEWB) and the funding report says what counts', rep.mg && rep.def, JSON.stringify(rep));
  ok('E9 AOD and Justice are unchanged (Men\'s Group sessions don\'t count there)', await p.evaluate(()=>clientEpisodeStats('m','aod').totalContacts===0 && clientEpisodeStats('m','justice').totalContacts===0));
  await p.evaluate(()=>showPage('mensgroup')); await p.waitForTimeout(300);
  ok('E10 the Men\'s Group page says its sessions count toward SEWB episodes of care', /counts toward the participant's SEWB episodes of care/.test(await p.innerText('#content')));
  await done("MEN'S GROUP → SEWB EPISODES OF CARE");
})().catch(e=>{ console.error(e); process.exit(1); });

// QA — the Annual KPI shows a total of completed episodes of care INCLUDING partial (in-progress)
// episodes: on the Reports page widget, the Official Funding Report and the Dashboard. Synthetic people only.
const {start}=require('./harness.cjs');
const SEED=new Function('w',`
  const day=(y,m,d)=>new Date(Date.UTC(y,m,d)).toISOString().slice(0,10);
  // one completed SEWB episode this financial year (5 contacts over 12+ weeks, Jul–Oct 2026)
  w('clients','a',{id:'a',fullName:'Complete Person',status:'active',sewb:true,keyWorker:'Jon Benson',created:'2026-07-01T09:00'});
  [0,21,42,63,85].forEach((d,i)=>w('notes','a'+i,{id:'a'+i,clientId:'a',type:'sewb',worker:'Jon Benson',text:'x',created:new Date(Date.UTC(2026,6,10)+d*864e5).toISOString().slice(0,10)+'T10:00'}));
  // partial: 2 contacts 6 weeks apart → min(6/12, 2/5) = 0.4
  w('clients','b',{id:'b',fullName:'Partial Person',status:'active',sewb:true,keyWorker:'Jon Benson',created:'2026-09-01T09:00'});
  w('notes','b0',{id:'b0',clientId:'b',type:'sewb',worker:'Jon Benson',text:'x',created:'2026-09-01T10:00'});
  w('notes','b1',{id:'b1',clientId:'b',type:'sewb',worker:'Jon Benson',text:'x',created:'2026-10-13T10:00'});
  // partial in Men's Group (counts as SEWB): 3 contacts over 12 weeks → min(1, 3/5) = 0.6
  w('clients','c',{id:'c',fullName:'Group Partial',status:'active',sewb:true,mensgroup:true,keyWorker:'Jon Benson',created:'2026-07-01T09:00'});
  ['2026-08-01','2026-09-01','2026-10-24'].forEach((d,i)=>w('notes','c'+i,{id:'c'+i,clientId:'c',type:'mensgroup',worker:'Jon Benson',text:'x',created:d+'T10:00'}));
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED});
  const k=await p.evaluate(()=>{ const x=fundingKPI(['sewb','aod','justice']); return { fy:x.episodesFY, partial:x.partial, withPartial:x.withPartial, pct:x.pct, pctWP:x.pctWithPartial, target:x.target }; });
  ok('K1 the total including partial = completed this year + partial episodes (1 + 0.4 + 0.6 = 2)', k.fy===1 && k.partial===1 && k.withPartial===2 && k.pctWP===Math.round(2/k.target*100), JSON.stringify(k));
  await p.evaluate(()=>showPage('reports')); await p.waitForTimeout(400);
  const card=await p.evaluate(()=>{ const c=document.getElementById('kpi-with-partial'); return c?c.innerText:''; });
  ok('K2 the Reports page KPI shows a "Total incl. partial" card with how it adds up', /Total incl\. partial/i.test(card) && /\n2\n/.test('\n'+card+'\n') && /1 completed \+ 1 partial/.test(card) && /3% of target/.test(card), card);
  ok('K3 the bar shows completed and partial separately, with a key', await p.evaluate(()=>/Completed 1%/.test(document.body.innerText) && /Including partial 3%/.test(document.body.innerText)));
  ok('K4 the summary line gives the total including partial', /Total including partial: 2 of 70/.test(await p.evaluate(()=>document.body.innerText)));
  ok('K5 the criteria say Family Violence and Men’s Group sessions count as SEWB', /Family Violence and Men’s Group sessions count as SEWB/.test(await p.evaluate(()=>document.body.innerText)));
  const rep=await p.evaluate(()=>buildFundingReport('all'));
  ok('K6 the Official Funding Report shows the total including partial (banner and figures)', /incl\. partial 2 \(3%\)/.test(rep) && /Total incl\. Partial \(1 \+ 1\)/.test(rep));
  await p.evaluate(()=>showPage('dashboard')); await p.waitForTimeout(300);
  ok('K7 the Dashboard Episodes of Care card shows it too', /2 incl\. partial/.test(await p.evaluate(()=>document.body.innerText)));
  await done('KPI — TOTAL INCLUDING PARTIAL');
})().catch(e=>{ console.error(e); process.exit(1); });

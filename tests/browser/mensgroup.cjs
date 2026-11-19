// QA — the Men's Group page shows the group's session notes from the Session Log (notes logged as
// "Men's Group"), newest first, with filters for participant, period and a search. Only clients the
// person can see; other note types stay off this list. Synthetic people only.
const {start}=require('./harness.cjs');
const SEED=new Function('w',`
  const d=n=>{ const x=new Date(); x.setDate(x.getDate()-n); return x.toISOString().slice(0,10); };
  w('clients','a',{id:'a',fullName:'Citizen Jordan',status:'active',sewb:true,mensgroup:true,keyWorker:'Jon Benson',created:'2026-01-01T09:00'});
  w('clients','b',{id:'b',fullName:'Sample Alex',status:'active',sewb:true,mensgroup:true,keyWorker:'Jon Benson',created:'2026-01-01T09:00'});
  w('clients','h',{id:'h',fullName:'Hidden Casey',status:'active',sewb:true,mensgroup:true,keyWorker:'Sam Worker',created:'2026-01-01T09:00'});
  w('notes','m1',{id:'m1',clientId:'a',type:'mensgroup',worker:'Jon Benson',text:'Yarning circle synthetic note one',followup:'Bring fishing gear',contactType:'Group',location:'Camp site',created:d(2)+'T10:00'});
  w('notes','m2',{id:'m2',clientId:'b',type:'mensgroup',worker:'Jon Benson',text:'Synthetic note two about the cook-up',created:d(1)+'T10:00'});
  w('notes','m3',{id:'m3',clientId:'a',type:'mensgroup',worker:'Jon Benson',text:'Old synthetic note from last year',created:d(200)+'T10:00'});
  w('notes','s1',{id:'s1',clientId:'a',type:'sewb',worker:'Jon Benson',text:'A SEWB note that is not Men\\'s Group',created:d(1)+'T11:00'});
  w('notes','hx',{id:'hx',clientId:'h',type:'mensgroup',worker:'Sam Worker',text:'Note on a hidden file',created:d(1)+'T12:00'});
  w('timelogs','t1',{id:'t1',clientId:'a',worker:'Jon Benson',date:d(2),minutes:90,activity:'Group',fromNoteId:'m1',program:'mensgroup'});
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED, width:1400, height:900});
  const W=ms=>p.waitForTimeout(ms||300);
  const list=()=>p.evaluate(()=>[...document.querySelectorAll('#mg-notes-list .mg-note')].map(e=>e.dataset.id).join());
  await p.evaluate(()=>{ coiList.push({id:'coiH',clientId:'h',personEmail:currentUser.email,personName:currentUser.name,status:'managed',manage:{hideFile:true}}); showPage('mensgroup'); }); await W(500);
  ok('M1 the Men\'s Group page has a "Men\'s Group Session Notes" section under the participants', await p.evaluate(()=>!!document.getElementById('mg-notes-card') && /Men's Group Session Notes/.test(document.getElementById('mg-notes-card').innerText)));
  ok('M2 it shows the Men\'s Group notes from the Session Log, newest first (last 3 months by default)', await list()==='m2,m1', await list());
  ok('M3 notes of other types (SEWB) and notes on files hidden from this person are not shown', !/not Men's Group|hidden file/.test(await p.innerText('#mg-notes-list')));
  const card=await p.evaluate(()=>document.querySelector('#mg-notes-list .mg-note[data-id="m1"]').innerText);
  ok('M4 each note shows the client, date, worker, contact type, place, time logged, the note and the follow-up', /Citizen Jordan/.test(card) && /Jon Benson/.test(card) && /Group/.test(card) && /Camp site/.test(card) && /90 min/.test(card) && /Yarning circle synthetic note one/.test(card) && /Bring fishing gear/.test(card), card);
  await p.selectOption('#mg-nf-period','all'); await W(200);
  ok('M5 "All time" includes older notes', await list()==='m2,m1,m3', await list());
  await p.selectOption('#mg-nf-client','a'); await W(200);
  ok('M6 choosing a participant shows only their notes', await list()==='m1,m3', await list());
  ok('M7 the participant list does not offer a hidden file', !(await p.evaluate(()=>[...document.getElementById('mg-nf-client').options].some(o=>o.value==='h'))));
  await p.fill('#mg-nf-q','fishing'); await W(200);
  ok('M8 search finds notes by their words (including the follow-up)', await list()==='m1', await list());
  await p.fill('#mg-nf-q','nothing-matches-this'); await W(200);
  ok('M9 no match shows a clear empty message', await list()==='' && /match these filters/.test(await p.innerText('#mg-notes-list')));
  await p.fill('#mg-nf-q',''); await p.selectOption('#mg-nf-client',''); await W(200);
  await p.evaluate(()=>document.querySelector('#mg-notes-list .mg-note[data-id="m2"] .session-header span[onclick]').click()); await W(500);
  ok('M10 clicking the client name opens their file', await p.evaluate(()=>!!document.querySelector('#modal-container .modal') && /Sample Alex/.test(document.querySelector('#modal-container .modal').innerText)));
  await p.evaluate(()=>closeModal()); await W(200);
  await p.evaluate(()=>document.querySelector('#mg-notes-card .btn-primary').click()); await W(500);
  ok('M11 "Log Men\'s Group session" opens Log Session with Men\'s Group chosen', await p.evaluate(()=>{ const s=document.querySelector('#modal-container select option[value="mensgroup"]'); return !!s && s.selected; }));
  await p.evaluate(()=>{ document.getElementById('sm-client').value='b'; rteSetContent('sm-text','','Brand new synthetic group note'); const el=document.getElementById('sm-text'); el.value='Brand new synthetic group note'; el.dispatchEvent(new Event('input',{bubbles:true})); });
  await p.click('#modal-container .modal-footer .btn-primary'); await W(800);
  ok('M12 a session saved from there shows straight away on the Men\'s Group page', /Brand new synthetic group note/.test(await p.innerText('#mg-notes-list')), await p.innerText('#mg-notes-list').catch(()=>''));
  ok('M13 the Session Log still shows its cards with their styles', await p.evaluate(()=>{ showPage('sessions'); const c=document.querySelector('#sessions-list .session-card'); return !!c && getComputedStyle(c).borderLeftWidth==='4px'; }));
  // ---- the two are linked ----
  await p.evaluate(()=>{ showPage('sessions'); filterSessions('mensgroup'); }); await W(300);
  ok('M14 Session Log: with the Men\'s Group filter on, an "Open the Men\'s Group page" link shows (and is hidden for other filters)', await p.evaluate(()=>{ const b=document.getElementById('sf-mg-link'); const on=b && b.style.display!=='none'; filterSessions('sewb'); const off=b.style.display==='none'; filterSessions('mensgroup'); return on && off; }));
  ok('M15 Session Log: each Men\'s Group note\'s badge is a link (other types are not)', await p.evaluate(()=>{ const mg=document.querySelector('#sessions-list .session-card[data-type="mensgroup"] .mg-link'); const other=document.querySelector('#sessions-list .session-card[data-type="sewb"] .mg-link'); return !!mg && !other; }));
  await p.evaluate(()=>{ const card=[...document.querySelectorAll('#sessions-list .session-card[data-type="mensgroup"]')].find(c=>/Old synthetic note from last year/.test(c.innerText)); card.querySelector('.mg-link').click(); }); await W(400);
  ok('M16 clicking it opens the Men\'s Group page at the session notes, showing that participant\'s notes (all time)', await p.evaluate(()=>currentPage==='mensgroup' && document.getElementById('mg-nf-client').value==='a' && document.getElementById('mg-nf-period').value==='all') && await list()==='m1,m3', await list());
  await p.evaluate(()=>document.getElementById('sf-mg-link')); await p.evaluate(()=>{ showPage('sessions'); filterSessions('mensgroup'); document.getElementById('sf-mg-link').click(); }); await W(400);
  ok('M17 the "Open the Men\'s Group page" link opens it with all participants', await p.evaluate(()=>currentPage==='mensgroup' && document.getElementById('mg-nf-client').value===''));
  await p.click('#mg-to-sessionlog'); await W(400);
  ok('M18 Men\'s Group page → "Session Log (Men\'s Group)" opens the Session Log showing only Men\'s Group sessions', await p.evaluate(()=>{ const cards=[...document.querySelectorAll('#sessions-list .session-card')]; const shown=cards.filter(c=>c.style.display!=='none'); return currentPage==='sessions' && shown.length>0 && shown.every(c=>c.dataset.type==='mensgroup') && cards.some(c=>c.style.display==='none'); }));
  await p.evaluate(()=>{ showPage('mensgroup'); }); await W(300);
  const counts=await p.evaluate(()=>{ _mgNoteFilter.period='all'; _mgNoteFilter.client=''; mgNoteSet('q',''); return { mg: document.querySelectorAll('#mg-notes-list .mg-note').length, log: (()=>{ showPage('sessions'); const ids=visibleClients(clients).map(c=>c.id); return [...document.querySelectorAll('#sessions-list .session-card[data-type="mensgroup"]')].length; })() }; });
  ok('M19 the Men\'s Group page shows every Men\'s Group note in the Session Log for files this person can see (the one extra in the log is on a file hidden from them)', counts.mg===4 && counts.log===5, JSON.stringify(counts));
  await p.setViewportSize({width:390,height:800}); await p.evaluate(()=>showPage('mensgroup')); await W(400);
  ok('M20 on a phone the notes section is no wider than the rest of the page (no extra sideways scrolling)', await p.evaluate(()=>{ const r=document.getElementById('mg-notes-card').getBoundingClientRect(), t=document.querySelector('#content .card').getBoundingClientRect(); return r.left>=0 && r.right<=t.right+1; }));
  await done("MEN'S GROUP SESSION NOTES");
})().catch(e=>{ console.error(e); process.exit(1); });

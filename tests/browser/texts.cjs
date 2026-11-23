// QA — two-way texts with clients (Twilio): the 💬 Texts section of a client's file (the conversation,
// sending, live replies, marking seen), what stops a text (consent, no mobile, STOP, switched off),
// the Key Worker's Dashboard alert, unmatched texts for managers, and the Settings switch.
// The text service (functions-sms) is played by the test: it writes results and replies the way the
// Cloud Functions do. Synthetic people only.
const {start}=require('./harness.cjs');
const lib=require('../../functions-sms/lib.js');
const T='teams/worngundidj/';
const SEED=new Function('w',`
  w('clients','a',{id:'a',fullName:'Citizen Jordan',status:'active',sewb:true,phone:'0491 570 156',ifSafeContact:'Yes',keyWorker:'Jon Benson',created:'2026-09-01T09:00'});
  w('clients','b',{id:'b',fullName:'Sample Alex',status:'active',sewb:true,phone:'0491570157',ifSafeContact:'No',keyWorker:'Sam Worker',created:'2026-09-01T09:00'});
  w('clients','c',{id:'c',fullName:'Example Casey',status:'active',sewb:true,phone:'03 5561 0000',ifSafeContact:'Yes',keyWorker:'Jon Benson',created:'2026-09-01T09:00'});
  w('smsConfig','settings',{autoHandbook:true,twoWay:true});
  w('smsOutbox','h1',{kind:'handbook',clientId:'a',requestedBy:'uid-x',requestedByName:'Jon Benson',requestedAt:'2026-11-20T09:00:00.000Z',status:'sent',sentAt:'2026-11-20T09:00:05.000Z',to:'0491 ••• 156',toFull:'0491570156',message:'Hi Jordan, welcome to Worn Gundidj. Your Participant Handbook: https://x/hb'});
  w('smsInbox','SMin1',{providerId:'SMin1',from:'0491 ••• 156',fromFull:'0491570156',to:'+61400000001',body:'Thanks! Got it',numMedia:0,receivedAt:'2026-11-20T10:00:00.000Z',clientId:'a',matchedBy:'last-text',candidates:[],status:'new',optOut:''});
  w('smsInbox','SMun1',{providerId:'SMun1',from:'0491 ••• 999',fromFull:'0491570999',to:'+61400000001',body:'Hi its Alex from the group, new phone',numMedia:0,receivedAt:'2026-11-21T10:00:00.000Z',clientId:'',matchedBy:'',candidates:[],status:'new',optOut:''});
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED, width:1300, height:950});
  const W=ms=>p.waitForTimeout(ms||300);
  const cloud=path=>p.evaluate(path=>window.__cloud.read(path),T+path);
  const put=(path,id,d)=>p.evaluate(([path,id,d])=>window.__cloud.write(path,id,d),[T+path,id,d]);
  const alerts=[]; p.on('dialog',d=>alerts.push(d.message()));
  const thread=()=>p.evaluate(()=>[...document.querySelectorAll('#tx-thread .tx-msg')].map(e=>(e.classList.contains('tx-in')?'IN:':'OUT:')+e.querySelector('.tx-bubble').innerText.trim().slice(0,40)+' | '+e.querySelector('.tx-meta').innerText));

  // ---- Dashboard: the Key Worker is alerted; unmatched texts for managers ----
  await p.evaluate(()=>showPage('dashboard')); await W(400);
  ok('T1 the Key Worker (Jon) sees "New texts from clients" on the Dashboard with the reply', await p.evaluate(()=>{ const c=document.getElementById('tx-alerts'); return !!c && /New texts from clients \(1\)/.test(c.innerText) && /Citizen Jordan/.test(c.innerText) && /Thanks! Got it/.test(c.innerText); }));
  ok('T2 a manager sees "Unmatched texts" with the text from an unknown number', await p.evaluate(()=>{ const c=document.getElementById('tx-unmatched'); return !!c && /Unmatched texts \(1\)/.test(c.innerText) && /new phone/.test(c.innerText); }));
  ok('T3 the section list on the file shows the new reply', await p.evaluate(()=>{ openClientProfile('a'); return [...document.getElementById('profile-section').options].some(o=>o.value==='texts' && /Texts \(1 new\)/.test(o.text)); }));
  await p.evaluate(()=>closeModal()); await W(200);
  await p.click('#tx-alerts .btn-primary'); await W(600);
  ok('T4 "Open texts" opens the client\'s file at the Texts section', await p.evaluate(()=>document.getElementById('profile-section').value==='texts' && !!document.getElementById('tx-thread')));
  let th=await thread();
  ok('T5 the conversation shows the automatic handbook text and the reply, oldest first', th.length===2 && /^OUT:.*Participant Handbook/.test(th[0]) && /Sent to 0491 ••• 156/.test(th[0]) && /^IN:Thanks! Got it/.test(th[1]), JSON.stringify(th));
  await W(300);
  const r1=(await cloud('smsInbox')).SMin1;
  ok('T6 opening it marks the reply as seen, by name, in the cloud', r1.status==='read' && r1.readBy==='Jon Benson' && !!r1.readAt, JSON.stringify(r1));
  const box=await p.evaluate(()=>({ v:document.getElementById('tx-body').value, n:document.getElementById('tx-count').innerText }));
  ok('T7 the message box starts "Hi Jordan," (first name — names are recorded surname first) and is signed "- Jon, Worn Gundidj"', /^Hi Jordan, /.test(box.v) && /- Jon, Worn Gundidj$/.test(box.v) && /1 SMS/.test(box.n), JSON.stringify(box));
  alerts.length=0;
  await p.click('#tx-send'); await W(300);
  ok('T8 sending the untouched greeting is refused ("Write your message first")', alerts.some(m=>/Write your message first/.test(m)) && !Object.values(await cloud('smsOutbox')).some(o=>o.kind==='message'));
  await p.fill('#tx-body','x'.repeat(700)); await W(100);
  ok('T9 the counter warns when a text is too long', /too long/.test(await p.innerText('#tx-count')));
  alerts.length=0; await p.click('#tx-send'); await W(300);
  ok('T10 …and it is not sent', alerts.some(m=>/too long/.test(m)) && !Object.values(await cloud('smsOutbox')).some(o=>o.kind==='message'));
  await p.fill('#tx-body','Hi Jordan — can we move Tuesday to 2pm?\n- Jon'); await W(100);
  await p.click('#tx-send'); await W(700);
  const out=Object.entries(await cloud('smsOutbox')).find(([,o])=>o.kind==='message');
  ok('T11 the text goes to the cloud as a request: client id + words + who — never a phone number', !!out && out[1].clientId==='a' && out[1].body==='Hi Jordan - can we move Tuesday to 2pm?\n- Jon' && out[1].requestedBy==='uid-jon.benson@worngundidj.org.au' && Object.keys(out[1]).sort().join()==='body,clientId,kind,requestedAt,requestedBy,requestedByName', JSON.stringify(out));
  th=await thread();
  ok('T12 it shows straight away as "Sending…" and the box is cleared back to the greeting', /^OUT:Hi Jordan - can we move Tuesday/.test(th[2]||'') && /Sending/.test(th[2]||'') && /^Hi Jordan, /.test(await p.inputValue('#tx-body')), JSON.stringify(th));
  // the text service sends it and writes the result back
  await put('smsOutbox',out[0],Object.assign({},out[1],{status:'sent',sentAt:new Date().toISOString(),to:'0491 ••• 156',toFull:'0491570156',message:out[1].body,parts:1,cost:0.1}));
  await W(400); th=await thread();
  ok('T13 when the text service has sent it, it shows "✓ Sent"', /✓ Sent to 0491 ••• 156/.test(th[2]||''), JSON.stringify(th));
  // a reply arrives while the conversation is open
  await p.fill('#tx-body','Half-typed draft'); 
  await put('smsInbox','SMin2',{providerId:'SMin2',from:'0491 ••• 156',fromFull:'0491570156',to:'+61400000001',body:'Yes 2pm works',numMedia:0,receivedAt:new Date(Date.now()+1000).toISOString(),clientId:'a',matchedBy:'last-text',candidates:[],status:'new',optOut:''});
  await W(600); th=await thread();
  ok('T14 a reply that arrives while the conversation is open appears at once and is marked seen', /^IN:Yes 2pm works/.test(th[th.length-1]) && (await cloud('smsInbox')).SMin2.status==='read', JSON.stringify(th));
  ok('T15 …without losing what the worker was typing', await p.inputValue('#tx-body')==='Half-typed draft');
  // STOP
  await put('smsOptOut','0491570156',{mobile:'0491570156',at:new Date().toISOString(),via:'Replied STOP',clientId:'a'});
  await W(500);
  ok('T16 if the client replies STOP, the message box is replaced by the reason', await p.evaluate(()=>!document.getElementById('tx-body') && /replied STOP/.test(document.getElementById('tx-blocked').innerText)));
  await p.evaluate(()=>window.__cloud.write('teams/worngundidj/smsOptOut','0491570156',null)).catch(()=>{});
  await p.evaluate(()=>{ smsOptOut=[]; _textsRefresh(); }); await W(300);
  ok('T17 …and comes back when they reply START', await p.evaluate(()=>!!document.getElementById('tx-body')));
  // other reasons
  const reason=id=>p.evaluate(id=>{ openClientProfile(id,'texts'); const b=document.getElementById('tx-blocked'); return b?b.innerText:''; },id);
  ok('T18 no consent to texts → the reason is shown, no message box', /not said it is safe to leave texts/.test(await reason('b')));
  ok('T19 no Australian mobile (a landline) → the reason is shown', /no Australian mobile/.test(await reason('c')));
  await p.evaluate(()=>{ smsConfig=Object.assign({},smsConfig,{twoWay:false}); });
  ok('T20 two-way texts switched off → it says the System Manager turns them on', /not switched on yet.*System Manager/.test(await reason('a')));
  await p.evaluate(()=>{ smsConfig=Object.assign({},smsConfig,{twoWay:true}); closeModal(); });

  // ---- unmatched → put on a file ----
  await p.evaluate(()=>showPage('dashboard')); await W(400);
  await p.selectOption('#tx-assign-SMun1','b'); await p.click('#tx-unmatched .btn-primary'); await W(500);
  const un=(await cloud('smsInbox')).SMun1;
  ok('T21 a manager puts the unmatched text on the right file (recorded who and when) and the list empties', un.clientId==='b' && un.matchedBy==='manual' && un.assignedBy==='Jon Benson' && un.status==='new' && await p.evaluate(()=>!document.getElementById('tx-unmatched')), JSON.stringify(un));
  ok('T22 it is not on Jon\'s alerts — Sam is that client\'s Key Worker', await p.evaluate(()=>!document.getElementById('tx-alerts')));

  // ---- Settings ----
  await p.evaluate(()=>showPage('settings')); await W(400);
  ok('T23 Settings has the "Two-way texts with clients (Twilio)" switch, on', await p.evaluate(()=>{ const t=document.getElementById('sms-twoway-toggle'); return !!t && t.checked; }));
  await p.click('#sms-twoway-toggle'); await W(500);
  const cfg=(await cloud('smsConfig')).settings;
  ok('T24 turning it off saves it — and keeps the automatic handbook setting as it was', cfg.twoWay===false && cfg.autoHandbook===true && cfg.twoWayBy==='Jon Benson', JSON.stringify(cfg));
  await p.click('#sms-twoway-toggle'); await W(500);
  ok('T25 …and on again', (await cloud('smsConfig')).settings.twoWay===true);

  // ---- the CMS and the text service count and tidy texts the same way ----
  const samples=['Hi Jordan', 'Hi — “quoted” ‘x’ …', 'a'.repeat(160), 'a'.repeat(161), '{[x]}'.repeat(40), 'Emoji \u{1F600}'.repeat(12), '  trailing   \n\n\n\nlines  ', 'éè café', 'Ä'.repeat(70)];
  const page=await p.evaluate(ss=>ss.map(x=>[textNormalise(x), textParts(textNormalise(x))]), samples);
  const srv=samples.map(x=>[lib.normaliseMessage(x), lib.smsParts(lib.normaliseMessage(x))]);
  ok('T26 the message box\'s tidying and SMS count agree with the text service exactly', JSON.stringify(page)===JSON.stringify(srv), JSON.stringify({page,srv}));
  ok('T27 the limits agree too (640 characters, 4 SMS)', await p.evaluate(()=>[TEXT_MAX_CHARS,TEXT_MAX_PARTS].join())===[lib.MESSAGE_MAX_CHARS,lib.MESSAGE_MAX_PARTS].join());

  // ---- a worker ----
  await p.evaluate(()=>logout()); await W(700); await p.fill('#login-email','sam.worker@worngundidj.org.au'); await p.fill('#login-pass','x'); await p.click('#login-btn'); await W(2200);
  await p.evaluate(()=>showPage('dashboard')); await W(400);
  ok('T28 Sam (Key Worker for that client) now sees the text alert; workers do not see the unmatched list', await p.evaluate(()=>{ const c=document.getElementById('tx-alerts'); return !!c && /Sample Alex/.test(c.innerText) && /new phone/.test(c.innerText) && !document.getElementById('tx-unmatched'); }));
  ok('T29 a toast told Sam about it', await p.evaluate(()=>window.__toasts.some(t=>/New text from Alex/.test(t))), JSON.stringify(await p.evaluate(()=>window.__toasts.slice(-5))));
  // ---- on a phone ----
  await p.setViewportSize({width:390,height:800}); await p.evaluate(()=>openClientProfile('b','texts')); await W(500);
  ok('T30 on a phone the conversation fits the screen', await p.evaluate(()=>{ const r=document.getElementById('tx-thread').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1; }));
  await done('TWO-WAY TEXTS (TWILIO)');
})().catch(e=>{ console.error(e); process.exit(1); });

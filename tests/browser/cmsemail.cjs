// QA — emailing the handbook, an intake form link, a consent form link or a feedback request goes from
// the CMS's own Email (the worker's Outlook, through Microsoft — stubbed here), and the time is logged on
// the client's file once it has been sent. Outlook not connected → connect first; Outlook not usable in the
// CMS → the device's email app, and it says the time wasn't logged. Synthetic people only.
const {start}=require('./harness.cjs');
const SEED=new Function('w',`
  w('clients','a',{id:'a',fullName:'Citizen Jordan',status:'active',sewb:true,email:'jordan.citizen@example.com',phone:'0491 570 156',ifSafeContact:'Yes',dob:'1985-03-14',keyWorker:'Jon Benson',created:'2026-09-01T09:00'});
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED});
  const W=ms=>p.waitForTimeout(ms||400);
  await p.evaluate(()=>{ window.__ext=[]; window.openExternalLink=u=>{ window.__ext.push(u); }; });
  await p.route('https://graph.microsoft.com/**',async route=>{ const rq=route.request(), cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,prefer','access-control-allow-methods':'GET,POST,OPTIONS'};
    if(rq.method()==='OPTIONS') return route.fulfill({status:204,headers:cors});
    if(rq.method()==='POST'&&/sendMail/.test(rq.url())){ await p.evaluate(b=>{ (window.__sent=window.__sent||[]).push(JSON.parse(b)); },rq.postData()); return route.fulfill({status:202,headers:cors,body:''}); }
    return route.fulfill({status:200,headers:{...cors,'content-type':'application/json'},body:JSON.stringify({value:[]})}); });
  const connect=()=>p.evaluate(()=>{ outlookOrgConfig={clientId:'11111111-2222-3333-4444-555555555555'}; _saveOutlookAccount({name:'Jon Benson',username:'jon.benson@worngundidj.org.au',homeAccountId:'h'}); window._mailToken=async()=>'tok'; });
  const compose=()=>p.evaluate(()=>({ open:!!document.getElementById('mail-compose'), to:document.getElementById('mc-to')?.value, sub:document.getElementById('mc-subject')?.value, body:document.getElementById('mc-body')?.value||'', rec:document.getElementById('mc-record')?.checked, mins:document.getElementById('mc-mins')?.value, cl:document.getElementById('mc-client')?.value }));
  const counts=()=>p.evaluate(()=>({ n:notes.filter(x=>x.clientId==='a').length, t:timeLogs.filter(x=>x.clientId==='a').length, mins:timeLogs.filter(x=>x.clientId==='a').reduce((s,x)=>s+(+x.minutes||0),0), sent:(window.__sent||[]).length }));
  await connect();

  // ---- the handbook ----
  await p.evaluate(()=>openHandbookSendModal('a','profile:files')); await W();
  ok('H1 the handbook window offers "Email from the CMS"', await p.evaluate(()=>/Email from the CMS/.test(document.getElementById('hb-email')?.textContent||'')));
  await p.click('#hb-email'); await W(500);
  let c=await compose();
  ok('H2 it opens the CMS email to the client, filled in, with "record on the file" ticked and 15 minutes', c.open && c.to==='jordan.citizen@example.com' && /Participant Handbook/.test(c.sub) && /\/hb/.test(c.body) && c.rec===true && c.mins==='15' && c.cl==='a', JSON.stringify(c));
  ok('H3 nothing opens outside the CMS (no Outlook app / mailto)', await p.evaluate(()=>window.__ext.length===0));
  let before=await counts(); const hb0=await p.evaluate(()=>(clients.find(x=>x.id==='a').handbookSent||[]).length);
  await p.click('#mc-send'); await W(800);
  let after=await counts();
  ok('H4 sent from the CMS — the email is on the file and 15 minutes are logged (one note, one time entry)', after.sent===before.sent+1 && after.n===before.n+1 && after.t===before.t+1 && after.mins===before.mins+15, JSON.stringify({before,after}));
  ok('H5 the handbook is recorded as given (by email)', await p.evaluate(h=>{ const s=clients.find(x=>x.id==='a').handbookSent||[]; return s.length===h+1 && s[s.length-1].channel==='email'; },hb0));
  ok('H6 the email that went has the handbook link as a clickable link', await p.evaluate(()=>/<a href="[^"]*\/hb"/.test(window.__sent[window.__sent.length-1].message.body.content)));

  // ---- the intake form link ----
  await p.evaluate(()=>openIntakeLinkModal('a')); await W(); await p.click('#if-create'); await W(900);
  await p.click('#if-email'); await W(500);
  c=await compose();
  ok('I1 the intake link "Email from the CMS" opens the CMS email with the link, time ticked', c.open && /intake form/i.test(c.sub) && /\/i#/.test(c.body) && c.rec===true && c.mins==='15', JSON.stringify(c));
  before=await counts(); await p.click('#mc-send'); await W(800); after=await counts();
  ok('I2 once sent: the link\'s send history says so and the time is logged', after.t===before.t+1 && after.mins===before.mins+15 && await p.evaluate(()=>intakeForms.some(f=>f.clientId==='a' && (f.sends||[]).some(s=>/email from the CMS/.test(s.channel)))), JSON.stringify({before,after}));
  // cancelling the email window logs nothing
  await p.evaluate(()=>openIntakeLinkModal('a')); await W(); await p.click('#if-email'); await W(500);
  before=await counts(); await p.evaluate(()=>closeModal()); await W(300); after=await counts();
  ok('I3 closing the email window without sending logs nothing', JSON.stringify(before)===JSON.stringify(after), JSON.stringify({before,after}));

  // ---- the feedback request ----
  await p.evaluate(()=>openFeedbackSendModal('a','other')); await W();
  ok('F1 the feedback request offers "Email from the CMS"', /Email from the CMS/.test(await p.evaluate(()=>document.getElementById('qf-email')?.textContent||'')));
  await p.click('#qf-email'); await W(500);
  c=await compose(); before=await counts(); const fr0=await p.evaluate(()=>(clients.find(x=>x.id==='a').feedbackRequests||[]).length);
  await p.click('#mc-send'); await W(800); after=await counts();
  ok('F2 sent from the CMS with the time logged, and the request recorded', c.rec===true && after.t===before.t+1 && await p.evaluate(n=>(clients.find(x=>x.id==='a').feedbackRequests||[]).length===n+1,fr0), JSON.stringify({c,before,after}));

  // ---- Outlook not connected: connect first ----
  await p.evaluate(()=>{ DB.save('msalAccount',''); window.outlookConnect=async()=>{ window.__connected=(window.__connected||0)+1; _saveOutlookAccount({name:'Jon Benson',username:'jon.benson@worngundidj.org.au',homeAccountId:'h'}); }; });
  await p.evaluate(()=>openHandbookSendModal('a','profile:files')); await W(); await p.click('#hb-email'); await W(600);
  ok('N1 if Outlook isn\'t connected yet, it connects first (sign-in window from the click), then opens the CMS email', await p.evaluate(()=>window.__connected===1 && !!document.getElementById('mail-compose') && window.__ext.length===0));
  await p.evaluate(()=>closeModal());
  // ---- Outlook can't be used in the CMS: the device's email app, and it says the time wasn't logged ----
  await p.evaluate(()=>{ outlookOrgConfig={clientId:''}; window.__toasts.length=0; }); 
  const blk=await p.evaluate(()=>mailBlocker());
  await p.evaluate(()=>openHandbookSendModal('a','profile:files')); await W(); before=await counts(); await p.click('#hb-email'); await W(500); after=await counts();
  ok('N2 if Outlook isn\'t set up in the CMS, it opens the device\'s email app instead and says the time wasn\'t logged', blk==='setup' && await p.evaluate(()=>window.__ext.some(u=>/^mailto:jordan\.citizen%40example\.com\?subject=Your%20Worn%20Gundidj%20Participant%20Handbook/.test(u)) && window.__toasts.some(t=>/time wasn.t logged/.test(t))) && after.t===before.t, JSON.stringify(await p.evaluate(()=>({ext:window.__ext,toasts:window.__toasts}))));
  await done('EMAIL FROM THE CMS — WITH THE TIME LOGGED');
})().catch(e=>{ console.error(e); process.exit(1); });

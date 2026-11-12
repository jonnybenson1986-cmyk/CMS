// QA — Email: the signed-in worker's own Outlook mailbox, read and sent through Microsoft Graph.
// Microsoft is replaced by a stub; synthetic people and messages only.
const {start}=require('./harness.cjs');
const SEED=new Function('w',`
  w('clients','a',{id:'a',fullName:'Jordan Citizen',status:'active',sewb:true,email:'jordan.citizen@example.com',dob:'1985-03-14',created:'2026-09-01T09:00'});
  w('clients','b',{id:'b',fullName:'Alex Sample',status:'active',sewb:true,created:'2026-01-01T09:00'});
  w('clients','c',{id:'c',fullName:'Casey Example',status:'active',sewb:true,aod:true,email:'casey.example@example.com',ifSafeContact:'Yes',created:'2026-01-01T09:00'});
  w('clients','d',{id:'d',fullName:'Drew Noprogram',status:'active',homeOwnership:true,email:'drew.noprogram@example.com',ifSafeContact:'Yes',created:'2026-01-01T09:00'});
`);
const ME='jon.benson@worngundidj.org.au';
const MSGS=[
  {id:'AAA=1',subject:'Quarterly <b>report</b> due',from:{emailAddress:{name:'Pat <img src=x onerror=window.__xss=1>',address:'pat@example.org'}},toRecipients:[{emailAddress:{name:'Jon Benson',address:ME}}],receivedDateTime:'2026-11-10T22:30:00Z',isRead:false,bodyPreview:'Please send the figures',hasAttachments:true},
  {id:'AAA=2',subject:'Appointment time',from:{emailAddress:{name:'Jordan Citizen',address:'Jordan.Citizen@example.com'}},toRecipients:[{emailAddress:{address:ME}},{emailAddress:{address:'sam.worker@worngundidj.org.au'}}],receivedDateTime:'2026-11-10T01:00:00Z',isRead:true,bodyPreview:'Can we move to Thursday?',hasAttachments:false},
  {id:'AAA=3',subject:'Newsletter',from:{emailAddress:{address:'news@example.net'}},toRecipients:[{emailAddress:{address:ME}}],receivedDateTime:'2026-11-09T01:00:00Z',isRead:true,bodyPreview:'',hasAttachments:false},
];
const BODY={'AAA=1':{body:{contentType:'text',content:'Hi Jon,\n<img src=x onerror=window.__xss=1>\nPlease send the figures.'},webLink:'https://outlook.office365.com/owa/?ItemID=AAA1',ccRecipients:[],hasAttachments:true},
            'AAA=2':{body:{contentType:'text',content:'Can we move to Thursday?'},webLink:'javascript:alert(1)',ccRecipients:[{emailAddress:{address:'cc@example.com'}}]}};
async function stubGraph(p, state){
  state.calls=[]; state.sent=[];
  await p.route('https://graph.microsoft.com/**', async route=>{
    const rq=route.request(), u=new URL(rq.url()), cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,prefer','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'};
    if(rq.method()==='OPTIONS') return route.fulfill({status:204,headers:cors});
    const path=decodeURIComponent(u.pathname.replace('/v1.0','')), q=decodeURIComponent(u.search);
    state.calls.push({method:rq.method(),path,q,prefer:rq.headers()['prefer']||''});
    const json=(o,s=200)=>route.fulfill({status:s,headers:{...cors,'content-type':'application/json'},body:JSON.stringify(o)});
    if(state.fail) return json({error:{message:state.fail.message||'denied'}},state.fail.status);
    if(rq.method()==='POST'&&path==='/me/sendMail'){ state.sent.push(JSON.parse(rq.postData())); return route.fulfill({status:202,headers:cors,body:''}); }
    if(/\/me\/mailFolders\/inbox$/.test(path)) return json({displayName:'Inbox'});
    if(/\/me\/mailFolders\/inbox\/messages$/.test(path)) return json({value:state.inbox||MSGS});
    if(/\/me\/mailFolders\/sentitems\/messages$/.test(path)) return json({value:[{id:'S1',subject:'Sent one',from:{emailAddress:{address:ME}},toRecipients:[{emailAddress:{name:'Jordan Citizen',address:'jordan.citizen@example.com'}}],sentDateTime:'2026-11-10T03:00:00Z',isRead:true,bodyPreview:'hello',hasAttachments:false}]});
    const m=path.match(/\/me\/messages\/(.+)$/); if(m&&BODY[m[1]]) return json({...MSGS.find(x=>x.id===m[1]),...BODY[m[1]]});
    return json({error:{message:'not stubbed: '+path}},404);
  });
}
const connect=p=>p.evaluate(ME=>{ outlookOrgConfig={clientId:'11111111-2222-3333-4444-555555555555',tenant:''}; _saveOutlookAccount({name:'Jon Benson',username:ME,homeAccountId:'h'}); window._mailToken=async()=> 'tok'; },ME);
(async()=>{
  const st={};
  const {p,ok,done}=await start({seed:SEED});
  await stubGraph(p,st); const T=ms=>p.waitForTimeout(ms||350);
  const toasts=()=>p.evaluate(()=>window.__toasts.join(' | '));
  ok('E1 the sidebar has an Email item', await p.evaluate(()=>[...document.querySelectorAll('#sidebar .nav-item')].some(n=>/Email/.test(n.textContent))));

  // not set up / not connected
  await p.evaluate(()=>{ outlookOrgConfig={}; DB.save('msalClientId',''); showPage('email'); }); await T(150);
  ok('E2 with no Azure set-up, the page says so (and makes no Microsoft calls)', await p.evaluate(()=>/hasn't been set up/.test(document.getElementById('content').innerText)) && st.calls.length===0);
  await p.evaluate(()=>{ outlookOrgConfig={clientId:'11111111-2222-3333-4444-555555555555'}; showPage('email'); }); await T(150);
  ok('E3 set up but not connected → "Connect to Outlook"', await p.evaluate(()=>/Connect to Outlook/.test(document.getElementById('content').innerText)) && st.calls.length===0);
  await p.evaluate(ME=>{ _saveOutlookAccount({name:'Someone Else',username:'someone.else@worngundidj.org.au',homeAccountId:'x'}); showPage('email'); },ME); await T(150);
  ok('E4 connected as somebody else → blocked, nothing fetched', await p.evaluate(()=>/connected as someone\.else@worngundidj\.org\.au/.test(document.getElementById('content').innerText) && !document.getElementById('mail-root')) && st.calls.length===0);

  // connected
  await connect(p); await p.evaluate(()=>showPage('email')); await T(700);
  const l=await p.evaluate(()=>({rows:[...document.querySelectorAll('.mail-row')].map(r=>({u:r.classList.contains('unread'),t:r.innerText})), xss:!!window.__xss, img:!!document.querySelector('#mail-list img, #mail-pane img')}));
  ok('E5 the inbox lists the 3 messages, newest first, the unread one in bold', l.rows.length===3 && l.rows[0].u && !l.rows[1].u && /Quarterly/.test(l.rows[0].t) && /Newsletter/.test(l.rows[2].t), JSON.stringify(l.rows.map(r=>r.t.slice(0,30))));
  ok('E6 senders and subjects are shown as text — nothing in an email runs', !l.xss && !l.img && /<b>report<\/b>/.test(l.rows[0].t));
  const c0=st.calls[0];
  ok('E7 it asks Microsoft for the inbox, 30 newest, and reads only (no changes made)', /mailFolders\/inbox\/messages/.test(c0.path) && /\$top=30/.test(c0.q) && /\$orderby=receivedDateTime desc/.test(c0.q) && st.calls.every(c=>c.method==='GET'));
  await p.click('.mail-row[data-i="0"]'); await T(400);
  const o=await p.evaluate(()=>({txt:document.getElementById('mail-pane').innerText, link:document.querySelector('#mail-pane a[href^="http"]')?.href||'', rel:document.querySelector('#mail-pane a[href^="http"]')?.rel||'', img:!!document.querySelector('#mail-pane img'), xss:!!window.__xss, pre:document.querySelector('.mail-body')?.textContent||''}));
  ok('E8 opening shows the message as plain text, with an attachments notice', /Please send the figures/.test(o.pre) && /<img src=x onerror/.test(o.pre) && !o.img && !o.xss && /attachments/.test(o.txt));
  ok('E9 the body is requested as text, and the Outlook link is only offered for a Microsoft address', /outlook\.body-content-type="text"/.test(st.calls.at(-1).prefer) && o.link==='https://outlook.office365.com/owa/?ItemID=AAA1' && /noopener/.test(o.rel));
  await p.click('.mail-row[data-i="1"]'); await T(400);
  const o2=await p.evaluate(()=>({link:!!document.querySelector('#mail-pane a[href^="javascript"]')||[...document.querySelectorAll('#mail-pane a')].some(a=>/javascript/i.test(a.getAttribute('href')||'')), btns:[...document.querySelectorAll('#mail-pane .btn')].map(b=>b.innerText.trim())}));
  ok('E10 a non-Microsoft link in the message is never made clickable', !o2.link && !o2.btns.some(t=>/Open in Outlook/.test(t)), o2.btns.join('|'));
  ok('E11 a message from a client offers "Record on …\'s file"; Reply all appears when there are several recipients', o2.btns.some(t=>/Record on Jordan C\.'s file/.test(t)) && o2.btns.includes('↩️ Reply all'), o2.btns.join('|'));

  // reply
  await p.click('#mail-pane .btn-primary'); await T(250);
  const r=await p.evaluate(()=>({to:document.getElementById('mc-to').value, sub:document.getElementById('mc-subject').value, body:document.getElementById('mc-body').value, cl:document.getElementById('mc-client').value, rec:document.getElementById('mc-record').checked}));
  ok('E12 Reply fills in the sender, "RE: …", the quoted message, and the client', r.to==='Jordan.Citizen@example.com' && r.sub==='RE: Appointment time' && /^\n\n— On .* wrote:\n> Can we move to Thursday\?/.test(r.body) && r.cl==='a' && r.rec, JSON.stringify(r));
  // validation
  await p.fill('#mc-to','not an address, jordan@example.com'); await p.click('#mc-send'); await T(100);
  let e1=await p.textContent('#mc-error'); ok('E13 a bad address is refused, and named', /don't look like email addresses: not an address/.test(e1) && st.sent.length===0, e1);
  await p.fill('#mc-to','jordan.citizen@example.com'); await p.fill('#mc-subject',''); await p.click('#mc-send'); await T(100);
  e1=await p.textContent('#mc-error'); ok('E14 no subject is refused', /subject/i.test(e1) && st.sent.length===0);
  await p.fill('#mc-subject','RE: Appointment time'); await p.fill('#mc-body','  '); await p.click('#mc-send'); await T(100);
  ok('E15 an empty message is refused', /empty/i.test(await p.textContent('#mc-error')) && st.sent.length===0);
  await p.fill('#mc-to',Array.from({length:26},(_,i)=>`p${i}@example.com`).join(', ')); await p.fill('#mc-body','x'); await p.click('#mc-send'); await T(100);
  ok('E16 more than 25 recipients is refused', /more than 25/.test(await p.textContent('#mc-error')) && st.sent.length===0);
  // send
  const sewbBefore=await p.evaluate(()=>clientEpisodeStats('a','sewb').totalContacts);
  const tf=await p.evaluate(()=>({prog:[...document.querySelectorAll('#mc-program option')].map(o=>o.value), sel:document.getElementById('mc-program')?.value, mins:document.getElementById('mc-mins')?.value}));
  ok('E17a recording is ticked for a client email, and offers the client\'s program with 15 minutes filled in', tf.prog.join()==='sewb,general' && tf.sel==='sewb' && tf.mins==='15', JSON.stringify(tf));
  await p.fill('#mc-to','Jordan Citizen <jordan.citizen@example.com>; JORDAN.citizen@example.com'); await p.fill('#mc-cc','boss@example.org'); await p.fill('#mc-body','Thursday works. See you then.');
  await p.fill('#mc-mins','0'); await p.click('#mc-send'); await T(100);
  ok('E17b no minutes → not sent, asks for the minutes', /minutes of email contact/.test(await p.textContent('#mc-error')) && st.sent.length===0);
  await p.fill('#mc-mins','15'); await p.click('#mc-send'); await T(600);
  const sent=st.sent[0];
  ok('E17 Send posts one email: recipients tidied and de-duplicated, saved to Sent Items, plain text', st.sent.length===1 && sent.message.toRecipients.length===1 && sent.message.toRecipients[0].emailAddress.address==='jordan.citizen@example.com' && sent.message.ccRecipients[0].emailAddress.address==='boss@example.org' && sent.saveToSentItems===true && sent.message.body.contentType==='text' && sent.message.subject==='RE: Appointment time', JSON.stringify(sent));
  ok('E18 the form closes and confirms: sent, recorded, 15 min logged to SEWB', await p.evaluate(()=>!document.querySelector('#modal-container .modal-overlay')) && /Email sent\. Recorded on Jordan Citizen's file — 15 min logged to SEWB/.test(await toasts()), await toasts());
  const n=await p.evaluate(()=>notes.filter(x=>x.clientId==='a'&&x.contactType==='Email'));
  ok('E19 it is on the client\'s file as an "Email" note under SEWB', n.length===1 && n[0].type==='sewb' && /Thursday works/.test(n[0].text) && /Subject: RE: Appointment time/.test(n[0].text));
  const tl=await p.evaluate(()=>timeLogs.filter(t=>t.clientId==='a').map(t=>({m:t.minutes,p:t.program,prog:timeLogProgram(t),type:t.type,act:t.activity,src:t.source,date:t.date,from:t.fromNoteId,w:t.worker,notes:t.notes,today:today()})));
  ok('E20 15 minutes of email contact is logged for the client, against SEWB, linked to the note', tl.length===1 && tl[0].m===15 && tl[0].p==='sewb' && tl[0].prog==='sewb' && tl[0].type==='Email' && tl[0].act==='Email' && tl[0].date===tl[0].today && tl[0].from===n[0].id && tl[0].w==='Jon Benson' && /^Email: RE: Appointment time/.test(tl[0].notes), JSON.stringify(tl));
  ok('E20b it counts as ONE SEWB contact (not two for the note and its time)', await p.evaluate(()=>clientEpisodeStats('a','sewb').totalContacts)===sewbBefore+1);
  const au=await p.evaluate(()=>auditLog.filter(a=>a.action==='Email sent'));
  ok('E21 the audit log says an email was sent — with the count and the client, not the address or the words', au.length===1 && au[0].detail==='2 recipients' && au[0].clientId==='a' && !/@|Thursday|Appointment/.test(JSON.stringify(au[0])), JSON.stringify(au[0]));
  ok('E21b …and that it was recorded on the file with the time and program', await p.evaluate(()=>auditLog.some(a=>a.action==='Email recorded on client file'&&a.detail==='15 min · SEWB'&&a.clientId==='a')));
  // record a received email
  await p.evaluate(()=>mailOpen(1)); await T(400);
  await p.click('#mail-pane .btn:has-text("Record on")'); await T(250);
  const mf=await p.evaluate(()=>({open:!!document.getElementById('mail-file'), prog:[...document.querySelectorAll('#mf-program option')].map(o=>o.textContent), mins:document.getElementById('mf-mins')?.value, btn:document.querySelector('#modal-container .modal-footer .btn-primary')?.textContent, txt:document.getElementById('mail-file')?.innerText||''}));
  ok('E22 "Record on file" asks which program and shows 15 minutes before saving', mf.open && mf.prog.join('|')==='SEWB|General — no program' && mf.mins==='15' && /Record and log time/.test(mf.btn) && /Appointment time/.test(mf.txt), JSON.stringify(mf));
  await p.fill('#mf-mins',''); await p.click('#modal-container .modal-footer .btn-primary'); await T(150);
  ok('E22a blank minutes → stays open and asks', await p.evaluate(()=>!!document.getElementById('mail-file') && /Enter the minutes/.test(document.getElementById('mf-error').textContent) && notes.filter(x=>x.clientId==='a'&&x.contactType==='Email').length===1));
  await p.fill('#mf-mins','15'); await p.click('#modal-container .modal-footer .btn-primary'); await T(400);
  const r2=await p.evaluate(()=>{ const ns=notes.filter(x=>x.clientId==='a'&&x.contactType==='Email'), ts=timeLogs.filter(t=>t.clientId==='a'); return { n:ns.length, last:ns[ns.length-1], t:ts.length, total:ts.reduce((a,t)=>a+t.minutes,0), linked:ts[ts.length-1].fromNoteId===ns[ns.length-1].id, closed:!document.querySelector('#modal-container .modal-overlay') }; });
  ok('E22b saving adds the note (received from the client) and another 15 minutes — 30 in total', r2.closed && r2.n===2 && /received from Jordan Citizen/.test(r2.last.text) && r2.last.type==='sewb' && r2.last.emailId==='AAA=2' && r2.t===2 && r2.total===30 && r2.linked && /Recorded on Jordan Citizen's file — 15 min logged to SEWB/.test(await toasts()), JSON.stringify({n:r2.n,t:r2.t,total:r2.total}));
  ok('E22c the same email cannot be recorded (and timed) twice: the button becomes "On …\'s file"', await p.evaluate(()=>{ const had=!!document.getElementById('mail-filed') && ![...document.querySelectorAll('#mail-pane .btn')].some(b=>/Record on/.test(b.textContent)); mailFileToClient('a'); return had && !document.getElementById('mail-file') && timeLogs.filter(t=>t.clientId==='a').length===2; }) && /already on Jordan Citizen's file/.test(await toasts()));
  // a client in two programs: the worker chooses; time goes only to that program
  const before=await p.evaluate(()=>({aod:clientEpisodeStats('c','aod').totalContacts,sewb:clientEpisodeStats('c','sewb').totalContacts}));
  await p.evaluate(()=>emailClient('c')); await T(250);
  ok('E22d a client in SEWB and AOD: both are offered', await p.evaluate(()=>[...document.querySelectorAll('#mc-program option')].map(o=>o.value).join()==='sewb,aod,general'));
  await p.selectOption('#mc-program','aod'); await p.fill('#mc-mins','20'); await p.fill('#mc-subject','Your appointment'); await p.fill('#mc-body','See you Friday.');
  await p.selectOption('#mc-client','c'); await T(100);
  ok('E22e what was chosen stays put while the form is open', await p.evaluate(()=>document.getElementById('mc-program').value==='aod' && document.getElementById('mc-mins').value==='20'));
  await p.click('#mc-send'); await T(600);
  const rc=await p.evaluate(()=>({t:timeLogs.filter(t=>t.clientId==='c').map(t=>[t.minutes,t.program]), n:notes.filter(x=>x.clientId==='c').map(x=>x.type), aod:clientEpisodeStats('c','aod').totalContacts, sewb:clientEpisodeStats('c','sewb').totalContacts}));
  ok('E22f 20 minutes go to AOD — one AOD contact, SEWB unchanged', rc.t.length===1 && rc.t[0][0]===20 && rc.t[0][1]==='aod' && rc.n.join()==='aod' && rc.aod===before.aod+1 && rc.sewb===before.sewb, JSON.stringify({rc,before}));
  // no time-taking program → General; and unticking records nothing (clients with no program at all are put under SEWB by the CMS)
  await p.evaluate(()=>emailClient('d')); await T(250);
  ok('E22g a client only in Home Ownership (no program that takes time): time is logged as General', await p.evaluate(()=>[...document.querySelectorAll('#mc-program option')].map(o=>o.value).join()==='general'), await p.evaluate(()=>JSON.stringify({o:[...document.querySelectorAll('#mc-program option')].map(o=>o.value), open:!!document.getElementById('mail-compose'), cl:document.getElementById('mc-client')?.value, d:clients.find(x=>x.id==='d')})));
  await p.fill('#mc-subject','Hello'); await p.fill('#mc-body','Hi Drew.'); await p.click('#mc-send'); await T(600);
  ok('E22h …with no program on the time entry', await p.evaluate(()=>{ const t=timeLogs.filter(t=>t.clientId==='d'); return t.length===1 && t[0].minutes===15 && !t[0].program && notes.filter(x=>x.clientId==='d')[0].type==='general'; }));
  await p.evaluate(()=>emailClient('d')); await T(250);
  await p.uncheck('#mc-record'); await T(100);
  ok('E22i unticking "record" hides the time boxes', await p.evaluate(()=>!document.getElementById('mc-mins') && !document.getElementById('mc-program')));
  await p.fill('#mc-subject','Hello again'); await p.fill('#mc-body','Hi.'); await p.click('#mc-send'); await T(600);
  ok('E22j …and the email is sent with nothing added to the file and no time logged', st.sent.length===4 && await p.evaluate(()=>timeLogs.filter(t=>t.clientId==='d').length===1 && notes.filter(x=>x.clientId==='d').length===1));

  // folders and search
  await p.click('[data-mail-folder="sentitems"]'); await T(500);
  ok('E23 the Sent folder lists what was sent, by recipient', await p.evaluate(()=>/Jordan Citizen/.test(document.querySelector('.mail-row')?.innerText||'') && /Sent one/.test(document.querySelector('.mail-row').innerText)) && /mailFolders\/sentitems/.test(st.calls.at(-1).path));
  await p.click('[data-mail-folder="inbox"]'); await T(400);
  await p.fill('#mail-q','figures "quoted"'); await p.click('.mail-bar .btn-outline:has-text("Search")'); await T(500);
  ok('E24 search is passed to Microsoft safely (quotes stripped, no ordering)', /\$search="figures +quoted"/.test(st.calls.at(-1).q.replace(/%22/g,'"')) && !/orderby/.test(st.calls.at(-1).q), st.calls.at(-1).q);

  // from the client file
  await p.evaluate(()=>{ _mail.q=''; openClientProfile('a'); }); await T(300);
  ok('E25 the client file\'s Actions menu has "Email client" (only when there is an address)', await p.evaluate(()=>!!document.getElementById('pf-email')));
  await p.evaluate(()=>emailClient('a')); await T(250);
  ok('E26 …which opens a new email to that client, linked to them', await p.evaluate(()=>document.getElementById('mc-to')?.value==='jordan.citizen@example.com' && document.getElementById('mc-client')?.value==='a'));
  await p.evaluate(()=>closeModal()); await p.evaluate(()=>openClientProfile('b')); await T(300);
  ok('E27 no address on file → no "Email client" action', await p.evaluate(()=>!document.getElementById('pf-email')));
  await p.evaluate(()=>closeModal());

  // privacy
  const ls=await p.evaluate(()=>Object.keys(localStorage).map(k=>localStorage.getItem(k)).join('\n'));
  ok('E28 nothing from the mailbox is kept in the browser\'s storage', !/Quarterly|Please send the figures|Newsletter|pat@example\.org|Sent one/.test(ls));
  await p.evaluate(()=>showPage('email')); await T(500);
  await p.evaluate(()=>logout('idle')); await T(500);
  ok('E29 signing out drops the mailbox from memory', await p.evaluate(()=>_mail.list===null && _mail.open===null));

  // permission problems
  await p.reload(); await T(900);
  await p.fill('#login-email',ME); await p.fill('#login-pass','x'); await p.click('#login-btn'); await T(1600);
  await connect(p); st.fail={status:403,message:'Access is denied'};
  await p.evaluate(()=>showPage('email')); await T(600);
  ok('E30 refused by Microsoft → plain words for the administrator (Mail.Read / Mail.Send)', await p.evaluate(()=>/Mail\.Read and Mail\.Send/.test(document.getElementById('mail-error')?.innerText||'')));
  st.fail=null; await p.evaluate(()=>{ window._mailToken=async(silent)=>{ if(silent) return null; return null; }; mailReset(); showPage('email'); }); await T(500);
  ok('E31 first time (permission not yet given) → an "Allow email access" button, no window opened by itself', await p.evaluate(()=>!!document.querySelector('#mail-consent .btn') && /Allow email access/.test(document.getElementById('mail-consent').innerText)));
  await p.evaluate(()=>{ window._mailToken=async()=> 'tok'; }); await p.click('#mail-consent .btn'); await T(700);
  ok('E32 pressing it, then the inbox loads', await p.evaluate(()=>document.querySelectorAll('.mail-row').length===3 && !document.getElementById('mail-consent')));
  ok('E33 every page and the client-file sections still open', (await p.evaluate(()=>{ const out=[]; for (const pg of 'dashboard clients sessions calendar email resources reports settings'.split(' ')) { try{ showPage(pg); }catch(e){ out.push(pg+': '+e.message); } } return out; })).length===0);
  await done('EMAIL');
  process.exit(0);
})();

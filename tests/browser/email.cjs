// QA — Email: the signed-in worker's own Outlook mailbox, read and sent through Microsoft Graph.
// Microsoft is replaced by a stub; synthetic people and messages only.
const {start}=require('./harness.cjs');
const SEED=new Function('w',`
  w('clients','a',{id:'a',fullName:'Jordan Citizen',status:'active',sewb:true,email:'jordan.citizen@example.com',dob:'1985-03-14',created:'2026-09-01T09:00'});
  w('clients','b',{id:'b',fullName:'Alex Sample',status:'active',sewb:true,created:'2026-01-01T09:00'});
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
  const sewbBefore=await p.evaluate(()=>JSON.stringify(clientEpisodeStats('a','sewb')));
  await p.fill('#mc-to','Jordan Citizen <jordan.citizen@example.com>; JORDAN.citizen@example.com'); await p.fill('#mc-cc','boss@example.org'); await p.fill('#mc-body','Thursday works. See you then.'); await p.click('#mc-send'); await T(600);
  const sent=st.sent[0];
  ok('E17 Send posts one email: recipients tidied and de-duplicated, saved to Sent Items, plain text', st.sent.length===1 && sent.message.toRecipients.length===1 && sent.message.toRecipients[0].emailAddress.address==='jordan.citizen@example.com' && sent.message.ccRecipients[0].emailAddress.address==='boss@example.org' && sent.saveToSentItems===true && sent.message.body.contentType==='text' && sent.message.subject==='RE: Appointment time', JSON.stringify(sent));
  ok('E18 the form closes with a confirmation', await p.evaluate(()=>!document.querySelector('#modal-container .modal-overlay')) && /Email sent and recorded on Jordan Citizen's file/.test(await toasts()));
  const n=await p.evaluate(()=>notes.filter(x=>x.clientId==='a'&&x.contactType==='Email'));
  ok('E19 it was recorded on the client\'s file as a general "Email" note', n.length===1 && n[0].type==='general' && /Thursday works/.test(n[0].text) && /Subject: RE: Appointment time/.test(n[0].text));
  ok('E20 an email note does not count as a program contact', await p.evaluate(()=>JSON.stringify(clientEpisodeStats('a','sewb')))===sewbBefore);
  const au=await p.evaluate(()=>auditLog.filter(a=>a.action==='Email sent'));
  ok('E21 the audit log says an email was sent — with the count and the client, not the address or the words', au.length===1 && au[0].detail==='2 recipients' && au[0].clientId==='a' && !/@|Thursday|Appointment/.test(JSON.stringify(au[0])), JSON.stringify(au[0]));
  // record received
  await p.evaluate(()=>mailOpen(1)); await T(400);
  await p.evaluate(()=>mailFileToClient('a')); await T(100);
  ok('E22 "Record on file" saves the received email as a note', await p.evaluate(()=>notes.filter(x=>x.clientId==='a'&&x.contactType==='Email').length===2 && /received from Jordan Citizen/.test(notes.filter(x=>x.contactType==='Email').pop().text)));

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

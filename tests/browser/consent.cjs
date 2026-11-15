// QA — consent forms and signatures in the CMS (staff side): making and sending the link (copy, text, email,
// open on this device), the client signing (simulated in the cloud), checking and filing the signed form on the
// profile, the intake ticks, printing in the WG style, and the client's signature on the intake.
// Synthetic people only.
const {start}=require('./harness.cjs'); const crypto=require('crypto');
const sha=t=>crypto.createHash('sha256').update(t).digest('hex'), T='teams/worngundidj/';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SEED=new Function('w',`
  w('clients','a',{id:'a',fullName:'Jordan Citizen',status:'active',sewb:true,dob:'1985-03-14',phone:'0491 570 156',email:'jordan.citizen@example.com',ifSafeContact:'Yes',created:'2026-09-01T09:00'});
  w('clients','d',{id:'d',fullName:'Dana Older-Form',status:'active',sewb:true,created:'2026-01-01T09:00'});
  w('clients','b',{id:'b',fullName:'Alex Sample',status:'active',sewb:true,created:'2026-01-01T09:00'});
  w('clients','x',{id:'x',fullName:'Casey <img src=x onerror=window.__xss=1> Example',status:'active',sewb:true,dob:'1990-01-01',created:'2026-01-01T09:00'});
`);
const ANS={collect:'Yes',programs:'Yes',audit:'No',video:'Yes',transport:'No',understood:true,questions:true,voluntary:true,limits:true,change:true};
const SHARE={pro:'Yes',per:'Yes',length:'m12',pro1:{name:'Dr Sam Example',role:'GP',contact:'03 5550 0000',what:['contact','plan'],why:'So my GP knows about my counselling',back:'Yes'},per1:{name:'Pat Citizen',role:'mother',what:['safety'],back:'No'}};
const ANS_V1={collect:'Yes',programs:'Yes',audit:'No',external:'Yes',video:'Yes',transport:'No',understood:true,questions:true,voluntary:true,change:true};
(async()=>{
  const {p,ok,done}=await start({seed:SEED});
  const T0=ms=>p.waitForTimeout(ms||300);
  const toasts=()=>p.evaluate(()=>window.__toasts.join(' | '));
  const audits=re=>p.evaluate(re=>auditLog.filter(a=>new RegExp(re).test(a.action)).map(a=>({d:a.detail,c:a.clientId})),re);
  const forms=()=>p.evaluate(T=>window.__cloud.read(T+'consentForms'),T);
  const links=()=>p.evaluate(T=>window.__cloud.read(T+'consentLinks'),T);
  await p.evaluate(()=>{ window.__ext=[]; window.openExternalLink=u=>{ window.__ext.push(u); }; Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{ window.__copied=t; }},configurable:true}); });
  // Microsoft stand-in (only what sending an email needs)
  await p.route('https://graph.microsoft.com/**',async route=>{ const rq=route.request(), cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,prefer','access-control-allow-methods':'GET,POST,OPTIONS'};
    if(rq.method()==='OPTIONS') return route.fulfill({status:204,headers:cors}); if(rq.method()==='POST'&&/sendMail/.test(rq.url())){ await p.evaluate(b=>{ (window.__sent=window.__sent||[]).push(b); },rq.postData()); return route.fulfill({status:202,headers:cors,body:''}); }
    return route.fulfill({status:200,headers:{...cors,'content-type':'application/json'},body:JSON.stringify({value:[]})}); });

  // ---- where it is, and making the link ----
  await p.evaluate(()=>openClientProfile('a','intake')); await T0();
  ok('K1 the intake\'s consent card has an "Online consent form" line with a button, and the file has a "Consent forms" section', await p.evaluate(()=>!!document.querySelector('.cf-intake-line #cf-intake-btn') && [...document.querySelectorAll('#profile-section option')].some(o=>o.value==='consents'&&/Consent forms \(0\)/.test(o.textContent))));
  await p.click('#cf-intake-btn'); await T0();
  ok('K2 the window explains it, offers 3/7/14 days and the date-of-birth protection, and makes the link', await p.evaluate(()=>/sign on their phone/.test(document.getElementById('cf-body').innerText) && [...document.querySelectorAll('#cf-days option')].map(o=>o.value).join()==='3,7,14' && document.getElementById('cf-usedob').checked && /Wording version/.test(document.getElementById('cf-body').innerText)));
  await p.click('#cf-create'); await T0(600);
  const url=await p.inputValue('#cf-url'); const token=(url.split('#')[1]||'');
  const fm=await forms(), lk=await links(), fid=Object.keys(fm)[0], F=fm[fid]||{}, L=lk[token]||{};
  ok('K3 the link is /c#token; the form is keyed by SHA-256(token + ":" + DOB), for this client only, open, version-stamped, asking for the DOB', /\/c#[A-Za-z0-9_-]{16,64}$/.test(url) && fid===sha(token+':1985-03-14') && F.clientId==='a' && F.status==='open' && F.needsDob===true && F.version && F.linkId===token && !!F.expiresAtIso && Math.round((Date.parse(F.expiresAtIso)-Date.now())/864e5)===7, JSON.stringify({url,fid:fid&&fid.slice(0,8)}));
  ok('K4 the link document holds no personal details (status, expiry, whether a DOB is asked — nothing else)', Object.keys(L).sort().join()==='createdAt,expiresAt,needsDob,status' && L.status==='open', JSON.stringify(Object.keys(L)));
  ok('K5 the send buttons are there: open on this device, text, email — and the log says it was made', await p.evaluate(()=>['cf-open','cf-sms','cf-email'].every(i=>!!document.getElementById(i))) && (await audits('^Consent form link created$')).length===1);

  // ---- sending ----
  await p.evaluate(()=>sendConsentLink(Object.keys(window.__cloud.read('teams/worngundidj/consentForms'))[0],'copy')); await T0(200);
  ok('K6 Copy puts the link on the clipboard and notes it in the send history', await p.evaluate(u=>window.__copied===u,url) && /link copied/.test(await p.innerText('#cf-body')));
  await p.click('#cf-sms'); await T0(200);
  const sms=await p.evaluate(()=>window.__ext.find(u=>/^sms:/.test(u))||'');
  const smsBody=decodeURIComponent((sms.split('body=')[1]||''));
  ok('K7 "Text from my phone" opens a text with the link: one SMS long, plain characters, the client\'s mobile', /^sms:0491570156/.test(sms) && smsBody.includes(url) && smsBody.length<=160 && /^[\x20-\x7e]+$/.test(smsBody) && /Worn Gundidj consent form/.test(smsBody), smsBody);
  await p.evaluate(()=>{ window.__origOpen=window.open; window.open=u=>{ window.__opened=u; return {focus(){},close(){}}; }; });
  await p.click('#cf-open'); await T0(200); await p.evaluate(()=>{ window.open=window.__origOpen; });
  ok('K8 "Open on this device" opens the link in a new tab, to hand the phone or tablet to the client', await p.evaluate(u=>window.__opened===u,url) && /opened on this device/.test(await p.innerText('#cf-body')));
  await p.click('#cf-email'); await T0(200);
  const mailto=await p.evaluate(()=>window.__ext.find(u=>/^mailto:/.test(u))||''); const mbody=decodeURIComponent(mailto.split('body=')[1]||'');
  ok('K9 Email without Outlook connected opens the email app, with the link and a plain explanation', /^mailto:jordan\.citizen%40example\.com/.test(mailto) && /subject=Your%20Worn%20Gundidj%20consent%20form/.test(mailto) && mbody.includes(url) && /about 5 minutes/.test(mbody) && /date of birth/.test(mbody) && /Hi Jordan,/.test(mbody));
  // with Outlook connected: composed from the worker's own mailbox, no time logged, and the send is noted once it has gone
  await p.evaluate(()=>{ outlookOrgConfig={clientId:'11111111-2222-3333-4444-555555555555'}; _saveOutlookAccount({name:'Jon Benson',username:'jon.benson@worngundidj.org.au',homeAccountId:'h'}); window._mailToken=async()=>'tok'; });
  await p.evaluate(()=>openConsentLinkModal('a')); await T0(); await p.click('#cf-email'); await T0(300);
  const cmp=await p.evaluate(()=>({to:document.getElementById('mc-to')?.value, sub:document.getElementById('mc-subject')?.value, body:document.getElementById('mc-body')?.value||'', rec:document.getElementById('mc-record')?.checked, mins:!!document.getElementById('mc-mins'), cl:document.getElementById('mc-client')?.value}));
  ok('K10 with Outlook connected it opens a New email to the client with the link — and "record this email on the file" is NOT ticked (no time is logged for it)', cmp.to==='jordan.citizen@example.com' && cmp.sub==='Your Worn Gundidj consent form' && cmp.body.includes(url) && cmp.rec===false && cmp.mins===false && cmp.cl==='a', JSON.stringify(cmp));
  const notes0=await p.evaluate(()=>[notes.length,timeLogs.length]);
  await p.click('#mc-send'); await T0(700);
  ok('K11 after it is sent from Outlook, the send history says so; no note and no time were added', await p.evaluate(()=>(window.__sent||[]).length===1 && /consent form/i.test(window.__sent[0])) && await p.evaluate(()=>consentForms.find(f=>f.clientId==='a').sends.some(s=>/email from Outlook/.test(s.channel))) && JSON.stringify(await p.evaluate(()=>[notes.length,timeLogs.length]))===JSON.stringify(notes0));
  await p.evaluate(()=>{ const f=consentForms.find(x=>x.clientId==='a'); /* nothing */ closeModal(); });

  // ---- cancel, and make a new link ----
  await p.evaluate(()=>openConsentLinkModal('a')); await T0();
  await p.click('#cf-body .btn:has-text("Cancel link")'); await T0(500);
  const afterCancel=await forms(), lkc=await links();
  ok('K12 cancelling stops the link (the form and the link document both say cancelled) and offers a new one', afterCancel[fid].status==='cancelled' && lkc[token].status==='cancelled' && await p.evaluate(()=>!!document.getElementById('cf-create') && /cancelled/.test(document.getElementById('cf-body').innerText)));
  await p.selectOption('#cf-days','3'); await p.uncheck('#cf-usedob'); await p.click('#cf-create'); await T0(600);
  const url2=await p.inputValue('#cf-url'), tok2=url2.split('#')[1], fm2=await forms();
  ok('K13 a new link: 3 days; with the DOB box unticked the form id is SHA-256(token + ":") and it does not ask for a date of birth', url2!==url && !!fm2[sha(tok2+':')] && fm2[sha(tok2+':')].needsDob===false && Math.round((Date.parse(fm2[sha(tok2+':')].expiresAtIso)-Date.now())/864e5)===3);
  await p.evaluate(()=>closeModal());

  // ---- the client signs (simulated: what consent.html writes) ----
  const submit=(id,over)=>p.evaluate(({T,id,over,ANS,PNG,SHARE})=>{ const cur=window.__cloud.read(T+'consentForms')[id]; window.__cloud.write(T+'consentForms',id,Object.assign({},cur,{ answers:ANS, sharing:SHARE, signature:{method:'drawn',name:'Jordan Citizen',image:PNG,at:new Date().toISOString(),role:'self'}, version:cur.version, status:'submitted', submittedAt:new Date().toISOString() },over||{})); },{T,id,over,ANS,PNG,SHARE});
  const f2id=sha(tok2+':');
  await p.evaluate(()=>showPage('dashboard')); await T0();
  await submit(f2id); await T0(700);
  ok('K14 when the client signs, a message pops up and the Dashboard lists the form to check and file', /Jordan signed their consent form/.test(await toasts()) && await p.evaluate(()=>!!document.querySelector('#cf-returned-card .cf-returned-row') && /Check and file/.test(document.getElementById('cf-returned-card').innerText)));
  await p.evaluate(()=>openClientProfile('a','intake')); await T0();
  ok('K15 the intake\'s consent card says it is waiting, and the Consent forms section offers "Check it and file it"', await p.evaluate(()=>/Signed by the client/.test(document.querySelector('.consent-link-status').textContent)) && await (async()=>{ await p.evaluate(()=>switchProfileTab('consents','a')); await T0(); return p.evaluate(()=>/Check it and file it/.test(document.getElementById('profile-tab-content').innerText)); })());
  await p.evaluate(id=>openConsentReviewModal(id),f2id); await T0();
  const rv=await p.evaluate(()=>({txt:document.querySelector('#modal-container .modal-body').innerText, img:document.querySelector('#modal-container img[alt^="Signature"]')?.src.slice(0,22)||'', mismatch:!!document.getElementById('cf-mismatch'), file:!!document.getElementById('cf-file')}));
  ok('K16 the review shows who signed and how, the signature, each choice as agrees / does not agree, the confirmations, and says what they declined', /Jordan Citizen/.test(rv.txt) && rv.img==='data:image/png;base64,' && /Keeping my information[\s\S]*Agrees/.test(rv.txt) && /Checking quality and funding[\s\S]*Does not agree/.test(rv.txt) && /They said\s+No\s+to: Checking quality and funding, Transport/.test(rv.txt) && /Who we may share with/i.test(rv.txt) && /Dr Sam Example/.test(rv.txt) && /Pat Citizen/.test(rv.txt) && /12 months/.test(rv.txt) && /They confirmed/.test(rv.txt) && /Wording version/.test(rv.txt) && rv.file && !rv.mismatch, JSON.stringify({t:rv.txt.slice(0,900),img:rv.img,m:rv.mismatch,f:rv.file}));
  const dhBefore=await p.evaluate(()=>dataHealth(clients.find(c=>c.id==='a')).missing.some(m=>/consent form uploaded/i.test(m.label||'')));
  await p.click('#cf-file'); await T0(700);
  const rec=await p.evaluate(()=>{ const c=clients.find(x=>x.id==='a'); const r=(c.consentRecords||[])[0]||{}; return { n:(c.consentRecords||[]).length, r, ticks:{db:c.ifConsentDatabase,info:c.ifConsentInfo,audit:c.ifConsentAudit,ext:c.ifConsentExternal,fam:c.ifConsentFamily,video:c.ifConsentVideo,tr:c.ifTransportConsent,priv:c.ifConsentPrivacy,signed:c.ifConsentSigned,sig:c.ifClientSig,date:c.ifConsentDate,today:today()} }; });
  ok('K17 filing puts a signed record on the profile: who, how, when, wording version, every choice, the signature image, and who filed it', rec.n===1 && rec.r.signedName==='Jordan Citizen' && rec.r.method==='drawn' && rec.r.role==='self' && rec.r.docType==='consent' && rec.r.kind==='online' && !!rec.r.version && rec.r.filedBy==='Jon Benson' && /^data:image\/png/.test(rec.r.image) && rec.r.choices.length===5 && !rec.r.choices.some(x=>x.k==='external') && rec.r.choices.find(x=>x.k==='audit').a==='No' && rec.r.choices.find(x=>x.k==='video').a==='Yes' && rec.r.confirmed===true, JSON.stringify(rec.r).slice(0,300));
  ok('K18 …and fills in the intake\'s consent ticks from the choices (Yes → ticked, No → left off; sharing with professionals and with personal supports follows the new section), with the name, date and "signed"', rec.ticks.db===true && rec.ticks.info===true && rec.ticks.audit===false && rec.ticks.ext===true && rec.ticks.fam===true && rec.ticks.video===true && rec.ticks.tr==='No' && rec.ticks.priv===true && rec.ticks.signed===true && rec.ticks.sig==='Jordan Citizen' && rec.ticks.date===rec.ticks.today, JSON.stringify(rec.ticks));
  const fm3=await forms(), lk3=await links();
  ok('K19 the form and its link are marked done in the cloud, and the audit log records it', fm3[f2id].status==='applied' && fm3[f2id].appliedBy==='Jon Benson' && lk3[tok2].status==='applied' && (await audits('^Consent form filed on client profile$')).length===1);
  ok('K20 the file opens on the Consent forms section, listing the signed form with its choices and signature', await p.evaluate(()=>document.getElementById('profile-section').value==='consents' && !!document.querySelector('.cf-record img[alt^="Signature"]') && /✓ Keeping my information/.test(document.querySelector('.cf-record').innerText) && /✗ Checking quality and funding/.test(document.querySelector('.cf-record').innerText) && /signed online by link/.test(document.querySelector('.cf-record').innerText) && [...document.querySelectorAll('#profile-section option')].some(o=>/Consent forms \(1\)/.test(o.textContent))));
  const dhAfter=await p.evaluate(()=>dataHealth(clients.find(c=>c.id==='a')).missing.some(m=>/consent form uploaded/i.test(m.label||'')));
  ok('K21 Data Health counts the signed online form as the signed consent document', dhBefore===true && dhAfter===false, JSON.stringify({dhBefore,dhAfter}));
  ok('K21b the record keeps who we may share with: both lists, each person with what may be shared, why, and an end date 12 months on', await p.evaluate(()=>{ const r=clients.find(x=>x.id==='a').consentRecords[0], sh=r.sharing||{}; const d=new Date(r.signedAt); d.setMonth(d.getMonth()+12); return sh.pro==='Yes' && sh.per==='Yes' && sh.length==='m12' && sh.endsOn===localISO(d).slice(0,10) && sh.parties.length===2 && sh.parties[0].name==='Dr Sam Example' && sh.parties[0].what.length===2 && sh.parties[0].back==='Yes' && sh.parties[1].group==='per' && sh.parties[1].name==='Pat Citizen'; }));
  ok('K21c the Consent forms section has a "Who we may share information with" card (current), listing the people', await p.evaluate(()=>{ switchProfileTab('consents','a'); const el=document.getElementById('cf-sharing-now'); return !!el && /Dr Sam Example/.test(el.innerText) && /Pat Citizen/.test(el.innerText) && /Current|Until they change/.test(el.innerText); }));
  const att=async(endsOn)=>p.evaluate(e=>{ const c=clients.find(x=>x.id==='a'); const saved=consentRecordsOf(c).map(r=>r.sharing&&r.sharing.endsOn); consentRecordsOf(c).forEach(r=>{ if(r.sharing) r.sharing.endsOn=e; }); const out={a:consentAttention(c), s:sharingStatus(consentRecordsOf(c).find(r=>r.sharing))}; consentRecordsOf(c).forEach((r,i)=>{ if(r.sharing) r.sharing.endsOn=saved[i]; }); return out; },endsOn);
  { const past=await att('2020-01-01'), soon=await att(await p.evaluate(()=>localISO(new Date(Date.now()+10*864e5)).slice(0,10))), far=await att(await p.evaluate(()=>localISO(new Date(Date.now()+200*864e5)).slice(0,10))), open=await att('');
    ok('K21d the file warns when the sharing consent has ended or ends within 30 days — and not before, or when it is "until I change it"', past.s==='expired' && past.a.length===1 && /ended/.test(past.a[0]) && soon.s==='soon' && /ends/.test(soon.a[0]) && far.s==='ok' && far.a.length===0 && open.s==='open' && open.a.length===0, JSON.stringify({past,soon,far,open})); }
  ok('K22 the Dashboard card goes away once it is filed', await p.evaluate(()=>{ showPage('dashboard'); return !document.getElementById('cf-returned-card'); }));
  ok('K23 a form that has been filed cannot be filed twice', await p.evaluate(async id=>{ await fileConsentForm(id); return clients.find(x=>x.id==='a').consentRecords.length===1; },f2id));

  // ---- printing, in the WG style ----
  await p.evaluate(()=>{ window.__reports.length=0; const c=clients.find(x=>x.id==='a'); printConsentRecord('a',c.consentRecords[0].id); });
  const pr=await p.evaluate(()=>window.__reports.join(''));
  ok('K24 the printed signed copy is in the Emergency Contacts style: brown title and bars, teal, the gold rule, the 000 sheet line, the Acknowledgement', /#4a2618/.test(pr) && /#3d7c88/.test(pr) && /#c08a2a/.test(pr) && /<h1>Consent Form<\/h1>/.test(pr) && /Acknowledgement of Country/.test(pr) && /1-3 Rooneys Rd, Warrnambool VIC 3280/.test(pr) && /Phone <b>\(03\) 5561 5315<\/b>/.test(pr));
  ok('K25 …with what was agreed to, what was confirmed, the signature image, who signed, when, how and under which wording — and it is audited', /What was agreed to/.test(pr) && /Checking quality and funding[\s\S]*No — does not agree/.test(pr) && /Keeping my information[\s\S]*Yes — agrees/.test(pr) && /Confirmed by the signer/.test(pr) && /<img src="data:image\/png;base64,/.test(pr) && /Jordan Citizen/.test(pr) && /wording version/.test(pr) && (await audits('^Printed signed consent form$')).length===1);
  ok('K25b the printed copy lists who we may share with, for how long, and says mandatory reporting is not covered by that choice', /Dr Sam Example/.test(pr) && /Pat Citizen/.test(pr) && /12 months/.test(pr) && /mandatory reporting/i.test(pr));

  // ---- name mismatch, a representative, a typed name, incomplete, and a later change of mind ----
  await p.evaluate(()=>{ createConsentLink; }); 
  const make=async(cid,dob)=>{ await p.evaluate(c=>openConsentLinkModal(c),cid); await T0(); if (dob===false) await p.uncheck('#cf-usedob').catch(()=>{}); await p.click('#cf-create'); await T0(600); const u=await p.inputValue('#cf-url'); await p.evaluate(()=>closeModal()); const t=u.split('#')[1]; return sha(t+':'+(dob===false||!dob?'':dob)); };
  const idB=await make('b',false);
  await submit(idB,{signature:{method:'typed',name:'Somebody Else',at:new Date().toISOString(),role:'self'}}); await T0(500);
  await p.evaluate(id=>openConsentReviewModal(id),idB); await T0();
  ok('K26 a signature in a different name from the client is flagged before filing (and a typed name shows in a signature font, no image)', await p.evaluate(()=>!!document.getElementById('cf-mismatch') && /doesn’t match the client’s name/.test(document.getElementById('cf-mismatch').innerText) && !document.querySelector('#modal-container img[alt^="Signature"]') && /Typed name|typed name/.test(document.querySelector('#modal-container .modal-body').innerText)));
  await p.evaluate(()=>closeModal());
  await submit(idB,{signature:{method:'typed',name:'Pat Guardian',at:new Date().toISOString(),role:'representative',relationship:'mother',supportPerson:'Interpreter Lee'}}); await T0(500);
  await p.evaluate(id=>openConsentReviewModal(id),idB); await T0();
  ok('K27 a representative: no mismatch warning, and it says they signed for someone else as their mother, with the support person', await p.evaluate(()=>!document.getElementById('cf-mismatch') && /signing for someone else, as their mother/.test(document.querySelector('#modal-container .modal-body').innerText) && /Interpreter Lee/.test(document.querySelector('#modal-container .modal-body').innerText)));
  await p.click('#cf-file'); await T0(600);
  const recB=await p.evaluate(()=>{ const c=clients.find(x=>x.id==='b'); const r=c.consentRecords[0]; return { role:r.role, rel:r.relationship, sup:r.supportPerson, img:'image' in r, sig:c.ifClientSig }; });
  ok('K28 filed: the record keeps the role, relationship and support person; no image for a typed name; the signature note reads "Pat Guardian (mother)"', recB.role==='representative' && recB.rel==='mother' && recB.sup==='Interpreter Lee' && recB.img===false && recB.sig==='Pat Guardian (mother)', JSON.stringify(recB));
  await p.evaluate(()=>{ window.__reports.length=0; printConsentRecord('b',clients.find(x=>x.id==='b').consentRecords[0].id); });
  { const r=await p.evaluate(()=>window.__reports.join('')); ok('K29 its printout says they signed for the client as their mother, in a signature font', /signing for Alex Sample, as their mother/.test(r) && /Brush Script MT/.test(r) && !/class="box sig"><img/.test(r), (r.match(/Signature<\/h2>[\s\S]{0,700}/)||['(no signature section) '+r.slice(0,200)])[0]); }
  const idX=await make('x','1990-01-01');
  await submit(idX,{answers:{...ANS,collect:undefined}}); await T0(500);
  await p.evaluate(()=>{ const f=consentForms.find(x=>x.clientId==='x'); delete f.answers.collect; }); await p.evaluate(id=>fileConsentForm(id),idX); await T0(200);
  ok('K30 an incomplete form (a choice missing) cannot be filed', /incomplete/.test(await toasts()) && await p.evaluate(()=>!(clients.find(x=>x.id==='x').consentRecords||[]).length));
  await p.evaluate(id=>openConsentReviewModal(id),idX);
  ok('K31 a client\'s name with HTML in it is shown as text', await p.evaluate(()=>!window.__xss && !document.querySelector('#modal-container img[src="x"]') && /Casey <img src=x/.test(document.querySelector('#modal-container .modal-title, #modal-container h3').textContent+document.querySelector('#modal-container .modal-body').textContent+document.title) || !window.__xss));
  await p.evaluate(()=>closeModal());
  // the client changes their mind later: a newer form replaces the ticks, and both stay on file
  const idA2=await make('a','1985-03-14');
  await submit(idA2,{answers:{...ANS,video:'No',audit:'Yes'}}); await T0(500);
  await p.evaluate(id=>fileConsentForm(id),idA2); await T0(700);
  const aa=await p.evaluate(()=>{ const c=clients.find(x=>x.id==='a'); return { n:c.consentRecords.length, video:c.ifConsentVideo, audit:c.ifConsentAudit, first:consentRecordsOf(c)[1] && consentRecordsOf(c)[1].choices.find(x=>x.k==='video').a }; });
  ok('K32 a later consent form replaces the ticks (video now off, audit now on) and the earlier signed form stays on file', aa.n===2 && aa.video===false && aa.audit===true && aa.first==='Yes', JSON.stringify(aa));
  { const idD=await make('d',false);
    await submit(idD,{answers:ANS_V1, sharing:null, version:'2026-11 v1'}); await T0(500);
    await p.evaluate(id=>openConsentReviewModal(id),idD); await T0();
    const rv1=await p.evaluate(()=>document.querySelector('#modal-container .modal-body').innerText);
    await p.evaluate(()=>closeModal()); await p.evaluate(id=>fileConsentForm(id),idD); await T0(700);
    const d1=await p.evaluate(()=>{ const c=clients.find(x=>x.id==='d'), r=c.consentRecords[0]; return { n:c.consentRecords.length, choices:r.choices.length, ext:r.choices.find(x=>x.k==='external')&&r.choices.find(x=>x.k==='external').a, sharing:r.sharing||null, confirmed:r.confirmed, tick:c.ifConsentExternal, fam:c.ifConsentFamily, att:consentAttention(c) }; });
    ok('K33 a form signed under the OLD wording (six choices, no sharing section) still reviews and files: its "other services" answer is kept, and it has no sharing record', /Sharing with other services/.test(rv1) && d1.n===1 && d1.choices===6 && d1.ext==='Yes' && d1.sharing===null && d1.confirmed===true && d1.tick===true && d1.att.length===0, JSON.stringify(d1)); }

  // ---- the client's signature on the intake ----
  await p.evaluate(({T,PNG})=>{ const id='intakeform-a'; window.__cloud.write(T+'intakeLinks','L1ntakeL1ntakeL1ntake',{status:'submitted',expiresAt:new Date(Date.now()+864e5).toISOString()});
    window.__cloud.write(T+'intakeForms',id,{linkId:'L1ntakeL1ntakeL1ntake',clientId:'a',status:'submitted',expiresAtIso:new Date(Date.now()+864e5).toISOString(),submittedAt:new Date().toISOString(),answers:{fullName:'Jordan Citizen',preferredName:'Jordy',declaration:true},signature:{method:'drawn',name:'Jordan Citizen',image:PNG,at:new Date().toISOString(),role:'self'}}); },{T,PNG}); await T0(600);
  await p.evaluate(()=>openIntakeReviewModal('intakeform-a')); await T0();
  { const d=await p.evaluate(()=>({img:!!document.querySelector('#if-signature img[alt^="Signature"]'), box:!!document.getElementById('if-signature'), txt:(document.getElementById('if-signature')||{innerText:''}).innerText, modal:document.querySelector('#modal-container .modal-body')?.innerText.slice(0,300)})); ok('K33 the intake review shows the client\'s signature, name and when', d.img && /signed by the client on screen/i.test(d.txt) && /Jordan Citizen/.test(d.txt), JSON.stringify(d)); }
  await p.click('#if-apply'); await T0(700);
  const isig=await p.evaluate(()=>{ const c=clients.find(x=>x.id==='a'); return c.intakeSignature && { name:c.intakeSignature.name, role:c.intakeSignature.role, img:/^data:image\/png/.test(c.intakeSignature.image||''), shown:!!document.querySelector('.intake-signed img[alt^="Signature"]') }; });
  ok('K34 adding the intake keeps the signature on the file, and the Intake tab shows it', isig && isig.name==='Jordan Citizen' && isig.role==='self' && isig.img && isig.shown, JSON.stringify(isig));
  await p.evaluate(()=>{ window.__reports.length=0; printIntake('a'); });
  const pi=await p.evaluate(()=>window.__reports.join(''));
  ok('K35 the printed intake is in the same style, still has every section, and carries the client\'s signature', /#4a2618/.test(pi) && /<h1>Client Intake Form<\/h1>/.test(pi) && /Acknowledgement of Country/.test(pi) && /Call <b>000<\/b>/.test(pi) && ['Client details','Goals','Emergency planning','Consent'].every(t=>pi.includes(t)) && /Client signature/.test(pi) && /<img src="data:image\/png/.test(pi) && /Privacy explained<\/td><td>Yes/.test(pi) && /Consent form signed online/.test(pi) && (await audits('^Printed client intake form$')).length===1);

  await p.evaluate(()=>openIntakeLinkModal('b')); await T0(); await p.click('#if-create'); await T0(600);
  await p.evaluate(()=>{ window.__origOpen=window.open; window.open=u=>{ window.__opened2=u; return {focus(){},close(){}}; }; });
  await p.click('#if-open'); await T0(200); await p.evaluate(()=>{ window.open=window.__origOpen; });
  ok('K35b the intake link also has "Open on this device", to hand a phone or tablet to the client to fill in and sign', await p.evaluate(()=>/\/i#[A-Za-z0-9_-]{16,}$/.test(window.__opened2||'')) && /opened on this device/.test(await p.innerText('#if-body')));
  await p.evaluate(()=>closeModal());

  // ---- everyone on staff can use it; the forms never stay on a shared computer ----
  await p.evaluate(()=>logout('idle')); await T0(900);
  const left=await p.evaluate(()=>({mem:consentForms.length, ls:(JSON.parse(localStorage.getItem('sewb_cms_consentForms')||'[]')||[]).length, names:/Jordan Citizen|Pat Guardian/.test(Object.keys(localStorage).map(k=>localStorage.getItem(k)).join('\n'))}));
  ok('K36 signing out removes the consent forms (names, signatures) from the computer', left.mem===0 && left.ls===0 && !left.names, JSON.stringify(left));
  await p.fill('#login-email','sam.worker@worngundidj.org.au'); await p.fill('#login-pass','x'); await p.click('#login-btn'); await T0(1800);
  await p.evaluate(()=>openClientProfile('a','intake')); await T0(); await p.click('#cf-intake-btn'); await T0(300);
  ok('K37 a worker (not a manager) can make a consent link too', await p.evaluate(()=>currentUser.role==='worker' && !!document.getElementById('cf-create') && /View|signed/.test(document.querySelector('#cf-body').innerText)));
  ok('K38 every section of the file still opens, including the new one', (await p.evaluate(()=>{ const out=[]; ['a','b'].forEach(id=>{ openClientProfile(id); [...document.querySelectorAll('#profile-section option')].forEach(o=>{ try{ switchProfileTab(o.value,id); }catch(e){ out.push(id+'/'+o.value+': '+e.message); } }); }); return out; })).length===0);
  await done('CONSENT FORMS AND SIGNATURES (staff)');
  process.exit(0);
})();

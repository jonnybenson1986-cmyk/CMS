// QA — privacy: no outside look-ups, what is left on a device after sign-out, the audit trail for
// exports and deletions, voice-to-text notice and switch, record retention dates, privacy wording.
// Synthetic people only.
const {start}=require('./harness.cjs'); const fs=require('fs'), path=require('path');
const SITE=path.join(__dirname,'..','..','site');
const SEED=new Function('w',`
  w('clients','a',{id:'a',fullName:'Jordan Citizen',status:'active',sewb:true,email:'jordan.citizen@example.com',ifSafeContact:'No',dob:'1985-03-14',created:'2026-09-01T09:00',attachments:[{name:'Consent form.pdf',docType:'consent',data:'data:text/plain;base64,eA=='}]});
  w('clients','b',{id:'b',fullName:'Alex Sample',status:'active',sewb:true,email:'alex.sample@example.com',ifSafeContact:'Yes',created:'2026-01-01T09:00'});
  w('clients','c1',{id:'c1',fullName:'Casey Adult',status:'closed',closedDate:'2026-05-01',closureReason:'Goals met',dob:'1980-02-02',created:'2025-01-01T09:00'});
  w('clients','c2',{id:'c2',fullName:'Drew Younger',status:'closed',closedDate:'2026-03-10',closureReason:'Moved away',dob:'2012-06-15',created:'2025-01-01T09:00'});
  w('clients','c3',{id:'c3',fullName:'Eli Nodob',status:'closed',closedDate:'2025-12-01',closureReason:'<img src=x onerror=window.__xss=1>',created:'2025-01-01T09:00'});
  w('notes','n1',{id:'n1',clientId:'a',type:'sewb',created:new Date(Date.now()-3600e3).toISOString().slice(0,19),worker:'Jon Benson',text:'SECRET-WORDS about the session'});
  w('notes','n2',{id:'n2',clientId:'c1',type:'sewb',created:'2026-06-20T10:00:00',worker:'Jon Benson',text:'Follow-up call after closure'});
  w('calevents','list',{list:[{id:'e1',title:'Home visit',clientId:'a',clientName:'Jordan Citizen',date:'2026-11-12',startTime:'10:00',worker:'Jon Benson'}]});
  w('walkins','list',{list:[{id:'w1',name:'Jordan Citizen',date:'2026-11-10',time:'09:00',reason:'Enquiry',worker:'Jon Benson'}]});
`);
(async()=>{
  const {p,ok,done,base}=await start({seed:SEED});
  const T=ms=>p.waitForTimeout(ms||300);
  const audits=re=>p.evaluate(re=>auditLog.filter(a=>new RegExp(re).test(a.action)).map(a=>({d:a.detail,c:a.clientId,ip:a.ip})),re);
  let dialogs=0; p.on('dialog',()=>dialogs++);

  // ---- nothing is sent to outside look-up or tracking services ----
  const reqs=[]; p.on('request',r=>reqs.push(r.url()));
  await p.reload(); await T(900); await p.fill('#login-email','jon.benson@worngundidj.org.au'); await p.fill('#login-pass','x'); await p.click('#login-btn'); await T(1600);
  await p.evaluate(()=>{ window.__reports.length=0; exportClientSummaryPDF('a'); });
  const outside=reqs.filter(u=>!u.startsWith(base)&&!/^(data|blob|about):/.test(u));
  ok('P1 loading, signing in and printing make no calls to IP look-up, analytics or font services', !outside.some(u=>/ipify|google-analytics|analytics\.google|fonts\.googleapis|fonts\.gstatic/.test(u)), outside.join(' '));
  const src=fs.readFileSync(path.join(SITE,'index.html'),'utf8'), toml=fs.readFileSync(path.join(SITE,'..','netlify.toml'),'utf8');
  ok('P2 the code no longer contains the IP look-up or the Google Fonts import, and the site\'s security policy no longer allows them', !/fetch\(['"]https:\/\/api\.ipify/.test(src) && !/fonts\.googleapis/.test(src) && !/ipify|google-analytics|analytics\.google/.test(toml));
  const li=await audits('^Login$');
  ok('P3 sign-in is still audited (who, two-step on/off) — without an IP address', li.length>=1 && /^Signed in · two-step/.test(li.at(-1).d) && !li.at(-1).ip, JSON.stringify(li.at(-1)));

  // ---- exports and deletions leave a trail ----
  ok('P4 printing / exporting a client file is audited', (await audits('^Printed / exported client file$')).some(a=>a.c==='a'));
  await p.evaluate(()=>{ HTMLAnchorElement.prototype.click=function(){}; exportClientJSON('a'); });
  ok('P5 exporting a client file as .json is audited', (await audits('^Exported client file')).some(a=>a.c==='a'));
  await p.evaluate(()=>{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true}); copyClientSummary('a'); }); await T(100);
  ok('P6 copying a client summary is audited', (await audits('^Copied client summary$')).some(a=>a.c==='a'));
  await p.evaluate(()=>openClientProfile('a','notes')); await T();
  await p.evaluate(()=>deleteNote('n1','a')); await T();
  const dn=await audits('^Deleted note$');
  ok('P7 deleting a note (allowed in the first 24 hours) records who, when and which note — not the words', dn.length===1 && dn[0].c==='a' && /SEWB note dated/.test(dn[0].d) && !/SECRET/.test(JSON.stringify(dn)), JSON.stringify(dn));
  ok('P8 …and the cloud copy is kept, marked as deleted', await p.evaluate(()=>{ const d=window.__cloud.read('teams/worngundidj/notes').n1; return !!d && d._deleted===true && /SECRET-WORDS/.test(d.text||'') && !!d._deletedBy; }));
  await p.evaluate(()=>deleteFile('a',0)); await T();
  const df=await audits('^Removed file from client record$');
  ok('P9 removing a file from a client record is audited with its name and type', df.length===1 && /Consent form\.pdf \(consent\)/.test(df[0].d));

  // ---- voice to text ----
  await p.evaluate(()=>{ DB.save('voiceAck',{}); }); dialogs=0;
  const v1=await p.evaluate(()=>voiceGate()), d1=dialogs, v2=await p.evaluate(()=>voiceGate()), d2=dialogs;
  ok('P10 the first use of voice to text shows a notice (speech goes to the browser maker\'s service); after that it is not repeated', v1===true && d1===1 && v2===true && d2===1 && (await audits('^Voice-to-text notice accepted$')).length===1);
  await p.evaluate(()=>{ closeModal(); showPage('settings'); }); await T();
  ok('P11 Settings has a Privacy card saying where information goes — and no blanket "no overseas disclosure" claim', await p.evaluate(()=>{ const t=document.getElementById('privacy-card')?.innerText||''; return /Health Records Act 2001/.test(t) && /Sydney/.test(t) && /may be processed outside Australia/.test(t) && !/No overseas disclosure/i.test(document.getElementById('content').innerText); }));
  await p.uncheck('#pv-voice'); await p.fill('#pv-contact','Privacy Officer, (03) 5550 0000'); await p.click('#privacy-card .btn-primary:has-text("Save privacy settings")'); await T(500);
  const cfg=await p.evaluate(()=>window.__cloud.read('teams/worngundidj/appConfig').privacy);
  ok('P12 the System Manager can switch voice to text off for everyone and set the privacy contact (shared, audited)', cfg && cfg.voiceOff===true && /Privacy Officer/.test(cfg.contact) && (await audits('^Privacy settings changed$')).length===1, JSON.stringify(cfg));
  dialogs=0;
  ok('P13 switched off → voice to text is refused, and no microphone buttons are added', await p.evaluate(()=>voiceGate()===false) && dialogs===0 && await p.evaluate(()=>{ const ta=document.createElement('textarea'); document.body.appendChild(ta); _attachVoiceButtons(); const had=!!ta.dataset.voiceAttached; ta.remove(); return !had; }));

  // ---- privacy policy ----
  await p.evaluate(()=>showPrivacyPolicy()); await T();
  const pol=await p.evaluate(()=>document.getElementById('privacy-policy')?.innerText||'');
  ok('P14 the policy names both laws, the 7-year / age-25 retention rule, breach notification and both complaint bodies', /Privacy Act 1988/.test(pol) && /Health Records Act 2001/.test(pol) && /7 years/.test(pol) && /turns 25/.test(pol) && /Office of the Australian Information Commissioner/.test(pol) && /Health Complaints Commissioner/.test(pol) && /Data breaches/i.test(pol));
  ok('P15 it is accurate about overseas handling and uses the privacy contact that was set', /Information handled outside Australia/i.test(pol) && !/no cross-border disclosure/i.test(pol) && !/IP address/i.test(pol) && /Privacy Officer, \(03\) 5550 0000/.test(pol) && /currently switched off/.test(pol));
  await p.evaluate(()=>closeModal());

  // ---- retention ----
  const r=await p.evaluate(()=>({ adult:retention(clients.find(c=>c.id==='c1')), child:retention(clients.find(c=>c.id==='c2')), nodob:retention(clients.find(c=>c.id==='c3')) }));
  ok('P16 adult: keep 7 years after the LAST service (a note after closure counts)', r.adult.until==='2033-06-20', JSON.stringify(r.adult));
  ok('P17 under 18 at the last service: keep until they turn 25', r.child.until==='2037-06-15' && /turn 25/.test(r.child.why), JSON.stringify(r.child));
  ok('P18 no date of birth: 7 years, with a warning to check their age first', r.nodob.until==='2032-12-01' && /Date of birth is not recorded/.test(r.nodob.why), JSON.stringify(r.nodob));
  await p.evaluate(()=>showPage('closedclients')); await T();
  ok('P19 Closed Clients shows "Keep record until" for each file, and shows text safely', await p.evaluate(()=>/Keep record until/i.test(document.querySelector('#content thead').innerText) && document.querySelectorAll('.keep-until').length===3 && [...document.querySelectorAll('.keep-until')].some(td=>/20 June? 2033/.test(td.innerText)) && !window.__xss && !document.querySelector('#content img[src="x"]')), await p.evaluate(()=>JSON.stringify({h:document.querySelector('#content thead')?.innerText,c:[...document.querySelectorAll('.keep-until')].map(t=>t.innerText),x:!!window.__xss,pg:currentPage})));

  // ---- email + intake consent ----
  await p.evaluate(ME=>{ outlookOrgConfig={clientId:'11111111-2222-3333-4444-555555555555'}; _saveOutlookAccount({name:'Jon Benson',username:ME,homeAccountId:'h'}); mailCompose({to:'jordan.citizen@example.com',clientId:'a'}); },'jon.benson@worngundidj.org.au'); await T();
  const w1=await p.evaluate(()=>document.getElementById('mc-safe-warn')?.innerText||'');
  await p.selectOption('#mc-client','b'); await T(100);
  ok('P20 emailing a client whose "safe to contact" is not Yes shows a reminder; a client who said Yes shows none', /Safe to leave calls\/texts\?.*is No/.test(w1) && await p.evaluate(()=>!document.getElementById('mc-safe-warn')), w1);
  await p.evaluate(()=>{ closeModal(); openClientProfile('b','intake'); }); await T();
  await p.check('#ifConsentPrivacy'); await p.evaluate(()=>saveIntake('b')); await T();
  await p.evaluate(()=>{ window.__reports.length=0; printIntake('b'); });
  ok('P21 intake records that privacy was explained, and prints it', await p.evaluate(()=>clients.find(c=>c.id==='b').ifConsentPrivacy===true && /Privacy explained<\/td><td>Yes/.test(window.__reports.join(''))));
  await p.evaluate(()=>closeModal());

  // ---- the client's own online form ----
  const ih=fs.readFileSync(path.join(SITE,'intake.html'),'utf8');
  ok('P22 the client intake form gives a privacy notice: why, choice, who sees it, where kept, rights and complaints', ['How we look after your information','Why we ask','your choice','Who sees it','stored in Australia','ask to see your information','oaic.gov.au','hcc.vic.gov.au'].every(t=>ih.includes(t)) && !/only seen by Worn Gundidj staff/.test(ih));
  let synOK=true; try{ (ih.match(/<script>([\s\S]*?)<\/script>/g)||[]).forEach(b=>new Function(b.replace(/^<script>|<\/script>$/g,''))); }catch(e){ synOK=e.message; }
  ok('P23 the client intake form still loads (its code is valid)', synOK===true, String(synOK));

  // ---- what is left on a shared computer after sign-out ----
  await p.evaluate(()=>showPage('dashboard')); await T(200);
  const before=await p.evaluate(()=>({cal:calEvents.length,walk:walkins.length,aud:auditLog.length}));
  await p.evaluate(()=>logout('user')); await T(900);
  const left=await p.evaluate(()=>{ const all=Object.keys(localStorage).map(k=>k+'='+localStorage.getItem(k)).join('\n'); return { names:/Jordan Citizen|Alex Sample|Casey Adult|Drew Younger/.test(all), keys:['calevents','walkins','auditlog','clients','notes'].filter(k=>(JSON.parse(localStorage.getItem('sewb_cms_'+k)||'[]')||[]).length), login:!!document.getElementById('login-email') }; });
  ok('P24 after sign-out no client names are left in the browser: calendar, walk-in register and audit log are cleared too', before.cal===1 && before.walk===1 && before.aud>5 && left.login && !left.names && left.keys.length===0, JSON.stringify({before,left}));
  const cloudAudit=await p.evaluate(()=>Object.keys(window.__cloud.read('teams/worngundidj/auditlog')).length);
  ok('P25 the audit log was saved to the cloud before being cleared from the device', cloudAudit>=before.aud, cloudAudit+' vs '+before.aud);
  await p.fill('#login-email','jon.benson@worngundidj.org.au'); await p.fill('#login-pass','x'); await p.click('#login-btn'); await T(1800);
  const back=await p.evaluate(()=>({cal:calEvents.length,walk:walkins.length,aud:auditLog.length,del:auditLog.some(a=>a.action==='Deleted note')}));
  ok('P26 signing back in brings the calendar, walk-ins and the full audit log back from the cloud', back.cal===1 && back.walk===1 && back.aud>=before.aud && back.del, JSON.stringify(back));
  await done('PRIVACY');
  process.exit(0);
})();

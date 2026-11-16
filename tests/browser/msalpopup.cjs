// QA — Microsoft sign-in windows are not blocked. Browsers only let a page open a window
// straight after a click; anything slow in between (a failing silent sign-in can take 10 s or
// more) and the window is blocked as a pop-up. Here Microsoft's sign-in component (MSAL) is
// replaced by a stand-in that behaves like a pop-up blocker: a sign-in window asked for more
// than 1 second after the last click is refused (popup_window_error). Its silent sign-in is
// slow to fail, as it is when Microsoft wants the worker to sign in again. Synthetic data only.
const {start}=require('./harness.cjs');
const ME='jon.benson@worngundidj.org.au';
(async()=>{
  const {p,ok,done}=await start({});
  const W=ms=>p.waitForTimeout(ms||300);
  const st={sent:[],calls:[]};
  await p.route('https://graph.microsoft.com/**', async route=>{ const rq=route.request(), u=new URL(rq.url()), cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,prefer','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'};
    if(rq.method()==='OPTIONS') return route.fulfill({status:204,headers:cors});
    const path=decodeURIComponent(u.pathname.replace('/v1.0','')); st.calls.push(rq.method()+' '+path);
    if(rq.method()==='POST'&&path==='/me/sendMail'){ st.sent.push(JSON.parse(rq.postData())); return route.fulfill({status:202,headers:cors,body:''}); }
    if(/\/me\/mailFolders\/inbox\/messages$/.test(path)) return route.fulfill({status:200,headers:{...cors,'content-type':'application/json'},body:JSON.stringify({value:[{id:'M1',subject:'Synthetic message',from:{emailAddress:{address:'pat@example.org'}},toRecipients:[{emailAddress:{address:ME}}],receivedDateTime:'2026-11-10T01:00:00Z',isRead:true,bodyPreview:'hi',hasAttachments:false}]})});
    if(/\/me\/calendar\/events/.test(path)||/calendarView/.test(path)) return route.fulfill({status:200,headers:{...cors,'content-type':'application/json'},body:JSON.stringify({value:[]})});
    return route.fulfill({status:404,headers:{...cors,'content-type':'application/json'},body:JSON.stringify({error:{message:'not stubbed '+path}})});
  });
  // The stand-in for Microsoft's sign-in component, with a pop-up blocker.
  const install=()=>p.evaluate(ME=>{
    const S=window.__ms={ silent:'slowfail', blockAll:false, inits:0, silentCalls:0, popups:[], blocked:0, lastClick:0, token:null };
    document.addEventListener('click',()=>{ S.lastClick=performance.now(); },true);
    const acc={ username:ME, homeAccountId:'h', name:'Jon Benson' };
    const popup=(kind,req)=>{ const gap=S.lastClick?performance.now()-S.lastClick:1e9;
      if(S.blockAll||gap>1000){ S.blocked++; S.popups.push({kind,gap,blocked:true}); return Promise.reject(Object.assign(new Error('popup blocked'),{errorCode:'popup_window_error'})); }
      S.popups.push({kind,gap,blocked:false,scopes:req.scopes,silentAt:S.silentCalls}); S.token='tok-'+Date.now(); S.cleared=false; return Promise.resolve({ accessToken:S.token, account:acc }); };
    window.msal={ PublicClientApplication: class { constructor(c){ this.c=c; }
      initialize(){ S.inits++; return new Promise(r=>setTimeout(r,250)); }
      getAllAccounts(){ return S.cleared?[]:[acc]; } setActiveAccount(){} clearCache(){ S.cleared=true; S.token=null; return Promise.resolve(); }
      acquireTokenSilent(req){ S.silentCalls++; if(S.token) return Promise.resolve({accessToken:S.token,account:acc});
        if(S.silent==='ok') return Promise.resolve({accessToken:'tok-silent',account:acc});
        return new Promise((_,rej)=>setTimeout(()=>rej(Object.assign(new Error('interaction required'),{errorCode:'interaction_required'})),1500)); }
      acquireTokenPopup(req){ return popup('token',req); }
      loginPopup(req){ return popup('login',req); } } };
    _msalInstance=null; _msalKey='';
    outlookOrgConfig={clientId:'11111111-2222-3333-4444-555555555555',tenant:''};
    _saveOutlookAccount({name:'Jon Benson',username:ME,homeAccountId:'h'}); mailReset();
  },ME);
  await install();

  // ---- the Email page ----
  await p.evaluate(()=>showPage('email')); await W(2300);
  let s=await p.evaluate(()=>({...window.__ms, consent:!!document.querySelector('#mail-consent .btn'), txt:document.getElementById('content').innerText}));
  ok('P1 opening Email gets Microsoft\'s sign-in component ready straight away (before anyone clicks)', s.inits>=1);
  ok('P2 when Microsoft wants the worker to sign in, the page asks with a button — it never tries to open a window on its own', s.consent && s.popups.length===0 && /Allow email access/.test(s.txt), JSON.stringify({c:s.consent,p:s.popups}));
  const silentBefore=s.silentCalls;
  await p.click('#mail-consent .btn'); await W(900);
  s=await p.evaluate(()=>({...window.__ms, rows:document.querySelectorAll('.mail-row').length, err:(document.getElementById('mail-error')||{}).innerText||''}));
  ok('P3 pressing "Allow email access" opens Microsoft\'s window at once — not blocked (it used to wait for a slow silent sign-in first, and the browser blocked it)', s.popups.length===1 && !!s.popups[0] && !s.popups[0].blocked && s.popups[0].gap<200 && s.popups[0].scopes.includes('Mail.Read'), JSON.stringify(s.popups));
  ok('P4 …without trying a silent sign-in again first', !!s.popups[0] && s.popups[0].silentAt===silentBefore, JSON.stringify({before:silentBefore,popups:s.popups}));
  ok('P5 …and then the inbox loads', s.rows===1 && !s.err, JSON.stringify({rows:s.rows,err:s.err}));

  // ---- a browser that blocks every pop-up ----
  await p.evaluate(()=>{ window.__ms.token=null; window.__ms.blockAll=true; window.__ms.popups=[]; mailReset(); showPage('email'); }); await W(2300);
  await p.click('#mail-consent .btn'); await W(700);
  s=await p.evaluate(()=>({...window.__ms, err:(document.getElementById('mail-error')||{}).innerText||'', btn:!!document.getElementById('mail-signin')}));
  ok('P6 if the browser still blocks it, the page says exactly what to do, with a "🔑 Sign in to Microsoft" button to try again', s.blocked>=1 && /stopped the Microsoft sign-in window/.test(s.err) && /Always allow pop-ups/.test(s.err) && s.btn, JSON.stringify({err:s.err,btn:s.btn}));
  await p.evaluate(()=>{ window.__ms.blockAll=false; }); await p.click('#mail-signin'); await W(900);
  s=await p.evaluate(()=>({...window.__ms, rows:document.querySelectorAll('.mail-row').length, err:!!document.getElementById('mail-error'), etxt:(document.getElementById('mail-error')||{}).innerText||''}));
  ok('P7 once pop-ups are allowed, that button signs in and the inbox loads', s.popups.filter(x=>!x.blocked).length===1 && s.rows===1 && !s.err, JSON.stringify({rows:s.rows,err:s.err,e:s.etxt}));

  // ---- sending when Microsoft wants a sign-in ----
  await p.evaluate(()=>{ window.__ms.token=null; window.__ms.popups=[]; mailCompose({to:'pat@example.org',subject:'Synthetic',body:'Hello'}); }); await W(300);
  await p.click('#mc-send'); await W(2200);
  s=await p.evaluate(()=>({...window.__ms, err:(document.getElementById('mc-error')||{}).innerText||'', btn:!!document.getElementById('mc-signin'), open:!!document.getElementById('mc-send')}));
  ok('P8 sending when Microsoft wants a sign-in: no window is tried in the middle of sending; the email stays open with "🔑 Sign in and send"', s.popups.length===0 && s.btn && s.open && /sign in before this can be sent/.test(s.err) && st.sent.length===0, JSON.stringify({p:s.popups,err:s.err}));
  await p.click('#mc-signin'); await W(1200);
  s=await p.evaluate(()=>({...window.__ms, open:!!document.getElementById('mc-send')}));
  ok('P9 pressing it opens Microsoft\'s window at once, then sends the email', s.popups.length===1 && !s.popups[0].blocked && st.sent.length===1 && st.sent[0].message.subject==='Synthetic' && !s.open, JSON.stringify({p:s.popups,sent:st.sent.length}));

  // ---- the calendar ----
  await p.evaluate(()=>{ window.__ms.token=null; window.__ms.popups=[]; window.__toasts.length=0; showPage('calendar'); }); await W(400);
  await p.evaluate(()=>outlookSync('week')); await W(2300);
  s=await p.evaluate(()=>({...window.__ms, t:window.__toasts.join(' | ')}));
  ok('P10 a calendar sync that needs a sign-in never opens a window part-way through — it says to press Connect', s.popups.length===0 && /press 🔗 Connect to Outlook/i.test(s.t), JSON.stringify({p:s.popups,t:s.t.slice(0,200)}));
  await p.evaluate(()=>outlookDisconnect()); await W(500);
  await p.evaluate(()=>showPage('calendar')); await W(400);
  await p.click('#outlook-connect-btn'); await W(700);
  s=await p.evaluate(()=>({...window.__ms, acc:outlookAccount()}));
  ok('P11 "Connect Outlook" opens Microsoft\'s window at once (not blocked) and connects', s.popups.length===1 && s.popups[0].kind==='login' && !s.popups[0].blocked && s.acc && s.acc.username===ME, JSON.stringify(s.popups));
  await done('MICROSOFT SIGN-IN WINDOWS');
})().catch(e=>{ console.error(e); process.exit(1); });

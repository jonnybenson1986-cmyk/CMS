// Regression for the counting rules and recent features around Log Session.
const {start}=require('./harness.cjs');
(async()=>{
  const day=n=>{ const t=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne'}).format(new Date()); const d=new Date(t+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
  const D=[day(-90),day(-70),day(-50),day(-30),day(-5)];
  const {p,ok,done}=await start({seed:new Function('w',`
    w('workersList','list',{list:['Jon Benson','Sam Worker']});
    w('clients','g',{id:'g',fullName:'General Person',status:'active',sewb:true,created:'2026-01-01T09:00'});
    w('clients','n',{id:'n',fullName:'Ndis Only',status:'active',disability:true,created:'2026-01-01T09:00'});
    w('clients','m',{id:'m',fullName:'Mens Group',status:'active',sewb:true,mensgroup:true,created:'2026-01-01T09:00'});
    ${JSON.stringify(D)}.forEach((d,i)=>{
      w('notes','g'+i,{id:'g'+i,clientId:'g',type:'general',created:d+'T10:00:00',worker:'Jon Benson',text:'gen'});
      w('notes','n'+i,{id:'n'+i,clientId:'n',type:'general',created:d+'T10:00:00',worker:'Jon Benson',text:'gen'});
      w('notes','m'+i,{id:'m'+i,clientId:'m',type:'mensgroup',created:d+'T10:00:00',worker:'Jon Benson',text:'mg'}); });
  `)});
  const r=await p.evaluate(()=>({ g:clientEpisodeStats('g','sewb').completeEpisodes, n:clientEpisodeStats('n','sewb').totalContacts, mS:clientEpisodeStats('m','sewb').totalContacts, mM:clientEpisodeStats('m','mensgroup').completeEpisodes }));
  ok('R1 GENERAL contacts still count toward SEWB for a SEWB client', r.g===1, JSON.stringify(r));
  ok('R2 …but not for an NDIS-only client', r.n===0, JSON.stringify(r));
  ok('R3 Men\'s Group stays its own program (not added to SEWB)', r.mS===0 && r.mM===1, JSON.stringify(r));
  await p.evaluate(()=>openClientProfile('g','overview')); await p.waitForTimeout(200);
  ok('R4 the file header has the single Log session button', await p.evaluate(()=>[...document.querySelectorAll('.pf-actions button')].some(b=>/Log session/.test(b.textContent)) && ![...document.querySelectorAll('.pf-actions button')].some(b=>/Add note/.test(b.textContent))));
  await p.click('.pf-actions button:has-text("Log session")'); await p.waitForTimeout(250);
  const types=await p.evaluate(()=>[...document.querySelectorAll('#sm-type option')].map(o=>o.value+'='+o.textContent).join(', '));
  ok('R5 Session Type list: GENERAL, SEWB, FAMILY VIOLENCE, AOD, JUSTICE, CULTURAL, MEN\'S GROUP, DISABILITY, WORK FOUNDATIONS', types==="general=GENERAL, sewb=SEWB, familyviolence=FAMILY VIOLENCE, aod=AOD, justice=JUSTICE, cultural=CULTURAL, mensgroup=MEN'S GROUP, disability=DISABILITY, workfoundations=WORK FOUNDATIONS", types);
  await p.selectOption('#sm-worker2','Sam Worker');
  await p.evaluate(()=>{ rteSetContent('sm-text','','Joint.'); const el=document.getElementById('sm-text'); el.value='Joint.'; el.dispatchEvent(new Event('input',{bubbles:true})); });
  await p.click('#modal-container .modal-footer .btn-primary'); await p.waitForTimeout(500);
  ok('R6 second worker still saves, and you\'re returned to the file', await p.evaluate(()=>notes.some(n=>n.text==='Joint.'&&n.worker2==='Sam Worker') && !!document.getElementById('profile-section')));
  ok('R7 Outlook helpers present (my appointments, today / this week)', await p.evaluate(()=>typeof outlookRange==='function' && outlookRange('today').from===today() && typeof isMyWorkerName==='function' && isMyWorkerName('jon.benson')));
  // ---- security: no anonymous sessions; sign-out clears cloud-held data from the device ----
  const fs=require('fs'), path=require('path'), SITE=path.join(__dirname,'..','..','site'), ROOT=path.join(__dirname,'..','..');
  const html=fs.readFileSync(path.join(SITE,'index.html'),'utf8'), toml=fs.readFileSync(path.join(ROOT,'netlify.toml'),'utf8');
  ok('S1 the app never signs in anonymously', !/signInAnonymously/.test(html) && !/signInAnonymously/.test(fs.readFileSync(path.join(SITE,'intake.html'),'utf8')));
  ok('S2 all four rule files refuse anonymous sessions', ['firestore.rules','firestore.rules.strict','storage.rules','storage.rules.strict'].every(f=>/function signedIn\(\)\s*\{ return request\.auth != null && request\.auth\.token\.firebase\.sign_in_provider != 'anonymous'; \}/.test(fs.readFileSync(path.join(ROOT,f),'utf8'))));
  ok('S3 scripts can only load from this site or Google (no open package CDN)', !/jsdelivr/.test(toml) && !/jsdelivr/.test(html));
  ok('S4 no AI-provider keys or PHP anywhere in the published site', !/sk-ant-|sk-or-|sk-proj-|openrouter|api\.openai\.com|api\.anthropic\.com/i.test(html) && !fs.readdirSync(SITE).some(f=>/\.php$/i.test(f)));
  await p.evaluate(()=>{ closeModal(); smsOutbox=[{id:'o1',clientId:'g',toFull:'0491570156'}]; DB.save('smsOutbox',smsOutbox); intakeForms=[{id:'f1',clientId:'g',answers:{fullName:'General Person'}}]; DB.save('intakeForms',intakeForms); });
  await p.evaluate(()=>logout()); await p.waitForTimeout(800);
  const left=await p.evaluate(()=>({ keys:['clients','notes','timelogs','referrals','smsOutbox','intakeForms'].filter(k=>(JSON.parse(localStorage.getItem('sewb_cms_'+k)||'[]')||[]).length), login:!!document.getElementById('login-email'), badge:document.getElementById('sync-badge')?.textContent||'' }));
  ok('S5 signing out clears client records, text requests and intake forms from this device', left.keys.length===0 && left.login, JSON.stringify(left));
  await p.reload(); await p.waitForTimeout(1500);
  const pre=await p.evaluate(()=>({ badge:document.getElementById('login-fb-badge')?.textContent||'', red:/Sync offline/.test(document.getElementById('sync-badge')?.textContent||''), n:clients.length, user:!!firebase.auth().currentUser }));
  ok('S6 before sign-in: nothing is loaded, nobody is signed in, and no false "Sync offline" alarm', /ready/i.test(pre.badge) && !pre.red && pre.n===0 && !pre.user, JSON.stringify(pre));
  await p.fill('#login-email','jon.benson@worngundidj.org.au'); await p.fill('#login-pass','x'); await p.click('#login-btn'); await p.waitForTimeout(1800);
  ok('S7 signing in still connects and loads the records', await p.evaluate(()=>FSYNC.isReady() && clients.length===3 && /Jon Benson/.test(document.querySelector('#sidebar .user-badge-bar')?.innerText||'')));
  await done('REGRESSION'); process.exit(0);
})();

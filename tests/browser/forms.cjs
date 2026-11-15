// QA — the client's own forms on a phone: signing (the pad, the typed-name alternative), the consent form
// (informed consent explained, choices, signing, the client's own copy) and the intake form's signature.
// Microsoft/Firebase are replaced by stand-ins; synthetic people only.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
let pw; try { pw=require('playwright'); } catch (_) { pw=require('/opt/node22/lib/node_modules/playwright'); }
const {chromium,devices}=pw;
const ROOT=path.join(__dirname,'..','..','site'), FAKE=fs.readFileSync(path.join(__dirname,'fakepublic.js'),'utf8');
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
const T='teams/worngundidj/';
function serve(){ return new Promise(r=>{ const srv=http.createServer((rq,rs)=>{ let u=decodeURIComponent(rq.url.split('?')[0]); if(u==='/')u='/index.html'; const fp=path.join(ROOT,u); if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){rs.writeHead(404);rs.end();return;}
  const ext=path.extname(fp); rs.writeHead(200,{'content-type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'}[ext]||'application/octet-stream'}); fs.createReadStream(fp).pipe(rs); }); srv.listen(0,'127.0.0.1',()=>r(srv)); }); }
const res=[]; const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||'']);
const TOKEN='Tk3nTk3nTk3nTk3nTk3nAA', DOB='1985-03-14';
const later=()=>new Date(Date.now()+5*864e5).toISOString(), past=()=>new Date(Date.now()-1000).toISOString();
(async()=>{
  const srv=await serve(); const base='http://127.0.0.1:'+srv.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const errs=[];
  async function page(opts){ // a phone
    const ctx=await browser.newContext({...devices['iPhone 12'],serviceWorkers:'block',...(opts||{})}); await ctx.addInitScript(FAKE);
    await ctx.addInitScript(()=>{ window.__printed=0; window.print=()=>{ window.__printed++; }; });
    const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message)); await p.route('**/*',r=>{ const u=r.request().url(); if(u.includes('/vendor/firebase/')||!u.startsWith(base)) return r.abort(); return r.continue(); });
    return {p,ctx};
  }
  const seed=(p,docs)=>p.evaluate(d=>{ window.__pub.seed(d); },docs);
  const openAt=async(p,file,token)=>{ await p.goto(base+'/'+file+'#'+token); await p.waitForTimeout(600); };
  const stroke=async(p,sel,pts,type)=>{ // draw with the pointer (touch-style events when type='touch')
    await p.evaluate(({sel,pts,type})=>{ const c=document.querySelector(sel), r=c.getBoundingClientRect(); const ev=(n,x,y)=>c.dispatchEvent(new PointerEvent(n,{pointerId:type==='touch'?7:1,pointerType:type||'mouse',isPrimary:true,button:0,buttons:n==='pointerup'?0:1,clientX:r.left+x*r.width,clientY:r.top+y*r.height,bubbles:true,cancelable:true}));
      ev('pointerdown',pts[0][0],pts[0][1]); pts.slice(1).forEach(q=>ev('pointermove',q[0],q[1])); ev('pointerup',pts[pts.length-1][0],pts[pts.length-1][1]); },{sel,pts,type}); };
  const SCRIBBLE=[[.1,.5],[.2,.3],[.3,.6],[.4,.3],[.5,.6],[.6,.35],[.7,.6],[.85,.4]];

  // ===================== the signature pad =====================
  { const {p,ctx}=await page(); await p.goto(base+'/consent.html#x'); await p.waitForTimeout(300);
    await p.evaluate(()=>{ document.body.innerHTML='<div id="r" style="width:340px"><div class="sigwrap"><canvas id="cv"></canvas></div></div>'; window.pad=WG_SIGN.createPad(document.getElementById('cv'),{onChange(){ window.__chg=(window.__chg||0)+1; }}); });
    ok('G1 the pad starts empty and a tap or a dot is not a signature', await p.evaluate(()=>!pad.hasInk() && pad.toDataURL()==='') && await (async()=>{ await stroke(p,'#cv',[[.5,.5]],'touch'); return p.evaluate(()=>!pad.hasInk()); })());
    await p.evaluate(()=>pad.clear());
    await stroke(p,'#cv',SCRIBBLE,'touch');
    const png=await p.evaluate(()=>new Promise(res=>{ const u=pad.toDataURL(), im=new Image(); im.onload=()=>{ const c=document.createElement('canvas'); c.width=im.width; c.height=im.height; const x=c.getContext('2d'); x.drawImage(im,0,0); const d=x.getImageData(0,0,c.width,c.height).data; let ink=0,opaqueBg=0; for(let i=3;i<d.length;i+=4){ if(d[i]>0) ink++; } res({w:im.width,h:im.height,len:u.length,ink,head:u.slice(0,22),corner:d[3],chg:window.__chg}); }; im.src=u; }));
    ok('G2 signing with a finger gives a 600×200 transparent PNG of a few kilobytes, with ink in it', png.head==='data:image/png;base64,' && png.w===600 && png.h===200 && png.len<40000 && png.ink>200 && png.corner===0, JSON.stringify(png));
    ok('G3 the same works with a mouse (pointer events cover both)', await (async()=>{ await p.evaluate(()=>pad.clear()); await stroke(p,'#cv',SCRIBBLE,'mouse'); return p.evaluate(()=>pad.hasInk()); })());
    ok('G4 Undo takes the last stroke off, Clear empties the pad, and each tells the page', await (async()=>{ await stroke(p,'#cv',[[.1,.8],[.9,.8]],'touch'); const before=await p.evaluate(()=>pad.getStrokes().length); await p.evaluate(()=>pad.undo()); const afterUndo=await p.evaluate(()=>pad.getStrokes().length); await p.evaluate(()=>pad.clear()); return before===2 && afterUndo===1 && await p.evaluate(()=>!pad.hasInk() && window.__chg>=4); })());
    ok('G5 the box stops the page scrolling while signing (touch-action: none) and is wide enough for a thumb', await p.evaluate(()=>{ const c=document.getElementById('cv'); const r=c.getBoundingClientRect(); return getComputedStyle(c).touchAction==='none' && r.width>=300 && r.height>=90; }));
    ok('G6 rotating the phone redraws the signature at the new size without losing it', await (async()=>{ await stroke(p,'#cv',SCRIBBLE,'touch'); await p.setViewportSize({width:844,height:390}); await p.evaluate(()=>{ document.getElementById('r').style.width='700px'; }); await p.waitForTimeout(250); return p.evaluate(()=>pad.hasInk() && document.getElementById('cv').width>=700); })());
    await ctx.close(); }

  // ===================== the consent form =====================
  const consentDocs=(over)=>({ [T+'consentLinks/'+TOKEN]:{status:'open',expiresAt:later(),needsDob:true,...(over&&over.link)}, [T+'consentForms/'+sha(TOKEN+':'+DOB)]:{linkId:TOKEN,clientId:'c1',status:'open',expiresAt:later(),version:'2026-11 v1',needsDob:true,...(over&&over.form)} });
  { const {p,ctx}=await page(); await p.goto(base+'/consent.html#short'); await p.waitForTimeout(400);
    ok('C1 a broken link says so, in plain words', /isn’t complete/.test(await p.innerText('#main')));
    await openAt(p,'consent.html',TOKEN);
    ok('C2 a link nobody made is shown as expired (it does not say whether it ever existed)', /has expired/.test(await p.innerText('#main'))); await ctx.close(); }
  { const {p,ctx}=await page(); await p.goto(base+'/consent.html'); await seed(p,consentDocs({link:{expiresAt:past()}})); await openAt(p,'consent.html',TOKEN); await p.reload(); await p.waitForTimeout(500);
    ok('C3 an expired link, a cancelled link and a filed one each get their own message', /has expired/.test(await p.innerText('#main')) && await (async()=>{ await seed(p,consentDocs({link:{status:'cancelled'}})); await p.reload(); await p.waitForTimeout(500); const a=/no longer active/.test(await p.innerText('#main')); await seed(p,consentDocs({link:{status:'applied'}})); await p.reload(); await p.waitForTimeout(500); return a && /already added your signed form/.test(await p.innerText('#main')); })()); await ctx.close(); }

  // the form itself
  const {p,ctx}=await page({viewport:{width:390,height:844}}); await p.goto(base+'/consent.html'); await seed(p,consentDocs()); await openAt(p,'consent.html',TOKEN);
  ok('C4 the date of birth is asked first, to keep the form private', await p.evaluate(()=>!!document.getElementById('dob-in')) && !/Informed consent/.test(await p.innerText('#main')));
  await p.fill('#dob-in','1990-01-01'); await p.click('#dob-form button'); await p.waitForTimeout(500);
  ok('C5 a wrong date of birth does not open it', /doesn’t match our records/.test(await p.innerText('#main')));
  await p.fill('#dob-in',DOB); await p.click('#dob-form button'); await p.waitForTimeout(600);
  const look=await p.evaluate(()=>{ const bar=document.querySelector('.bar-h'), css=s=>getComputedStyle(s); const first=[...document.querySelectorAll('.bar-h')].map(b=>css(b).backgroundColor); const addr=document.querySelector('.wg-addr'), foot=document.querySelector('.wg-foot');
    return { title:document.querySelector('.wg-top h1').textContent, sub:document.querySelector('.wg-top p').textContent, subColor:css(document.querySelector('.wg-top p')).color, titleColor:css(document.querySelector('.wg-top h1')).color, bars:first, addrBg:css(addr).backgroundColor, addrBorder:css(addr).borderBottomColor, help:document.querySelector('.wg-help').innerText, foot:foot.innerText, footBg:css(foot).backgroundColor, font:css(document.body).fontFamily, logo:!!document.querySelector('.wg-top img') && document.querySelector('.wg-top img').naturalWidth>0 }; });
  ok('C6 it looks like the Emergency Contacts sheet: brown title and bars, teal and ochre section bars, gold rule, the 000 banner, the Acknowledgement of Country', look.title==='Consent Form' && /Social & Emotional Wellbeing Team/.test(look.sub) && look.titleColor==='rgb(74, 38, 24)' && look.subColor==='rgb(61, 124, 136)' && look.bars.includes('rgb(74, 38, 24)') && look.bars.includes('rgb(61, 124, 136)') && look.bars.includes('rgb(154, 107, 30)') && look.addrBg==='rgb(74, 38, 24)' && look.addrBorder==='rgb(192, 138, 42)' && /000/.test(look.help) && /Acknowledgement of Country/.test(look.foot) && /Gunditjmara Peoples/.test(look.foot) && /Arial/.test(look.font) && look.logo, JSON.stringify(look));
  const body=await p.evaluate(()=>document.getElementById('main').textContent.replace(/\s+/g,' '));
  ok('C7 it explains informed consent first: told, understand, your choice, change your mind — and who can sign for someone else', /What is informed consent\?/i.test(body) && ['You are told','You understand','It’s your choice','You can change your mind'].every(t=>body.includes(t)) && /decide with all the facts/.test(body) && /parent, guardian or someone with legal authority/.test(body) && /You don’t have to sign today/.test(body));
  ok('C8 it lists the choices (one needed, the rest their own), when we might share without consent, their rights and four things to confirm', await p.evaluate(()=>document.querySelectorAll('.choice').length===6 && document.querySelectorAll('.choice.req').length===1 && document.querySelectorAll('input[data-c]').length===4) && /serious threat to your life, health or safety/.test(body) && /Health Complaints Commissioner/.test(body) && /at least 7 years/.test(body) && /needed/i.test(body) && /your choice/i.test(body));
  ok('C9 nothing is pre-ticked — every choice is the client\'s own decision', await p.evaluate(()=>![...document.querySelectorAll('#main .choice input[type=radio],#main input[data-c]')].some(i=>i.checked)));
  ok('C10 it fits a small phone: no sideways scrolling, and every control is thumb-sized', await p.evaluate(()=>{ const small=[...document.querySelectorAll('#main .opt,#main .confirm,#main .btn,#main input[type=text]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<44); return document.documentElement.scrollWidth<=window.innerWidth+1 && small.length===0; }));
  await p.click('#send'); await p.waitForTimeout(150);
  ok('C11 sending with nothing filled in lists what is missing, and sends nothing', /Please tap Yes or No for: Keeping my information/.test(await p.innerText('#send-err')) && await p.evaluate(()=>window.__pub.updates.length===0));
  const choose=async(k,v)=>p.check(`input[name="ch-${k}"][value="${v}"]`);
  await choose('collect','No'); for (const k of ['programs','audit','external','video','transport']) await choose(k,'No'); await p.click('#send'); await p.waitForTimeout(150);
  ok('C12 "No" to the one thing needed is not sent — it says to call and talk it through', /please call us on \(03\) 5561 5315/.test(await p.innerText('#send-err')) && await p.evaluate(()=>window.__pub.updates.length===0));
  await choose('collect','Yes'); await choose('programs','Yes'); await choose('video','Yes'); await p.click('#send'); await p.waitForTimeout(150);
  ok('C13 the four confirmations must each be ticked', /tap each box in “5\. Before you sign”/.test(await p.innerText('#send-err')));
  for (const el of await p.$$('input[data-c]')) await el.check(); await p.click('#send'); await p.waitForTimeout(150);
  ok('C14 a name is needed, and then a signature (drawn, or typed if they can\'t draw)', /type your full name/.test(await p.innerText('#send-err')));
  await p.fill('#sg-name','Jordan Citizen'); await p.click('#send'); await p.waitForTimeout(150);
  ok('C15 no signature drawn → it asks, and offers the typed-name tick for anyone who can\'t draw', /Please sign in the box/.test(await p.innerText('#send-err')) && /tick the box under it to use your typed name/.test(await p.innerText('#send-err')) && await p.evaluate(()=>window.__pub.updates.length===0));
  await p.check('input[name="sg-role"][value="representative"]'); await stroke(p,'#sg-canvas',SCRIBBLE,'touch'); await p.click('#send'); await p.waitForTimeout(150);
  ok('C16 signing for someone else needs how they are related', /how you are related/.test(await p.innerText('#send-err')) && await p.evaluate(()=>!document.getElementById('sg-relwrap').hidden));
  await p.check('input[name="sg-role"][value="self"]'); await p.click('#sg-undo'); await p.click('#sg-clear'); await p.click('#send'); await p.waitForTimeout(100);
  ok('C17 Clear really empties the box (a cleared signature can\'t be sent)', /Please sign in the box/.test(await p.innerText('#send-err')));
  await stroke(p,'#sg-canvas',SCRIBBLE,'touch'); await p.fill('#sg-support','Aunty Pat (support person)');
  await p.click('#send'); await p.waitForTimeout(600);
  const up=await p.evaluate(()=>window.__pub.updates);
  ok('C18 it sends one update to the form: every answer, the signature, the wording version, "submitted" — and nothing else', up.length===1 && up[0].path===T+'consentForms/'+sha(TOKEN+':'+DOB) && Object.keys(up[0].patch).sort().join()==='answers,signature,status,submittedAt,version' && up[0].patch.status==='submitted' && up[0].patch.version===(await p.evaluate(()=>WG_CONSENT.VERSION)), JSON.stringify(up.map(u=>Object.keys(u.patch))));
  const sent=up[0]&&up[0].patch;
  ok('C19 the answers are exactly the choices made (Yes/No) and the four confirmations', sent && sent.answers.collect==='Yes' && sent.answers.programs==='Yes' && sent.answers.video==='Yes' && sent.answers.audit==='No' && sent.answers.external==='No' && sent.answers.transport==='No' && ['understood','questions','voluntary','change'].every(k=>sent.answers[k]===true) && Object.keys(sent.answers).sort().join()===(await p.evaluate(()=>WG_CONSENT.KEYS.slice().sort().join())), JSON.stringify(sent&&sent.answers));
  ok('C20 the signature carries who, how, when, and a real PNG image — plus the support person', sent && sent.signature.method==='drawn' && sent.signature.name==='Jordan Citizen' && sent.signature.role==='self' && /^data:image\/png;base64,/.test(sent.signature.image) && sent.signature.image.length<60000 && !isNaN(Date.parse(sent.signature.at)) && sent.signature.supportPerson==='Aunty Pat (support person)' && !('relationship' in sent.signature), JSON.stringify(Object.keys(sent.signature)));
  const done=await p.evaluate(()=>({txt:document.getElementById('main').innerText, btn:!!document.getElementById('print-copy'), copy:document.getElementById('copy').innerText, img:document.querySelector('#copy .sigcopy img')?.src.slice(0,22)||'', ls:Object.keys(localStorage).filter(k=>k.startsWith('wg-consent'))}));
  ok('C21 the client is thanked and can save or print their own copy; nothing is left on the phone', /Thank you — your signed form has been sent/.test(done.txt) && done.btn && done.ls.length===0);
  ok('C22 the copy shows what they agreed to, what they confirmed, their signature and the version — and the Acknowledgement', /What I agreed to/.test(done.copy) && /Keeping my information[\s\S]*Yes — I agree/.test(done.copy) && /Checking quality and funding[\s\S]*No — I don’t agree/.test(done.copy) && /I confirmed that/.test(done.copy) && /Jordan Citizen/.test(done.copy) && /form version 2026-11 v1/.test(done.copy) && /Acknowledgement of Country/.test(done.copy) && done.img==='data:image/png;base64,');
  await p.click('#print-copy'); ok('C23 "Save or print my copy" prints only the copy', await p.evaluate(()=>window.__printed===1) && await p.evaluate(()=>{ const sheets=[...document.styleSheets].flatMap(s=>{ try{ return [...s.cssRules]; }catch(_){ return []; } }); const pr=sheets.find(r=>r.media&&/print/.test(r.media.mediaText)); return !!pr && /#copy\{display:block|#copy \{ display:block|display: block/.test(pr.cssText); }));
  await p.reload(); await p.waitForTimeout(500); await p.fill('#dob-in',DOB); await p.click('#dob-form button'); await p.waitForTimeout(600);
  ok('C24 opening the link again after sending shows it has been sent (and the copy is still there)', /already sent your consent form/.test(await p.innerText('#main')) && await p.evaluate(()=>!!document.getElementById('print-copy') && /Jordan Citizen/.test(document.getElementById('copy').innerText)));
  await ctx.close();

  // typed name, a representative, going offline, and being refused
  async function fill(p,over){ await p.fill('#dob-in',DOB); await p.click('#dob-form button'); await p.waitForTimeout(500);
    for (const k of ['collect','programs','audit','external','video','transport']) await p.check(`input[name="ch-${k}"][value="${(over&&over[k])||'Yes'}"]`); for (const el of await p.$$('input[data-c]')) await el.check(); }
  { const {p,ctx}=await page(); await p.goto(base+'/consent.html'); await seed(p,consentDocs()); await openAt(p,'consent.html',TOKEN); await fill(p);
    await p.fill('#sg-name','Pat Guardian'); await p.check('input[name="sg-role"][value="representative"]'); await p.fill('#sg-rel','mother'); await p.check('#sg-typed'); await p.waitForTimeout(100);
    ok('C25 "I can\'t draw" swaps the box for their typed name in a signature font', await p.evaluate(()=>document.getElementById('sg-wrap').classList.contains('is-typed') && document.getElementById('sg-typedview').textContent==='Pat Guardian' && getComputedStyle(document.getElementById('sg-canvas')).display==='none'));
    await p.click('#send'); await p.waitForTimeout(500);
    const s2=(await p.evaluate(()=>window.__pub.updates[0]||null)); const sg=s2&&s2.patch.signature;
    ok('C26 a typed signature by a representative: method typed, no image, role and relationship recorded', sg && sg.method==='typed' && !('image' in sg) && sg.name==='Pat Guardian' && sg.role==='representative' && sg.relationship==='mother', JSON.stringify(sg));
    ok('C27 the copy says it was signed for someone else, as their mother', /signing for someone else, as their mother/.test(await p.evaluate(()=>document.getElementById('copy').innerText)) && /typed name/.test(await p.evaluate(()=>document.getElementById('copy').innerText))); await ctx.close(); }
  { const {p,ctx}=await page(); await p.goto(base+'/consent.html'); await seed(p,consentDocs()); await openAt(p,'consent.html',TOKEN); await fill(p,{external:'No'});
    await p.fill('#sg-name','Jordan Citizen'); await stroke(p,'#sg-canvas',SCRIBBLE,'touch'); await p.evaluate(()=>{ window.__pub.denyUpdate='offline'; }); await p.click('#send'); await p.waitForTimeout(500);
    ok('C28 with no connection it says so, keeps the signing on screen, and saves their choices on the phone', /couldn’t send it/.test(await p.innerText('#send-err')) && await p.evaluate(()=>!!document.getElementById('sg-canvas') && Object.keys(localStorage).some(k=>k.startsWith('wg-consent'))));
    await p.evaluate(()=>{ window.__pub.denyUpdate=null; }); await p.reload(); await p.waitForTimeout(500); await p.fill('#dob-in',DOB); await p.click('#dob-form button'); await p.waitForTimeout(600);
    ok('C29 coming back, their choices are still ticked (the signature is not kept on the phone)', await p.evaluate(()=>document.querySelector('input[name="ch-external"][value="No"]').checked && document.querySelector('input[name="ch-collect"][value="Yes"]').checked && [...document.querySelectorAll('input[data-c]')].every(i=>i.checked)));
    await stroke(p,'#sg-canvas',SCRIBBLE,'touch'); await p.fill('#sg-name','Jordan Citizen'); await p.evaluate(()=>{ window.__pub.denyUpdate='refused'; }); await p.click('#send'); await p.waitForTimeout(500);
    ok('C30 a form the server refuses (expired meanwhile) is shown as expired, not as a vague error', /has expired/.test(await p.innerText('#main'))); await ctx.close(); }
  { const {p,ctx}=await page(); await p.addInitScript(()=>{ window.__spoken=[]; window.SpeechSynthesisUtterance=function(t){ this.text=t; }; Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,pending:false,speak(u){ window.__spoken.push(u.text); this.speaking=true; },cancel(){ this.speaking=false; window.__cancelled=true; }},configurable:true}); });
    await p.goto(base+'/consent.html'); await seed(p,consentDocs()); await openAt(p,'consent.html',TOKEN); await p.fill('#dob-in',DOB); await p.click('#dob-form button'); await p.waitForTimeout(600);
    const shown=await p.evaluate(()=>!document.getElementById('speak').hidden); await p.click('#speak'); const spoken=await p.evaluate(()=>window.__spoken); const label=await p.textContent('#speak'); await p.click('#speak');
    ok('C31 it reads the explanations aloud in Australian English — only the form\'s wording — and can be stopped', shown && spoken.length>=5 && /informed consent/i.test(spoken.join(' ')) && /Stop reading/.test(label) && await p.evaluate(()=>window.__cancelled===true) && !/Jordan|1985/.test(spoken.join(' ')));
    await ctx.close(); }
  { const {p,ctx}=await page({viewport:{width:360,height:740}}); await p.goto(base+'/consent.html'); await seed(p,consentDocs({link:{needsDob:false},form:{needsDob:false}})); await seed(p,{[T+'consentForms/'+sha(TOKEN+':')]:{linkId:TOKEN,clientId:'c1',status:'open',expiresAt:later(),needsDob:false}}); await openAt(p,'consent.html',TOKEN);
    ok('C33 a link made without a date of birth opens straight to the form', /what is informed consent/i.test(await p.innerText('#main')) && await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)); await ctx.close(); }

  // ===================== the intake form: signing =====================
  const intakeDocs=(over)=>({ [T+'intakeLinks/'+TOKEN]:{status:'open',expiresAt:later(),needsDob:false}, [T+'intakeForms/'+sha(TOKEN+':')]:{linkId:TOKEN,clientId:'c1',status:'open',expiresAt:later(),needsDob:false,answers:{fullName:'Jordan Citizen',phone:'0491 570 156'},...(over||{})} });
  { const {p,ctx}=await page(); await p.goto(base+'/intake.html'); await seed(p,intakeDocs()); await openAt(p,'intake.html',TOKEN);
    const lk=await p.evaluate(()=>({title:document.querySelector('.wg-top h1').textContent, bar:getComputedStyle(document.querySelector('.bar-h')).backgroundColor, foot:/Acknowledgement of Country/.test(document.querySelector('.wg-foot').innerText), help:/000/.test(document.querySelector('.wg-help').innerText), footClear:getComputedStyle(document.querySelector('.wg-foot')).paddingBottom }));
    ok('F1 the intake form has the same look: brown title and bars, the 000 banner, the Acknowledgement of Country (clear of the fixed Back/Next bar)', lk.title==='Intake Form' && lk.bar==='rgb(74, 38, 24)' && lk.foot && lk.help && parseFloat(lk.footClear)>=88, JSON.stringify(lk));
    for (let i=0;i<6;i++){ await p.click('#btn-next'); await p.waitForTimeout(120); } await p.waitForTimeout(250);
    ok('F2 at the end there is a "Sign your form" step with the box, the name, who is signing and the date', /check your answers/i.test(await p.innerText('#main')) && /sign your form/i.test(await p.innerText('#main')) && await p.evaluate(()=>!!document.getElementById('sg-canvas') && document.getElementById('sg-name').value==='Jordan Citizen' && /Date:/.test(document.querySelector('.signdate').innerText)));
    await p.click('#btn-next'); await p.waitForTimeout(150);
    ok('F3 sending without signing is refused, with the reason', /Please sign in the box/.test(await p.innerText('#send-err')) && await p.evaluate(()=>window.__pub.updates.filter(u=>u.patch.status==='submitted').length===0));
    await stroke(p,'#sg-canvas',SCRIBBLE,'touch'); await p.click('#btn-next'); await p.waitForTimeout(150);
    ok('F4 …and without ticking that the answers are true', /tick the box to confirm/.test(await p.innerText('#send-err')));
    await p.click('[data-goto="0"]'); await p.waitForTimeout(200); for (let i=0;i<6;i++){ await p.click('#btn-next'); await p.waitForTimeout(100); } await p.waitForTimeout(250);
    ok('F5 the signature is still in the box after going back to change an answer and returning', await p.evaluate(()=>{ const c=document.getElementById('sg-canvas'); const x=c.getContext('2d'); const d=x.getImageData(0,0,c.width,c.height).data; let dark=0; for(let i=0;i<d.length;i+=4){ if(d[i+3]>200 && d[i]<80) dark++; } return dark>50; }));
    await p.check('#decl'); await p.click('#btn-next'); await p.waitForTimeout(500);
    const sub=await p.evaluate(()=>window.__pub.updates.filter(u=>u.patch.status==='submitted'));
    ok('F6 sending includes the declaration and the signature (drawn PNG, name, role, time)', sub.length===1 && sub[0].patch.answers.declaration===true && sub[0].patch.signature.method==='drawn' && /^data:image\/png;base64,/.test(sub[0].patch.signature.image) && sub[0].patch.signature.name==='Jordan Citizen' && sub[0].patch.signature.role==='self' && Object.keys(sub[0].patch).sort().join()==='answers,signature,status,step,submittedAt', JSON.stringify(sub.map(u=>Object.keys(u.patch))));
    ok('F7 the client is thanked and told the signature went with it', /Your signature has been sent/.test(await p.innerText('#main'))); await ctx.close(); }
  { const {p,ctx}=await page(); await p.goto(base+'/intake.html'); await seed(p,intakeDocs()); await openAt(p,'intake.html',TOKEN); for (let i=0;i<6;i++){ await p.click('#btn-next'); await p.waitForTimeout(100); } await p.waitForTimeout(200);
    await p.check('#sg-typed'); await p.check('#decl'); await p.fill('#sg-name','  Jordan Citizen  '); await p.click('#btn-next'); await p.waitForTimeout(500);
    const sg=await p.evaluate(()=>(window.__pub.updates.filter(u=>u.patch.status==='submitted')[0]||{patch:{}}).patch.signature);
    ok('F8 a typed name works too on the intake (no image; the name is tidied)', sg && sg.method==='typed' && sg.name==='Jordan Citizen' && !('image' in sg)); await ctx.close(); }
  { const {p,ctx}=await page(); await p.goto(base+'/intake.html'); await seed(p,intakeDocs()); await openAt(p,'intake.html',TOKEN);
    ok('F9 the intake page works on a small phone (no sideways scrolling) and still saves as it goes', await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1) && await (async()=>{ await p.fill('#q-preferredName','Jordy'); await p.waitForTimeout(1600); return p.evaluate(()=>window.__pub.updates.some(u=>u.patch.status==='draft' && u.patch.answers.preferredName==='Jordy' && !('signature' in u.patch))); })()); await ctx.close(); }

  ok('Z no page errors on any client page', errs.length===0, errs.slice(0,3).join(' | '));
  await browser.close(); srv.close();
  console.log('\n=== CLIENT FORMS ON A PHONE ==='); res.forEach(r=>console.log(r[0].padEnd(5),r[1],r[2]&&r[0]!=='PASS'?'\n        → '+r[2]:''));
  console.log('\nRESULT:',res.filter(r=>r[0]==='PASS').length+'/'+res.length+' passed'); process.exit(0);
})();

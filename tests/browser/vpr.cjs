// QA — Vulnerable Persons Register: screening on the client file, automatic add/remove, the Admin page.
// Synthetic people only.
const {start}=require('./harness.cjs');
const SEED=new Function('w',`
  w('clients','a',{id:'a',fullName:'Jordan Citizen',status:'active',sewb:true,dob:'1941-03-14',gender:'Male',address:'1 Example Road, Sampleton VIC 3000',phone:'0491 570 156',ifEc1name:'Pat Citizen',ifEc1rel:'Niece',ifEc1phone:'0491 570 157',created:'2026-09-01T09:00'});
  w('clients','b',{id:'b',fullName:'Alex Sample',status:'active',sewb:true,dob:'1950-07-02',created:'2026-01-01T09:00',ifEmergencyAssist:'Yes',ifEmergencyHelp:'No'});
  w('clients','c',{id:'c',fullName:'Casey <img src=x onerror=window.__xss=1> Example',status:'active',sewb:true,dob:'1948-07-02',address:'<b>2 Test St</b>',created:'2026-01-01T09:00',
    vpr:{c1:'Yes',c2:'Yes',c3:'Yes',consent:'Yes',consentMethod:'written',consentDate:'2025-01-10',consentBy:'Sam Worker',listed:true,listedAt:'2025-01-10T10:00',comments:'<script>window.__xss=1</script>',considerations:{mobility:['Wheelchair'],equipment:['Oxygen']},history:[{at:'2025-01-10T10:00',by:'Sam Worker',action:'Added to the register',detail:'All four criteria met'}]}});
  w('clients','d',{id:'d',fullName:'Drew Closed',status:'closed',closedDate:'2026-05-01',sewb:true,created:'2025-01-01T09:00',
    vpr:{c1:'Yes',c2:'Yes',c3:'Yes',consent:'Yes',consentMethod:'verbal',consentDate:'2025-02-01',consentBy:'Sam Worker',listed:false,listedAt:'2025-02-01T10:00',removedAt:'2026-05-01T10:00',removedReason:'File closed',history:[]}});
  w('clients','e',{id:'e',fullName:'Eli Notyet',status:'active',sewb:true,created:'2026-01-01T09:00',vpr:{c1:'Yes',c2:'No',c3:'Yes'}});
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED});
  const T=()=>p.waitForTimeout(250);
  const state=id=>p.evaluate(id=>{ const c=clients.find(x=>x.id===id), v=c.vpr||{}; return { on:vprOnRegister(c), listed:!!v.listed, listedAt:v.listedAt||'', removedAt:v.removedAt||'', reason:v.removedReason||'', hist:(v.history||[]).map(h=>h.action), c:[v.c1,v.c2,v.c3], consent:v.consent, review:!!v.needsReview, status:c.status }; },id);
  const audits=re=>p.evaluate(re=>auditLog.filter(a=>new RegExp(re).test(a.action)).length,re);
  const lastToast=()=>p.evaluate(()=>window.__toasts[window.__toasts.length-1]||'');

  // ---- the Admin page ----
  ok('V1 Admin has a "Vulnerable Persons Register" item, above Audit Log', await p.evaluate(()=>{ const items=[...document.querySelectorAll('#sidebar .nav-item')].map(n=>n.textContent.trim()); const i=items.findIndex(t=>/Vulnerable Persons Register/.test(t)); return i>0 && /Audit Log/.test(items[i+1]); }));
  await p.evaluate(()=>showPage('vpr')); await T();
  const pg=await p.evaluate(()=>({ title:document.getElementById('page-title')?.textContent||document.title, txt:document.getElementById('main').innerText, on:document.getElementById('vpr-count-on')?.textContent, rows:[...document.querySelectorAll('.vpr-row')].map(r=>r.dataset.id), tabs:[...document.querySelectorAll('[data-vpr-tab]')].map(b=>b.textContent.trim()) }));
  ok('V2 the page opens and lists who is on the register (1 seeded)', pg.on==='1' && pg.rows.join()==='c' && /all four criteria/i.test(pg.txt), JSON.stringify({on:pg.on,rows:pg.rows}));
  ok('V3 it says this is not the official State register, and that help is not guaranteed', /vpr\.mecccentral\.com/.test(pg.txt) && /does not guarantee assistance/i.test(pg.txt));
  ok('V4 tabs: on register 1 · being screened 0 · not eligible 1 · removed 1 · not yet screened 2', pg.tabs.join('|')==='On the register (1)|Being screened (0)|Screened — not eligible (1)|Removed — records kept (1)|Not yet screened (2)', pg.tabs.join('|'));
  ok('V5 names, addresses and comments are shown as text, never run as HTML', await p.evaluate(()=>!window.__xss && !document.querySelector('#main img[src="x"]') && /<b>2 Test St<\/b>/.test(document.getElementById('main').innerText)));
  ok('V6 the seeded record missed its re-validation date → Unverified, and is flagged as not in the council database', await p.evaluate(()=>document.querySelector('.vpr-row[data-id=c] .vpr-pill')?.dataset.status==='unverified' && /Not entered/.test(document.querySelector('.vpr-row[data-id=c]').innerText)));
  await p.evaluate(()=>vprSetTab('removed')); await T();
  ok('V7 Removed tab keeps closed people with the date and reason', await p.evaluate(()=>{ const r=document.querySelector('.vpr-row[data-id=d]'); return !!r && /File closed/.test(r.innerText) && /closed/i.test(r.innerText); }));
  await p.evaluate(()=>vprSetTab('unscreened')); await T();
  ok('V8 Not-yet-screened tab shows the intake answers (needs help: Yes, someone nearby: No)', await p.evaluate(()=>{ const r=document.querySelector('.vpr-row[data-id=b]'); return !!r && /Yes/.test(r.cells[1].innerText) && /No/.test(r.cells[2].innerText); }));

  // ---- screening on the client file ----
  await p.evaluate(()=>openClientProfile('a','vpr')); await T();
  ok('V9 the client file has an "Emergency plan & VPR" section with the four criteria', await p.evaluate(()=>!![...document.querySelectorAll('#profile-section option')].find(o=>o.value==='vpr'&&/Emergency plan & VPR/.test(o.textContent)) && document.querySelectorAll('.vpr-crit').length===4 && /Not on the Vulnerable Persons Register/.test(document.querySelector('.vpr-status').innerText)));
  const save=async()=>{ await p.click('.save-bar .btn-primary'); await T(); };
  const setC=async(k,v)=>p.check(`input[name="vpr-${k}"][value="${v}"]`);
  await setC('c1','Yes'); await setC('c2','Yes'); await setC('c3','Yes'); await p.fill('#vpr-c1Notes','Uses a wheelchair; lives alone.'); await save();
  let s=await state('a');
  ok('V10 three criteria met but no consent → NOT on the register', !s.on && !s.listed && s.c.join()==='Yes,Yes,Yes' && /1 of 4 criteria still to be met/.test(await lastToast()), JSON.stringify(s)+' '+await lastToast());
  ok('V11 the screening stays on the section after saving, with what is missing', await p.evaluate(()=>!!document.getElementById('vpr-form') && document.querySelector('input[name="vpr-c1"]:checked')?.value==='Yes' && document.getElementById('vpr-c1Notes').value==='Uses a wheelchair; lives alone.' && /consent not recorded/.test(document.querySelector('.vpr-consent-missing')?.innerText||'')));
  await p.evaluate(()=>switchProfileTab('overview','a')); await T();
  ok('V12 the file\'s "needs attention" list prompts for consent', await p.evaluate(()=>/Meets VPR criteria 1–3 — consent still to be recorded/.test(document.getElementById('profile-tab-content').innerText)));
  await p.evaluate(()=>switchProfileTab('vpr','a')); await T();
  // consent ticked "Yes" but with no method → still not listed (non-compliant without evidence)
  await p.selectOption('#vpr-consent','Yes'); await p.fill('#vpr-consentDate',''); await save();
  s=await state('a');
  ok('V13 consent "Yes" without how/when recorded → still not listed', !s.on && /how consent was given/.test(await p.evaluate(()=>document.querySelector('.vpr-consent-missing')?.innerText||'')), JSON.stringify(s));
  await p.selectOption('#vpr-consentMethod','verbal'); await p.fill('#vpr-consentDate',await p.evaluate(()=>today())); await p.fill('#vpr-consentBy','Jon Benson');
  await p.check('.vpr-cons[value="Wheelchair"]'); await p.check('.vpr-cons[value="Oxygen"]'); await p.check('.vpr-check[data-i="0"]'); await p.check('#vpr-planDiscussed'); await p.fill('#vpr-comments','Side gate is locked — key with neighbour.'); await save();
  s=await state('a');
  ok('V14 all four criteria met → added to the register automatically', s.on && s.listed && !!s.listedAt && /added to the Vulnerable Persons Register/.test(await lastToast()), JSON.stringify(s)+' '+await lastToast());
  ok('V15 the addition is in the record\'s history and the audit log', s.hist.includes('Consent recorded') && s.hist.includes('Added to the register') && await audits('^VPR: added to register$')===1, s.hist.join(','));
  ok('V16 the file header shows "On the VPR" and the section says so', await p.evaluate(()=>!!document.getElementById('pf-vpr') && /On the Vulnerable Persons Register/.test(document.querySelector('.vpr-status.on')?.innerText||'') && document.querySelector('.vpr-status .vpr-pill')?.dataset.status==='verified'));
  ok('V17 ticked considerations and comments were saved', await p.evaluate(()=>{ const v=clients.find(x=>x.id==='a').vpr; return WG_VPR.considerationsText(v)==='Mobility: Wheelchair; Equipment, critical medication and pets: Oxygen' && v.checklist[0]===true && v.planDiscussed===true && /Side gate/.test(v.comments); }));
  await p.evaluate(()=>{ _vprTab='on'; showPage('vpr'); }); await T();
  ok('V18 the register page now lists them with address, emergency contact and considerations', await p.evaluate(()=>{ const r=document.querySelector('.vpr-row[data-id=a]'); return !!r && /1 Example Road/.test(r.innerText) && /Pat Citizen/.test(r.innerText) && /Wheelchair/.test(r.innerText) && /Side gate/.test(r.innerText) && document.getElementById('vpr-count-on').textContent==='2'; }));

  // ---- printing ----
  await p.evaluate(()=>{ window.__reports.length=0; printVprRegister(); });
  const rep=await p.evaluate(()=>window.__reports.join(''));
  ok('V19 Print register: confidential, lists the two people, escaped, and audited', /CONFIDENTIAL/.test(rep) && /Jordan Citizen/.test(rep) && /Casey &lt;img/.test(rep) && !/<img src=x/.test(rep) && !/Drew Closed/.test(rep) && await audits('^Printed Vulnerable Persons Register$')===1);
  await p.evaluate(()=>{ window.__reports.length=0; printVprConsent('a'); });
  const cf=await p.evaluate(()=>window.__reports.join(''));
  ok('V20 Print consent form: the guidance wording, pre-filled, verbal consent ticked', /Vulnerable Persons Register: Consent Form/.test(cf) && /does not guarantee assistance in an emergency/.test(cf) && /☑ <strong>Verbal consumer consent/.test(cf) && /☐ <strong>Written consumer consent/.test(cf) && /Jordan Citizen/.test(cf) && /Privacy and Data Protection Act 2014/.test(cf));

  // ---- coming off: consent withdrawn ----
  await p.evaluate(()=>openClientProfile('a','vpr')); await T();
  await p.selectOption('#vpr-consent','Withdrawn'); await save();
  s=await state('a');
  ok('V21 consent withdrawn → removed at once, reason recorded', !s.on && !s.listed && !!s.removedAt && s.reason==='Consent withdrawn' && /removed from the register — records kept/.test(await lastToast()), JSON.stringify(s));
  ok('V22 nothing is deleted: screening, notes, considerations and history are all still there', s.c.join()==='Yes,Yes,Yes' && s.hist.includes('Removed from the register') && s.hist.includes('Consent withdrawn') && await p.evaluate(()=>{ const v=clients.find(x=>x.id==='a').vpr; return v.c1Notes==='Uses a wheelchair; lives alone.' && v.considerations.mobility[0]==='Wheelchair' && !!v.listedAt; }) && await audits('^VPR: removed from register$')===1);
  await p.selectOption('#vpr-consent','Yes'); await save();
  s=await state('a');
  ok('V23 consent given again → back on the register', s.on && s.listed && !s.removedAt, JSON.stringify(s));

  // ---- coming off: file closed ----
  await p.evaluate(()=>closeClient('a')); await T();
  await p.check('#er-skip'); await p.selectOption('#er-skipreason',{index:1}); await p.selectOption('#er-reason2',{index:1});
  await p.click('#modal-container .modal-footer .btn-primary'); await p.waitForTimeout(500);
  s=await state('a');
  ok('V24 closing the file removes them from the register', s.status==='closed' && !s.on && !s.listed && s.reason==='File closed', JSON.stringify(s));
  ok('V25 …and keeps every record', s.c.join()==='Yes,Yes,Yes' && s.consent==='Yes' && s.hist.filter(h=>h==='Removed from the register').length===2 && await p.evaluate(()=>!!clients.find(x=>x.id==='a').vpr.comments));
  await p.evaluate(()=>{ _vprTab='removed'; showPage('vpr'); }); await T();
  ok('V26 they move to "Removed — records kept" and off the live list', await p.evaluate(()=>!!document.querySelector('.vpr-row[data-id=a]') && /File closed/.test(document.querySelector('.vpr-row[data-id=a]').innerText) && document.getElementById('vpr-count-on').textContent==='1'));
  await p.evaluate(()=>openClientProfile('a','vpr')); await T();
  ok('V27 the closed file still shows the full screening and history', await p.evaluate(()=>/Removed from the Vulnerable Persons Register/.test(document.querySelector('.vpr-status.off')?.innerText||'') && document.querySelectorAll('.vpr-hist').length>=5 && document.querySelector('input[name="vpr-c1"]:checked')?.value==='Yes'));

  // ---- reopened ----
  await p.evaluate(()=>reopenClient('a')); await T();
  s=await state('a');
  ok('V28 reopening puts them back on, flagged to confirm criteria and consent again', s.on && s.listed && s.review, JSON.stringify(s));
  await p.evaluate(()=>{ _vprTab='on'; showPage('vpr'); }); await T();
  ok('V29 shown as "Re-validate" until a worker confirms', await p.evaluate(()=>document.querySelector('.vpr-row[data-id=a] .vpr-pill')?.dataset.status==='revalidate'));
  await p.evaluate(()=>vprRevalidate('a')); await T();
  ok('V30 Re-validate → Verified, recorded in history and audit', await p.evaluate(()=>document.querySelector('.vpr-row[data-id=a] .vpr-pill')?.dataset.status==='verified' && clients.find(x=>x.id==='a').vpr.lastValidated===today() && clients.find(x=>x.id==='a').vpr.history.some(h=>h.action==='Re-validated')) && await audits('^VPR: re-validated$')===1);

  // ---- a criterion no longer met ----
  await p.evaluate(()=>openClientProfile('a','vpr')); await T();
  await setC('c3','No'); await p.fill('#vpr-c3Notes','Daughter has moved in next door.'); await save();
  s=await state('a');
  ok('V31 a criterion no longer met → removed, with which one', !s.on && /^Criteria not met: 3/.test(s.reason), JSON.stringify(s));

  // ---- safety: the form of one client can never save onto another ----
  await p.evaluate(()=>{ window.__before=JSON.stringify(clients.find(x=>x.id==='b').vpr||null); saveVpr('b'); });
  ok('V32 saving only ever writes the client whose form is on screen', await p.evaluate(()=>JSON.stringify(clients.find(x=>x.id==='b').vpr||null)===window.__before));

  // ---- intake + consent ----
  await p.evaluate(()=>openClientProfile('b','intake')); await T();
  ok('V33 Intake has an "Emergency planning" card with three questions', await p.evaluate(()=>['if-emergencyPlan','if-emergencyAssist','if-emergencyHelp'].every(id=>!!document.getElementById(id)) && /Emergency planning/.test(document.getElementById('profile-tab-content').innerText) && document.getElementById('if-emergencyAssist').value==='Yes'));
  ok('V34 …and prompts for a VPR screening when help is needed and nobody is nearby', await p.evaluate(()=>/complete the VPR screening/.test(document.querySelector('.vpr-intake-status')?.innerText||'')));
  ok('V35 the Consent card shows the VPR consent status', await p.evaluate(()=>/Vulnerable Persons Register consent/.test(document.querySelector('.vpr-consent-line')?.innerText||'')));
  await p.selectOption('#if-emergencyPlan','No'); await p.evaluate(()=>saveIntake('b')); await T();
  ok('V36 the emergency answers save with the intake', await p.evaluate(()=>{ const c=clients.find(x=>x.id==='b'); return c.ifEmergencyPlan==='No' && c.ifEmergencyAssist==='Yes' && c.ifEmergencyHelp==='No'; }));
  await p.evaluate(()=>{ window.__reports.length=0; printIntake('b'); });
  ok('V37 the printed intake includes emergency planning and VPR consent', await p.evaluate(()=>{ const r=window.__reports.join(''); return /Emergency planning/.test(r) && /Vulnerable Persons Register consent/.test(r); }));
  await p.evaluate(()=>openClientProfile('b','overview')); await T();
  ok('V38 that client\'s file flags "VPR screening needed"', await p.evaluate(()=>/VPR screening needed/.test(document.getElementById('profile-tab-content').innerText)));

  // ---- files: a VPR consent form is its own document type ----
  ok('V39 an uploaded "VPR consent" file is typed as the VPR consent form, not the general consent form', await p.evaluate(()=>WG_DATA_HEALTH.docTypeOf({name:'VPR consent - signed.pdf'})==='vprconsent' && WG_DATA_HEALTH.docTypeOf({name:'Vulnerable Persons Register form.pdf'})==='vprconsent' && WG_DATA_HEALTH.docTypeOf({name:'Consent form.pdf'})==='consent'));
  ok('V40 every section of the file still opens (open, on-register and closed files)', (await p.evaluate(()=>{ const out=[]; ['a','c','d'].forEach(id=>{ openClientProfile(id); [...document.querySelectorAll('#profile-section option')].forEach(o=>{ try{ switchProfileTab(o.value,id); }catch(e){ out.push(id+'/'+o.value+': '+e.message); } }); }); return out; })).length===0);
  await p.evaluate(()=>{ _vprTab='on'; showPage('vpr'); }); await T(300);
  ok('V41 the four criteria are defined at the very top of the register page, before the counts and the list', await p.evaluate(()=>{ const sec=document.getElementById('vpr-criteria'), first=document.getElementById('content').firstElementChild; const defs=[...document.querySelectorAll('#vpr-criteria .vpr-crit-def')]; const stat=document.querySelector('.stat-card'); return first===sec && defs.length===4 && defs.map(d=>d.dataset.crit).join()==='c1,c2,c3,c4' && !!(sec.compareDocumentPosition(stat)&Node.DOCUMENT_POSITION_FOLLOWING) && /All four criteria must be met/.test(sec.innerText); }));
  ok('V42 each criterion has its name and a plain-English definition (frail/impaired · cannot understand or respond · no support network · consent)', await p.evaluate(()=>{ const t=k=>document.querySelector(`#vpr-criteria .vpr-crit-def[data-crit=${k}]`)?.innerText||''; return /Frail and\/or physically or cognitively impaired/.test(t('c1')) && /extra time or help/.test(t('c1')) && /cannot understand emergency warnings/.test(t('c2')) && /nobody who could help/.test(t('c3')) && /Consents to be on the VPR/.test(t('c4')) && /No consent, no listing/.test(t('c4')); }));
  ok('V43 the "what to consider" prompts are all showing as soon as the page opens — nothing is folded away', await p.evaluate(()=>{ const box=document.querySelector('#vpr-criteria .vpr-crit-def[data-crit=c3] .vpr-consider'); const lis=[...document.querySelectorAll('#vpr-criteria .vpr-consider li')]; return !!box && /What to consider/.test(box.innerText) && /Lives alone/.test(box.innerText) && lis.length===WG_VPR.CRITERIA.reduce((n,c)=>n+c.consider.length,0) && lis.every(l=>l.offsetParent!==null) && !document.querySelector('#content details') && !window.__xss; }));
  const img=await p.evaluate(()=>new Promise(res=>{ const im=document.querySelector('.vpr-scope img'); if(!im) return res({found:false}); const fin=()=>res({found:true,src:im.getAttribute('src'),w:im.naturalWidth,alt:im.alt,cap:document.querySelector('.vpr-scope figcaption')?.innerText||''}); if(im.complete&&im.naturalWidth) return fin(); im.onload=fin; im.onerror=()=>res({found:true,src:im.getAttribute('src'),w:0}); setTimeout(fin,4000); }));
  ok('V44 the DFFH "where the register fits" diagram is on the page, loads, and credits its source', img.found && img.src==='vpr-scope.png' && img.w===619 && /Vulnerable Persons Register/.test(img.alt) && /DFFH/.test(img.cap), JSON.stringify(img));
  ok('V45 the diagram explainer is always open (no fold-out), visible, and says the register is the smallest group', await p.evaluate(()=>{ _vprTab='on'; showPage('vpr'); const d=document.querySelector('.vpr-scope'); const im=d&&d.querySelector('img'); return !!d && d.tagName!=='DETAILS' && !document.querySelector('#content details') && !!im && im.offsetParent!==null && im.getBoundingClientRect().width>200 && /smallest group/.test(d.innerText) && /all four criteria/.test(d.innerText); }));
  await done('VULNERABLE PERSONS REGISTER (manager)');

  // ---- a worker: no register page ----
  const w=await start({seed:SEED, email:'sam.worker@worngundidj.org.au'});
  await w.p.waitForTimeout(300);
  w.ok('W1 workers do not see the register in the menu', await w.p.evaluate(()=>{ const n=[...document.querySelectorAll('#sidebar .nav-item')].find(n=>/Vulnerable Persons Register/.test(n.textContent)); return !n || getComputedStyle(n).display==='none'; }));
  await w.p.evaluate(()=>showPage('vpr')); await w.p.waitForTimeout(250);
  w.ok('W2 …and cannot open it directly', await w.p.evaluate(()=>currentPage!=='vpr' && !document.getElementById('vpr-count-on')) && /managers and supervisors/.test(await w.p.evaluate(()=>window.__toasts.join('|'))));
  w.ok('W3 …or print it', await w.p.evaluate(()=>{ window.__reports.length=0; printVprRegister(); return window.__reports.length===0; }));
  await w.done('VULNERABLE PERSONS REGISTER (worker)');
  process.exit(0);
})();

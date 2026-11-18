// QA — Conflict of interest: any worker declares one on a client's file; the System Manager,
// Admins and Supervisors see the register (Admin → Conflict of Interest Register) and record how
// each is managed (don't allocate / hide the file), never the person it is about.
// Synthetic people only. (The server rules are tested in tests/rules.)
const {start}=require('./harness.cjs');
const JON='jon.benson@worngundidj.org.au', SAM='sam.worker@worngundidj.org.au', SUE='sue.supervisor@worngundidj.org.au', ADA='ada.admin@worngundidj.org.au', RITA='rita.reception@worngundidj.org.au';
const SEED=new Function('w',`
  w('staff','list',{list:[{email:'${JON}',name:'Jon Benson',role:'sysmanager'},{email:'${SAM}',name:'Sam Worker',role:'worker'},{email:'${SUE}',name:'Sue Supervisor',role:'supervisor'},{email:'${ADA}',name:'Ada Admin',role:'admin'},{email:'${RITA}',name:'Rita Reception',role:'reception'}]});
  w('workersList','list',{list:['Jon Benson','Sam Worker','Sue Supervisor']});
  w('clients','a',{id:'a',fullName:'Jordan Citizen',status:'active',sewb:true,dob:'1985-03-14',created:'2026-09-01T09:00'});
  w('clients','b',{id:'b',fullName:'Alex Sample',status:'active',sewb:true,created:'2026-09-01T09:00'});
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED});
  const W=ms=>p.waitForTimeout(ms||350);
  const dialogs=[]; p.on('dialog',d=>dialogs.push(d.message()));
  const cloud=()=>p.evaluate(()=>window.__cloud.read('teams/worngundidj/coi'));
  const signAs=async email=>{ await p.evaluate(()=>logout()); await W(700); await p.fill('#login-email',email); await p.fill('#login-pass','x'); await p.click('#login-btn'); await W(2200); };
  const navHas=()=>p.evaluate(()=>{ const n=[...document.querySelectorAll('#sidebar .nav-item')].find(x=>/Conflict of Interest Register/.test(x.textContent)); return !!n && getComputedStyle(n).display!=='none'; });
  const openFile=async(id)=>{ await p.evaluate(id=>openClientProfile(id,'coi'),id); await W(500); };

  // ---- the menu ----
  ok('K1 the System Manager has "Conflict of Interest Register" in the Admin menu', await navHas());

  // ---- a worker declares ----
  await signAs(SAM);
  ok('K2 a worker does not see the register in the menu', !(await navHas()));
  await p.evaluate(()=>showPage('coi')); await W(300);
  ok('K3 …and is turned away if they go to it — told to declare from the client\'s file', await p.evaluate(()=>currentPage==='dashboard' && window.__toasts.some(t=>/Conflict of Interest Register is for the System Manager, Admins and Supervisors/.test(t))));
  await openFile('a');
  const tab=await p.evaluate(()=>({ opt:[...document.querySelectorAll('#profile-section option')].some(o=>o.value==='coi'), txt:(document.getElementById('coi-tab')||{}).innerText||'' }));
  ok('K4 every client file has a "⚖️ Conflict of interest" section that explains what to declare and who will see it', tab.opt && /Declaring is not wrongdoing; not declaring can be/.test(tab.txt) && /Only you, and the System Manager, Admins and Supervisors/.test(tab.txt), tab.txt.slice(0,300));
  await p.click('#coi-declare-btn'); await W(250);
  const form=await p.evaluate(()=>({ person:document.getElementById('coi-person')?.disabled, me:document.getElementById('coi-person')?.textContent||'', manage:!!document.getElementById('coi-m-hideFile'), status:!!document.getElementById('coi-status'), txt:document.querySelector('#modal-container .modal-body').innerText }));
  ok('K5 the declaration form: the person is the worker themselves (they can\'t pick someone else), with connection, nature, interest and what it applies to', form.person===true && /Sam Worker \(me\)/.test(form.me) && /Connection/i.test(form.txt) && /Nature/i.test(form.txt) && /Interest \*/i.test(form.txt) && /Applies to/i.test(form.txt), JSON.stringify(form));
  ok('K6 …and no way for them to decide how it is managed — a manager or supervisor does that', !form.manage && !form.status && /reviews each declaration and records how it is managed/.test(form.txt));
  await p.evaluate(()=>handleModalSave()); await W(300);
  ok('K7 the interest must be described', /Describe the interest/.test(await p.evaluate(()=>document.getElementById('coi-error').textContent)));
  await p.selectOption('#coi-connection','family'); await p.selectOption('#coi-nature','actual'); await p.fill('#coi-interest','Jordan is my cousin. <b>not bold</b>');
  await p.evaluate(()=>handleModalSave()); await W(700);
  let cl=await cloud(); const d1=Object.values(cl)[0]||{};
  ok('K8 it is saved in the cloud as Sam\'s own declaration: open, nothing about how it is managed yet', Object.keys(cl).length===1 && d1.personEmail===SAM && d1.personName==='Sam Worker' && d1.declaredByEmail===SAM && d1.declaredByUid==='uid-'+SAM && d1.clientId==='a' && d1.status==='open' && d1.connection==='family' && d1.nature==='actual' && !('manage' in d1) && !('reviewedBy' in d1), JSON.stringify(d1));
  const mine=await p.evaluate(()=>({ txt:(document.getElementById('coi-tab')||{}).innerText||'', html:(document.getElementById('coi-tab')||{}).innerHTML||'', review:!!document.querySelector('#coi-tab .coi-review') }));
  ok('K9 Sam sees it on the file, shown as text (no HTML runs), as open — with no Review button for himself', /Jordan is my cousin\. <b>not bold<\/b>/.test(mine.txt) && !/<b>not bold<\/b>/.test(mine.html.replace(/&lt;b&gt;not bold&lt;\/b&gt;/,'')) && /Open — to review/.test(mine.txt) && !mine.review, mine.txt.slice(0,300));
  ok('K10 it is in the audit log', await p.evaluate(()=>auditLog.some(a=>a.action==='Conflict of interest declared' && /Sam Worker — Family or kinship, Actual/.test(a.detail) && a.clientId==='a')));

  // ---- the register ----
  await signAs(JON);
  const badge=await p.evaluate(()=>{ const b=document.getElementById('coi-nav-badge'); return b && b.style.display!=='none' ? b.textContent : ''; });
  ok('K11 the System Manager sees a badge on the register: 1 waiting for review', badge==='1', badge);
  await p.evaluate(()=>showPage('coi')); await W(400);
  const reg=await p.evaluate(()=>({ rows:[...document.querySelectorAll('#coi-table .coi-row')].map(r=>r.innerText), open:document.getElementById('coi-count-open').textContent, txt:document.getElementById('content').innerText }));
  ok('K12 the register lists it under "Open — to review": when, who, which client, connection and nature, the interest', reg.rows.length===1 && /Sam Worker/.test(reg.rows[0]) && /Jordan Citizen/.test(reg.rows[0]) && /Family or kinship/.test(reg.rows[0]) && /Actual/.test(reg.rows[0]) && /cousin/.test(reg.rows[0]) && /Not reviewed yet/.test(reg.rows[0]) && reg.open==='1', JSON.stringify(reg.rows));
  ok('K13 the register says who can see it, and that declarations are never deleted', /Only the System Manager, Admins and Supervisors can see this register/.test(reg.txt) && /never deleted/.test(reg.txt));
  await openFile('a'); await p.evaluate(()=>switchProfileTab('overview','a')); await W(300);
  ok('K14 on the client\'s overview, a manager is told there is a declaration to review', await p.evaluate(()=>[...document.querySelectorAll('.coi-attn')].some(r=>/Sam Worker declared a conflict of interest — review/.test(r.innerText))));
  await p.evaluate(()=>{ closeModal(); showPage('coi'); }); await W(300); await p.click('#coi-table .coi-review'); await W(250);
  const rv=await p.evaluate(()=>({ ro:document.getElementById('coi-interest').readOnly, m:!!document.getElementById('coi-m-noAllocate') && !!document.getElementById('coi-m-hideFile'), txt:document.querySelector('#modal-container .modal-body').innerText }));
  ok('K15 reviewing: the declaration can\'t be changed; the manager records how it is managed (don\'t allocate · hide the file), notes and status', rv.ro && rv.m && /can’t be changed once made/.test(rv.txt) && /The person it is about cannot change these\. Whoever does is recorded\./.test(rv.txt));
  await p.check('#coi-m-noAllocate'); await p.check('#coi-m-hideFile'); await p.fill('#coi-notes','Allocated to Sue; Sam not to attend.'); await p.selectOption('#coi-status','managed');
  await p.evaluate(()=>handleModalSave()); await W(700);
  cl=await cloud(); const d2=Object.values(cl)[0];
  ok('K16 saved: how it is managed, the notes, "managed", and who did it (their account) and when — the declaration itself unchanged', d2.status==='managed' && d2.manage.noAllocate===true && d2.manage.hideFile===true && d2.managedNotes==='Allocated to Sue; Sam not to attend.' && d2.updatedBy===JON && d2.reviewedBy==='Jon Benson' && !!d2.reviewedAt && d2.interest===d1.interest && d2.personEmail===SAM, JSON.stringify(d2));
  ok('K17 …and audited', await p.evaluate(()=>auditLog.some(a=>a.action==='Conflict of interest reviewed' && /Managed — Don’t allocate this client to them · Hide this client’s file from them/.test(a.detail))));
  // allocating him anyway
  await p.evaluate(()=>openAssignWorkersModal('a')); await W(250);
  ok('K18 the "Assign workers" window flags Sam: conflict of interest — don\'t allocate', await p.evaluate(()=>{ const l=[...document.querySelectorAll('#modal-container label')].find(x=>/Sam Worker/.test(x.textContent)); return !!l && /Conflict of interest — don’t allocate/.test(l.textContent); }));
  await p.check('.aw-worker[value="Sam Worker"]'); dialogs.length=0; await p.evaluate(()=>handleModalSave()); await W(400);
  ok('K19 allocating him asks first ("should not be allocated… allocate anyway?")', dialogs.some(m=>/Sam Worker has a declared conflict of interest with this client/.test(m) && /Allocate anyway\?/.test(m)), JSON.stringify(dialogs));
  await p.evaluate(()=>{ closeModal(); showPage('coi'); }); await W(300);
  ok('K20 …and the register flags it: "Allocated against advice" 1, with a warning naming him and the client', await p.evaluate(()=>document.getElementById('coi-count-against').textContent==='1' && /Sam Worker.*is allocated to.*Jordan Citizen/.test(document.getElementById('coi-against').innerText)));
  await p.evaluate(()=>coiSetTab('managed')); await W(200);
  ok('K21 the tabs sort it: it is now under "Managed"', await p.evaluate(()=>document.querySelectorAll('#coi-table .coi-row').length===1 && /Managed \(1\)/.test(document.querySelector('[data-coitab="managed"]').textContent)));
  // a manager's own declaration
  await openFile('b'); await p.click('#coi-declare-btn'); await W(250);
  ok('K22 a manager can record one for someone else (person list) — or for themselves', await p.evaluate(()=>!document.getElementById('coi-person').disabled && [...document.getElementById('coi-person').options].some(o=>/Sam Worker/.test(o.text)) && /Jon Benson \(me\)/.test(document.getElementById('coi-person').selectedOptions[0].text)));
  ok('K22a declaring for themselves, a manager can\'t set how it is managed — the boxes are switched off and it says another manager will review', await p.evaluate(()=>document.getElementById('coi-m-hideFile').disabled && document.getElementById('coi-status').disabled && getComputedStyle(document.getElementById('coi-self-note')).display!=='none'));
  await p.selectOption('#coi-person','sam.worker@worngundidj.org.au'); await W(100);
  ok('K22b …recording one for a worker, they can', await p.evaluate(()=>!document.getElementById('coi-m-hideFile').disabled && getComputedStyle(document.getElementById('coi-self-note')).display==='none'));
  await p.selectOption('#coi-person','jon.benson@worngundidj.org.au'); await W(100);
  await p.fill('#coi-interest','I sit on a board with Alex.'); await p.selectOption('#coi-connection','community'); await p.evaluate(()=>handleModalSave()); await W(600);
  await p.evaluate(()=>{ closeModal(); coiSetTab('open'); }); await W(300);
  ok('K23 a manager\'s own declaration goes on the register as "About you" — they can\'t review their own', await p.evaluate(()=>{ const r=[...document.querySelectorAll('#coi-table .coi-row')].find(x=>/Alex Sample/.test(x.innerText)); return !!r && /About you/.test(r.innerText) && !r.querySelector('.coi-review'); }));
  await p.evaluate(()=>{ window.__reports.length=0; printCoiRegister(); });
  const pr=await p.evaluate(()=>window.__reports.join(''));
  ok('K24 the register can be printed (marked confidential), and printing is audited', /<h1>Conflict of Interest Register<\/h1>/.test(pr) && /Sam Worker/.test(pr) && /Alex Sample/.test(pr) && /Confidential/.test(pr) && await p.evaluate(()=>auditLog.some(a=>a.action==='Printed the Conflict of Interest Register')));

  // ---- the file is hidden from Sam ----
  await signAs(SAM);
  const hid=await p.evaluate(()=>({ vis:visibleClients(clients).map(c=>c.fullName), can:canViewClient(clients.find(c=>c.id==='a')) }));
  ok('K25 with "hide the file" on, Sam no longer sees Jordan Citizen anywhere — other clients unaffected', !hid.vis.includes('Jordan Citizen') && hid.vis.includes('Alex Sample') && hid.can===false, JSON.stringify(hid));
  ok('K26 Sam only has his own declaration on his device — not Jon\'s about Alex', await p.evaluate(()=>coiList.length===1 && coiList[0].personEmail==='sam.worker@worngundidj.org.au'));

  // ---- supervisors and admins see the register; reception does not ----
  await signAs(SUE);
  ok('K27 a Supervisor has the register and can review declarations', await navHas() && await (async()=>{ await p.evaluate(()=>{ coiSetTab('open'); }); await W(300); return p.evaluate(()=>currentPage==='coi' && document.querySelectorAll('#coi-table .coi-review').length===1); })());
  await p.click('#coi-table .coi-review'); await W(250);
  await p.selectOption('#coi-status','managed'); await p.check('#coi-m-noAllocate'); await p.evaluate(()=>handleModalSave()); await W(600);
  ok('K28 …so Jon\'s own declaration gets reviewed by someone else (recorded as Sue)', Object.values(await cloud()).some(d=>d.personEmail===JON && d.status==='managed' && d.updatedBy===SUE && d.manage.noAllocate===true));
  await signAs(ADA);
  ok('K29 an Admin has the register', await navHas() && await (async()=>{ await p.evaluate(()=>showPage('coi')); await W(300); return p.evaluate(()=>currentPage==='coi' && document.querySelectorAll('#coi-table .coi-row').length>=0); })());
  await signAs(RITA);
  ok('K30 Reception does not', !(await navHas()) && await (async()=>{ await p.evaluate(()=>showPage('coi')); await W(200); return p.evaluate(()=>currentPage!=='coi'); })());
  await signAs(SAM); await openFile('b');
  ok('K31 a worker sees nothing about other people\'s declarations on a file (Jon\'s about Alex is not shown to Sam)', await p.evaluate(()=>!/I sit on a board/.test((document.getElementById('coi-tab')||{}).innerText||'') && /haven’t declared/.test((document.getElementById('coi-tab')||{}).innerText||'')));
  await p.evaluate(()=>logout()); await W(500);
  ok('K32 signing out clears the declarations from the device', await p.evaluate(()=>JSON.parse(localStorage.getItem('sewb_cms_coi')||'[]').length===0));
  await done('CONFLICT OF INTEREST');
})().catch(e=>{ console.error(e); process.exit(1); });

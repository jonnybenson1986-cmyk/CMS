// QA — "Full screen" on the client profile and the Log Session window: they can fill the whole screen
// as well as open at the normal size; the choice is remembered on the device for each kind of window.
// Synthetic people only.
const {start}=require('./harness.cjs');
const SEED=new Function('w',`
  w('clients','a',{id:'a',fullName:'Citizen Jordan',status:'active',sewb:true,keyWorker:'Jon Benson',dob:'1985-03-14',created:'2026-09-01T09:00'});
`);
(async()=>{
  const {p,ok,done}=await start({seed:SEED, width:1400, height:900});
  const W=ms=>p.waitForTimeout(ms||300);
  const box=()=>p.evaluate(()=>{ const ov=document.querySelector('#modal-container .modal-overlay'), m=ov&&ov.querySelector('.modal'), b=m&&m.querySelector('.modal-body'), f=m&&m.querySelector('.modal-footer'), r=m&&m.getBoundingClientRect();
    return ov ? { full:ov.classList.contains('modal-full'), w:Math.round(r.width), h:Math.round(r.height), top:Math.round(r.top), vw:innerWidth, vh:innerHeight, btn:(document.getElementById('modal-fs-btn')||{}).textContent||'', pressed:(document.getElementById('modal-fs-btn')||{getAttribute:()=>null}).getAttribute('aria-pressed'),
      bodyScrolls: b ? getComputedStyle(b).overflowY==='auto' : false, footBottom: f ? Math.round(f.getBoundingClientRect().bottom) : null } : null; });

  // ---- the client profile ----
  await p.evaluate(()=>openClientProfile('a')); await W(500);
  let b=await box();
  ok('S1 the client profile opens as it is now (a window, about 900px wide), with a "⛶ Full screen" button beside the close button', b && !b.full && b.w<=900 && b.w>800 && /Full screen/.test(b.btn) && b.pressed==='false', JSON.stringify(b));
  await p.click('#modal-fs-btn'); await W(200);
  b=await box();
  ok('S2 pressing it fills the whole screen — full width and height — and the button becomes "Normal size"', b.full && b.w===b.vw && b.h===b.vh && b.top===0 && /Normal size/.test(b.btn) && b.pressed==='true' && b.bodyScrolls, JSON.stringify(b));
  await p.screenshot({path:process.env.SHOT_DIR?process.env.SHOT_DIR+'/profile-full.png':'/dev/null'}).catch(()=>{});
  await p.evaluate(()=>switchProfileTab('notes','a')); await W(300);
  b=await box();
  ok('S3 it stays full screen while moving between sections of the file', b && b.full, JSON.stringify(b));
  await p.evaluate(()=>closeModal()); await W(200); await p.evaluate(()=>openClientProfile('a')); await W(500);
  b=await box();
  ok('S4 closed and opened again, the profile comes back full screen (remembered on this device)', b && b.full && /Normal size/.test(b.btn), JSON.stringify(b));
  await p.click('#modal-fs-btn'); await W(200); b=await box();
  ok('S5 "Normal size" puts it back as it was', b && !b.full && b.w<=900, JSON.stringify(b));
  await p.evaluate(()=>closeModal()); await W(200); await p.evaluate(()=>openClientProfile('a')); await W(500);
  ok('S6 …and that is remembered too', !(await box()).full);
  await p.evaluate(()=>closeModal()); await W(200);

  // ---- logging a session (time) ----
  await p.evaluate(()=>openSessionModal('a')); await W(600);
  b=await box();
  ok('S7 the Log Session window has the button too, and opens at its normal size (the profile\'s choice is kept separately)', b && !b.full && /Full screen/.test(b.btn) && b.w<=720, JSON.stringify(b));
  await p.click('#modal-fs-btn'); await W(200);
  b=await box();
  ok('S8 full screen, the Log Session window fills the screen and its Save button stays in view at the bottom', b.full && b.w===b.vw && b.h===b.vh && b.footBottom===b.vh, JSON.stringify(b));
  await p.evaluate(()=>{ rteSetContent('sm-text','','Synthetic session note'); const el=document.getElementById('sm-text'); el.value='Synthetic session note'; el.dispatchEvent(new Event('input',{bubbles:true})); });
  const before=await p.evaluate(()=>notes.length);
  await p.click('#modal-container .modal-footer .btn-primary'); await W(600);
  ok('S9 saving from full screen works as normal', await p.evaluate(b=>notes.length===b+1 && !document.querySelector('#modal-container .modal-overlay'),before), String(before));
  await p.evaluate(()=>openSessionModal('a')); await W(500);
  ok('S10 the Log Session window remembers full screen next time', (await box()).full);
  await p.evaluate(()=>closeModal()); await W(200);

  // ---- other windows are unchanged ----
  await p.evaluate(()=>{ showPage('settings'); openAddStaffModal(); }); await W(300);
  ok('S11 other windows (e.g. Add Staff Account) are unchanged — no full-screen button', await p.evaluate(()=>!!document.querySelector('#modal-container .modal') && !document.getElementById('modal-fs-btn')));
  await p.evaluate(()=>closeModal());
  // ---- on a phone ----
  await p.setViewportSize({width:390,height:800}); await p.evaluate(()=>{ showPage('dashboard'); openClientProfile('a'); }); await W(500);
  b=await box();
  const phoneNormal=b; await p.click('#modal-fs-btn'); await W(200); const phoneFull=await box();
  ok('S12 on a phone both sizes fit the screen width — full screen takes the whole phone screen — and Escape still closes it', phoneNormal && !phoneNormal.full && phoneNormal.w===390 && phoneFull.full && phoneFull.w===390 && phoneFull.h===800 && await p.evaluate(()=>{ const m=document.querySelector('#modal-container .modal').getBoundingClientRect(); return m.left>=0 && m.right<=innerWidth+1; }) && await (async()=>{ await p.keyboard.press('Escape'); await W(200); return !(await box()); })(), JSON.stringify({phoneNormal,phoneFull}));
  await done('FULL SCREEN WINDOWS');
})().catch(e=>{ console.error(e); process.exit(1); });

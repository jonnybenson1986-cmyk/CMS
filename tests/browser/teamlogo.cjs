// QA — the Spare team shows no Worn Gundidj logo anywhere: sidebar, sign-in page, printed reports and
// documents, the tab icon, and the client's own intake and consent pages. Worn Gundidj (and the Test
// team) keep it. Synthetic people only.
const {start}=require('./harness.cjs');
const SEED=new Function('w',`
  w('clients','a',{id:'a',fullName:'Citizen Jordan',status:'active',sewb:true,keyWorker:'Jon Benson',dob:'1985-03-14',created:'2026-09-01T09:00'});
`);
(async()=>{
  const {p,base,ok,done}=await start({seed:SEED});
  const W=ms=>p.waitForTimeout(ms||300);
  const look=()=>p.evaluate(()=>{ window.__reports.length=0; generateReport && document.getElementById('rpt-client-select');
    const doc=wgPrintDoc('t','Title','Sub','<p>x</p>'); const hdr=printBrandHeader().html;
    return { team:ACTIVE_TEAM, sidebarImg:!!document.querySelector('#sidebar img'), brand:(document.getElementById('team-brand')||{}).textContent||'', logo:orgLogoSrc(), docImg:/<img/.test(doc), hdrImg:/<img/.test(hdr),
      icon:(document.querySelector('link[rel="icon"]')||{}).href||'' }; });

  // ---- Worn Gundidj: unchanged ----
  let s=await look();
  ok('L1 Worn Gundidj: the logo is in the sidebar, on printed documents and report headers (unchanged)', s.team==='worngundidj' && s.sidebarImg && !!s.logo && s.docImg && s.hdrImg && !s.brand, JSON.stringify({...s,logo:s.logo.slice(0,30),icon:''}));
  const wgIcon=s.icon;

  // ---- the Spare team ----
  await p.evaluate(()=>openTeamSwitcher()); await W(200); await p.click('#team-switch-list button[data-team="spare"]'); await W(3200);
  s=await look();
  ok('L2 Spare team: no logo in the sidebar — the team\'s name instead', s.team==='spare' && !s.sidebarImg && s.brand==='Spare team', JSON.stringify({...s,icon:''}));
  ok('L3 Spare team: printed documents and report headers have no logo', !s.logo && !s.docImg && !s.hdrImg, JSON.stringify({...s,icon:''}));
  ok('L4 Spare team: the tab / app icon is the plain placeholder, not the logo', s.icon && s.icon!==wgIcon);
  await p.evaluate(()=>{ window.__reports.length=0; openClientProfile && showPage('reports'); });
  const anyImg=await p.evaluate(()=>[...document.querySelectorAll('img')].map(i=>i.src.slice(0,40)));
  ok('L5 Spare team: no logo image anywhere on the page', anyImg.length===0, JSON.stringify(anyImg));
  await p.evaluate(()=>logout()); await W(1200);
  ok('L6 Spare team: the sign-in page has no logo', await p.evaluate(()=>!!document.getElementById('login-email') && document.querySelectorAll('#main img').length===0 && /Spare team/.test(document.getElementById('main').innerText)));

  // ---- the client's own pages ----
  const page=async(path,hash)=>{ await p.goto(base+path+hash); await W(700); return p.evaluate(()=>[...document.querySelectorAll('.wg-top img')].length); };
  const tok='AbCdEfGhIjKlMnOpQrSt';
  ok('L7 intake page from a Spare team link: no logo', await page('/intake.html','#spare.'+tok)===0);
  ok('L8 consent page from a Spare team link: no logo', await page('/consent.html','#spare.'+tok)===0);
  ok('L9 the same pages from a Worn Gundidj link keep the logo', await page('/intake.html','#'+tok)===1 && await page('/consent.html','#'+tok)===1);
  ok('L10 …and from a Test team link too (only the Spare team changes)', await page('/intake.html','#test.'+tok)===1);
  await done('SPARE TEAM — NO WORN GUNDIDJ LOGO');
})().catch(e=>{ console.error(e); process.exit(1); });

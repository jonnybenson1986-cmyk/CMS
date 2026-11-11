// Quick check the rebuilt harness works: sign in, every page and every client-file section opens.
const {start}=require('./harness.cjs');
(async()=>{ const {p,ok,done}=await start({seed:w=>{ w('clients','a',{id:'a',fullName:'Jordan Citizen',status:'active',sewb:true,dob:'1985-03-14',created:'2026-09-01T09:00'}); }});
  ok('H1 signed in', /Jon Benson/.test(await p.evaluate(()=>document.querySelector('#sidebar .user-badge-bar')?.innerText||'')));
  const bad=await p.evaluate(()=>{ const out=[]; for (const pg of 'dashboard clients closedclients referrals sessions notes calendar walkins reports resources policies vpr auditlog settings sewb aod justice cultural mensgroup disability workfoundations homeownership'.split(' ')) { try{ showPage(pg); if((document.getElementById('main').innerText||'').length<20) out.push(pg); }catch(e){ out.push(pg+': '+e.message); } } return out; });
  ok('H2 every page opens', bad.length===0, bad.join(', '));
  const secs=await p.evaluate(()=>{ openClientProfile('a'); const out=[]; [...document.querySelectorAll('#profile-section option')].forEach(o=>{ try{ switchProfileTab(o.value,'a'); }catch(e){ out.push(o.value+': '+e.message); } }); return out; });
  ok('H3 every client-file section opens', secs.length===0, secs.join(', '));
  await done('HARNESS SMOKE'); process.exit(0); })();

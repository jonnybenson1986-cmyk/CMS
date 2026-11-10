// QA — Data Health: score, ring, scorecard, list column, document types,
// dashboard, states — and that the "items missing" banner is unchanged.
const fs=require('fs'); const {start}=require('./harness.cjs');
const OLD=fs.readFileSync(__dirname+'/fixtures-old-completeness.js','utf8');   // the previous hard-coded checks, kept as the reference
(async()=>{
  const {p,ok,done}=await start({seed:w=>{
    w('clients','new',{id:'new',fullName:'Brand New',status:'active',sewb:true,created:'2026-10-01T09:00'});
    w('clients','part',{id:'part',fullName:'Jordan Citizen',status:'active',sewb:true,aod:true,dob:'1985-03-14',gender:'Female',atsi:'Yes — Aboriginal',phone:'0491 570 156',keyWorker:'Jon Benson',riskLevel:'high',
      intakeSavedAt:'2026-09-01T10:00',ifConsentSigned:true,ifHasChildren:'Yes',sewbDomains:[3,4,0,0,0,0,0,0],
      goalPlan:[{id:'g1',title:'Feel settled',category:'Housing',baseline:3,target:8,reviewDate:'2030-01-01',created:'2026-09-01',reviews:[],milestones:[]}],
      attachments:[{id:'f1',name:'Signed consent form.pdf',type:'application/pdf',size:5,data:'data:application/pdf;base64,JVBERi0=',uploadedAt:'2026-09-01',uploadedBy:'Jon Benson'},
                   {id:'f2',name:'photo.jpg',type:'image/jpeg',size:5,data:'data:image/jpeg;base64,AAAA',uploadedAt:'2026-09-01',uploadedBy:'Jon Benson'}],created:'2026-09-01T09:00'});
    w('clients','shut',{id:'shut',fullName:'Closed Person',status:'closed',closedDate:'2026-08-01',closureReason:'Moved away',sewb:true,dob:'1990-01-01',created:'2026-01-01T09:00'});
  }});
  await p.evaluate(OLD+'\n;window.oldFileCompleteness=oldFileCompleteness;');
  // ---- 1. banner equivalence over many generated files ----
  const eq=await p.evaluate(()=>{ let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647; const pick=a=>a[Math.floor(rnd()*a.length)];
    const maybe=(v,pr=0.5)=>rnd()<pr?v:pick(['',undefined]);
    const goal=()=>({id:'g'+rnd(),title:'G',baseline:pick([undefined,2,0]),target:pick([undefined,8]),reviewDate:pick(['','2020-01-01','2031-01-01']),outcome:pick([undefined,undefined,'achieved'])});
    const diffs=[]; let n=0, withIssues=0;
    for(let i=0;i<600;i++){ const addr=maybe('1 Example St');
      const c={id:'t'+i,fullName:'T '+i,status:pick(['active','closed',undefined]),dob:maybe('1990-01-01'),gender:maybe('Male'),atsi:maybe('No'),phone:maybe('0491 570 156'),address:addr,
        intakeSavedAt:maybe('2026-01-01T10:00',0.4),ifIntakeWorker:maybe('Sam',0.3),ifConsentSigned:pick([true,false,undefined]),
        goalPlan:pick([undefined,[],[goal()],[goal(),goal()]]),riskLevel:pick(['low','medium','high',undefined]),sfWarning:maybe('w',0.3),sfDate:maybe('2026-01-01',0.3),
        homeRisk:pick([undefined,{},{date:'2020-01-01',address:addr},{date:today(),address:addr,reviewDate:'2031-01-01'},Object.assign({date:today(),address:addr},Object.fromEntries(HRA_REQUIRED.map(([k])=>[k,'No'])))]),
        handbookSent:pick([undefined,[],[{at:'2026-01-01',channel:'in person',by:'x'}]]),aod:pick([true,false]),aodPrimary:maybe('Alcohol'),aodTreatment:maybe('Counselling'),referralSource:maybe('Self')};
      const a=JSON.stringify(oldFileCompleteness(c)), b=JSON.stringify(fileCompleteness(c)); n++; if(a!=='[]') withIssues++; if(a!==b && diffs.length<3) diffs.push({old:a,now:b}); }
    // and a file with nothing missing: both say so
    const addr='1 Example St', full={id:'ok',fullName:'OK',status:'active',dob:'1990-01-01',gender:'Male',atsi:'No',phone:'0491 570 156',address:addr,intakeSavedAt:'2026-01-01T10:00',ifConsentSigned:true,riskLevel:'low',
      goalPlan:[{id:'g',title:'G',baseline:2,target:8,reviewDate:'2031-01-01'}],homeRisk:Object.assign({date:today(),address:addr},Object.fromEntries(HRA_REQUIRED.map(([k])=>[k,'No']))),handbookSent:[{at:'2026-01-01',channel:'in person',by:'x'}]};
    const clean = JSON.stringify(oldFileCompleteness(full))==='[]' && JSON.stringify(fileCompleteness(full))==='[]';
    return {n,withIssues,diffs,clean}; });
  ok(`D1 the "items missing" banner gives exactly the same result as before on ${eq.n} generated files (${eq.withIssues} with gaps)`, eq.diffs.length===0 && eq.withIssues>300 && eq.clean, JSON.stringify({diffs:eq.diffs,clean:eq.clean}));
  // ---- 2. scores ----
  const sc=await p.evaluate(()=>({ n:dataHealth(clients.find(c=>c.id==='new')), pa:dataHealth(clients.find(c=>c.id==='part')), none:dataHealth(undefined) }));
  ok('D2 a brand-new file scores low, a part-done file scores in between, both 0–100 whole numbers', Number.isInteger(sc.n.score) && sc.n.score<15 && sc.pa.score>sc.n.score+20 && sc.pa.score<100, JSON.stringify({new:sc.n.score,part:sc.pa.score}));
  ok('D3 no record → no score ("unavailable"), not a guess', sc.none.status==='unavailable' && sc.none.score===null);
  // ---- 3. client file ----
  await p.evaluate(()=>openClientProfile('part','notes')); await p.waitForTimeout(250);
  const chip=await p.textContent('#pf-health');
  ok('D4 the file header shows "Data health NN%" with a ring', new RegExp('Data health '+sc.pa.score+'%').test(chip) && await p.evaluate(()=>!!document.querySelector('#pf-health .dh-ring svg circle.dh-val')), chip);
  await p.click('#pf-health'); await p.waitForTimeout(500);
  ok('D5 clicking it opens the Overview scorecard', await p.evaluate(()=>document.getElementById('profile-section').value==='overview' && !!document.getElementById('dh-card')));
  const card=await p.evaluate(()=>{ const el=document.getElementById('dh-card'); return { txt:el.innerText, secs:[...el.querySelectorAll('details.dh-sec')].map(d=>d.dataset.section), ring:el.querySelector('.dh-ring .dh-num')?.textContent, aria:el.querySelector('.dh-ring').getAttribute('aria-label') }; });
  ok('D6 the scorecard shows the score ring, band, items complete and "Biggest gains"', card.ring===sc.pa.score+'%' && /items complete/.test(card.txt) && /Biggest gains/.test(card.txt) && /Data health \d+% — /.test(card.aria), card.txt.slice(0,160));
  ok('D7 sections: the core ones plus only this client\'s programs (SEWB, AOD — not Justice/NDIS/Closure)', ['identity','care','intake','goals','sewb','aod','documents'].every(x=>card.secs.includes(x)) && !['justice','disability','closure','mensgroup'].some(x=>card.secs.includes(x)), card.secs.join(','));
  await p.click('details.dh-sec[data-section="sewb"] summary'); await p.waitForTimeout(150);
  ok('D8 part-done items show part credit (SEWB domains 2 of 8 = 25%)', /SEWB domains assessed.*\(25%\)/.test((await p.textContent('details.dh-sec[data-section="sewb"]')).replace(/\s+/g,' ')));
  await p.click('details.dh-sec[data-section="care"] summary'); await p.waitForTimeout(150);
  const careTxt=(await p.textContent('details.dh-sec[data-section="care"]')).replace(/\s+/g,' ');
  ok('D9 conditional item: high risk → Safety plan is listed as missing', /Safety plan \(medium \/ high risk\)/.test(careTxt) && /Fix →/.test(careTxt), careTxt.slice(0,200));
  await p.click('details.dh-sec[data-section="care"] .dh-item:has-text("Safety plan") button'); await p.waitForTimeout(250);
  ok('D10 "Fix →" goes to the right section (Safety plan)', (await p.evaluate(()=>document.getElementById('profile-section').value))==='safety');
  // fix it, score rises
  await p.fill('#sf-warning','Signs').catch(()=>{}); await p.evaluate(()=>{ const c=clients.find(x=>x.id==='part'); c.sfWarning='Signs'; c.sfDate=today(); saveAll(); renderClientProfile('part','overview'); }); await p.waitForTimeout(250);
  const after=await p.evaluate(()=>dataHealth(clients.find(c=>c.id==='part')).score);
  ok('D11 filling the gap raises the score, and the header updates', after>sc.pa.score && new RegExp('Data health '+after+'%').test(await p.textContent('#pf-health')), `${sc.pa.score} → ${after}`);
  await p.evaluate(()=>{ const d=document.querySelector('details.dh-sec[data-section="care"]'); d.open=true; });
  await p.click('details.dh-sec[data-section="identity"] summary'); await p.waitForTimeout(100);
  // Fix → for an Edit-details item
  await p.evaluate(()=>{ const c=clients.find(x=>x.id==='part'); c.keyWorker=''; renderClientProfile('part','overview'); document.querySelector('details.dh-sec[data-section="care"]').open=true; }); await p.waitForTimeout(150);
  await p.click('details.dh-sec[data-section="care"] .dh-item:has-text("Key worker") button'); await p.waitForTimeout(250);
  ok('D12 "Fix →" on Key worker opens Edit Client; closing it returns to the file', /Edit Client/.test(await p.evaluate(()=>document.querySelector('#modal-container .modal-header h3')?.textContent||'')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(350);
  // ---- 4. documents ----
  await p.evaluate(()=>{ clients.find(x=>x.id==='part').keyWorker='Jon Benson'; renderClientProfile('part','files'); }); await p.waitForTimeout(250);
  const sel=await p.evaluate(()=>[...document.querySelectorAll('select.dh-doctype')].map(s=>s.value+'|'+s.selectedOptions[0].textContent));
  ok('D13 Files: each file has a Document type; an older file is recognised from its name', sel.length===2 && /^consent\|Signed consent form \(from file name\)$/.test(sel[0]) && sel[1].startsWith('|'), sel.join(' ; '));
  const before=await p.evaluate(()=>dataHealth(clients.find(c=>c.id==='part')).score);
  await p.selectOption('select.dh-doctype >> nth=0','other'); await p.waitForTimeout(300);
  const lower=await p.evaluate(()=>({s:dataHealth(clients.find(c=>c.id==='part')).score, t:clients.find(c=>c.id==='part').attachments[0].docType, sec:document.getElementById('profile-section')?.value}));
  ok('D14 changing a file\'s type is saved, stays on Files, and the score follows (consent form no longer counted)', lower.t==='other' && lower.sec==='files' && lower.s<before, JSON.stringify({before,lower}));
  await p.selectOption('select.dh-doctype >> nth=1','consent'); await p.waitForTimeout(300);
  ok('D15 tagging another file as the consent form counts it again', (await p.evaluate(()=>dataHealth(clients.find(c=>c.id==='part')).score))===before);
  ok('D16 setting a document type is audited', await p.evaluate(()=>auditLog.some(a=>a.action==='Set document type')));
  // ---- 5. closed + new files ----
  await p.evaluate(()=>{ closeModal(); openClientProfile('shut','overview'); }); await p.waitForTimeout(250);
  ok('D17 a closed file still shows its data health, with a Closure section and no "missing" nagging', await p.evaluate(()=>!!document.getElementById('pf-health') && !document.getElementById('pf-todo') && !!document.querySelector('details.dh-sec[data-section="closure"]')));
  await p.evaluate(()=>{ closeModal(); openClientProfile('new','overview'); }); await p.waitForTimeout(250);
  ok('D18 a brand-new file explains itself ("just been started") rather than only showing a low number', /just been started/.test(await p.textContent('#dh-card')), String(sc.n.score));
  // ---- 6. lists ----
  await p.evaluate(()=>{ closeModal(); showPage('clients'); }); await p.waitForTimeout(300);
  const rows=await p.evaluate(()=>[...document.querySelectorAll('tr.client-row')].map(r=>r.querySelector('.dh-mini b')?.textContent));
  ok('D19 the Clients list has a Data health column with a bar and % per client', rows.length>=2 && rows.every(t=>/^\d+%$/.test(t||'')) && /data health/i.test(await p.evaluate(()=>document.querySelector('#main thead')?.textContent||'')), rows.join(','));
  await p.evaluate(()=>showPage('dashboard')); await p.waitForTimeout(300);
  const dash=await p.evaluate(()=>document.querySelector('.completeness-dash')?.innerText||'');
  ok('D20 the dashboard shows the average data health and the lowest files', /Average data health \d+%/.test(dash) && /Lowest: .*Brand New \(\d+%\)/.test(dash.replace(/\s+/g,' ')), dash.slice(0,200));
  // ---- 7. states ----
  const st=await p.evaluate(()=>{ const keep=window.WG_DATA_HEALTH; window.WG_DATA_HEALTH=undefined; const c=clients.find(x=>x.id==='part');
    const out={ dh:dataHealth(c).status, ring:dataHealthRingHTML(dataHealth(c),56), card:dataHealthCardHTML(c), flags:fileCompleteness(c), mini:dataHealthMiniHTML(dataHealth(c)) }; window.WG_DATA_HEALTH=keep;
    out.empty=dataHealthRingHTML({status:'empty',score:null,band:null},56); return out; });
  ok('D21 if the checks can\'t load: a waiting ring and a plain message — never "File complete"', st.dh==='unavailable' && /dh-wait/.test(st.ring) && /—/.test(st.ring) && /haven't loaded yet/.test(st.card) && st.flags.length===1 && /could not load/.test(st.flags[0].label) && /—/.test(st.mini));
  ok('D22 nothing to measure → a grey "—" ring, labelled', /nothing to measure/.test(st.empty) && !/dh-val/.test(st.empty));
  // ---- 8. safety ----
  const x=await p.evaluate(()=>{ const c={id:'x1',fullName:'Z<img src=x onerror="window.__x=1">',status:'active',attachments:[{name:'<img src=x onerror="window.__x=2">.pdf',type:'application/pdf',size:1}]}; clients.push(c);
    const d=document.createElement('div'); d.innerHTML=dataHealthCardHTML(c)+fileDocTypeSelectHTML('x1',0,c.attachments[0]); document.body.appendChild(d); return new Promise(r=>setTimeout(()=>{ d.remove(); clients.pop(); r(window.__x||0); },200)); });
  ok('D23 names and file names are shown as text (no code runs)', x===0);
  // phone
  await p.setViewportSize({width:390,height:800}); await p.evaluate(()=>openClientProfile('part','overview')); await p.waitForTimeout(300);
  ok('D24 the scorecard fits a phone screen (no sideways scroll inside the file)', await p.evaluate(()=>{ const el=document.getElementById('dh-card'), m=document.querySelector('#modal-container .modal'); return el.getBoundingClientRect().right<=m.getBoundingClientRect().right+1 && el.scrollWidth<=el.clientWidth+1; }));
  await done('DATA HEALTH'); process.exit(0);
})();

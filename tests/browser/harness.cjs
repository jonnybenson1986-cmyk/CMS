// Shared test harness: serves site/, launches Chromium with the fake cloud, signs in.
const http=require('http'),fs=require('fs'),path=require('path');
// Playwright from the project, or a global install (cloud sessions have it at /opt/node22).
let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const {chromium}=pw;
const ROOT=process.env.QA_ROOT||path.join(__dirname,'..','..','site'); const FAKE=fs.readFileSync(__dirname+'/fakecloud.js','utf8');
const CHROME=process.env.CHROME_PATH||undefined;   // default: Playwright's own Chromium
function serve(){ return new Promise(r=>{ const srv=http.createServer((rq,rs)=>{let u=decodeURIComponent(rq.url.split('?')[0]);if(u==='/')u='/index.html';const fp=path.join(ROOT,u);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){rs.writeHead(404);rs.end();return;}rs.writeHead(200,{'content-type':u.endsWith('.html')?'text/html':u.endsWith('.js')?'application/javascript':'application/octet-stream'});fs.createReadStream(fp).pipe(rs);}); srv.listen(0,'127.0.0.1',()=>r(srv)); }); }
async function start({seed, email='jon.benson@worngundidj.org.au', width=1280, height=900}={}){
  const srv=await serve(); const base='http://127.0.0.1:'+srv.address().port; const errs=[];
  const browser=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block',timezoneId:'Australia/Melbourne'}); await ctx.addInitScript(FAKE);
  await ctx.addInitScript(()=>{ window.__reports=[]; window.print=()=>{}; window.open=()=>({document:{write:h=>window.__reports.push(h),close(){}},focus(){},print(){},close(){}});
    window.__toasts=[]; new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{ if(n.nodeType===1&&n.classList&&n.classList.contains('wg-toast')) window.__toasts.push(n.textContent); }))).observe(document,{childList:true,subtree:true}); });
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>{const u=r.request().url(); if(u.includes('/vendor/firebase/')||!u.startsWith(base)) return r.abort(); return r.continue();});
  await p.goto(base+'/index.html');
  await p.evaluate(seed=>{ localStorage.clear(); window.__cloud.reset(); const T='teams/worngundidj/', w=(c,id,d)=>window.__cloud.write(T+c,id,d);
    w('staff','list',{list:[{email:'jon.benson@worngundidj.org.au',name:'Jon Benson',role:'sysmanager'},{email:'sam.worker@worngundidj.org.au',name:'Sam Worker',role:'worker'}]});
    (new Function('w',seed||''))(w); }, seed ? `(${seed.toString()})(w)` : '');
  await p.reload(); await p.waitForTimeout(700);
  await p.fill('#login-email',email); await p.fill('#login-pass','x'); await p.click('#login-btn'); await p.waitForTimeout(1600);
  const res=[]; const ok=(n,c,d)=>res.push([c?'PASS':'FAIL',n,d||'']);
  const done=async title=>{ ok('Z no page errors', errs.length===0, errs.slice(0,3).join(' | ')); await browser.close(); srv.close();
    console.log('\n=== '+title+' ==='); res.forEach(r=>console.log(r[0].padEnd(5),r[1],r[2]&&r[0]!=='PASS'?'\n        → '+r[2]:''));
    console.log('\nRESULT:',res.filter(r=>r[0]==='PASS').length+'/'+res.length+' passed'); };
  return { p, base, errs, ok, done, browser };
}
module.exports={ start };

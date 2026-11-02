// Stand-in for Firebase (Firestore + Auth + Storage) for browser tests. Data
// persists across reloads in sessionStorage. Nothing can be read until someone
// signs in (like the real rules); anonymous sign-in is disabled.
(function(){
  const KEY='__FAKE_CLOUD', AKEY='__FAKE_AUTH';
  const load=()=>{ try{ return JSON.parse(sessionStorage.getItem(KEY)||'{}'); }catch(e){ return {}; } };
  const save=c=>sessionStorage.setItem(KEY, JSON.stringify(c));
  const clone=o=>o===undefined?undefined:JSON.parse(JSON.stringify(o));
  const meta={ fromCache:false, hasPendingWrites:false };
  const listeners=[];
  const permErr=()=>Object.assign(new Error('Missing or insufficient permissions.'),{code:'permission-denied'});
  const mkUser=email=>({ uid:'uid-'+email, email, emailVerified:true, isAnonymous:false, getIdTokenResult:()=>Promise.resolve({claims:{}}), getIdToken:()=>Promise.resolve('tok'), reload:()=>Promise.resolve(), multiFactor:{ enrolledFactors:[] } });
  const saved=sessionStorage.getItem(AKEY);
  const auth={ currentUser: saved?mkUser(saved):null,
    onAuthStateChanged:cb=>{ setTimeout(()=>cb(auth.currentUser),0); return ()=>{}; },
    signInAnonymously:()=>Promise.reject(Object.assign(new Error('auth/operation-not-allowed'),{code:'auth/operation-not-allowed'})),
    signOut:()=>{ auth.currentUser=null; sessionStorage.removeItem(AKEY); return Promise.resolve(); },
    signInWithEmailAndPassword:email=>{ const e=String(email).toLowerCase(); auth.currentUser=mkUser(e); sessionStorage.setItem(AKEY,e); return Promise.resolve({user:auth.currentUser}); },
    sendPasswordResetEmail:()=>Promise.resolve() };
  const denied=()=>!auth.currentUser;
  const applyVal=(cur,v)=>{ if(v&&typeof v==='object'&&v.__fv==='inc') return (+cur||0)+v.n; if(v&&typeof v==='object'&&v.__fv==='ts') return new Date().toISOString(); return clone(v); };
  const write=(path,id,data,merge)=>{ const c=load(); c[path]=c[path]||{}; const cur=c[path][id];
    const out = merge&&cur ? Object.assign({},cur) : {};
    Object.keys(data||{}).forEach(k=>{ const v=data[k]; if(v&&typeof v==='object'&&v.__fv==='del') delete out[k]; else out[k]=applyVal(out[k],v); });
    c[path][id]=out; save(c); notify(path); };
  const del=(path,id)=>{ const c=load(); if(c[path]) delete c[path][id]; save(c); notify(path); };
  const docSnap=(path,id)=>{ const d=(load()[path]||{})[id]; return { id, exists:!!d, data:()=>d?clone(d):undefined, metadata:meta, ref:docRef(path+'/'+id) }; };
  const match=(d,f)=>{ const v=d[f.f]; if(f.op==='=='||f.op==='===') return v===f.v; if(f.op==='array-contains') return Array.isArray(v)&&v.includes(f.v); if(f.op==='in') return f.v.includes(v); if(f.op==='>=') return v>=f.v; if(f.op==='<=') return v<=f.v; if(f.op==='>') return v>f.v; if(f.op==='<') return v<f.v; if(f.op==='!=') return v!==f.v; return true; };
  const querySnap=(path,filters)=>{ const c=load()[path]||{}; const docs=Object.keys(c).filter(id=>(filters||[]).every(f=>match(c[id],f))).map(id=>docSnap(path,id));
    return { empty:!docs.length, size:docs.length, docs, metadata:meta, forEach:f=>docs.forEach(f), docChanges:()=>docs.map(d=>({type:'added',doc:d})) }; };
  function notify(path){ setTimeout(()=>listeners.filter(l=>l.path===path).forEach(l=>{ try{ l.cb(l.id?docSnap(path,l.id):querySnap(path,l.filters)); }catch(e){ console.error(e); } }),0); }
  function colRef(path,filters){ return { path, id:path.split('/').pop(),
    doc:id=>docRef(path+'/'+(id||('auto'+Math.random().toString(36).slice(2)))),
    where:(f,op,v)=>colRef(path,[...(filters||[]),{f,op,v}]), orderBy:()=>colRef(path,filters), limit:()=>colRef(path,filters), limitToLast:()=>colRef(path,filters), startAfter:()=>colRef(path,filters),
    get:()=>denied()?Promise.reject(permErr()):Promise.resolve(querySnap(path,filters)),
    add:d=>{ if(denied()) return Promise.reject(permErr()); const id='auto'+Math.random().toString(36).slice(2); write(path,id,d,false); return Promise.resolve(docRef(path+'/'+id)); },
    onSnapshot:(cb,err)=>{ if(denied()){ setTimeout(()=>err&&err(permErr()),0); return ()=>{}; } const l={path,filters,cb}; listeners.push(l); setTimeout(()=>cb(querySnap(path,filters)),0); return ()=>{ const i=listeners.indexOf(l); if(i>=0) listeners.splice(i,1); }; } }; }
  function docRef(full){ const i=full.lastIndexOf('/'), path=full.slice(0,i), id=full.slice(i+1);
    return { path:full, id, parent:{path},
      collection:n=>colRef(full+'/'+n),
      get:()=>denied()?Promise.reject(permErr()):Promise.resolve(docSnap(path,id)),
      set:(d,o)=>{ if(denied()) return Promise.reject(permErr()); write(path,id,d,!!(o&&o.merge)); return Promise.resolve(); },
      update:d=>{ if(denied()) return Promise.reject(permErr()); write(path,id,d,true); return Promise.resolve(); },
      delete:()=>{ if(denied()) return Promise.reject(permErr()); del(path,id); return Promise.resolve(); },
      onSnapshot:(cb,err)=>{ if(denied()){ setTimeout(()=>err&&err(permErr()),0); return ()=>{}; } const l={path,id,cb}; listeners.push(l); setTimeout(()=>cb(docSnap(path,id)),0); return ()=>{ const k=listeners.indexOf(l); if(k>=0) listeners.splice(k,1); }; } }; }
  const db={ collection:n=>colRef(n), doc:p=>docRef(p),
    batch:()=>{ const ops=[]; return { set:(r,d,o)=>ops.push(['set',r,d,o]), update:(r,d)=>ops.push(['set',r,d,{merge:true}]), delete:r=>ops.push(['del',r]),
      commit:()=>{ if(denied()) return Promise.reject(permErr()); ops.forEach(([k,r,d,o])=>{ const i=r.path.lastIndexOf('/'); if(k==='del') del(r.path.slice(0,i),r.path.slice(i+1)); else write(r.path.slice(0,i),r.path.slice(i+1),d,!!(o&&o.merge)); }); return Promise.resolve(); } }; },
    runTransaction:fn=>fn({ get:r=>r.get(), set:(r,d,o)=>r.set(d,o), update:(r,d)=>r.update(d), delete:r=>r.delete() }),
    settings:()=>{}, enablePersistence:()=>Promise.resolve(), enableIndexedDbPersistence:()=>Promise.resolve() };
  const apps=[];
  const fb={ apps,
    initializeApp:cfg=>{ const a={ name:'[DEFAULT]', options:cfg, delete:()=>{ const i=apps.indexOf(a); if(i>=0) apps.splice(i,1); return Promise.resolve(); } }; apps.push(a); return a; },
    app:()=>apps[apps.length-1]||fb.initializeApp({}),
    firestore:()=>db, auth:()=>auth,
    storage:()=>({ ref:()=>({ child:()=>({ put:()=>({ on:(ev,prog,err)=>setTimeout(()=>err(new Error('no storage')),0), then:(a,b)=>Promise.reject(new Error('no storage')).then(a,b), catch:f=>Promise.reject(new Error('no storage')).catch(f) }), getDownloadURL:()=>Promise.reject(new Error('no storage')), delete:()=>Promise.resolve() }) }) }) };
  fb.firestore.FieldValue={ serverTimestamp:()=>({__fv:'ts'}), increment:n=>({__fv:'inc',n}), delete:()=>({__fv:'del'}), arrayUnion:(...a)=>a, arrayRemove:()=>[] };
  fb.firestore.Timestamp={ now:()=>({ toDate:()=>new Date(), toMillis:()=>Date.now() }), fromDate:d=>({ toDate:()=>d, toMillis:()=>d.getTime() }) };
  Object.defineProperty(window,'firebase',{ value:fb, writable:false, configurable:false });
  window.__cloud={ read:p=>load()[p]||{}, write:(p,id,d)=>write(p,id,d,false), reset:()=>{ sessionStorage.removeItem(KEY); sessionStorage.removeItem(AKEY); } };
})();

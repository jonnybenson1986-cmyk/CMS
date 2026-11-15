// Stand-in for Firebase for the CLIENT-facing pages (intake.html, consent.html), which have no sign-in.
// Documents are kept by full path in sessionStorage, so they survive the page reloading (the form
// reloads itself when the link changes). window.__pub.seed({path: doc}) adds documents; every update is
// logged in window.__pub.updates; window.__pub.denyUpdate = 'offline' | 'refused' | null makes updates fail.
// (The real rules are tested separately, against the emulator, in tests/rules.)
(function () {
  const KEY = '__PUB', clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const st = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || { docs: {}, updates: [], deny: null }; } catch (_) { return { docs: {}, updates: [], deny: null }; } };
  const sv = s => sessionStorage.setItem(KEY, JSON.stringify(s));
  window.__pub = {
    seed(docs) { const s = st(); Object.assign(s.docs, clone(docs)); sv(s); },
    get docs() { return st().docs; }, get updates() { return st().updates; },
    get denyUpdate() { return st().deny; }, set denyUpdate(v) { const s = st(); s.deny = v; sv(s); },
  };
  function docRef(path) {
    return {
      path,
      collection: n => colRef(path + '/' + n),
      get: async () => { const d = st().docs[path]; return { exists: !!d, data: () => d ? clone(d) : undefined }; },
      update: async patch => {
        const s = st();
        if (s.deny) throw Object.assign(new Error(s.deny === 'offline' ? 'Failed to fetch' : 'denied'), { code: s.deny === 'offline' ? 'unavailable' : 'permission-denied' });
        s.updates.push({ path, patch: clone(patch) }); s.docs[path] = Object.assign({}, s.docs[path], clone(patch)); sv(s);
      },
    };
  }
  function colRef(path) { return { doc: id => docRef(path + '/' + id) }; }
  const db = { collection: n => colRef(n), useEmulator() {} };
  Object.defineProperty(window, 'firebase', { value: { initializeApp() {}, firestore: () => db }, writable: false, configurable: false });
})();

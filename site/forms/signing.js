// Worn Gundidj — signing on the client forms (intake.html, consent.html).
//
//   WG_SIGN.blockHTML({ prefix })        the "Sign here" block: who is signing, their
//                                         name, a signature box, and the typed-name
//                                         alternative for anyone who can't draw
//   WG_SIGN.mount(rootEl, { prefix, name, keep })
//                                         wires it up → { value(), validate(), ... }
//   WG_SIGN.createPad(canvas, opts)      the signature pad on its own
//
// The pad takes a finger, a stylus or a mouse (pointer events), so the form can be
// signed on a phone, a tablet or a computer. The saved signature is a small
// transparent PNG (600 × 200) — a few kilobytes — kept with the form.
//
// What is saved with a signature (the Firestore rules allow exactly these keys):
//   method        'drawn' | 'typed'
//   name          who signed (the typed name is the signature when method = 'typed')
//   image         data:image/png;base64,…  (drawn signatures only)
//   at            when it was signed (ISO time on the signer's device)
//   role          'self' | 'representative'
//   relationship  if role = 'representative': how they are related
//   supportPerson optional: a support person or interpreter who was there
//
// No dependencies; runs in the browser and (for tests) in Node without a DOM.
(function (root) {
  'use strict';
  const INK = '#111827';
  const EXPORT_W = 600, EXPORT_H = 200;     // saved image size
  const PEN = 2.6;                          // pen width in CSS px on screen (scaled up in the saved image)
  const MIN_TRAVEL = 30;                    // CSS px of pen travel before it counts as a signature
  const MAX_NAME = 120, MAX_REL = 80;
  const SIG_KEYS = ['method', 'name', 'image', 'at', 'role', 'relationship', 'supportPerson'];

  function createPad(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    let strokes = [], cur = null, w = 1, h = 1, dpr = 1;
    const emit = () => { if (opts.onChange) { try { opts.onChange(); } catch (_) {} } };

    function drawStrokes(c, W, H, lw) {
      c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = lw;
      strokes.forEach(s => {
        if (!s.length) return;
        if (s.length === 1) { c.beginPath(); c.arc(s[0].x * W, s[0].y * H, lw / 2, 0, Math.PI * 2); c.fill(); return; }
        c.beginPath(); c.moveTo(s[0].x * W, s[0].y * H);
        for (let i = 1; i < s.length - 1; i++) c.quadraticCurveTo(s[i].x * W, s[i].y * H, (s[i].x + s[i + 1].x) / 2 * W, (s[i].y + s[i + 1].y) / 2 * H);
        const last = s[s.length - 1]; c.lineTo(last.x * W, last.y * H); c.stroke();
      });
    }
    function redraw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // the guide line and the "x" are on screen only — not in the saved image
      ctx.save(); ctx.strokeStyle = '#cdbfae'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(w * 0.05, h * 0.74); ctx.lineTo(w * 0.95, h * 0.74); ctx.stroke(); ctx.restore();
      drawStrokes(ctx, w, h, PEN);
    }
    function size() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.max(1, Math.min(3, root.devicePixelRatio || 1));
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      redraw();
    }
    const pt = e => { const r = canvas.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))), y: Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1))) }; };
    function down(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      cur = [pt(e)]; strokes.push(cur); redraw();
    }
    function move(e) {
      if (!cur) return; e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      (evs && evs.length ? evs : [e]).forEach(ev => cur.push(pt(ev)));
      redraw();
    }
    function up() { if (!cur) return; cur = null; emit(); }
    const noScroll = e => e.preventDefault();
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('touchstart', noScroll, { passive: false }); canvas.addEventListener('touchmove', noScroll, { passive: false });
    const onResize = () => size();
    root.addEventListener('resize', onResize);
    let ro = null; if (root.ResizeObserver) { ro = new root.ResizeObserver(size); ro.observe(canvas); }
    size();

    const api = {
      // Has something been drawn that is long enough to be a signature?
      hasInk() {
        let len = 0;
        strokes.forEach(s => { for (let i = 1; i < s.length; i++) len += Math.hypot((s[i].x - s[i - 1].x) * w, (s[i].y - s[i - 1].y) * h); });
        return len >= MIN_TRAVEL;
      },
      clear() { strokes = []; cur = null; redraw(); emit(); },
      undo() { strokes.pop(); redraw(); emit(); },
      // The saved signature: a small transparent PNG, '' if nothing was drawn.
      toDataURL() {
        if (!api.hasInk()) return '';
        const c = document.createElement('canvas'); c.width = EXPORT_W; c.height = EXPORT_H;
        drawStrokes(c.getContext('2d'), EXPORT_W, EXPORT_H, PEN * EXPORT_W / w);
        return c.toDataURL('image/png');
      },
      getStrokes() { return JSON.parse(JSON.stringify(strokes)); },     // kept in memory by the page, so going back and forward doesn't lose it
      setStrokes(s) { strokes = Array.isArray(s) ? s : []; redraw(); },
      resize: size,
      destroy() {
        canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
        canvas.removeEventListener('touchstart', noScroll); canvas.removeEventListener('touchmove', noScroll);
        root.removeEventListener('resize', onResize); if (ro) ro.disconnect();
      },
    };
    return api;
  }

  const dateLabel = () => new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  function blockHTML(o) {
    const p = (o && o.prefix) || 'sg';
    return `<div class="signblock" id="${p}-block">
      <fieldset class="f"><legend>Who is signing?</legend>
        <div class="opts">
          <label class="opt"><input type="radio" name="${p}-role" value="self" checked> <span>I’m signing for myself</span></label>
          <label class="opt"><input type="radio" name="${p}-role" value="representative"> <span>I’m signing for someone else, as their parent, guardian or authorised representative</span></label>
        </div></fieldset>
      <div class="f" id="${p}-relwrap" hidden><label for="${p}-rel">How are you related to them?</label><input type="text" id="${p}-rel" maxlength="${MAX_REL}" autocomplete="off" placeholder="For example: mother, guardian, carer"></div>
      <div class="f"><label for="${p}-name">Your full name</label><input type="text" id="${p}-name" maxlength="${MAX_NAME}" autocomplete="name"></div>
      <div class="f"><label for="${p}-support">Support person or interpreter <span style="font-weight:400">(if someone helped you)</span></label><input type="text" id="${p}-support" maxlength="${MAX_NAME}" autocomplete="off"></div>
      <div class="f"><label id="${p}-padlabel">Your signature</label>
        <p class="help" id="${p}-padhelp">Sign inside the box with your finger, a stylus or a mouse.</p>
        <div class="sigwrap" id="${p}-wrap">
          <canvas id="${p}-canvas" role="img" aria-labelledby="${p}-padlabel" aria-describedby="${p}-padhelp"></canvas>
          <span class="sig-x" aria-hidden="true">✕</span>
          <div class="typed" id="${p}-typedview" aria-live="polite"></div>
        </div>
        <div class="sigtools"><button type="button" class="btn link" id="${p}-undo">Undo</button><button type="button" class="btn link" id="${p}-clear">Clear</button></div>
        <label class="opt"><input type="checkbox" id="${p}-typed"> <span>I can’t draw a signature on this device. Use my typed name instead.</span></label>
      </div>
      <p class="signdate">Date: <strong>${dateLabel()}</strong></p>
    </div>`;
  }

  // Wire the block up inside rootEl. `keep` is an object the page owns: what was entered is
  // saved into it, and restored from it, so the block survives the page being redrawn.
  function mount(rootEl, o) {
    o = o || {}; const p = o.prefix || 'sg', keep = o.keep || {};
    const $ = id => rootEl.querySelector('#' + p + '-' + id);
    const roleEls = [...rootEl.querySelectorAll(`input[name="${p}-role"]`)];
    const wrap = $('wrap'), typed = $('typed'), name = $('name'), rel = $('rel'), support = $('support'), view = $('typedview');
    const pad = createPad($('canvas'), { onChange: store });
    const role = () => (roleEls.find(r => r.checked) || {}).value || 'self';
    function show() {
      const isTyped = typed.checked;
      wrap.classList.toggle('is-typed', isTyped);
      view.textContent = name.value.trim();
      $('relwrap').hidden = role() !== 'representative';
      $('undo').hidden = $('clear').hidden = isTyped;
      $('padhelp').textContent = isTyped ? 'Your typed name below will be used as your signature.' : 'Sign inside the box with your finger, a stylus or a mouse.';
      if (!isTyped) pad.resize();
    }
    function store() {
      keep.role = role(); keep.rel = rel.value; keep.name = name.value; keep.support = support.value; keep.typed = typed.checked; keep.strokes = pad.getStrokes();
    }
    // restore, else default the name
    if (keep.role) { const r = roleEls.find(x => x.value === keep.role); if (r) r.checked = true; }
    rel.value = keep.rel || ''; support.value = keep.support || ''; typed.checked = !!keep.typed;
    name.value = keep.name != null ? keep.name : (typeof o.name === 'function' ? o.name() : o.name || '') || '';
    if (keep.strokes) pad.setStrokes(keep.strokes);
    [name, rel, support, typed].forEach(el => el.addEventListener(el === typed ? 'change' : 'input', () => { show(); store(); }));
    roleEls.forEach(r => r.addEventListener('change', () => { show(); store(); }));
    $('undo').addEventListener('click', () => pad.undo());
    $('clear').addEventListener('click', () => pad.clear());
    show();
    return {
      pad,
      // '' when the block is complete, otherwise what is missing — in plain words
      validate() {
        if (!name.value.trim()) return 'Please type your full name.';
        if (role() === 'representative' && !rel.value.trim()) return 'Please say how you are related to the person you are signing for.';
        if (!typed.checked && !pad.hasInk()) return 'Please sign in the box. If you can’t draw a signature on this device, tick the box under it to use your typed name instead.';
        return '';
      },
      value() {
        if (this.validate()) return null;
        const out = { method: typed.checked ? 'typed' : 'drawn', name: name.value.trim().slice(0, MAX_NAME), at: new Date().toISOString(), role: role() };
        if (!typed.checked) out.image = pad.toDataURL();
        if (role() === 'representative') out.relationship = rel.value.trim().slice(0, MAX_REL);
        if (support.value.trim()) out.supportPerson = support.value.trim().slice(0, MAX_NAME);
        return out;
      },
      focus() { (name.value.trim() ? $('canvas') : name).focus && (name.value.trim() ? $('canvas') : name).focus(); },
      destroy() { store(); pad.destroy(); },
    };
  }
  root.WG_SIGN = { createPad, blockHTML, mount, SIG_KEYS, MAX_NAME, MAX_REL, EXPORT_W, EXPORT_H, VERSION: 1 };
})(typeof window !== 'undefined' ? window : globalThis);

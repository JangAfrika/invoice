/* Signing documents: draw, upload or type a signature. IM.getSignature(title) resolves to a PNG data URL, or null.
   The dialog is added to the page the first time it is needed. */
(function () {
  const IM = (window.IM = window.IM || {});
  const $ = (id) => document.getElementById(id);
  const SIG_FONTS = ['Dancing Script', 'Great Vibes', 'Allura', 'Caveat'];
  const sg = { tab: 'draw', ink: '#0b1f4d', strokes: [], cur: null, upload: null, font: SIG_FONTS[0], resolve: null };
  let canvas, ctx, ready = false;

  const DIALOG = `
  <dialog id="sigDialog">
    <div class="dlg">
      <h3 id="sgTitle">Sign document</h3>
      <div class="info">Choose how to create your signature. It is added above the signature line.</div>
      <div class="sg-saved" id="sgSaved" hidden>
        <img id="sgSavedImg" alt="Saved signature">
        <div class="col">
          <button type="button" class="primary" id="sgUseSaved">Use saved signature</button>
          <button type="button" class="linkbtn" id="sgForget">Remove saved signature</button>
        </div>
      </div>
      <div class="sg-tabs">
        <button type="button" class="active" data-sg="draw">Draw</button>
        <button type="button" data-sg="upload">Upload</button>
        <button type="button" data-sg="type">From my name</button>
      </div>
      <div class="sg-ink" id="sgInk">Ink
        <button type="button" data-ink="#0b1f4d" style="background:#0b1f4d" title="Navy" class="on"></button>
        <button type="button" data-ink="#111111" style="background:#111111" title="Black"></button>
        <button type="button" data-ink="#1a3fc0" style="background:#1a3fc0" title="Blue"></button>
      </div>
      <div data-panel="draw">
        <canvas id="sgCanvas" width="900" height="300"></canvas>
        <div class="sg-row">
          <span>Sign with your mouse, finger or stylus</span>
          <span><button type="button" id="sgUndo">Undo</button> <button type="button" id="sgClear">Clear</button></span>
        </div>
      </div>
      <div data-panel="upload" hidden>
        <input type="file" id="sgFile" accept="image/*">
        <label class="check" style="margin:10px 0 0"><input type="checkbox" id="sgRemoveBg" checked> Remove the white background</label>
        <div class="sg-prev" id="sgUpPrev">Your uploaded signature appears here</div>
      </div>
      <div data-panel="type" hidden>
        <input id="sgText" type="text" maxlength="40" placeholder="Type your name" autocomplete="off">
        <div class="sg-fonts" id="sgFonts"></div>
      </div>
      <label class="check" style="margin-bottom:6px"><input type="checkbox" id="sgRemember" checked> Remember this signature on this device</label>
      <div class="err" id="sgError" role="alert"></div>
      <div class="btns">
        <button type="button" id="sgCancel">Cancel</button>
        <button type="button" class="primary" id="sgApply">Apply signature</button>
      </div>
    </div>
  </dialog>`;

  /* ---- saved signature (per user, on this device) ---- */
  const key = () => 'im_sig:' + (IM.user ? IM.user.id : '');
  IM.savedSignature = () => { try { return localStorage.getItem(key()) || ''; } catch (e) { return ''; } };
  IM.forgetSignature = () => { try { localStorage.removeItem(key()); } catch (e) { /* ignore */ } };
  const store = (url) => { try { localStorage.setItem(key(), url); } catch (e) { /* storage blocked */ } };

  /* ---- drawing ---- */
  function drawStroke(c, st) {
    const pts = st.pts;
    if (!pts.length) return;
    c.strokeStyle = st.ink; c.fillStyle = st.ink;
    c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    if (pts.length < 3) {
      c.arc(pts[0].x, pts[0].y, 2.5, 0, Math.PI * 2); c.fill();
      if (pts.length === 2) { c.moveTo(pts[0].x, pts[0].y); c.lineTo(pts[1].x, pts[1].y); c.stroke(); }
      return;
    }
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    c.stroke();
  }
  function redraw() { ctx.clearRect(0, 0, canvas.width, canvas.height); sg.strokes.forEach((st) => drawStroke(ctx, st)); }
  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  }

  /* ---- any canvas -> tight transparent PNG ---- */
  function trim(src) {
    const w = src.width, h = src.height;
    const px = src.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const m = 8, cw = x1 - x0 + 1 + m * 2, ch = y1 - y0 + 1 + m * 2;
    const k = Math.min(1, 800 / cw, 300 / ch);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
    out.getContext('2d').drawImage(src, x0 - m, y0 - m, cw, ch, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  function fromImage(img, removeBg) {
    const k = Math.min(1, 1000 / img.width, 400 / img.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, c.width, c.height);
    if (removeBg) {
      const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const a = lum > 235 ? 0 : lum > 190 ? Math.round(((235 - lum) / 45) * 255) : 255;
        d[i + 3] = Math.min(d[i + 3], a);
      }
      x.putImageData(id, 0, 0);
    }
    return c;
  }
  function uploadPreview() {
    if (!sg.upload) { $('sgUpPrev').textContent = 'Your uploaded signature appears here'; return; }
    const url = trim(fromImage(sg.upload, $('sgRemoveBg').checked));
    $('sgUpPrev').innerHTML = url ? `<img src="${url}" alt="">` : 'No signature found in that image.';
  }

  async function fromText(text, font, ink) {
    const size = 120;
    try { await document.fonts.load(`${size}px "${font}"`, text); } catch (e) { /* falls back to cursive */ }
    const c = document.createElement('canvas');
    const fontCss = `${size}px "${font}", cursive`;
    c.getContext('2d').font = fontCss;
    c.width = Math.ceil(c.getContext('2d').measureText(text).width) + 100; c.height = size * 2;
    const x = c.getContext('2d');
    x.font = fontCss; x.fillStyle = ink; x.textBaseline = 'middle';
    x.fillText(text, 50, size);
    return c;
  }
  function drawFontChoices() {
    const text = $('sgText').value.trim() || 'Your name';
    $('sgFonts').innerHTML = SIG_FONTS.map((f) => `
      <label class="${f === sg.font ? 'on' : ''}">
        <input type="radio" name="sgFont" value="${IM.esc(f)}" ${f === sg.font ? 'checked' : ''}>
        <span style="font-family:'${IM.esc(f)}',cursive;color:${sg.ink}">${IM.esc(text)}</span>
      </label>`).join('');
  }

  function showTab(tab) {
    sg.tab = tab;
    document.querySelectorAll('.sg-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.sg === tab));
    document.querySelectorAll('#sigDialog [data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    $('sgInk').hidden = tab === 'upload';
    $('sgError').textContent = '';
    if (tab === 'type') drawFontChoices();
  }

  function finish(url) {
    const done = sg.resolve;
    sg.resolve = null;
    if ($('sigDialog').open) $('sigDialog').close();
    if (done) done(url);
  }

  function init() {
    if (ready) return;
    ready = true;
    // signature fonts, only on pages that sign
    if (!document.querySelector('link[data-sigfonts]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.dataset.sigfonts = '1';
      l.href = 'https://fonts.googleapis.com/css2?family=Allura&family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&display=swap';
      document.head.appendChild(l);
    }
    document.body.insertAdjacentHTML('beforeend', DIALOG);
    canvas = $('sgCanvas');
    ctx = canvas.getContext('2d');

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      $('sgError').textContent = '';
      canvas.setPointerCapture(e.pointerId);
      sg.cur = { ink: sg.ink, pts: [point(e)] };
      sg.strokes.push(sg.cur);
      redraw();
    });
    canvas.addEventListener('pointermove', (e) => { if (!sg.cur) return; sg.cur.pts.push(point(e)); redraw(); });
    ['pointerup', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, () => { sg.cur = null; }));
    $('sgUndo').addEventListener('click', () => { sg.strokes.pop(); redraw(); });
    $('sgClear').addEventListener('click', () => { sg.strokes = []; redraw(); });

    $('sgFile').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { $('sgError').textContent = 'Please choose an image file (PNG or JPG).'; return; }
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => { sg.upload = img; $('sgError').textContent = ''; uploadPreview(); };
        img.onerror = () => { $('sgError').textContent = 'That image could not be read.'; };
        img.src = String(r.result);
      };
      r.readAsDataURL(f);
    });
    $('sgRemoveBg').addEventListener('change', uploadPreview);
    $('sgText').addEventListener('input', drawFontChoices);
    $('sgFonts').addEventListener('change', (e) => { if (e.target.name === 'sgFont') { sg.font = e.target.value; drawFontChoices(); } });

    document.querySelectorAll('.sg-tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.sg)));
    $('sgInk').addEventListener('click', (e) => {
      const c = e.target.dataset.ink;
      if (!c) return;
      sg.ink = c;
      $('sgInk').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.ink === c));
      sg.strokes.forEach((st) => { st.ink = c; });
      redraw();
      drawFontChoices();
    });

    $('sigDialog').addEventListener('close', () => finish(null));
    $('sgCancel').addEventListener('click', () => finish(null));
    $('sgUseSaved').addEventListener('click', () => finish(IM.savedSignature() || null));
    $('sgForget').addEventListener('click', () => { IM.forgetSignature(); $('sgSaved').hidden = true; });

    $('sgApply').addEventListener('click', async () => {
      const err = (m) => { $('sgError').textContent = m; };
      let url = null;
      try {
        if (sg.tab === 'draw') {
          if (!sg.strokes.length) return err('Draw your signature in the box first.');
          url = trim(canvas);
        } else if (sg.tab === 'upload') {
          if (!sg.upload) return err('Choose an image of your signature first.');
          url = trim(fromImage(sg.upload, $('sgRemoveBg').checked));
        } else {
          const text = $('sgText').value.trim();
          if (!text) return err('Type your name first.');
          url = trim(await fromText(text, sg.font, sg.ink));
        }
      } catch (e) { return err('Could not create the signature: ' + e.message); }
      if (!url) return err('No signature was found. Please try again.');
      if ($('sgRemember').checked) store(url);
      finish(url);
    });
  }

  IM.getSignature = function (title) {
    init();
    return new Promise((resolve) => {
      sg.resolve = resolve;
      $('sgTitle').textContent = title || 'Sign document';
      $('sgError').textContent = '';
      sg.strokes = []; sg.cur = null; sg.upload = null;
      redraw();
      $('sgFile').value = '';
      uploadPreview();
      $('sgText').value = IM.user ? IM.user.name : '';
      const saved = IM.savedSignature();
      $('sgSaved').hidden = !saved;
      if (saved) $('sgSavedImg').src = saved;
      showTab('draw');
      $('sigDialog').showModal();
    });
  };
})();

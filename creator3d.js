// Making your own character, in the lobby before walking about: gender (and skin tone), then the
// hair or a hijab, the top, the bottom and the shoes, one step at a time, with the character
// turning on its own little stage beside the choices (drag to turn it yourself).
// A hijab or a pashmina is one model in any colour: ready-made swatches, or a colour wheel.
// openCreator() resolves with the finished look, or null if the guest backs out of the first step.
import * as THREE from 'three';
import { loadManifest, loadKit, createAvatar, choices, defaultLook, tidyLook, savedLook, saveLook, tintable, SLOTS } from './avatar3d.js';

const STEPS = [
  { key: 'gender', title: 'Kamu datang sebagai', short: 'Gender' },
  { key: 'Head', title: 'Rambut atau hijab', titleMale: 'Rambut & peci', short: 'Rambut' },
  { key: 'Top', title: 'Atasan', short: 'Atasan' },
  { key: 'Bottom', title: 'Bawahan', short: 'Bawahan' },
  { key: 'Shoes', title: 'Sepatu', short: 'Sepatu' },
];
// where the stage's camera looks on each step: [height looked at, distance]
const FRAME = { gender: [0.88, 4.4], Head: [1.56, 1.7], Top: [1.2, 2.5], Bottom: [0.62, 3.0], Shoes: [0.2, 2.0] };

export function openCreator() {
  const box = document.getElementById('creator');
  const canvas = document.getElementById('creatorCanvas');
  const stepsEl = document.getElementById('creatorSteps');
  const titleEl = document.getElementById('creatorTitle');
  const optsEl = document.getElementById('creatorOptions');
  const back = document.getElementById('creatorBack');
  const next = document.getElementById('creatorNext');
  const loadingEl = document.getElementById('creatorLoading');
  if (!box || !canvas) return Promise.resolve(null);

  return loadManifest().then((M) => new Promise((resolve) => {
    // the look being made, and what each gender had last, so switching back and forth loses nothing
    const start = tidyLook(M, savedLook());
    const looks = { female: defaultLook(M, 'female'), male: defaultLook(M, 'male') };
    looks[start.gender] = start;
    let gender = start.gender;
    let step = 0;

    // ---------- the stage
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a2f28, 1.25));
    const key = new THREE.DirectionalLight(0xffe2bd, 1.5);
    key.position.set(1.5, 3, 2.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc9b4ff, 0.6);
    rim.position.set(-2, 2, -2);
    scene.add(rim);
    // a soft gold disc to stand on
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 48), new THREE.MeshBasicMaterial({ color: 0xcba15c, transparent: true, opacity: 0.22 }));
    disc.rotation.x = -Math.PI / 2;
    scene.add(disc);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    const turntable = new THREE.Group();
    scene.add(turntable);
    const cam = { y: FRAME.gender[0], d: FRAME.gender[1] };
    let spin = 0.5, spinVel = 0, dragging = null, idle = 0, spinTo = null;
    // turn back round to face the guest (a little to one side), the short way
    const faceFront = () => { spinTo = Math.round((spin - 0.35) / (2 * Math.PI)) * 2 * Math.PI + 0.35; spinVel = 0; idle = 0; };

    const avatars = {}; // one per gender, made on first use
    let shown = null;
    function avatarFor(g) {
      if (!avatars[g]) {
        avatars[g] = loadKit(g).then((kit) => {
          const a = createAvatar(kit, M);
          a.play('Idle');
          return a;
        });
      }
      return avatars[g];
    }
    function refresh() {
      const g = gender;
      loadingEl.hidden = !!(shown && shown.g === g);
      avatarFor(g).then((a) => {
        if (g !== gender || closed) return;
        loadingEl.hidden = true;
        a.wear(looks[g]);
        if (!shown || shown.a !== a) {
          if (shown) shown.a.root.removeFromParent();
          turntable.add(a.root);
          shown = { g, a };
        }
      }).catch(() => { loadingEl.textContent = 'Gagal memuat. Coba muat ulang halaman.'; });
    }

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const clock = new THREE.Clock();
    let closed = false, raf = 0;
    function frame() {
      if (closed) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      resize();
      // slowly turning on its own, unless the guest has just been turning it
      idle += dt;
      if (spinTo !== null) {
        spin += (spinTo - spin) * (1 - Math.pow(0.004, dt));
        if (Math.abs(spinTo - spin) < 0.01) spinTo = null;
      } else if (!dragging) {
        spin += spinVel * dt;
        spinVel *= Math.pow(0.04, dt);
        if (idle > 4) spin += dt * 0.35;
      }
      turntable.rotation.y = spin;
      const [ty, td] = FRAME[STEPS[step].key];
      const k = 1 - Math.pow(0.02, dt);
      cam.y += (ty - cam.y) * k;
      cam.d += (td - cam.d) * k;
      camera.position.set(0, cam.y + 0.08, cam.d);
      camera.lookAt(0, cam.y, 0);
      if (shown) shown.a.update(dt);
      renderer.render(scene, camera);
    }

    // drag (or swipe) the stage to turn the character
    const onDown = (e) => { spinTo = null; dragging = { x: e.clientX, id: e.pointerId, t: performance.now() }; canvas.setPointerCapture(e.pointerId); idle = 0; };
    const onMove = (e) => {
      if (!dragging || e.pointerId !== dragging.id) return;
      const dx = e.clientX - dragging.x, now = performance.now();
      spin += dx * 0.012;
      spinVel = (dx * 0.012) / Math.max(0.008, (now - dragging.t) / 1000);
      dragging.x = e.clientX; dragging.t = now; idle = 0;
    };
    const onUp = () => { dragging = null; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    // ---------- the steps
    function option(label, swatch, on, pick, extra) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'creator-opt' + (extra ? ' ' + extra : '');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (swatch) {
        const dot = document.createElement('span');
        dot.className = 'creator-dot';
        dot.style.background = swatch;
        b.appendChild(dot);
      }
      b.appendChild(document.createTextNode(label));
      b.addEventListener('click', () => { pick(); idle = 0; render(true); refresh(); });
      return b;
    }
    // ---------- colouring a part: swatches, and a wheel (hue round it, strength out from the middle)
    // with a brightness slider beside it. Dragging repaints the character as it goes.
    function colorPicker(slot, item) {
      const look = looks[gender];
      const now = () => look.colors[slot] || item.tint;
      const box = document.createElement('div');
      box.className = 'creator-colors';
      const row = document.createElement('div');
      row.className = 'creator-swatches';
      const swatches = (item.colors || []).map((hex) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'creator-swatch';
        b.style.background = hex;
        b.setAttribute('aria-label', hex);
        b.addEventListener('click', () => set(hex, true));
        row.appendChild(b);
        return { b, hex };
      });
      box.appendChild(row);
      const wheelWrap = document.createElement('div');
      wheelWrap.className = 'creator-wheel';
      const wheel = document.createElement('canvas');
      wheel.width = wheel.height = 300;
      wheel.setAttribute('aria-label', 'Roda warna');
      const mark = document.createElement('span');
      mark.className = 'creator-wheel-mark';
      wheelWrap.append(wheel, mark);
      const side = document.createElement('div');
      side.className = 'creator-wheel-side';
      const chip = document.createElement('span');
      chip.className = 'creator-chip';
      const light = document.createElement('input');
      light.type = 'range'; light.min = '8'; light.max = '100';
      light.className = 'creator-light';
      const lightLabel = document.createElement('label');
      lightLabel.className = 'creator-light-label';
      lightLabel.textContent = 'Terang';
      lightLabel.appendChild(light);
      side.append(chip, lightLabel);
      const wheelRow = document.createElement('div');
      wheelRow.className = 'creator-wheel-row';
      wheelRow.append(wheelWrap, side);
      box.appendChild(wheelRow);

      let [h, sat, val] = toHsv(now());
      function drawWheel() {
        const g = wheel.getContext('2d'), n = wheel.width, r = n / 2;
        const img = g.createImageData(n, n), d = img.data;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const dx = x - r, dy = y - r, dist = Math.hypot(dx, dy) / r, i = (y * n + x) * 4;
            if (dist > 1) { d[i + 3] = 0; continue; }
            const [R, G, B] = fromHsv(((Math.atan2(dy, dx) / (2 * Math.PI)) + 1) % 1, dist, val);
            d[i] = R; d[i + 1] = G; d[i + 2] = B;
            d[i + 3] = dist > 0.985 ? Math.round(((1 - dist) / 0.015) * 255) : 255; // a soft edge
          }
        }
        g.putImageData(img, 0, 0);
      }
      function show() {
        const hex = now();
        chip.style.background = hex;
        chip.textContent = hex.toUpperCase();
        chip.style.color = val > 0.6 && sat < 0.5 ? '#211a10' : '#f2ece1';
        light.value = String(Math.round(val * 100));
        const a = h * 2 * Math.PI;
        mark.style.left = `${50 + Math.cos(a) * sat * 50}%`;
        mark.style.top = `${50 + Math.sin(a) * sat * 50}%`;
        mark.style.background = hex;
        for (const w of swatches) w.b.setAttribute('aria-pressed', w.hex.toLowerCase() === hex.toLowerCase() ? 'true' : 'false');
        // the chosen hijab's own dot follows along
        const dot = optsEl.querySelector('.creator-opt[aria-pressed="true"][data-tint] .creator-dot');
        if (dot) dot.style.background = hex;
      }
      function set(hex, fromSwatch) {
        look.colors[slot] = hex.toLowerCase();
        if (fromSwatch) { [h, sat, val] = toHsv(hex); drawWheel(); }
        idle = 0;
        show();
        if (shown && shown.g === gender) shown.a.wear(look);
      }
      const pickAt = (e) => {
        const r = wheel.getBoundingClientRect();
        const dx = ((e.clientX - r.left) / r.width) * 2 - 1, dy = ((e.clientY - r.top) / r.height) * 2 - 1;
        h = ((Math.atan2(dy, dx) / (2 * Math.PI)) + 1) % 1;
        sat = Math.min(1, Math.hypot(dx, dy));
        set(toHex(fromHsv(h, sat, val)));
      };
      let drag = null;
      wheel.addEventListener('pointerdown', (e) => { drag = e.pointerId; wheel.setPointerCapture(e.pointerId); pickAt(e); });
      wheel.addEventListener('pointermove', (e) => { if (drag === e.pointerId) pickAt(e); });
      const stop = () => { drag = null; };
      wheel.addEventListener('pointerup', stop);
      wheel.addEventListener('pointercancel', stop);
      light.addEventListener('input', () => { val = Number(light.value) / 100; drawWheel(); set(toHex(fromHsv(h, sat, val))); });
      drawWheel();
      show();
      return box;
    }

    function group(name, items) {
      if (name) {
        const h = document.createElement('p');
        h.className = 'creator-group';
        h.textContent = name;
        optsEl.appendChild(h);
      }
      const wrap = document.createElement('div');
      wrap.className = 'creator-grid';
      items.forEach((i) => wrap.appendChild(i));
      if (items.length === 1 && items[0].classList.contains('creator-colors')) wrap.className = 'creator-colors-wrap';
      optsEl.appendChild(wrap);
    }
    function render(keepScroll) {
      const s = STEPS[step];
      stepsEl.innerHTML = '';
      STEPS.forEach((t, i) => {
        const li = document.createElement('li');
        li.textContent = t.short;
        if (i === step) li.className = 'is-on';
        else if (i < step) li.className = 'is-done';
        stepsEl.appendChild(li);
      });
      titleEl.textContent = gender === 'male' && s.titleMale ? s.titleMale : s.title;
      optsEl.innerHTML = '';
      const look = looks[gender];
      if (s.key === 'gender') {
        group(null, [
          option('Perempuan', null, gender === 'female', () => { gender = 'female'; }, 'is-big'),
          option('Laki-laki', null, gender === 'male', () => { gender = 'male'; }, 'is-big'),
        ]);
        group('Warna kulit', choices(M, gender, 'Skin').map((c) => option(c.label, c.swatch, look.parts.Skin === c.id, () => { look.parts.Skin = c.id; })));
      } else if (s.key === 'Head' && gender === 'female') {
        const all = choices(M, gender, 'Head');
        const pick = (c) => {
          const on = look.parts.Head === c.id;
          const b = option(c.label, (on && look.colors.Head) || c.swatch, on, () => { look.parts.Head = c.id; });
          if (c.tint) b.dataset.tint = '1';
          return b;
        };
        group('Hijab', all.filter((c) => c.kind === 'hijab').map(pick));
        const t = tintable(M, gender, look, 'Head');
        if (t) group('Warna ' + t.label.toLowerCase(), [colorPicker('Head', t)]);
        group('Rambut', all.filter((c) => c.kind === 'hair').map(pick));
      } else if (s.key === 'Head') {
        // men: the hair, then a peci (or none) over it
        group(null, choices(M, gender, 'Head').map((c) => option(c.label, c.swatch, look.parts.Head === c.id, () => { look.parts.Head = c.id; })));
        const hats = choices(M, gender, 'Hat');
        if (hats.length) {
          group('Peci', [option('Tanpa peci', null, !look.parts.Hat, () => { look.parts.Hat = null; }),
            ...hats.map((c) => option(c.label, c.swatch, look.parts.Hat === c.id, () => { look.parts.Hat = c.id; }))]);
        }
      } else {
        group(null, choices(M, gender, s.key).map((c) => option(c.label, c.swatch, look.parts[s.key] === c.id, () => { look.parts[s.key] = c.id; })));
      }
      back.textContent = step === 0 ? 'Batal' : 'Kembali';
      next.textContent = step === STEPS.length - 1 ? 'Selesai' : 'Lanjut';
      if (!keepScroll) optsEl.scrollTop = 0;
    }
    function close(result) {
      closed = true;
      cancelAnimationFrame(raf);
      back.removeEventListener('click', onBack);
      next.removeEventListener('click', onNext);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      box.classList.add('is-going');
      document.body.classList.remove('is-creating');
      setTimeout(() => {
        box.hidden = true;
        box.classList.remove('is-going');
        for (const p of Object.values(avatars)) p.then((a) => a.dispose()).catch(() => {});
        renderer.dispose();
      }, 350);
      resolve(result);
    }
    function onBack() {
      if (step === 0) return close(null);
      step--; render(); faceFront();
    }
    function onNext() {
      if (step < STEPS.length - 1) { step++; render(); faceFront(); return; }
      const made = looks[gender];
      const colors = {};
      for (const slot of SLOTS) if (made.colors[slot] && tintable(M, gender, made, slot)) colors[slot] = made.colors[slot];
      const look = { gender, parts: { ...made.parts }, colors };
      saveLook(look);
      window.dispatchEvent(new CustomEvent('character:made', { detail: look }));
      // a little celebration before handing back to the lobby
      if (shown) shown.a.play('Happy');
      faceFront();
      next.disabled = back.disabled = true;
      setTimeout(() => { next.disabled = back.disabled = false; close(look); }, 1300);
    }
    back.addEventListener('click', onBack);
    next.addEventListener('click', onNext);

    loadingEl.textContent = 'Memuat karakter…';
    box.hidden = false;
    document.body.classList.add('is-creating'); // the music button would sit on the Next button
    render();
    refresh();
    resize();
    frame();
    // the other gender too, in the background, so switching is instant
    avatarFor(gender === 'female' ? 'male' : 'female').catch(() => {});
  }));
}

// ---------- colour helpers: #rrggbb <-> hue, saturation, value (each 0..1)
function toHsv(hex) {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, max ? d / max : 0, max];
}
function fromHsv(h, s, v) {
  const f = (n) => { const k = (n + h * 6) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
  return [f(5), f(3), f(1)];
}
function toHex([r, g, b]) { return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join(''); }

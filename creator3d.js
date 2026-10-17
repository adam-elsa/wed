// Making your own character, in the lobby before walking about: gender (and skin tone), then the
// hair or a hijab, the top, the bottom and the shoes, one step at a time, with the character
// turning on its own little stage beside the choices (drag to turn it yourself).
// openCreator() resolves with the finished look, or null if the guest backs out of the first step.
import * as THREE from 'three';
import { loadManifest, loadKit, createAvatar, choices, defaultLook, tidyLook, savedLook, saveLook } from './avatar3d.js';

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
      b.addEventListener('click', () => { pick(); idle = 0; render(); refresh(); });
      return b;
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
      optsEl.appendChild(wrap);
    }
    function render() {
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
        const pick = (c) => option(c.label, c.swatch, look.parts.Head === c.id, () => { look.parts.Head = c.id; });
        group('Hijab', all.filter((c) => c.kind === 'hijab').map(pick));
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
      optsEl.scrollTop = 0;
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
      const look = { gender, parts: { ...looks[gender].parts } };
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

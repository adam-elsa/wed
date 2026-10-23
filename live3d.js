// The wedding day in the ballroom, as it happens. On Saturday 24 October 2026 (by the clock in
// Jakarta) the room follows the real day, moment by moment, from the rundown Adam approved
// (rundown.js, from adam-elsa/wedding-rundown), keeping to what happens in this room: set for the
// akad and empty until Adam walks in with his parents at 12.30; the serah terima, Elsa walked in,
// the ijab kabul and "Sah!"; sungkeman, photos and everyone out to the lobby; a break while the
// room is turned round; guests coming in at 16.00, the grand entrance, the speech and doa, the
// cake, the two of us walking the room, the congratulations line, the photos and the close.
//
// The rundown is written in "story seconds" (the whole day in three minutes, as in the video).
// To follow the clock, each beat of the day starts at its time (the time written against it, or
// its share of its moment's time) and plays at the video's pace; then the room holds until the
// next beat is due. Nobody freezes mid-step in a hold: whoever is still walking carries on to
// where they were going, and waits there for the room to catch up. On any other day the room is
// as it always is (ballroom3d.js's guests, couple3d.js's couple on the pelaminan); ?at=13:05 in a
// link plays the day from 13.05, on any day, to see it before it comes.
//
// Once the day is over (18.05 in Jakarta, and every day after) the room goes back to how it
// always is, and the card offers to relive the day: the whole of it, from the akad to the close,
// at the video's pace (about four and a half minutes), with a button for each of its big moments.
//
// The people are the creator's parts (avatar3d.js), dressed as the rundown says. Everyone but the
// two of us is one merged mesh per person, like guests3d.js's crowd, to keep a hundred of them
// cheap; Adam and Elsa are full avatars, all day in what they wear in our photos
// (couple3d.js). Everyone seated sits up straight, legs together. On screen: a card with the time and what is happening, name tags, and what
// people say, in Indonesian or English.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadManifest, loadKit, createAvatar, tintable } from './avatar3d.js';
import { makeGroom, makeBride } from './couple3d.js';
import { posture, sitUp } from './guests3d.js';
import * as R from './rundown.js';

const L = window.L || ((id) => id);
const DAY = '2026-10-24';
const WIB = 7 * 60;          // Jakarta: UTC+7, all year
const FAR = 16;              // metres: further than this, animate every third frame
const KEEP = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];

// ---------- the day, in this room ----------
// Only what happens in the ballroom: the morning (getting ready upstairs, and the video's
// overview before it) is left out, as are the beats that happen elsewhere.
const ELSEWHERE = new Set(['Intan & Nisa welcome them in the lobby, with souvenirs', 'Parents pray ashar in between']);
const MOMENTS = R.MOMENTS.filter((m) => m.t >= 22).map((m) => ({ ...m, beats: m.beats.filter((b) => !ELSEWHERE.has(b[2])) }));
const momentAt = (t) => MOMENTS.reduce((m, x) => (t >= x.t ? x : m), MOMENTS[0]);
// Everyone seated sits up properly, legs together and hands on the knees (the pack's skirt
// poses, which suit anyone), not slumped back with a knee crossed.
const FORMAL = { Sit: 'Sit_Skirt', Sit_M: 'Sit_Skirt', Sit_F: 'Sit_Skirt', SitTalk_M: 'SitTalk_Skirt', SitTalk_F: 'SitTalk_Skirt' };
const formal = (clip) => (clip && FORMAL[clip]) || clip;
const main = (p) => (p.prev && p.w < 0.5 ? p.prev : p.clip);
const seated = (p) => /^Sit/.test(main(p));
// That pose was made on the women's figure: on anyone the right arm swings out from the lap.
// Sitting quietly, the right arm copies the left (mirrored), so the hands rest together.
function mirrorArms(bones) {
  for (const n of ['Shoulder', 'Arm', 'ForeArm', 'Hand']) {
    const l = bones[`Left${n}`], r = bones[`Right${n}`];
    if (l && r) r.quaternion.set(l.quaternion.x, -l.quaternion.y, -l.quaternion.z, l.quaternion.w);
  }
}

// ---------- the clock ----------
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const END = toMin(MOMENTS[MOMENTS.length - 1].clock[1]); // the close: after this, the day is over
// where the day is in Jakarta: { min } on the wedding day (minutes past midnight), { over } on any
// day after it, {} before it
function clock() {
  const at = new URLSearchParams(window.location.search).get('at');
  const m = at && /^(\d{1,2})[.:](\d{2})$/.exec(at);
  if (m) {
    const from = Number(m[1]) * 60 + Number(m[2]), t0 = performance.now();
    return () => ({ min: from + (performance.now() - t0) / 60000 });
  }
  return () => {
    const now = Date.now() + WIB * 60000;
    const date = new Date(now).toISOString().slice(0, 10);
    return date > DAY ? { over: true } : date < DAY ? {} : { min: (now % 86400000) / 60000 };
  };
}

// Where each beat of the day starts: { real (minutes), story }. A beat with no time of its own
// gets its share of its moment, and never less than the beat before it needs to play out.
function anchors() {
  const out = [];
  const push = (real, story) => {
    const prev = out[out.length - 1];
    if (prev) {
      if (story <= prev.story) return;
      real = Math.max(real, prev.real + (R.toVideo(story) - R.toVideo(prev.story)) / 60);
    }
    out.push({ real, story });
  };
  MOMENTS.forEach((m, i) => {
    const r0 = toMin(m.clock[0]);
    const r1 = i + 1 < MOMENTS.length ? toMin(MOMENTS[i + 1].clock[0]) : toMin(m.clock[1]);
    push(r0, m.t);
    for (const [s, c] of m.beats) push(c ? toMin(c) : r0 + ((s - m.t) / (m.end - m.t)) * (r1 - r0), s);
  });
  // the end: everyone still there (at DURATION itself the rundown has popped them all away)
  push(toMin(MOMENTS[MOMENTS.length - 1].clock[1]), R.DURATION - 0.4);
  return out;
}

// The rundown moves people from one place to another (a seat to the photo line, say) by giving
// them a key there at a later time; in between it would glide them slowly across the room, and
// run the glide into their last walk. A stretch slower than anyone walks is a jump: stay put,
// then be there.
function jumps(keys) {
  const out = [keys[0]];
  for (let i = 1; i < keys.length; i++) {
    const a = out[out.length - 1], b = keys[i];
    const dist = Math.hypot(b[1] - a[1], b[2] - a[2]), dt = b[0] - a[0];
    if (dist > 0.5 && dist / dt < 0.9 && b[4] !== 1) out.push([b[0] - 0.002, a[1], a[2], a[3]]); // nobody walks slower than 1 m/s
    out.push(b);
  }
  return out;
}

// The plan for the whole day, worked out once: the beats, and for each actor how far ahead of
// the room it may be at the start of each stretch (still finishing a walk from the last hold).
function plan(cast) {
  const A = anchors();
  const moving = (a, t) => R.popScale(a.show, t) > 0.01 && R.along(a.keys, t).moving;
  const stillFrom = (a, s) => {
    for (let t = s; t < R.DURATION; t += 0.1) if (!moving(a, t)) return t;
    return R.DURATION;
  };
  const n = cast.length;
  let lead = new Float32Array(n).fill(-Infinity);
  let extra = 0; // seconds the clock has held, so far: animation keeps time through the holds
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = A[i + 1];
    a.lead = lead;
    a.extra = extra;
    if (!b) break;
    const span = (b.real - a.real) * 60;               // seconds of the day this stretch has
    const need = R.toVideo(b.story) - R.toVideo(a.story); // ...and how long it takes to play
    const end = R.toStory(R.toVideo(a.story) + span);
    // where each actor waits for the next beat: at the beat, unless walking there. Someone who
    // has only just set off (the couple start up the aisle a moment before their beat) waits
    // where they started, to go with the beat; anyone further along finishes the walk.
    a.still = new Float32Array(n);
    const next = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const c = cast[k];
      let at = b.story;
      if (moving(c, b.story)) {
        let back = b.story;
        while (back > Math.max(a.story, b.story - 1.5) && moving(c, back)) back -= 0.05;
        at = moving(c, back) ? stillFrom(c, b.story) : back;
      }
      a.still[k] = at;
      next[k] = Math.max(lead[k], Math.min(end, at));
    }
    lead = next;
    extra += Math.max(0, span - need);
  }
  return A;
}

// Where the day is at `real` minutes: the room's story time `t`, the clock for the animation
// `v`, and each actor's own story time from at(k).
function where(A, real) {
  if (real < A[0].real) return { t: 0, v: 0, at: () => 0 };
  let i = 0;
  while (i < A.length - 1 && A[i + 1].real <= real) i++;
  const a = A[i], b = A[i + 1];
  const e = (real - a.real) * 60;
  const v = R.toVideo(a.story) + e + a.extra;
  if (!b) return { t: a.story, v, i, at: (k) => Math.max(a.story, a.lead[k]) };
  const base = R.toStory(R.toVideo(a.story) + e);
  const t = Math.min(base, b.story);
  return {
    t, v, i,
    // in step with the room, up to where it waits for the next beat (unless still finishing a
    // walk from the last one)
    at: (k) => Math.max(a.lead[k], Math.min(base, a.still[k])),
  };
}

// the time of day a moment of the rundown happens at (for the clock while reliving the day)
function realAt(A, t) {
  let i = 0;
  while (i < A.length - 1 && A[i + 1].story <= t) i++;
  const a = A[i], b = A[i + 1];
  const real = a.real + (R.toVideo(Math.max(t, a.story)) - R.toVideo(a.story)) / 60;
  return b ? Math.min(real, b.real) : real;
}

// ---------- words ----------
// The rundown's text is English; this is its Indonesian. A few English lines are planning notes,
// put differently for guests.
const ID = {
  'A walk through our day': 'Sekilas hari kami',
  'Getting ready': 'Bersiap-siap',
  'The akad begins': 'Akad dimulai',
  'Elsa enters': 'Elsa memasuki ruangan',
  'Sungkeman & photos': 'Sungkeman & foto',
  'The akad ends': 'Akad selesai',
  Changeover: 'Jeda',
  'Doors open': 'Pintu dibuka',
  'Speech & doa': 'Sambutan & doa',
  'Cake moment': 'Potong kue',
  'Mingle & games': 'Ramah tamah & games',
  Congratulations: 'Ucapan selamat',
  'Photo session': 'Sesi foto',
  Closing: 'Penutup',
  "Elsa's room · Adam's room · Bronze 1": 'Kamar Elsa · kamar Adam · Bronze 1',
  "Adam's family walks in": 'Keluarga Adam masuk',
  'Jubir exchange & kalung melati': 'Sambutan jubir & kalung melati',
  'Walked in by two companions': 'Didampingi dua pendamping',
  'Parents only, then the immediate family': 'Kepada orang tua, lalu foto keluarga inti',
  'Everyone heads out to the lobby': 'Semua menuju lobi',
  'Room reset · retouch · food check': 'Ruangan ditata ulang · touch-up · cek hidangan',
  'Guests come in from the lobby': 'Tamu masuk dari lobi',
  'International style · live singer': 'Gaya internasional · live singer',
  "Adam's welcome, then a doa": 'Sambutan Adam, lalu doa',
  'Italian cake · couple only': 'Kue Italia · hanya kedua mempelai',
  'Adam & Elsa walk the room · MC runs the games': 'Adam & Elsa menyapa tamu · MC memandu games',
  'Up the left steps, out by the right': 'Naik dari tangga kiri, turun dari kanan',
  'MC calls each group from the photo list': 'MC memanggil tiap kelompok untuk foto',
  'Photos can carry on after': 'Foto masih bisa berlanjut setelahnya',
  'Morning call from the WO (Elsa)': 'Panggilan pagi dari WO untuk Elsa',
  'Elsa: makeup & hair in her room': 'Elsa: makeup & rambut di kamarnya',
  'Adam: call, simple makeup, beauty shoot': 'Adam: makeup sederhana & beauty shoot',
  'Moms & sisters: makeup in Bronze 1': 'Para ibu & saudari: makeup di Bronze 1',
  'Photo & video on standby': 'Foto & video bersiap',
  'Early lunch, 6 boxes': 'Makan siang lebih awal',
  'Dzuhur, then down to the akad': 'Salat Dzuhur, lalu turun ke akad',
  "Elsa's family waits by the stage": 'Keluarga Elsa menunggu di dekat pelaminan',
  'Adam walks in with his parents': 'Adam masuk bersama orang tuanya',
  'MC opens with a doa': 'MC membuka dengan doa',
  'Pak Badru, jubir, states the purpose': 'Pak Badru, sebagai jubir, menyampaikan maksud kedatangan',
  "MC answers for Elsa's family": 'MC menjawab mewakili keluarga Elsa',
  'Mama Elsa places the melati': 'Mama Elsa mengalungkan melati',
  "Elsa's parents walk Adam to the table": 'Orang tua Elsa mengantar Adam ke meja akad',
  'Penghulu Pak Fadhlan takes his seat': 'Penghulu Pak Fadhlan duduk di tempatnya',
  'MC invites Elsa in': 'MC mempersilakan Elsa masuk',
  '2 companions (still to be confirmed)': 'Elsa didampingi dua pendamping',
  'Signing the marriage book': 'Penandatanganan buku nikah',
  'Mahar (silver ring + prayer set) & rings': 'Mahar (cincin perak & seperangkat alat salat) & cincin',
  'Sungkeman to both sets of parents': 'Sungkeman kepada kedua orang tua',
  'Photo: penghulu, saksi & family': 'Foto bersama penghulu, saksi & keluarga',
  'Guests and family walk out': 'Tamu dan keluarga keluar',
  'Adam & Elsa last, to get ready': 'Adam & Elsa terakhir, untuk bersiap',
  'Guests arrive (300 pax, standing party)': 'Tamu berdatangan',
  'Intan & Nisa welcome them in the lobby, with souvenirs': 'Intan & Nisa menyambut di lobi, dengan suvenir',
  'Live singer & keyboard warm up': 'Live singer & keyboard bersiap',
  "Adam's parents": 'Orang tua Adam',
  "Elsa's parents": 'Orang tua Elsa',
  "Elsa's siblings & in-laws": 'Saudara & ipar Elsa',
  'Adam & Elsa to the pelaminan': 'Adam & Elsa menuju pelaminan',
  "Adam's welcome speech": 'Sambutan dari Adam',
  'Doa by the family ustaz': 'Doa oleh ustaz keluarga',
  'Buffet & stalls open': 'Prasmanan & stall dibuka',
  'Cutting the cake': 'Memotong kue',
  'Feeding each other': 'Saling menyuapi',
  'Forehead kiss': 'Kecupan di kening',
  'Adam & Elsa mingle round the room': 'Adam & Elsa berkeliling menyapa tamu',
  'Games by the stage, one per prize': 'Games berhadiah di dekat pelaminan',
  'Parents pray ashar in between': 'Orang tua salat Asar di sela acara',
  'Back up to the pelaminan': 'Kembali ke pelaminan',
  'Guests line up at the left steps': 'Tamu antre di tangga kiri',
  'Salaman with Adam, Elsa & both parents': 'Salaman dengan Adam, Elsa & kedua orang tua',
  'Out by the right steps': 'Turun lewat tangga kanan',
  "Adam's family": 'Keluarga Adam',
  "Elsa's family": 'Keluarga Elsa',
  Friends: 'Teman-teman',
  'MC closes the reception': 'MC menutup resepsi',
  'Thank you for coming': 'Terima kasih atas kehadirannya',
  // what people say
  'Bismillah, we begin.': 'Bismillah, kita mulai.',
  'We come with good intentions…': 'Kami datang dengan niat baik…',
  'Welcome, with open arms!': 'Selamat datang, dengan tangan terbuka!',
  'Please welcome, Elsa!': 'Mari kita sambut, Elsa!',
  'Thank you all for coming!': 'Terima kasih semuanya sudah hadir!',
  'Ready? One, two…': 'Siap? Satu, dua…',
  'Thank you for coming!': 'Terima kasih sudah datang!',
  'Enjoy the food!': 'Silakan dinikmati hidangannya!',
  'Yeay, a prize!': 'Yeay, dapat hadiah!',
  // name tags
  'Live singer': 'Penyanyi',
  'Companions (TBC)': 'Pendamping',
  'Ustaz (family)': 'Ustaz (keluarga)',
};
const EN = {
  Changeover: 'Break',
  '2 companions (still to be confirmed)': 'Walked in by two companions',
  'Guests arrive (300 pax, standing party)': 'Guests arrive',
  'Companions (TBC)': 'Companions',
};
const say = (s) => (s ? L(ID[s] || s, EN[s] || s) : '');
// "13.05 WIB", or for guests from Malaysia "2.05 PM Malaysia time" (an hour ahead)
const hm = (min) => {
  const m = Math.floor(min) % 1440;
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  if (window.LANG !== 'en') return `${String(h).padStart(2, '0')}.${mm} WIB`;
  const my = (h + 1) % 24;
  return `${my % 12 || 12}.${mm} ${my < 12 ? 'AM' : 'PM'} ${L('', 'Malaysia time')}`.trim();
};

// ---------- the people ----------
// One kit (avatar_*.glb) made ready for merged people: the bones on their own to copy for each,
// and each look merged into one geometry (one draw per material), made once and shared.
function prepareKit(kit, M, gender) {
  const scene = kit.gltf.scene;
  scene.updateMatrixWorld(true);
  let skeleton = null;
  scene.traverse((o) => { if (!skeleton && o.isSkinnedMesh) skeleton = o.skeleton; });
  let top = skeleton.bones[0];
  while (top.parent && top.parent.isBone) top = top.parent;
  const rig = top.parent.clone(false);
  rig.add(top.clone(true));
  const faces = [];
  scene.traverse((o) => { if (/^Face_/.test(o.name) && !faces.includes(o.name)) faces.push(o.name); });
  const tinted = new Map();
  const looks = new Map();
  const tidy = (mesh, tuck) => {
    const src = mesh.geometry, g = new THREE.BufferGeometry();
    const n = src.getAttribute('position').count;
    for (const a of KEEP) {
      const s = src.getAttribute(a);
      if (a === 'skinIndex') g.setAttribute(a, new THREE.Uint16BufferAttribute(Array.from(s.array), 4));
      else if (a === 'uv' && !s) g.setAttribute(a, new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      else g.setAttribute(a, new THREE.Float32BufferAttribute(Array.from(s.array), s.itemSize));
    }
    // under a peci, the hair tucked in for good (its shape key, as avatar3d.js turns on)
    const k = tuck && mesh.morphTargetDictionary ? mesh.morphTargetDictionary[tuck] : undefined;
    if (k !== undefined && src.morphAttributes.position) {
      const p = g.getAttribute('position'), d = src.morphAttributes.position[k];
      for (let i = 0; i < n; i++) p.setXYZ(i, p.getX(i) + d.getX(i), p.getY(i) + d.getY(i), p.getZ(i) + d.getZ(i));
    }
    g.setIndex(src.index ? Array.from(src.index.array) : [...Array(n).keys()]);
    g.applyMatrix4(mesh.bindMatrix);
    return g;
  };
  return {
    rig,
    boneNames: skeleton.bones.map((b) => b.name),
    boneInverses: skeleton.boneInverses,
    clips: kit.clips,
    look(look) {
      const key = JSON.stringify(look);
      if (looks.has(key)) return looks.get(key);
      const hat = look.parts.Hat && (M[gender].slots.Hat || []).find((c) => c.id === look.parts.Hat);
      const byMat = new Map();
      const ids = [...Object.entries(look.parts).filter(([, id]) => id), ...faces.map((id) => ['Face', id])];
      for (const [slot, id] of ids) {
        const node = scene.getObjectByName(id);
        if (!node) continue;
        const meshes = [];
        node.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
        const t = slot !== 'Face' && tintable(M, gender, look, slot);
        const hex = t && ((look.colors && look.colors[slot]) || t.tint);
        const marked = meshes.some((o) => /^Tint/.test(o.material.name));
        for (const o of meshes) {
          let mat = o.material;
          const n = mat.name || '';
          if (hex && (!marked || /^Tint/.test(n))) {
            // a coloured part, the way avatar3d.js paints it
            const k = `${n}|${hex}`;
            if (!tinted.has(k)) {
              const m = new THREE.MeshLambertMaterial({ map: /^TintMap/.test(n) ? mat.map : null, side: THREE.DoubleSide });
              m.color.set(hex).multiplyScalar(/^TintDark/.test(n) ? 0.8 : 1);
              tinted.set(k, m);
            }
            mat = tinted.get(k);
          }
          if (!byMat.has(mat)) byMat.set(mat, []);
          byMat.get(mat).push(tidy(o, slot === 'Head' && hat && hat.tuck));
        }
      }
      const geos = [...byMat.values()].map((list) => (list.length > 1 ? mergeGeometries(list) : list[0]));
      const geo = mergeGeometries(geos, true);
      geo.computeBoundingSphere();
      geo.boundingSphere.radius *= 1.3;
      const out = { geo, mats: [...byMat.keys()] };
      looks.set(key, out);
      return out;
    },
  };
}

// someone made of one merged mesh, posed to the frame
function mergedPerson(K, look) {
  const root = new THREE.Group();
  const rig = K.rig.clone(true);
  root.add(rig);
  const bones = {};
  rig.traverse((o) => { bones[o.name] = o; });
  const L0 = K.look(look);
  const mesh = new THREE.SkinnedMesh(L0.geo, L0.mats);
  mesh.userData.noBlock = true;
  root.add(mesh);
  mesh.bind(new THREE.Skeleton(K.boneNames.map((n) => bones[n]), K.boneInverses), new THREE.Matrix4());
  const sat = { root, posture: posture(root, bones) };
  const mixer = new THREE.AnimationMixer(root);
  const acts = new Map();
  const act = (name) => {
    const clip = K.clips[name] || K.clips.Idle;
    if (!acts.has(clip)) { const a = mixer.clipAction(clip); a.play(); acts.set(clip, a); }
    return acts.get(clip);
  };
  let lookKey = JSON.stringify(look);
  return {
    root,
    bones,
    wear(next) {
      const key = JSON.stringify(next);
      if (key === lookKey) return;
      lookKey = key;
      const Ln = K.look(next);
      mesh.geometry = Ln.geo;
      mesh.material = Ln.mats;
    },
    pose(clip, time, prev, prevTime, w) {
      const a = act(clip), b = prev && w < 1 ? act(prev) : null;
      for (const x of acts.values()) if (x !== a && x !== b) x.enabled = false;
      const set = (x, tm, wt) => {
        x.enabled = true;
        x.setEffectiveWeight(wt);
        const d = x.getClip().duration;
        x.time = ((tm % d) + d) % d;
      };
      set(a, time, b ? w : 1);
      if (b) set(b, prevTime, 1 - w);
      mixer.update(0);
    },
    sitUp() { if (sat.posture) sitUp(sat); },
  };
}

// Adam or Elsa, all day in what they wear in our photos (couple3d.js)
function couplePerson(id, kits, M) {
  const male = id === 'adam';
  const av = male ? makeGroom(kits.male, M) : makeBride(kits.female, M);
  const root = new THREE.Group();
  root.add(av.root);
  av.root.traverse((o) => { o.userData.noBlock = true; });
  const bones = {};
  av.root.traverse((o) => { if (o.isBone && !bones[o.name]) bones[o.name] = o; });
  const sat = { root, posture: posture(root, bones) };
  return {
    root,
    bones,
    wear() {},
    pose(clip, time, prev, prevTime, w) { av.pose(clip, time, prev, prevTime, w); },
    sitUp() { if (sat.posture) sitUp(sat); },
  };
}

// the melati garland Mama Elsa places on Adam at the serah terima
function garlandMesh() {
  const g = new THREE.Group();
  const jasmine = new THREE.MeshLambertMaterial({ color: 0xfffdf2, emissive: 0x2a2a20 });
  const bud = new THREE.SphereGeometry(0.028, 6, 5);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const s = new THREE.Mesh(bud, jasmine);
    s.position.set(Math.cos(a) * 0.15, -Math.abs(Math.sin(a / 2)) * 0.14, Math.sin(a) * 0.12);
    g.add(s);
  }
  for (const x of [-0.08, 0.08]) {
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Mesh(bud, jasmine);
      s.scale.setScalar(0.85);
      s.position.set(x, -0.16 - k * 0.045, 0.13);
      g.add(s);
    }
  }
  return g;
}
// ---------- the room's extra things ----------
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const PM = {
  gold: lam(0xc9a24f, { emissive: 0x3a2a0c }),
  red: lam(0x7a1420),
  cloth: lam(0xfbf6ec),
  ivory: lam(0xf3eadb),
  flower: lam(0xe9a8b3),
  blush: lam(0xf6d5d6),
  white: lam(0xfffdf8),
  book: lam(0x1f6b4a),
};
const box = (w, h, d, mat, x, y, z, parent) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  parent.add(m);
  return m;
};
const cyl = (r, h, mat, x, y, z, parent, seg = 20) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  parent.add(m);
  return m;
};
// a banquet chair like the room's: gold frame, red seat; the sitter faces `yaw`
const chair = (x, z, yaw, parent) => {
  const g = new THREE.Group();
  box(0.44, 0.06, 0.44, PM.red, 0, 0.42, 0, g);
  box(0.44, 0.52, 0.04, PM.gold, 0, 0.48, -0.21, g);
  for (const [dx, dz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) box(0.03, 0.42, 0.03, PM.gold, dx, 0, dz, g);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  parent.add(g);
  return g;
};
function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,244,220,1)');
  grd.addColorStop(1, 'rgba(255,244,220,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
// the akad table and chairs, the marriage book, the cake, the game prizes, the spotlights and
// the confetti, each shown when the day has it
function buildProps(scene) {
  const all = new THREE.Group();
  all.name = 'live-props';
  scene.add(all);
  const akad = new THREE.Group();
  box(2.3, 0.74, 0.86, PM.cloth, R.AKAD_TABLE.x, 0, R.AKAD_TABLE.z, akad);
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.07 + (i % 3) * 0.02, 8, 6), i % 2 ? PM.flower : PM.blush);
    s.position.set(R.AKAD_TABLE.x - 0.25 + (i % 5) * 0.12, 0.8 + Math.floor(i / 5) * 0.06, R.AKAD_TABLE.z + (((i * 7) % 3) - 1) * 0.06);
    akad.add(s);
  }
  for (const [x, z, yaw] of R.TABLE_SEATS) chair(x, z, yaw, akad);
  all.add(akad);
  const rows = new THREE.Group();
  for (const [x, z] of R.AKAD_CHAIRS) chair(x, z, Math.PI, rows);
  all.add(rows);
  const book = new THREE.Group();
  box(0.3, 0.03, 0.22, PM.book, 0.05, 0.74, R.AKAD_TABLE.z + 0.18, book);
  box(0.18, 0.04, 0.18, PM.gold, -0.35, 0.74, R.AKAD_TABLE.z + 0.1, book); // mahar: the ring box
  all.add(book);
  const cake = new THREE.Group();
  cyl(0.45, 0.76, PM.cloth, 0, 0, 0, cake, 24);
  cyl(0.27, 0.22, PM.white, 0, 0.76, 0, cake);
  cyl(0.2, 0.2, PM.ivory, 0, 0.98, 0, cake);
  cyl(0.13, 0.18, PM.white, 0, 1.18, 0, cake);
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), PM.flower);
    const a = (i / 7) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.2, 1.0 + (i % 2) * 0.2, Math.sin(a) * 0.2);
    cake.add(s);
  }
  cake.position.set(R.CAKE.x, 0, R.CAKE.z);
  all.add(cake);
  const gifts = new THREE.Group();
  for (const [x, z, c] of [[0.0, -9.2, 0xe9a8b3], [0.5, -9.4, 0xc9a24f], [-0.4, -9.5, 0x7e9277], [0.9, -9.0, 0x2f4478]]) {
    const g = new THREE.Group();
    box(0.32, 0.26, 0.32, lam(c), 0, 0, 0, g);
    box(0.34, 0.27, 0.06, PM.white, 0, 0, 0, g);
    box(0.06, 0.27, 0.34, PM.white, 0, 0, 0, g);
    g.position.set(x, 0, z);
    g.rotation.y = x * 0.8;
    gifts.add(g);
  }
  all.add(gifts);
  const tex = glowTex();
  const spots = [0, 1].map(() => {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 1, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    g.add(cone);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    all.add(g, pool);
    return { g, cone, pool };
  });
  const COUNT = 260;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  const colors = new Float32Array(COUNT * 3);
  const pal = [0xf2bcc3, 0xc9a24f, 0xffffff, 0x9fae96, 0xe99aa9, 0x8a9bb8].map((h) => new THREE.Color(h));
  for (let i = 0; i < COUNT; i++) pal[i % pal.length].toArray(colors, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false }));
  confetti.frustumCulled = false;
  all.add(confetti);
  all.traverse((o) => { o.userData.noBlock = true; }); // they come and go: walked through, not into
  return { all, akad, rows, book, cake, gifts, spots, confetti, COUNT };
}

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};

// ---------- the live mode ----------
// crowd: the seats and huddles ballroom3d.js gives its guests; at the reception they walk in
// from the door to those places instead of being there all along.
// watch(): take the guest to where they can see the day, as reliving it starts
export function addLive(scene, crowd, { watch } = {}) {
  const now = clock();
  let started = null; // the cast, the props and the plan, once the day has come
  // reliving the day: { v } video seconds into it, playing or not
  const FIRST = R.toVideo(MOMENTS[0].t), LAST = R.toVideo(R.DURATION - 0.4);
  let replay = null;
  const ui = overlay({
    relive() {
      replay = { v: FIRST, playing: true };
      if (watch) watch();
    },
    toggle() {
      if (!replay) return;
      if (replay.v >= LAST) replay.v = FIRST; // at the end: from the start again
      replay.playing = !replay.playing;
    },
    seek(t) { if (replay) { replay.v = R.toVideo(t); replay.playing = true; } },
    seekTo(k) { if (replay) replay.v = FIRST + k * (LAST - FIRST); },
    close() { replay = null; },
  });

  function start() {
    // strollers stay where they are: someone forever pacing would never let the room hold still
    const still = crowd.map((c) => (c.pose === 'walk' ? { x: c.x, z: c.z, yaw: Math.atan2(c.to[0] - c.x, c.to[1] - c.z), pose: 'stand', anim: 'Talk' } : c));
    const cast = [...R.ACTORS, ...R.crowdActors(still)].filter((a) => a.scene === 'ball');
    for (const a of cast) a.keys = jumps(a.keys);
    const st = { cast, people: new Array(cast.length).fill(null), props: buildProps(scene), A: plan(cast), kits: null, frame: 0 };
    st.group = new THREE.Group();
    st.group.name = 'live-people';
    scene.add(st.group);
    st.garland = garlandMesh();
    scene.add(st.garland);
    st.ready = Promise.all([loadManifest(), loadKit('male'), loadKit('female')]).then(([M, male, female]) => {
      st.kits = { M, male, female, K: { male: prepareKit(male, M, 'male'), female: prepareKit(female, M, 'female') } };
    });
    return st;
  }

  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), ball = new THREE.Sphere(new THREE.Vector3(), 1.2);
  const v3 = new THREE.Vector3();
  const within = (w, t) => !!w && t >= w[0] && t <= w[1];

  function person(st, k, look) {
    if (st.people[k]) return st.people[k];
    const a = st.cast[k];
    const { M, K } = st.kits;
    const p = a.id === 'adam' || a.id === 'elsa' ? couplePerson(a.id, st.kits, M) : mergedPerson(K[look.gender], look);
    st.group.add(p.root);
    st.people[k] = p;
    return p;
  }

  return {
    // every frame in the ballroom; says whether the day is being shown (live, or relived)
    update(dt, camera) {
      const c = now();
      const over = c.over || (c.min !== undefined && c.min >= END);
      const mode = replay ? 'replay' : over ? 'over' : c.min !== undefined ? 'live' : 'off';
      ui.show(mode);
      if (mode === 'off' || mode === 'over') {
        if (started) started.group.visible = started.props.all.visible = false;
        if (mode === 'over') ui.over();
        return false;
      }
      if (!started) started = start();
      const st = started;
      st.group.visible = st.props.all.visible = true;
      let day;
      if (replay) {
        // all in step, at the video's pace (once the people are in)
        if (st.kits && replay.playing) replay.v = Math.min(LAST, replay.v + dt);
        if (replay.v >= LAST) replay.playing = false;
        const t = R.toStory(replay.v);
        day = { t, v: replay.v, at: () => t };
        ui.card(realAt(st.A, t), t, true);
        ui.progress((replay.v - FIRST) / (LAST - FIRST), t, replay.playing);
      } else {
        day = where(st.A, c.min);
        // the card goes by the beat under way, not the one the room is holding ready for
        ui.card(c.min, day.i === undefined ? day.t : st.A[day.i].story);
      }
      const t = day.t;
      st.frame++;
      if (camera) frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));

      // the people
      const heads = {};
      if (st.kits) {
        st.cast.forEach((a, k) => {
          const ta = day.at(k);
          const p = R.actorAt(a, ta, day.v);
          const on = p.scale > 0.01;
          const who = st.people[k];
          if (!on) { if (who) who.root.visible = false; return; }
          const me = person(st, k, p.look);
          me.root.visible = true;
          me.wear(p.look);
          me.root.position.set(p.x, p.y, p.z);
          me.root.rotation.y = p.yaw;
          me.root.scale.setScalar(p.scale);
          // nobody animates unseen, and far away every third frame is plenty
          ball.center.set(p.x, p.y + 0.9, p.z);
          const seen = !camera || frustum.intersectsSphere(ball);
          const far = camera && ball.center.distanceTo(camera.position) > FAR;
          if (seen && (!far || (st.frame + k) % 3 === 0)) {
            // the named people talk as the rundown has them; the guests sit quietly
            if (!a.label) {
              if (/^SitTalk/.test(p.clip)) p.clip = 'Sit';
              if (/^SitTalk/.test(p.prev)) p.prev = 'Sit';
            }
            me.pose(formal(p.clip), p.time, formal(p.prev), p.prevTime, p.w);
            if (seated(p)) {
              me.sitUp();
              if (formal(main(p)) === 'Sit_Skirt') mirrorArms(me.bones);
            }
          }
          if (seen) heads[a.id] = { p, me, a };
        });
        // the garland, on Adam from the serah terima to the end of the akad
        st.garland.visible = false;
        const h = heads.adam;
        if (h && within(h.a.garland, day.at(st.cast.indexOf(h.a))) && h.me.bones.Neck) {
          h.me.root.updateMatrixWorld(true);
          h.me.bones.Neck.getWorldPosition(v3);
          st.garland.position.set(v3.x + Math.sin(h.p.yaw) * 0.05, v3.y - 0.07, v3.z + Math.cos(h.p.yaw) * 0.05);
          st.garland.rotation.y = h.p.yaw;
          st.garland.scale.setScalar(h.p.scale);
          st.garland.visible = true;
        }
      }

      // the room's things
      const P = st.props;
      const down = 1 - R.ramp(t, 85.4, 86.8); // the akad's chairs and table, cleared at the changeover
      P.rows.visible = P.akad.visible = down > 0.01;
      P.rows.scale.y = P.akad.scale.y = Math.max(0.01, down);
      P.book.visible = t > 62.5 && t < 84.5;
      const cs = R.popScale([[85.6, 1e9]], t, 0.5);
      P.cake.visible = cs > 0.01;
      P.cake.scale.setScalar(Math.max(cs, 0.01));
      const gs = R.popScale([[143.8, 149.6]], t);
      P.gifts.visible = gs > 0.01;
      P.gifts.children.forEach((g) => g.scale.setScalar(Math.max(gs, 0.01)));
      const lit = R.SPOTS.find(([a, b]) => t >= a && t <= b);
      P.spots.forEach((s, i) => {
        if (!lit) { s.g.visible = s.pool.visible = false; return; }
        const fade = Math.min(R.ramp(t, lit[0], lit[0] + 0.8), 1 - R.ramp(t, lit[1] - 0.8, lit[1]));
        const [tx, tz] = lit[2](t);
        const ty = tz < -14.2 ? 0.52 : 0.02;
        const src = new THREE.Vector3(i ? 5.5 : -5.5, 9.5, tz - 3.5);
        const dir = new THREE.Vector3(tx, ty, tz).sub(src);
        s.g.position.copy(src);
        s.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
        s.cone.scale.set(1, dir.length(), 1);
        s.cone.position.y = -dir.length() / 2;
        s.cone.material.opacity = 0.07 * fade;
        s.pool.position.set(tx, ty, tz);
        s.pool.material.opacity = 0.45 * fade;
        s.g.visible = s.pool.visible = fade > 0.01;
      });
      // confetti, falling at its own pace however long the room holds
      const pos = P.confetti.geometry.getAttribute('position');
      const held = st.A[day.i] ? st.A[day.i].extra : 0;
      const burst = R.CONFETTI.find(([t0]) => t >= t0 && t < t0 + 6);
      const tau = burst ? day.v - held - R.toVideo(burst[0]) : 99;
      P.confetti.visible = !!burst && tau >= 0 && tau < 4.5;
      if (P.confetti.visible) {
        const [, cx, cz, hgt] = burst;
        for (let i = 0; i < P.COUNT; i++) {
          const a = hash(`c${i}`) * Math.PI * 2, r = 0.6 + hash(`r${i}`) * 2.4, up = 2.5 + hash(`u${i}`) * 3;
          const fall = Math.max(0.02, hgt + up * tau - 2.2 * tau * tau);
          const drift = Math.min(1, tau * 1.4);
          pos.setXYZ(i, cx + Math.cos(a) * r * drift + Math.sin(tau * 3 + i) * 0.05, fall, cz + Math.sin(a) * r * drift);
        }
        pos.needsUpdate = true;
        P.confetti.material.opacity = 1 - R.ramp(tau, 3.5, 4.5);
      }

      ui.people(camera, t, heads);
      return true;
    },
  };
}

// ---------- on screen ----------
// the card with the time and what is happening (#venueLive, in place of the "come back on the
// day" notice), and the name tags and speech bubbles over people's heads
// on: { relive, toggle, seek(story t), seekTo(0..1), close } for the buttons.
function overlay(on) {
  const $ = (id) => document.getElementById(id);
  const box = $('venueLive'), notice = $('venueNotice'), host = $('venueUi');
  const bar = $('venueRelive'), go = $('venueReplay'), toggle = $('reliveToggle'), fill = $('reliveBar'), track = $('reliveTrack');
  const chips = bar ? [...bar.querySelectorAll('[data-at]')].map((b) => ({ b, at: Number(b.dataset.at) })) : [];
  if (go) go.addEventListener('click', () => on.relive());
  if (toggle) toggle.addEventListener('click', () => on.toggle());
  const close = $('reliveClose');
  if (close) close.addEventListener('click', () => on.close());
  for (const { b, at } of chips) b.addEventListener('click', () => on.seek(at));
  if (track) {
    track.addEventListener('click', (e) => {
      const r = track.getBoundingClientRect();
      on.seekTo(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    });
  }
  let playing = null;
  const noticeHidden = notice ? notice.hidden : true;
  let shown = null, lastCard = '';
  const tags = new Map(), bubbles = new Map();
  const v = new THREE.Vector3();
  const el = (cls) => {
    const d = document.createElement('div');
    d.className = cls;
    if (host) host.appendChild(d);
    return d;
  };
  const fillCard = (text) => {
    const key = text.join('|');
    if (key === lastCard) return;
    lastCard = key;
    ['venueLiveClock', 'venueLiveTitle', 'venueLiveSub', 'venueLiveNow', 'venueLiveNext'].forEach((id, k) => {
      const n = $(id);
      if (!n) return;
      n.textContent = text[k];
      n.hidden = !text[k];
    });
  };
  const card = (real, t, again = false) => {
    if (!box) return;
    const before = real < toMin(MOMENTS[0].clock[0]);
    const m = momentAt(t);
    const i = MOMENTS.indexOf(m);
    const next = before ? MOMENTS[0] : MOMENTS[i + 1];
    const over = !before && !next && real >= toMin(m.clock[1]) + 1;
    let beat = null;
    for (const b of m.beats) if (b[0] <= t + 0.05) beat = b;
    const text = [
      `${again ? L('ULANG', 'REPLAY') : L('LANGSUNG', 'LIVE')} · ${hm(real)}`,
      before ? L('Hari pernikahan kami', 'Our wedding day') : say(m.title),
      before ? L(`Akad pukul ${hm(toMin('12:30'))} · resepsi pukul ${hm(toMin('16:00'))}`, `The akad at ${hm(toMin('12:30'))} · the reception at ${hm(toMin('16:00'))}`)
        // the break: nothing happens here but the room being turned round
        : m.title === 'Changeover' ? L(`Resepsi dimulai pukul ${hm(toMin('16:00'))}`, `The reception starts at ${hm(toMin('16:00'))}`)
        : say(m.sub),
      over ? L('Terima kasih atas kehadiran dan doanya', 'Thank you for coming, and for your prayers') : beat ? say(beat[2]) : '',
      next ? `${L('Berikutnya', 'Next')}, ${hm(toMin(next.clock[0]))}: ${say(next.title)}` : '',
    ];
    fillCard(text);
  };
  return {
    // mode: 'live' | 'replay' | 'over' (the card, with the button to relive the day) | 'off'
    show(mode) {
      if (mode === shown) return;
      shown = mode;
      const card = mode !== 'off';
      if (box) {
        box.hidden = !card;
        box.classList.toggle('is-replay', mode === 'replay' || mode === 'over');
        box.classList.toggle('is-reliving', mode === 'replay');
      }
      if (go) go.hidden = mode !== 'over';
      if (bar) bar.hidden = mode !== 'replay';
      if (notice) notice.hidden = card || noticeHidden;
      if (mode !== 'live' && mode !== 'replay') for (const d of [...tags.values(), ...bubbles.values()]) d.classList.remove('is-visible');
    },
    card,
    over() {
      fillCard([
        L('Sabtu, 24 Oktober 2026', 'Saturday, 24 October 2026'),
        L('Acara telah selesai', 'The celebration is over'),
        L('Terima kasih atas kehadiran dan doanya', 'Thank you for coming, and for your prayers'),
        '',
        L('Saksikan lagi hari kami, dari akad sampai penutup', 'Watch our day again, from the akad to the close'),
      ]);
    },
    // while reliving: how far along, which big moment is on, and play or pause on the button
    progress(k, t, isPlaying) {
      if (fill) fill.style.transform = `scaleX(${Math.min(1, Math.max(0, k)).toFixed(4)})`;
      let cur = null;
      for (const c of chips) if (c.at <= t + 0.01) cur = c;
      for (const c of chips) c.b.classList.toggle('is-on', c === cur);
      if (toggle && isPlaying !== playing) {
        playing = isPlaying;
        toggle.textContent = isPlaying ? '❚❚' : '▶';
        toggle.setAttribute('aria-label', isPlaying ? L('Jeda', 'Pause') : L('Putar', 'Play'));
      }
    },
    // name tags (the rundown's, plus Adam and Elsa whenever they're in view) and what is being said
    people(camera, t, heads) {
      if (!host || !camera) return;
      const w = host.clientWidth, h = host.clientHeight;
      const want = new Set(['adam', 'elsa']);
      for (const [a, b, ids] of R.TAGS) if (t >= a && t <= b) ids.forEach((id) => want.add(id));
      const say1 = new Map();
      for (const [a, b, id, text] of R.BUBBLES) if (t >= a && t <= b) say1.set(id, text);
      const placed = [];
      const items = [];
      for (const [id, hd] of Object.entries(heads)) {
        const label = hd.a.label && want.has(id) ? say(hd.a.label) : '';
        const line = say1.get(id) || '';
        if (!label && !line) continue;
        const bone = hd.me.bones.Head;
        if (bone) { hd.me.root.updateMatrixWorld(true); bone.getWorldPosition(v); v.y += 0.32 * hd.p.scale; }
        else v.set(hd.p.x, hd.p.y + 1.95, hd.p.z);
        const dist = v.distanceTo(camera.position);
        v.project(camera);
        if (v.z > 1 || dist > 24) continue;
        items.push({ id, label, line, dist, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h });
      }
      items.sort((a, b) => a.dist - b.dist);
      const seen = new Set();
      for (const it of items) {
        // nearest first; one that would land on another is lifted above it (twice at most),
        // else left out
        const half = Math.max(it.label.length * 5.2, Math.min(say(it.line).length * 4, 130)) + 12;
        const tall = it.line ? 66 : 32;
        let r = null;
        for (let k = 0; k < 3 && !r; k++) {
          const c = [it.x - half, it.y - tall, it.x + half, it.y];
          const hit = placed.find((p) => c[0] < p[2] && c[2] > p[0] && c[1] < p[3] && c[3] > p[1]);
          if (!hit) r = c;
          else it.y = hit[1] - 2;
        }
        if (!r) continue;
        placed.push(r);
        seen.add(it.id);
        if (it.label) {
          if (!tags.has(it.id)) tags.set(it.id, el('live-tag'));
          const d = tags.get(it.id);
          if (d.textContent !== it.label) d.textContent = it.label;
          d.classList.add('is-visible');
          d.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%, -100%)`;
        } else if (tags.has(it.id)) tags.get(it.id).classList.remove('is-visible');
        if (it.line) {
          if (!bubbles.has(it.id)) bubbles.set(it.id, el('live-bubble'));
          const d = bubbles.get(it.id);
          const s = say(it.line);
          if (d.textContent !== s) d.textContent = s;
          d.classList.add('is-visible');
          d.style.transform = `translate(${it.x.toFixed(1)}px, ${(it.y - (it.label ? 30 : 0)).toFixed(1)}px) translate(-50%, -100%)`;
        } else if (bubbles.has(it.id)) bubbles.get(it.id).classList.remove('is-visible');
      }
      for (const [id, d] of tags) if (!seen.has(id)) d.classList.remove('is-visible');
      for (const [id, d] of bubbles) if (!seen.has(id)) d.classList.remove('is-visible');
    },
  };
}

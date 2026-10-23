// The two of us on the pelaminan, dressed as in our photos: Adam in a champagne-gold suit over a
// white tee, with his glasses; Elsa in an off-shoulder white ball gown with lace appliqué, her
// hair up in a low bun with a white flower at the side.
//
// Both are put together from the character creator's parts (avatar3d.js), the same as any guest's
// own character, and then dressed further here: the suit is the cream blazer recoloured, and the
// gown is made on the spot. Its bodice is cut from Elsa's own body mesh (from the neckline down,
// plus a band round each upper arm for the off-shoulder sleeves) and stood a few millimetres off
// it, so it moves with her; the skirt is a pleated bell skinned to the hips. The bun, the flower
// and the glasses ride on the head bone. Nothing is baked into a model file, so the parts files
// stay as the creator has them.
//
// Fetched in the background once the ballroom exists (avatar_*.glb, about 7 MB for the two), so
// the room never waits: we are simply there a moment later.
import * as THREE from 'three';
import { loadManifest, loadKit, createAvatar } from './avatar3d.js';
import { rng } from './lobby3d.js';

const GOLD = '#b38d50'; // reads as champagne gold under the stage's warm lights
const GROOM = {
  gender: 'male',
  parts: { Skin: 'Body_M_light', Head: 'Hair_M_black', Hat: null, Top: 'Top_blazer_beige', Bottom: 'Pants_M_basic', Shoes: 'Shoes_M_basic' },
  colors: { Bottom: GOLD, Shoes: '#3a322d' },
};
const BRIDE = {
  gender: 'female',
  parts: { Skin: 'Body_F_light', Head: 'Hair_F_bob', Hat: null, Top: null, Bottom: null, Shoes: 'Heels_basic' },
  colors: { Shoes: '#f6f1e8' },
};
const HAIR = 0x2a2828;

// In the parts' bind space (metres, y up, facing +z, +x the character's left): where the
// shoulders are and which way the upper arms run down from them, for the off-shoulder sleeves.
const SHOULDER = new THREE.Vector3(0.158, 1.355, -0.017);
const ARM_DIR = new THREE.Vector3(0.867, -0.497, 0).normalize();

// all the drawn things share one canvas each
let lace = null;
function laceTextures() {
  if (lace) return lace;
  const rnd = rng(7);
  // a lace motif: a little five-petalled flower with two leaves and a scroll
  const motif = (g, x, y, s, ink) => {
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * Math.PI * 2);
    g.scale(s, s);
    g.strokeStyle = ink;
    g.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      g.rotate((Math.PI * 2) / 5);
      g.beginPath();
      g.ellipse(0, -7, 3.6, 6, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.arc(0, 0, 2.4, 0, Math.PI * 2);
    g.stroke();
    for (const k of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, 12);
      g.quadraticCurveTo(k * 14, 16, k * 18, 8);
      g.quadraticCurveTo(k * 10, 9, 0, 12);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-14, -12);
    g.bezierCurveTo(-24, -24, -6, -30, -10, -18);
    g.stroke();
    g.restore();
  };
  const sequins = (g, x0, y0, w, h, n) => {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.arc(x0 + rnd() * w, y0 + rnd() * h, 0.8 + rnd() * 1.2, 0, Math.PI * 2);
      g.fill();
    }
  };
  const tex = (c, rx, ry) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    return t;
  };
  // the bodice: lace all over, beaded
  const b = document.createElement('canvas');
  b.width = b.height = 256;
  let g = b.getContext('2d');
  g.fillStyle = '#f7f3ec';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) motif(g, rnd() * 256, rnd() * 256, 0.7 + rnd() * 0.4, '#d6cfc3');
  sequins(g, 0, 0, 256, 256, 260);
  // the skirt, hem at the bottom: tulle with a deep band of appliqué along the hem, sprays
  // climbing from it, and a scatter of single flowers fading out toward the waist
  const s = document.createElement('canvas');
  s.width = 512;
  s.height = 1024;
  g = s.getContext('2d');
  g.fillStyle = '#f8f5ef';
  g.fillRect(0, 0, 512, 1024);
  const fold = g.createLinearGradient(0, 0, 512, 0); // the soft shadow down each pleat
  for (let i = 0; i <= 8; i++) fold.addColorStop(i / 8, i % 2 ? 'rgba(120,105,90,0.10)' : 'rgba(120,105,90,0)');
  g.fillStyle = fold;
  g.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 70; i++) motif(g, rnd() * 512, 1024 - Math.pow(rnd(), 1.8) * 230, 0.9 + rnd() * 0.5, '#cfc6b8');
  for (let i = 0; i < 4; i++) { // a spray up from the hem, one per pleat pair
    const x = 64 + i * 128;
    for (let k = 0; k < 9; k++) motif(g, x + Math.sin(k * 1.3) * 26, 800 - k * 34, 0.8, '#d3cbbf');
  }
  for (let i = 0; i < 40; i++) motif(g, rnd() * 512, 200 + rnd() * 600, 0.7, 'rgba(200,190,176,0.7)');
  // the scalloped edge of the hem band
  g.strokeStyle = '#cfc6b8';
  g.lineWidth = 2;
  for (let x = 0; x < 512; x += 32) {
    g.beginPath();
    g.arc(x + 16, 800, 16, Math.PI, 0);
    g.stroke();
  }
  sequins(g, 0, 0, 512, 1024, 900);
  lace = { bodice: tex(b, 3, 3), skirt: tex(s, 4, 1) };
  return lace;
}

export function addCouple(scene, { x = 0, y = 0, z = 0, yaw = 0, gap = 0.36 } = {}) {
  const group = new THREE.Group();
  group.name = 'couple';
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  scene.add(group);
  const people = [];
  let gone = false;

  const ready = Promise.all([loadManifest(), loadKit('male'), loadKit('female')]).then(([M, male, female]) => {
    if (gone) return;
    const groom = createAvatar(male, M);
    groom.wear(GROOM);
    suit(groom.root);
    const bride = createAvatar(female, M);
    bride.wear(BRIDE);
    gown(bride.root);
    // side by side, Elsa on Adam's left, each turned a touch toward the other
    groom.root.position.x = -gap;
    groom.root.rotation.y = 0.1;
    bride.root.position.x = gap;
    bride.root.rotation.y = -0.1;
    for (const p of [groom, bride]) {
      p.root.traverse((o) => { o.userData.noBlock = true; });
      p.play('Idle', 0);
      p.update(Math.random());
      group.add(p.root);
      people.push(p);
    }
  });

  return {
    ready,
    update(dt) { for (const p of people) p.update(dt); },
    dispose() {
      gone = true;
      for (const p of people) p.dispose();
      group.removeFromParent();
    },
  };
}

// ---------- Adam ----------
function suit(root) {
  const body = find(root, 'Body_M_light');
  // the cream blazer and the trousers in satin gold (a little shine, where the rest of the room
  // is matte); the blazer's black tee white above a gold waistcoat, buttoned
  const satin = new THREE.MeshPhongMaterial({ color: GOLD, specular: 0x4a3c22, shininess: 30, side: THREE.DoubleSide });
  for (const id of ['Top_blazer_beige', 'Pants_M_basic']) {
    const meshes = [];
    find(root, id).traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      if (id === 'Pants_M_basic' || /palette/i.test(o.material.name)) { o.material = satin; continue; }
      o.material = new THREE.MeshLambertMaterial({ color: 0xf4f2ee, side: THREE.DoubleSide });
      // the waistcoat: the tee again, a hair further out, in gold below a V
      const vest = shell(o, 0.002, (p) => 1.17 + 1.5 * Math.abs(p.x) - p.y);
      skinned(o, vest, Object.assign(satin.clone(), { alphaMap: edgeMap(), alphaTest: 0.5 }));
    }
  }
  const buttons = [1.13, 1.07, 1.01].map((y) => new THREE.SphereGeometry(0.008, 8, 6).translate(0, y, 0.112));
  rigid(body, merge(buttons), new THREE.MeshLambertMaterial({ color: 0x8a6d3b }), 'Spine1');
  // glasses: thin dark rims in front of the eyes, the arms back over the ears
  const parts = [new THREE.BoxGeometry(0.026, 0.004, 0.004).translate(0, 1.604, 0.13)]; // the bridge
  for (const s of [-1, 1]) {
    const rim = roundRect(0.048, 0.034, 0.011);
    rim.holes.push(roundRect(0.04, 0.026, 0.008));
    parts.push(new THREE.ExtrudeGeometry(rim, { depth: 0.004, bevelEnabled: false }).translate(s * 0.036, 1.596, 0.126));
    parts.push(new THREE.BoxGeometry(0.04, 0.004, 0.005).translate(s * 0.078, 1.604, 0.127)); // out to the side of the head
    parts.push(new THREE.BoxGeometry(0.004, 0.004, 0.12).translate(s * 0.097, 1.604, 0.067)); // and back over the ear
  }
  rigid(body, merge(parts), new THREE.MeshLambertMaterial({ color: 0x1d1b1b }), 'Head');
}

// ---------- Elsa ----------
function gown(root) {
  const body = find(root, 'Body_F_light');
  const sk = body.skeleton;
  const T = laceTextures();
  const satin = new THREE.MeshLambertMaterial({ color: 0xffffff, map: T.bodice, side: THREE.DoubleSide });
  const tulle = new THREE.MeshLambertMaterial({ color: 0xffffff, map: T.skirt, side: THREE.DoubleSide });

  // the bodice: the body from the neckline down to the hips, and a band round each upper arm
  {
    const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
    const arm = new Set(sk.bones.map((b, i) => (/^(Left|Right)(Arm|ForeArm|Hand)/.test(b.name) ? i : -1)).filter((i) => i >= 0));
    const a = new THREE.Vector3(), d = new THREE.Vector3();
    const geo = shell(body, 0.007, (p, i) => {
      if (p.y < 0.84) return -1;
      let w = 0;
      for (let k = 0; k < 4; k++) if (arm.has(si.getComponent(i, k))) w += sw.getComponent(i, k);
      if (w > 0.5) {
        const s = Math.sign(p.x) || 1;
        a.set(s * SHOULDER.x, SHOULDER.y, SHOULDER.z);
        d.set(s * ARM_DIR.x, ARM_DIR.y, ARM_DIR.z);
        const t = a.subVectors(p, a).dot(d);
        return Math.min(t - 0.035, 0.14 - t);
      }
      // straight across the chest and the back, with a sweetheart dip in the middle at the front
      return 1.29 - (p.z > 0 ? 0.035 * Math.exp(-((p.x / 0.035) ** 2)) : 0) - p.y;
    });
    satin.alphaMap = edgeMap();
    satin.alphaTest = 0.5;
    skinned(body, geo, satin);
  }

  // the skirt: a bell from the waist, pleated, a little fuller and longer at the back
  {
    const N = 64;
    // [height, radius] from the waist down to the floor
    const prof = [[1.08, 0.125], [1.0, 0.15], [0.92, 0.2], [0.84, 0.27], [0.72, 0.35], [0.56, 0.43], [0.38, 0.49], [0.2, 0.53], [0.06, 0.555], [-0.02, 0.565]];
    const P = [], UV = [], SI = [], SW = [], idx = [];
    const hips = sk.bones.findIndex((b) => b.name === 'Hips');
    const spine = sk.bones.findIndex((b) => b.name === 'Spine');
    const floor = sk.bones.findIndex((b) => b.name === 'Root');
    for (let j = 0; j < prof.length; j++) {
      const [y, r0] = prof[j];
      const drop = (1.08 - y) / 1.1;                 // 0 at the waist, 1 at the hem
      const flat = 0.78 + 0.22 * Math.min(1, drop * 3); // the waist is deeper side to side than front to back
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2;
        const back = Math.max(0, -Math.cos(th));
        const r = r0 * (1 + 0.035 * drop * Math.sin(th * 8)) * (1 + 0.12 * back * back * drop * drop);
                P.push(Math.sin(th) * r, y, Math.cos(th) * r * flat - 0.005);
        UV.push((i / N), (1 - drop));
        // the top follows the waist (Spine), the middle the hips, and the hem stays on the floor
        const ws = Math.min(1, Math.max(0, (y - 0.95) / 0.13)), wr = Math.min(1, Math.max(0, (0.84 - y) / 0.6));
        SI.push(hips, spine, floor, 0);
        SW.push(1 - ws - wr, ws, wr, 0);
      }
    }
    for (let j = 0; j < prof.length - 1; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + N + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    skinned(body, geo, tulle);
  }

  // the hair up: the bob's ends gathered in above the nape, and a low bun at the back
  {
    const hair = find(root, 'Hair_F_bob');
    const g = (hair.geometry = hair.geometry.clone());
    const pos = g.attributes.position, p = new THREE.Vector3();
    const TOP = 1.6, LOW = 1.447;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (p.y >= TOP) continue;
      const t = (TOP - p.y) / (TOP - LOW);
      p.y = TOP - (TOP - p.y) * 0.5;
      const k = 1 - 0.2 * t;
      p.x *= k;
      p.z = -0.02 + (p.z + 0.02) * k;
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    const dark = new THREE.MeshLambertMaterial({ color: HAIR });
    rigid(body, new THREE.SphereGeometry(0.068, 16, 12).scale(1.15, 0.82, 0.8).translate(0, 1.575, -0.135), dark, 'Head');
    // the white flower at her left, behind the ear
    const petals = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      petals.push(new THREE.SphereGeometry(0.018, 8, 6).scale(1, 0.55, 1).translate(Math.cos(a) * 0.019, 0, Math.sin(a) * 0.019));
    }
    const bloom = merge(petals).rotateZ(-1.1).translate(0.112, 1.6, -0.09);
    rigid(body, bloom, new THREE.MeshLambertMaterial({ color: 0xfdfbf6 }), 'Head');
    rigid(body, new THREE.SphereGeometry(0.009, 8, 6).translate(0.118, 1.603, -0.09), new THREE.MeshLambertMaterial({ color: 0xe8d9a8 }), 'Head');
  }
}

// ---------- helpers ----------
function find(root, name) {
  let hit = null;
  root.traverse((o) => { if (!hit && o.name === name) hit = o; });
  return hit;
}

// A copy of a skinned mesh stood `off` metres out along its normals, cut where edge(p, i) falls
// to 0 (kept where it is above). The cut is drawn by the alpha test (edgeMap), not by dropping
// triangles, so it runs straight across the parts' big low-poly triangles instead of zigzagging
// along their edges. uv: wrapped round the body, for a pattern.
function shell(mesh, off, edge) {
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal;
  const n = pos.count, p = new THREE.Vector3(), q = new THREE.Vector3();
  const P = new Float32Array(n * 3), UV = new Float32Array(n * 2), CUT = new Float32Array(n * 2), e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    e[i] = edge(q.copy(p), i);
    p.addScaledVector(q.fromBufferAttribute(nor, i), off).toArray(P, i * 3);
    UV[i * 2] = (Math.atan2(p.x, p.z) / (Math.PI * 2) + 0.5) * 4;
    UV[i * 2 + 1] = p.y * 4;
    CUT[i * 2] = Math.min(0.99, Math.max(0.01, 0.5 + e[i] * 4));
    CUT[i * 2 + 1] = 0.5;
  }
  const src = g.index ? g.index.array : [...Array(n).keys()];
  const tri = [];
  for (let i = 0; i < src.length; i += 3) if (e[src[i]] > 0 || e[src[i + 1]] > 0 || e[src[i + 2]] > 0) tri.push(src[i], src[i + 1], src[i + 2]);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', nor.clone());
  out.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  out.setAttribute('uv1', new THREE.BufferAttribute(CUT, 2));
  out.setAttribute('skinIndex', g.attributes.skinIndex.clone());
  out.setAttribute('skinWeight', g.attributes.skinWeight.clone());
  out.setIndex(tri);
  return out;
}
// the alpha map for a shell's cut, read through its second uv: clear left of the middle, solid right
let edgeTex = null;
function edgeMap() {
  if (!edgeTex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 1;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 32, 1);
    g.fillStyle = '#fff';
    g.fillRect(32, 0, 32, 1);
    edgeTex = new THREE.CanvasTexture(c);
    edgeTex.channel = 1;
  }
  return edgeTex;
}

// a mesh skinned to the body's own skeleton, sitting where the body sits
function skinned(body, geo, mat) {
  const m = new THREE.SkinnedMesh(geo, mat);
  m.position.copy(body.position);
  m.quaternion.copy(body.quaternion);
  m.scale.copy(body.scale);
  m.frustumCulled = false; // the bind-pose bounds don't follow the animation
  body.parent.add(m);
  m.bind(body.skeleton, body.bindMatrix);
  return m;
}

// a solid thing carried by one bone (in bind space)
function rigid(body, geo, mat, bone) {
  const b = body.skeleton.bones.findIndex((x) => x.name === bone);
  const n = geo.attributes.position.count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 ? 0 : b)), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 ? 0 : 1)), 4));
  return skinned(body, geo, mat);
}

function merge(geos) {
  const out = new THREE.BufferGeometry();
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const a of ['position', 'normal']) {
    const arr = [];
    for (const g of list) arr.push(...g.attributes[a].array);
    out.setAttribute(a, new THREE.Float32BufferAttribute(arr, 3));
  }
  return out;
}

function roundRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

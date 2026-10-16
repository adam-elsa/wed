// The other guests: people sitting at the tables, chatting in twos and threes, strolling about,
// so the venue isn't a ghost town. assets/chars/guests.glb holds every outfit on one skeleton with
// the pack's animations (built from ITHappy's Casino pack by tools/guests/); guests.json says which
// meshes make up which outfit.
//
// It is fetched in the background once a room exists, so the room never waits for it: the
// guests simply arrive a moment later. Each outfit's parts are merged into a single skinned mesh
// (one draw per material instead of one per garment), and every guest gets its own copy of the
// skeleton to animate.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const URL_GLB = 'assets/chars/guests.glb';
const URL_JSON = 'assets/chars/guests.json';
const FAR = 16;      // metres: further than this, animate every third frame
// The pack's sitting poses slump back 6-22 degrees, which on a straight-backed banquet chair
// pushes the shoulders through the chair back. Seated guests have the lower back set upright at
// the waist (to UPRIGHT, a touch forward) so they sit clear of it, then the upper back eases
// back by RELAX of that, and the head keeps the angle the animation gives it: relaxed, not
// bowed. The rest of the animation (talking, gestures, legs) is untouched.
const UPRIGHT = THREE.MathUtils.degToRad(-2);
const RELAX = 0.4;
const KEEP = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];

let loading = null;
function load() {
  if (!loading) {
    loading = Promise.all([
      new GLTFLoader().loadAsync(URL_GLB),
      fetch(URL_JSON).then((r) => r.json()),
    ]).then(([gltf, outfits]) => prepare(gltf, outfits));
    loading.catch(() => { loading = null; }); // let a later room try again
  }
  return loading;
}

// one geometry with just the attributes every part shares, indexed, in the skeleton's bind space
function tidy(mesh) {
  const src = mesh.geometry, g = new THREE.BufferGeometry();
  const n = src.getAttribute('position').count;
  for (const a of KEEP) {
    const s = src.getAttribute(a);
    if (a === 'skinIndex') g.setAttribute(a, new THREE.Uint16BufferAttribute(Array.from(s.array), 4));
    else if (a === 'uv' && !s) g.setAttribute(a, new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    else g.setAttribute(a, new THREE.Float32BufferAttribute(Array.from(s.array), s.itemSize));
  }
  g.setIndex(src.index ? Array.from(src.index.array) : [...Array(n).keys()]);
  g.applyMatrix4(mesh.bindMatrix);
  return g;
}

function prepare(gltf, outfits) {
  gltf.scene.updateMatrixWorld(true);
  const parts = {};
  let skeleton = null;
  gltf.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    skeleton = skeleton || o.skeleton;
    // a mesh with two materials comes in as a group of two, named after the group
    for (const n of new Set([o.name, o.parent && o.parent.name])) (parts[n] = parts[n] || []).push(o);
  });
  // the scene is lit with plain Lambert elsewhere; match it (and it is cheaper than standard)
  const mats = new Map();
  const lambert = (m) => {
    if (!mats.has(m)) {
      if (m.map && /palette/i.test(m.name)) {
        // flat colour swatches: never blur one into the next
        m.map.minFilter = m.map.magFilter = THREE.NearestFilter;
        m.map.generateMipmaps = false;
      }
      // two-sided: a hijab or a skirt is a single sheet, and its inside shows from below or behind
      mats.set(m, new THREE.MeshLambertMaterial({ map: m.map, color: m.color, side: THREE.DoubleSide }));
    }
    return mats.get(m);
  };
  const looks = {};
  for (const [key, names] of Object.entries(outfits)) {
    const byMat = new Map();
    let skirt = false, female = false;
    for (const n of names) {
      if (/^Skirt/.test(n)) skirt = true;
      if (/^Body_F/.test(n)) female = true;
      for (const m of parts[n] || []) {
        const mat = lambert(m.material);
        if (!byMat.has(mat)) byMat.set(mat, []);
        byMat.get(mat).push(tidy(m));
      }
    }
    const geos = [...byMat.values()].map((list) => (list.length > 1 ? mergeGeometries(list) : list[0]));
    const geo = mergeGeometries(geos, true);
    geo.computeBoundingSphere();
    geo.boundingSphere.radius *= 1.3; // room for the arms and a sitting pose
    looks[key] = { geo, mats: [...byMat.keys()], skirt, female };
  }
  // the bones on their own (with the armature node above them), to copy for each guest
  let top = skeleton.bones[0];
  while (top.parent && top.parent.isBone) top = top.parent;
  const rig = top.parent.clone(false);
  rig.add(top.clone(true));
  return {
    looks,
    rig,
    boneNames: skeleton.bones.map((b) => b.name),
    boneInverses: skeleton.boneInverses,
    clips: Object.fromEntries(gltf.animations.map((c) => [c.name, c])),
  };
}

// crowd: [{ x, z, yaw, pose: 'sit' | 'stand' | 'walk', y?, anim?, outfit?, to?: [x, z], lounge? }]
// `lounge`: sitting on a sofa or an armchair, so the pack's relaxed pose is kept as it is.
// yaw 0 faces +z (the same way the ballroom's chairs are turned). A walker strolls from (x, z)
// to `to` and back.
export function addGuests(scene, crowd, seed = 1) {
  const group = new THREE.Group();
  group.name = 'guests';
  scene.add(group);
  const people = [];
  let frame = 0, gone = false;
  const v = new THREE.Vector3();
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), ball = new THREE.Sphere(new THREE.Vector3(), 1.2);

  const ready = load().then((G) => {
    if (gone) return;
    const keys = Object.keys(G.looks);
    // deal the outfits out like cards, so neighbours rarely match
    let deck = [];
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const deal = () => {
      if (!deck.length) deck = keys.slice().sort(() => rnd() - 0.5);
      return deck.pop();
    };
    for (const c of crowd) {
      const key = c.outfit && G.looks[c.outfit] ? c.outfit : deal();
      const look = G.looks[key];
      const root = new THREE.Group();
      const rig = G.rig.clone(true);
      root.add(rig);
      const byName = {};
      rig.traverse((o) => { byName[o.name] = o; });
      const mesh = new THREE.SkinnedMesh(look.geo, look.mats);
      root.add(mesh);
      mesh.bind(new THREE.Skeleton(G.boneNames.map((n) => byName[n]), G.boneInverses), new THREE.Matrix4());
      if (c.pose === 'walk') mesh.userData.noBlock = true; // moves about: not something to stop against
      root.position.set(c.x, c.y || 0, c.z);
      root.rotation.y = c.yaw || 0;
      const anim = c.anim || pickAnim(c.pose, look, rnd);
      const mixer = new THREE.AnimationMixer(root);
      const clip = G.clips[anim] || G.clips.Idle;
      const action = mixer.clipAction(clip);
      action.time = rnd() * clip.duration;           // not all in step
      action.timeScale = 0.9 + rnd() * 0.2;
      action.play();
      group.add(root);
      if (c.pose === 'sit') {
        // the pack's sitting poses lean the hips about 10 cm to one side: slide the person
        // back across so they sit in the middle of the seat
        mixer.update(0);
        root.updateMatrixWorld(true);
        const hips = byName.Hips || byName.mixamorigHips;
        if (hips) {
          const off = root.worldToLocal(v.setFromMatrixPosition(hips.matrixWorld)).x;
          root.position.x -= Math.cos(root.rotation.y) * off;
          root.position.z += Math.sin(root.rotation.y) * off;
        }
      }
      const p = { root, mixer, acc: 0 };
      // straight-backed chairs only: a sofa or an armchair is for lounging in (`lounge: true`)
      if (c.pose === 'sit' && !c.lounge) Object.assign(p, { spine: byName.Spine, chest: byName.Spine1, hips: byName.Hips, neck: byName.Neck, head: byName.Head });
      if (c.pose === 'walk' && c.to) {
        p.walk = { a: new THREE.Vector2(c.x, c.z), b: new THREE.Vector2(c.to[0], c.to[1]), k: rnd(), dir: 1, turn: 0 };
        p.walk.len = p.walk.a.distanceTo(p.walk.b);
      }
      people.push(p);
    }
  });

  return {
    ready,
    update(dt, camera) {
      frame++;
      if (camera) frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const p of people) {
        if (p.walk) stroll(p, dt);
        p.acc += dt;
        if (camera) {
          // nobody animates unseen, and far away every third frame is plenty
          ball.center.copy(p.root.position).y += 0.9;
          if (!frustum.intersectsSphere(ball)) continue;
          if (v.copy(p.root.position).distanceTo(camera.position) > FAR && frame % 3) continue;
        }
        p.mixer.update(p.acc);
        p.acc = 0;
        if (p.spine) straighten(p);
      }
    },
    dispose() {
      gone = true;
      for (const p of people) p.mixer.stopAllAction();
      group.removeFromParent();
    },
  };
}

// sit a seated guest up: lower back upright, upper back relaxed, head as the animation has it
const _h = new THREE.Vector3(), _n = new THREE.Vector3(), _axis = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _head = new THREE.Quaternion();
// turn `bone` by `angle` about a world-space axis, in the frame it turns in (its parent's)
function turnBone(bone, ax, ay, az, angle) {
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_pq).invert();
  _axis.set(ax, ay, az).applyQuaternion(_pq).normalize();
  bone.quaternion.premultiply(_q.setFromAxisAngle(_axis, angle));
}
function straighten(p) {
  if (!p.hips || !p.neck) return;
  p.root.updateMatrixWorld(true);
  p.root.worldToLocal(_h.setFromMatrixPosition(p.hips.matrixWorld));
  p.root.worldToLocal(_n.setFromMatrixPosition(p.neck.matrixWorld));
  const back = Math.atan2(_h.z - _n.z, _n.y - _h.y); // leaning back is positive (the guest faces +z)
  const fix = Math.max(0, back - UPRIGHT);
  // the men's poses also slump to one side by up to 20 cm: take most of that out too
  const roll = Math.atan2(_n.x - _h.x, _n.y - _h.y) * 0.75;
  const yaw = p.root.rotation.y;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);   // the guest's left-right axis
  const fx = Math.sin(yaw), fz = Math.cos(yaw);    // their forward axis
  if (p.head) p.head.getWorldQuaternion(_head);    // where the animation points the head
  // lower back: forward about left-right, upright about forward
  if (fix > 0) turnBone(p.spine, rx, 0, rz, fix);
  if (Math.abs(roll) > 0.01) turnBone(p.spine, fx, 0, fz, roll);
  // upper back: let it ease back again a little, as people sit
  if (p.chest && fix > 0) turnBone(p.chest, rx, 0, rz, -fix * RELAX);
  // head: back to the animation's own angle, so it isn't bowed by the turns below it
  if (p.head) {
    p.head.parent.updateWorldMatrix(true, false);
    p.head.parent.getWorldQuaternion(_pq).invert();
    p.head.quaternion.copy(_pq.multiply(_head));
  }
}

const SPEED = 0.9; // m/s, an unhurried stroll
const TURN = 0.8;  // seconds to turn round at either end
function stroll(p, dt) {
  const w = p.walk;
  const heading = Math.atan2((w.b.x - w.a.x) * w.dir, (w.b.y - w.a.y) * w.dir);
  if (w.turn > 0) { // turning round on the spot, the way they came
    w.turn = Math.max(0, w.turn - dt);
    p.root.rotation.y = heading - Math.PI * (w.turn / TURN);
    return;
  }
  w.k += (w.dir * SPEED * dt) / w.len;
  if (w.k >= 1 || w.k <= 0) {
    w.k = Math.min(1, Math.max(0, w.k));
    w.dir = -w.dir;
    w.turn = TURN;
  }
  p.root.position.x = w.a.x + (w.b.x - w.a.x) * w.k;
  p.root.position.z = w.a.y + (w.b.y - w.a.y) * w.k;
  p.root.rotation.y = heading;
}

function pickAnim(pose, look, rnd) {
  if (pose === 'walk') return 'Walk';
  if (pose === 'sit') {
    const talk = rnd() < 0.7;
    if (look.skirt) return talk ? 'SitTalk_Skirt' : 'Sit_Skirt';
    return (talk ? 'SitTalk_' : 'Sit_') + (look.female ? 'F' : 'M');
  }
  const r = rnd();
  return r < 0.35 ? 'Listen' : r < 0.65 ? 'Talk' : r < 0.9 ? 'Idle' : 'Happy';
}

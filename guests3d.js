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
// pushes the shoulders through the chair back, and the head hangs. Guests on those chairs sit up
// properly: the lower back, the upper back and the neck are each turned to stand upright (the
// lower back a touch forward, UPRIGHT, so it stays clear of the chair), and the head is brought
// most of the way (HEAD_LEVEL) to how it sits when standing: level, looking ahead. Arms, legs
// and the talking gestures are left as the animation has them.
const UPRIGHT = THREE.MathUtils.degToRad(-2);
const HEAD_LEVEL = 0.8;
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
      // The other guests aren't obstacles: you walk through them, as in most games of this kind.
      // (Blocking by their bounds, the skeleton's T-pose with the arms out 1.4 m wide, shut the
      // gaps between the tables; even a body-sized footprint left the way past a drinks table
      // too tight.) The chairs the seated ones sit on still block.
      mesh.userData.noBlock = true;
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
      let sat = null;
      if (c.pose === 'sit') {
        sat = posture(root, byName);
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
      if (c.pose === 'sit' && !c.lounge && sat) p.posture = sat;
      if (c.pose === 'walk' && c.to) {
        p.walk = { a: new THREE.Vector2(c.x, c.z), b: new THREE.Vector2(c.to[0], c.to[1]), k: rnd(), dir: 1, turn: 0 };
        p.walk.len = p.walk.a.distanceTo(p.walk.b);
      }
      people.push(p);
    }
  });

  return {
    ready,
    group,
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
        if (p.posture) sitUp(p);
      }
    },
    dispose() {
      gone = true;
      for (const p of people) p.mixer.stopAllAction();
      group.removeFromParent();
    },
  };
}

// sit a seated guest up: each piece of the back and the neck turned to stand upright, the head levelled
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(), _q = new THREE.Quaternion(), _w = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
// turn `bone` (in world space, the shortest way) so the line from it to `child` points along `dir`
function aim(bone, child, dir) {
  _a.setFromMatrixPosition(bone.matrixWorld);
  _b.setFromMatrixPosition(child.matrixWorld).sub(_a).normalize();
  _q.setFromUnitVectors(_b, dir);
  bone.getWorldQuaternion(_w).premultiply(_q);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_w));
  bone.updateWorldMatrix(false, true);
}
// What sitUp straightens for someone: the pieces of the back and the neck, and the head as it
// sits when standing, relative to them (level, looking ahead). Taken before any animation has
// moved the bones (the bind pose), with the person already turned the way they sit.
export function posture(root, byName) {
  if (!byName.Spine || !byName.Spine1 || !byName.Neck || !byName.Head) return null;
  root.updateMatrixWorld(true);
  const headRest = root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(byName.Head.getWorldQuaternion(new THREE.Quaternion()));
  return { segs: [[byName.Spine, byName.Spine1, UPRIGHT], [byName.Spine1, byName.Neck, 0], [byName.Neck, byName.Head, 0]], head: byName.Head, headRest };
}
// p: { root, posture } (also used by live3d.js for the wedding day's seated people)
export function sitUp(p) {
  const { segs, head, headRest } = p.posture;
  p.root.updateMatrixWorld(true);
  const yaw = p.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
  for (const [bone, child, lean] of segs) {
    // straight up, tipped `lean` toward the back (negative: a touch forward)
    _up.set(-fx * Math.sin(lean), Math.cos(lean), -fz * Math.sin(lean));
    aim(bone, child, _up);
  }
  if (headRest) {
    // most of the way to the standing head: level and looking ahead, a little of the talking left
    p.root.getWorldQuaternion(_rq).multiply(headRest);
    head.getWorldQuaternion(_w).slerp(_rq, HEAD_LEVEL);
    head.parent.getWorldQuaternion(_pq).invert();
    head.quaternion.copy(_pq.multiply(_w));
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

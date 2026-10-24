// Emotes and sitting for the guests' own characters (thirdperson3d.js for you, net3d.js for the
// others): waving, clapping, cheering, dancing, an air hug, a toast, salam, a heart and a bow.
//
// The characters' file has only a handful of animations (Idle, Walk, Talk, Listen, Happy, Clap and
// the sitting ones), so most emotes are made here, on top of Idle: after the animation has posed
// the skeleton for the frame, the arms (and for the bow, the back) are turned to point where the
// emote wants them, given as directions in the character's own space (x to its left, y up, z
// ahead), so they read the same whichever way the character is facing. Each eases in and out.
// Sitting is the live day's formal sitting (live3d.js): the skirt sitting pose, the back and head
// straightened, the right arm copying the left.
import * as THREE from 'three';
import { posture, sitUp } from './guests3d.js';

const L = window.L || ((id) => id);
const EASE = 0.3; // seconds to ease into an emote, and out of it

// { id, label, icon, dur (seconds), clip (an animation of its own, else Idle under the arms) }
export const EMOTES = [
  { id: 'wave', label: L('Lambai', 'Wave'), icon: '👋', dur: 3 },
  { id: 'clap', label: L('Tepuk Tangan', 'Clap'), icon: '👏', dur: 4, clip: 'Clap' },
  { id: 'cheer', label: L('Hore', 'Cheer'), icon: '🙌', dur: 3 },
  { id: 'dance', label: L('Joget', 'Dance'), icon: '💃', dur: 8 },
  { id: 'hug', label: L('Peluk', 'Hug'), icon: '🤗', dur: 3.5 },
  { id: 'toast', label: L('Bersulang', 'Toast'), icon: '🥂', dur: 4 },
  { id: 'salam', label: L('Salam', 'Salam'), icon: '🙏', dur: 3 },
  { id: 'love', label: L('Love', 'Love'), icon: '❤️', dur: 3.5 },
  { id: 'bow', label: L('Hormat', 'Bow'), icon: '🙇', dur: 3 },
];
export const emoteById = (id) => EMOTES.find((e) => e.id === id) || null;

// Each emote: for time t (seconds) the arm directions, as [upper arm, forearm] per side
// (r: the character's right, -x; l: its left, +x), an optional lean of the back (radians,
// forward), and offsets to the whole character (dy: up, yaw: a turn).
const TAU = Math.PI * 2;
const arms = {
  wave: (t) => ({ r: [[-0.55, 0.8, 0.2], [-0.15 + 0.45 * Math.sin(TAU * 1.6 * t), 1, 0.15]] }),
  cheer: (t) => {
    const s = Math.abs(Math.sin(TAU * 1.2 * t));
    return { r: [[-0.42, 0.85 + 0.15 * s, 0.15], [-0.25, 1, 0.1]], l: [[0.42, 0.85 + 0.15 * s, 0.15], [0.25, 1, 0.1]], dy: 0.03 * s };
  },
  dance: (t) => {
    const s = Math.sin(TAU * 0.9 * t);
    return {
      l: [[0.7, -0.3, 0.4], [0.1, 0.55 + 0.3 * s, 0.8]],
      r: [[-0.7, -0.3, 0.4], [-0.1, 0.55 - 0.3 * s, 0.8]],
      yaw: 0.3 * Math.sin(TAU * 0.45 * t),
      dy: 0.035 * Math.abs(Math.sin(TAU * 0.9 * t)),
    };
  },
  hug: (t) => ({ l: [[0.5, -0.05, 0.86], [-0.8, 0.05, 0.6]], r: [[-0.5, -0.05, 0.86], [0.8, 0.05, 0.6]], yaw: 0.12 * Math.sin(TAU * 0.5 * t) }),
  toast: (t) => {
    const up = 0.5 - 0.5 * Math.cos(TAU * 0.5 * t); // raised, clinked, lowered a little, raised again
    return { r: [[-0.3, 0.1 + 0.3 * up, 0.94], [-0.05, 0.85, 0.5 - 0.2 * up]] };
  },
  salam: () => ({ l: [[0.3, -0.8, 0.5], [-0.85, 0.45, 0.35]], r: [[-0.3, -0.8, 0.5], [0.85, 0.45, 0.35]] }),
  love: () => ({ l: [[0.35, 0.92, 0.02], [-0.7, 0.65, 0.1]], r: [[-0.35, 0.92, 0.02], [0.7, 0.65, 0.1]] }),
  bow: () => ({ l: [[0.3, -0.8, 0.5], [-0.85, 0.45, 0.35]], r: [[-0.3, -0.8, 0.5], [0.85, 0.45, 0.35]], lean: 0.45 }),
};

// how far into an emote it shows: eased in, held, eased out at its end
export function emoteWeight(id, t) {
  const e = emoteById(id);
  if (!e) return 0;
  const k = Math.min(1, t / EASE, (e.dur - t) / EASE);
  return Math.max(0, k * k * (3 - 2 * k));
}
// the turn and lift an emote gives the whole character (the dance), for the root before posing
export function emoteOffset(id, t) {
  const f = arms[id];
  if (!f) return { dy: 0, yaw: 0 };
  const a = f(t), w = emoteWeight(id, t);
  return { dy: (a.dy || 0) * w, yaw: (a.yaw || 0) * w };
}

// Everything posing needs to know about one character, worked out once while it still stands in
// its bind pose (straight after createAvatar, before any animation has run).
export function poser(root) {
  const bones = {};
  root.traverse((o) => { if (o.isBone && !bones[o.name]) bones[o.name] = o; });
  return { root, bones, sat: { root, posture: posture(root, bones) }, glass: null };
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _w = new THREE.Quaternion(), _p = new THREE.Quaternion(), _t = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
// turn `bone` (by w of the way) so the line from it to `child` points along `dir`, a direction in
// the character's own space
function aim(P, bone, child, dir, w) {
  if (!bone || !child || w <= 0) return;
  _d.set(dir[0], dir[1], dir[2]).normalize().applyAxisAngle(_up, P.root.rotation.y);
  _a.setFromMatrixPosition(bone.matrixWorld);
  _b.setFromMatrixPosition(child.matrixWorld).sub(_a).normalize();
  _q.setFromUnitVectors(_b, _d);
  bone.getWorldQuaternion(_w).premultiply(_q);
  bone.parent.getWorldQuaternion(_p).invert();
  _t.copy(_p).multiply(_w);
  bone.quaternion.slerp(_t, w);
  bone.updateWorldMatrix(false, true);
}

// After the animation has posed the frame: the emote's arms (and lean) on top, t seconds in.
export function poseEmote(P, id, t) {
  const f = arms[id];
  const w = emoteWeight(id, t);
  if (P.glass) P.glass.visible = false;
  if (!f || w <= 0) return;
  const a = f(t), B = P.bones;
  P.root.updateMatrixWorld(true);
  if (a.lean) {
    aim(P, B.Spine, B.Spine1, [0, Math.cos(a.lean), Math.sin(a.lean)], w);
    aim(P, B.Spine1, B.Neck, [0, Math.cos(a.lean * 1.2), Math.sin(a.lean * 1.2)], w);
  }
  for (const [side, pre] of [['l', 'Left'], ['r', 'Right']]) {
    if (!a[side]) continue;
    aim(P, B[`${pre}Arm`], B[`${pre}ForeArm`], a[side][0], w);
    aim(P, B[`${pre}ForeArm`], B[`${pre}Hand`], a[side][1], w);
  }
  if (id === 'toast') holdGlass(P, w);
}

// a flute of something sparkling in the right hand, for the toast
function holdGlass(P, w) {
  if (!P.glass) {
    const g = new THREE.Group();
    const glass = new THREE.MeshLambertMaterial({ color: 0xeaf4f6, transparent: true, opacity: 0.55 });
    const fizz = new THREE.MeshLambertMaterial({ color: 0xf3d58a, emissive: 0x3a2a08 });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.018, 0.12, 10), glass);
    bowl.position.y = 0.13;
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.017, 0.08, 10), fizz);
    drink.position.y = 0.115;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 6), glass);
    stem.position.y = 0.035;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.006, 10), glass);
    g.add(bowl, drink, stem, foot);
    g.traverse((o) => { o.userData.noBlock = true; });
    P.glass = g;
  }
  const hand = P.bones.RightHand;
  if (!hand) return;
  if (P.glass.parent !== P.root.parent && P.root.parent) P.root.parent.add(P.glass);
  hand.getWorldPosition(P.glass.position);
  P.glass.position.y -= 0.05;
  P.glass.rotation.y = P.root.rotation.y;
  P.glass.scale.setScalar(Math.max(0.01, w) * P.root.scale.x);
  P.glass.visible = true;
}

// Sitting properly, after the sitting animation has posed the frame (`lounge`: a sofa or an
// armchair, where leaning back is fine and only the arms are tidied)
export function poseSit(P, lounge) {
  if (!lounge && P.sat.posture) sitUp(P.sat);
  mirrorArms(P.bones);
}
export const SIT_CLIP = 'Sit_Skirt'; // legs together, hands in the lap: it suits anyone

// The sitting pose was made on the women's figure: on anyone the right arm swings out from the
// lap. The right arm copies the left (mirrored), so the hands rest together.
export function mirrorArms(bones) {
  for (const n of ['Shoulder', 'Arm', 'ForeArm', 'Hand']) {
    const l = bones[`Left${n}`], r = bones[`Right${n}`];
    if (l && r) r.quaternion.set(l.quaternion.x, -l.quaternion.y, -l.quaternion.z, l.quaternion.w);
  }
}

export function disposePoser(P) {
  if (P && P.glass) P.glass.removeFromParent();
}

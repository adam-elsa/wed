// The guest's own character: one gender's parts (assets/chars/avatar_*.glb, from the modular
// .blend files in assets/chars/blenderfilesmodular via tools/guests/export_modular.py) all on one
// skeleton, with only the chosen part showing in each slot. avatar.json lists each slot's choices.
//
// A look is { gender: 'female' | 'male', parts: { Skin, Head, Hat, Top, Bottom, Shoes } }: Head is a
// hair or (for women) a hijab; Hat is a peci (men) or null. A peci switches on its hair's tuck shape
// key, which keeps the hair under the cap. A part with a `tint` in avatar.json (the hijab, the
// pashmina) is painted whatever colour the guest picked: look.colors[slot] as #rrggbb, else its tint.
// The creator (creator3d.js) makes one; the venue keeps it in
// localStorage (LOOK_KEY) for whatever walks the guest about.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const URL_JSON = 'assets/chars/avatar.json';
const BASE = 'assets/chars/';
export const LOOK_KEY = 'ae-character';
export const SLOTS = ['Skin', 'Head', 'Hat', 'Top', 'Bottom', 'Shoes'];
const OPTIONAL = new Set(['Hat']);

let manifest = null;
export function loadManifest() {
  if (!manifest) {
    manifest = fetch(URL_JSON).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    manifest.catch(() => { manifest = null; });
  }
  return manifest;
}

// the choices for one slot; Head puts the hijabs after the hair, each tagged with its kind
export function choices(M, gender, slot) {
  const s = M[gender].slots;
  if (slot !== 'Head') return s[slot] || [];
  return [...(s.Hair || []).map((c) => ({ ...c, kind: 'hair' })), ...(s.Hijab || []).map((c) => ({ ...c, kind: 'hijab' }))];
}

// the chosen part of a slot, if it is one the guest colours
export function tintable(M, gender, look, slot) {
  const id = look.parts[slot];
  return id ? choices(M, gender, slot).find((c) => c.id === id && c.tint) || null : null;
}
const HEX = /^#[0-9a-f]{6}$/i;

export function defaultLook(M, gender) {
  const d = M[gender].default;
  return { gender, colors: {}, parts: { Skin: d.Skin, Head: gender === 'female' ? d.Hijab || d.Hair : d.Hair, Hat: d.Hat || null, Top: d.Top, Bottom: d.Bottom, Shoes: d.Shoes } };
}

// a saved look, checked against what the parts files have now (anything gone falls back to the default)
export function tidyLook(M, look) {
  const gender = look && M[look.gender] ? look.gender : 'female';
  const out = defaultLook(M, gender);
  for (const slot of SLOTS) {
    const id = look && look.parts && look.parts[slot];
    if (id && choices(M, gender, slot).some((c) => c.id === id)) out.parts[slot] = id;
    else if (OPTIONAL.has(slot) && look && look.gender === gender && look.parts && 'Hat' in look.parts && !id) out.parts[slot] = null;
    const c = look && look.colors && look.colors[slot];
    if (c && HEX.test(c) && tintable(M, gender, out, slot)) out.colors[slot] = c.toLowerCase();
  }
  return out;
}

export function savedLook() {
  try { return JSON.parse(localStorage.getItem(LOOK_KEY) || 'null'); } catch (err) { return null; }
}
export function saveLook(look) {
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (err) { /* private mode: kept for this visit only */ }
}

const kits = {};
export function loadKit(gender) {
  if (!kits[gender]) {
    kits[gender] = loadManifest()
      .then((M) => new GLTFLoader().loadAsync(BASE + M[gender].glb))
      .then((gltf) => {
        // the venue is lit for plain Lambert; two-sided, since a hijab or a skirt is one sheet
        const mats = new Map();
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          const m = o.material;
          if (!mats.has(m)) {
            if (m.map && /palette/i.test(m.name)) {
              m.map.minFilter = m.map.magFilter = THREE.NearestFilter; // flat swatches: never blur one into the next
              m.map.generateMipmaps = false;
            }
            mats.set(m, new THREE.MeshLambertMaterial({ map: m.map, color: m.color, side: THREE.DoubleSide }));
          }
          o.material = mats.get(m);
        });
        return { gltf, clips: Object.fromEntries(gltf.animations.map((c) => [c.name, c])) };
      });
    kits[gender].catch(() => { delete kits[gender]; });
  }
  return kits[gender];
}

// one dressed character. wear(look) swaps parts; play(name) crossfades to an animation.
export function createAvatar(kit, M) {
  const root = cloneSkinned(kit.gltf.scene);
  const parts = {};
  root.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false; // the bind-pose bounds don't follow the animation
    if (o.name && (o.isMesh || o.isGroup) && !o.isBone) parts[o.name] = parts[o.name] || o;
  });
  const faces = Object.keys(parts).filter((n) => /^Face_/.test(n));
  // a coloured part gets plain materials of its own (no texture), so its colour can be anything
  const painted = new Map();
  const paint = (id, hex) => {
    const node = parts[id];
    if (!node) return;
    if (!painted.has(id)) {
      const mats = [];
      node.traverse((o) => {
        if (!o.isMesh) return;
        o.material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
        mats.push(o.material);
      });
      painted.set(id, mats);
    }
    for (const m of painted.get(id)) m.color.set(hex);
  };
  const mixer = new THREE.AnimationMixer(root);
  let action = null;
  let look = null;
  return {
    root,
    wear(next) {
      look = next;
      const on = new Set([...Object.values(next.parts).filter(Boolean), ...faces]);
      for (const [name, o] of Object.entries(parts)) {
        if (o.parent && parts[o.parent.name] === o.parent) continue; // a piece of a part: goes with it
        if (/^(Body|Face|Hair|Hijab|Pashmina|Peci|Rajut|Top|Pants|Skirt|Shoes|Heels|Sneakers)_/.test(name)) o.visible = on.has(name);
      }
      // under a peci, the hair is tucked in (its shape key for that kind of cap)
      const hat = M && next.parts.Hat && (M[next.gender].slots.Hat || []).find((c) => c.id === next.parts.Hat);
      const tuck = hat && hat.tuck;
      if (M) {
        for (const slot of SLOTS) {
          const t = tintable(M, next.gender, next, slot);
          if (t) paint(t.id, (next.colors && next.colors[slot]) || t.tint);
        }
      }
      const hair = parts[next.parts.Head];
      if (hair) hair.traverse((o) => {
        if (!o.morphTargetDictionary) return;
        for (const [k, i] of Object.entries(o.morphTargetDictionary)) o.morphTargetInfluences[i] = k === tuck ? 1 : 0;
      });
    },
    get skirt() { return !!look && /^Skirt/.test(look.parts.Bottom); },
    play(name, fade = 0.3) {
      const clip = kit.clips[name] || kit.clips.Idle;
      const next = mixer.clipAction(clip);
      if (next === action) return;
      next.reset().play();
      if (action) next.crossFadeFrom(action, fade, false);
      action = next;
    },
    update(dt) { mixer.update(dt); },
    dispose() {
      mixer.stopAllAction();
      root.removeFromParent();
      for (const mats of painted.values()) mats.forEach((m) => m.dispose());
    },
  };
}

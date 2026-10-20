// Third person: the guest's own character (their look from the creator) walking about the
// lobby and the ballroom, with the camera following behind and a little over the shoulder.
//
// The rooms don't know about it. They go on putting the camera at the guest's eyes each frame,
// exactly as in first person; after they have, place() stands the character on the floor
// under those eyes and moves the camera back behind them, and before the next frame restore()
// puts the camera back at the eyes, so the rooms' own smoothing never sees the difference.
// The character faces the way it is walking (so walking back turns it round), plays Walk
// while moving (quicker when hurrying) and Idle when still.
import * as THREE from 'three';
import { loadManifest, loadKit, createAvatar, tidyLook } from './avatar3d.js';

const DIST = 3.1;          // metres behind the eyes
const SHOULDER = 0.42;     // to the right, so the crosshair in the middle stays clear of the character
const LIFT = 0.45;         // and a little above
const TILT = THREE.MathUtils.degToRad(9); // looking down a touch, so the whole character is in frame
const WALL = 0.3;          // never closer than this to a wall, the floor or the ceiling
const TURN = 10;           // how quickly the character turns to face where it's going
const BLEND = 0.45;        // seconds for the camera to swing out behind (or back in)
const STRIDE = 1.35;       // m/s that the Walk clip looks right at

export function createThirdPerson() {
  let avatar = null, loading = null;
  let on = false;                            // the guest has chosen third person (and has a character)
  const eye = { pos: new THREE.Vector3(), q: new THREE.Quaternion() };
  let applied = false;                       // the camera is out behind: restore() owes it back
  let k = 0;                                 // 0 at the eyes .. 1 fully behind
  let yaw = 0, prevX = null, prevZ = null, walking = false;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const pivot = new THREE.Vector3(), want = new THREE.Vector3();
  const tilt = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0);

  function load(look) {
    loading = loadManifest().then((M) => {
      const tidy = tidyLook(M, look);
      return loadKit(tidy.gender).then((kit) => {
        if (avatar) avatar.dispose();
        avatar = createAvatar(kit, M);
        avatar.wear(tidy);
        avatar.play('Idle', 0);
        // something walking about: not furniture to stop against, nor anything to click
        avatar.root.traverse((o) => { o.userData.noBlock = true; });
        avatar.root.visible = false;
        return avatar;
      });
    });
    loading.catch((err) => { console.error(err); loading = null; on = false; });
    return loading;
  }

  return {
    // the guest's look (or null: no character, so first person only)
    setLook(look) {
      if (!look) { on = false; return; }
      load(look);
    },
    available: () => !!loading,
    on: () => on,
    set(next) { on = !!next && !!loading; return on; },

    // put the camera back at the eyes before the room moves it on
    restore(camera) {
      if (!applied) return;
      camera.position.copy(eye.pos);
      camera.quaternion.copy(eye.q);
      applied = false;
    },

    // after the room has placed the camera at the eyes: stand the character there and step back.
    // `show` is false while the room has the camera on rails (a tour, a door), or in first person.
    place(camera, scene, bounds, dt, show) {
      const want1 = show && on && avatar;
      k = THREE.MathUtils.clamp(k + (want1 ? dt : -dt) / BLEND, 0, 1);
      if (!avatar) return;
      if (avatar.root.parent !== scene) scene.add(avatar.root);
      eye.pos.copy(camera.position);
      eye.q.copy(camera.quaternion);
      const x = eye.pos.x, z = eye.pos.z;

      // facing and pace, from how far the eyes moved since last frame
      let speed = 0;
      if (prevX !== null && dt > 0) {
        const vx = (x - prevX) / dt, vz = (z - prevZ) / dt;
        speed = Math.hypot(vx, vz);
        if (speed > 0.25) {
          const to = Math.atan2(vx, vz); // 0 faces +z, as the pack's characters do
          yaw += Math.atan2(Math.sin(to - yaw), Math.cos(to - yaw)) * (1 - Math.exp(-dt * TURN));
        }
      }
      prevX = x; prevZ = z;
      const moving = speed > 0.25 && speed < 12; // (a jump between rooms is not a stride)
      if (moving !== walking) { walking = moving; avatar.play(moving ? 'Walk' : 'Idle', 0.25); }
      if (moving) avatar.setSpeed(THREE.MathUtils.clamp(speed / STRIDE, 0.6, 1.8));
      avatar.root.position.set(x, 0, z);
      avatar.root.rotation.y = yaw;
      avatar.update(dt);

      const e = k * k * (3 - 2 * k);
      // fully at the eyes it would be looking out through its own head
      avatar.root.visible = e > 0.35;
      if (e <= 0) return;
      // behind, along where the guest is looking (so looking down lifts the camera over them)
      fwd.set(0, 0, -1).applyQuaternion(eye.q);
      right.crossVectors(fwd, up).normalize();
      pivot.set(x, eye.pos.y - 0.1, z);
      want.copy(pivot).addScaledVector(fwd, -DIST).addScaledVector(right, SHOULDER).addScaledVector(up, LIFT);
      // keep it inside the room: shorten the arm rather than go through a wall
      if (bounds) {
        let t = 1;
        const lim = (p0, p1, lo, hi) => {
          if (p1 < lo) t = Math.min(t, (p0 - lo) / Math.max(1e-4, p0 - p1));
          if (p1 > hi) t = Math.min(t, (hi - p0) / Math.max(1e-4, p1 - p0));
        };
        lim(pivot.x, want.x, bounds.x0 + WALL, bounds.x1 - WALL);
        lim(pivot.z, want.z, bounds.z0 + WALL, bounds.z1 - WALL);
        lim(pivot.y, want.y, WALL, (bounds.h || 5) - WALL);
        want.lerpVectors(pivot, want, Math.max(0, t));
      }
      camera.position.lerpVectors(eye.pos, want, e);
      camera.quaternion.copy(eye.q).multiply(tilt.setFromAxisAngle(X, -TILT * e));
      applied = true;
    },
  };
}

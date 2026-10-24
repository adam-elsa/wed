// What a guest can do in the lobby and the ballroom besides walking: sit down on a free chair,
// play an emote, and take photos in photo mode. gate3d.js owns one and calls it every frame.
//
// Sitting: near a free seat (the rooms' `seats`), "Duduk" shows at the bottom (F on a keyboard);
// the guest's eyes drop to a seated height over the chair and walking is held, and pushing to walk
// (or F, or the button again) stands them back up where they were. With a character, it sits on
// the chair too (thirdperson3d.js).
// Emotes: the button bottom right (E) opens the list in emotes3d.js (1-9 pick on a keyboard). The
// camera steps out behind the character while one plays, even in first person. With no character
// yet, the button makes one first.
// Photo mode: the button (P) frees the camera to fly anywhere in the room (the thumbstick and a
// drag on a phone; WASD, the mouse, space and C on a computer), hides everything else on the
// screen, and keeps the emotes to hand. The photo itself is a screenshot; the panel says how, and
// can tuck itself away for a few seconds (H on a keyboard) to take a clean one.
// A message for the couple: in front of the pelaminan (the ballroom's `stage`), "Tinggalkan
// Pesan" (M) opens a short form, sent to the guest book's Sheet (script.js's sendStageMessage).
// Others see the sitting and the emotes through net3d.js, with a relay that passes them on.
import * as THREE from 'three';
import { EMOTES } from './emotes3d.js';
import { savedName } from './net3d.js';

const L = window.L || ((id) => id);
const REACH = 1.25;      // metres from a seat that "Duduk" offers it
const SEAT_EYE = 1.18;   // eye height sitting, above the seat's own lift
const EASE = 0.35;       // seconds to sit down into the seat's view (and back up)
const FLY = 2.2;         // m/s for photo mode's camera (shift: quicker)
const TUCK = 5000;       // ms the photo panel stays out of the way for a clean screenshot

// hooks: { controls, tp, isTouch, hasCharacter(), makeCharacter() }
export function createActions({ controls, tp, isTouch, hasCharacter, makeCharacter }) {
  const $ = (id) => document.getElementById(id);
  const sitBtn = $('sitButton'), emoteBtn = $('emoteButton'), photoBtn = $('photoButton');
  const menu = $('emoteMenu'), photoUi = $('photoUi');
  const msgBtn = $('msgButton'), msgForm = $('stageMsg');
  const key = (k) => (isTouch ? '' : `<span class="view-key">${L(`tekan "${k}"`, `press "${k}"`)}</span>`);

  // the emote buttons: in the menu, and along photo mode's panel
  const fillEmotes = (box, keys) => {
    if (!box) return;
    box.innerHTML = '';
    EMOTES.forEach((e, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emote-choice';
      b.innerHTML = `<span class="emote-icon" aria-hidden="true">${e.icon}</span><span>${e.label}</span>${keys && !isTouch ? `<span class="emote-num">${i + 1}</span>` : ''}`;
      b.addEventListener('click', () => play(e.id));
      box.appendChild(b);
    });
  };
  fillEmotes(menu && menu.querySelector('.emote-grid'), true);
  fillEmotes(photoUi && photoUi.querySelector('.photo-emotes'), false);
  if (emoteBtn) emoteBtn.querySelector('.view-state').innerHTML = `<span>Emote</span>${isTouch ? `<span>${L('ketuk untuk emote', 'tap to emote')}</span>` : key('E')}`;
  if (photoBtn) photoBtn.querySelector('.view-state').innerHTML = `<span>${L('Mode Foto', 'Photo Mode')}</span>${key('P')}`;
  const help = photoUi && photoUi.querySelector('.photo-help');
  if (help) {
    help.textContent = isTouch
      ? L('Tuas untuk terbang ke mana saja · geser layar untuk melihat · ambil foto dengan screenshot (tombol power + volume bawah)',
        'Use the joystick to fly anywhere · swipe to look · take the photo with a screenshot (power + volume down)')
      : L('WASD untuk terbang · mouse untuk melihat · Spasi / C naik turun · Shift lebih cepat · ambil foto dengan screenshot (PrtScn, atau ⌘⇧4 di Mac) · H sembunyikan panel',
        'WASD to fly · the mouse to look · Space / C up and down · Shift for speed · take the photo with a screenshot (PrtScn, or ⌘⇧4 on a Mac) · H hides this panel');
  }

  let room = null;        // the room up now (its seats and bounds), or null while not walking one
  let near = null;        // the seat "Duduk" is offering
  let seat = null;        // sitting on this one
  let sitK = 0;           // 0 standing .. 1 down in the seat's view
  const eyeAt = new THREE.Vector3(), seatEye = new THREE.Vector3();
  let photo = null;       // { pos, yaw, pitch } while in photo mode
  let tucked = 0;         // when the photo panel tucked itself away

  // ---------- sitting ----------
  function sit(s) {
    if (!s) return;
    stopEmote();
    seat = s;
    seatEye.set(s.x + Math.sin(s.yaw) * 0.12, SEAT_EYE + s.y, s.z + Math.cos(s.yaw) * 0.12);
    controls.hold(true);
    tp.sit(s);
  }
  function stand() {
    if (!seat) return;
    seat = null;
    controls.hold(false);
    tp.sit(null);
  }
  function toggleSit() {
    if (seat) stand();
    else if (near) sit(near);
  }
  if (sitBtn) sitBtn.addEventListener('click', toggleSit);

  // ---------- emotes ----------
  function openMenu(open) {
    if (!menu) return;
    if (open && !hasCharacter()) { makeCharacter(); return; } // something to do them with, first
    menu.hidden = !open;
    if (open) controls.unlock(); // the mouse is wanted for the list
  }
  function play(id) {
    openMenu(false);
    if (!hasCharacter()) { makeCharacter(); return; }
    stand();
    tp.emote(id);
  }
  function stopEmote() { tp.emote(null); }
  if (emoteBtn) emoteBtn.addEventListener('click', () => openMenu(menu ? menu.hidden : false));
  const menuClose = $('emoteClose');
  if (menuClose) menuClose.addEventListener('click', () => openMenu(false));

  // ---------- photo mode ----------
  function setPhoto(on, camera) {
    if (on === !!photo) return;
    openMenu(false);
    if (on) {
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      photo = { pos: camera.position.clone(), yaw: e.y, pitch: e.x };
      controls.hold(false);
    } else {
      photo = null;
      if (seat) controls.hold(true);
      tuck(false);
    }
    document.body.classList.toggle('is-photo', on);
    if (photoUi) photoUi.hidden = !on;
  }
  function tuck(on) {
    tucked = on ? performance.now() : 0;
    document.body.classList.toggle('is-photo-clean', on);
  }
  let lastCamera = null;
  if (photoBtn) photoBtn.addEventListener('click', () => lastCamera && setPhoto(true, lastCamera));
  const photoExit = $('photoExit'), photoTuck = $('photoTuck');
  if (photoExit) photoExit.addEventListener('click', () => setPhoto(false));
  if (photoTuck) photoTuck.addEventListener('click', () => tuck(true));

  // ---------- a message for the couple ----------
  let atStage = false;
  function openMessage(open) {
    if (!msgForm) return;
    msgForm.hidden = !open;
    if (!open) return;
    openMenu(false);
    controls.unlock(); // the mouse is wanted for the form
    const status = msgForm.querySelector('.rsvp-status');
    status.textContent = '';
    status.className = 'rsvp-status';
    if (!msgForm.elements.name.value) msgForm.elements.name.value = savedName() || '';
    setTimeout(() => (msgForm.elements.name.value ? msgForm.elements.message : msgForm.elements.name).focus(), 50);
  }
  if (msgBtn) msgBtn.addEventListener('click', () => openMessage(true));
  const msgCancel = $('stageMsgCancel');
  if (msgCancel) msgCancel.addEventListener('click', () => openMessage(false));
  if (msgForm) {
    msgForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = msgForm.querySelector('.rsvp-status');
      const name = msgForm.elements.name.value.trim(), message = msgForm.elements.message.value.trim();
      if (!name || message.length < 2) {
        status.textContent = L('Mohon isi nama dan pesanmu.', 'Please fill in your name and your message.');
        status.className = 'rsvp-status err';
        return;
      }
      status.textContent = L('Mengirim...', 'Sending...');
      status.className = 'rsvp-status';
      try {
        const sent = window.sendStageMessage ? await window.sendStageMessage(name, message) : 'preview';
        status.textContent = sent === 'preview'
          ? L('Terima kasih! (mode pratinjau, belum tersambung ke Google Sheet)', 'Thank you! (preview mode, not connected to the Google Sheet yet)')
          : L('Terima kasih! Pesanmu sudah kami terima 🤍', 'Thank you! We got your message 🤍');
        status.className = 'rsvp-status ok';
        msgForm.elements.message.value = '';
        setTimeout(() => openMessage(false), 2200);
      } catch (err) {
        status.textContent = L('Gagal mengirim. Silakan coba lagi.', 'Could not send. Please try again.');
        status.className = 'rsvp-status err';
      }
    });
  }

  // ---------- keys ----------
  window.addEventListener('keydown', (e) => {
    if (!room || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (document.body.classList.contains('is-creating')) return;
    if (e.code === 'KeyF' && !photo) toggleSit();
    else if (e.code === 'KeyE') openMenu(menu ? menu.hidden : false);
    else if (e.code === 'KeyP' && lastCamera) setPhoto(!photo, lastCamera);
    else if (e.code === 'KeyH' && photo) tuck(!tucked);
    else if (e.code === 'KeyM' && atStage && !photo) openMessage(true);
    else if (e.code === 'Escape') { if (msgForm && !msgForm.hidden) openMessage(false); else if (menu && !menu.hidden) openMenu(false); else if (photo) setPhoto(false); }
    else if (/^Digit[1-9]$/.test(e.code) && ((menu && !menu.hidden) || photo)) {
      const em = EMOTES[Number(e.code.slice(5)) - 1];
      if (em) play(em.id);
    } else return;
    e.preventDefault();
  });

  const show = (b, on) => { if (b && b.hidden === on) b.hidden = !on; };

  return {
    photo: () => !!photo,
    // what the others should see (net3d.js): sitting, or an emote
    pose() {
      const p = tp.pose();
      if (!p) return null;
      return seat ? { p, h: seat.y, yaw: seat.yaw, x: seat.x, z: seat.z } : { p };
    },
    // Every frame, after the room has placed the camera at the guest's eyes (and before third
    // person steps it back). r: { seats, bounds } of the room being walked, or null (on rails, on
    // the way through a door, or not in a room at all).
    afterRoom(camera, dt, r) {
      lastCamera = camera;
      if (r !== room) { stand(); room = r; if (!r) { setPhoto(false); openMenu(false); openMessage(false); } }
      show(emoteBtn, !!r);
      show(photoBtn, !!r);
      if (!r) { show(sitBtn, false); show(msgBtn, false); atStage = false; return; }
      // the nearest free seat in reach, if not sitting
      eyeAt.copy(camera.position);
      near = null;
      if (!seat && !photo) {
        let best = REACH;
        for (const s of r.seats || []) {
          const d = Math.hypot(s.x - eyeAt.x, s.z - eyeAt.z);
          if (d < best) { best = d; near = s; }
        }
      }
      // pushing to walk gets up
      if (seat && !photo && controls.pushed()) stand();
      show(sitBtn, !photo && (!!near || !!seat));
      // in front of the pelaminan: a message for the couple
      const z = r.stage;
      atStage = !!z && !photo && eyeAt.x > z.x0 && eyeAt.x < z.x1 && eyeAt.z > z.z0 && eyeAt.z < z.z1;
      show(msgBtn, atStage);
      if (msgBtn && !msgBtn.dataset.done) {
        msgBtn.dataset.done = '1';
        msgBtn.innerHTML = `<span>💌 ${L('Tinggalkan Pesan', 'Leave a Message')}</span>${key('M')}`;
      }
      if (sitBtn) {
        const label = seat ? L('Berdiri', 'Stand Up') : L('Duduk', 'Sit Down');
        const html = `<span>${label}</span>${key('F')}`;
        if (sitBtn.dataset.label !== label) { sitBtn.dataset.label = label; sitBtn.innerHTML = html; }
      }
      // down into the seat's view, and back up
      sitK = THREE.MathUtils.clamp(sitK + (seat ? dt : -dt) / EASE, 0, 1);
      if (sitK > 0) {
        const k = sitK * sitK * (3 - 2 * sitK);
        if (seat) camera.position.lerp(seatEye, k);
      }
    },
    // Every frame after third person has placed its camera: photo mode takes the camera over.
    afterThird(camera, dt) {
      if (tucked && performance.now() - tucked > TUCK && isTouch) tuck(false);
      if (!photo || !room) return;
      const look = controls.takeLook();
      photo.yaw += look.yaw;
      photo.pitch = THREE.MathUtils.clamp(photo.pitch + look.pitch, -1.35, 1.35);
      const { x, y, speed } = controls.axes();
      const v = FLY * (speed > 3 ? 2 : 1) * dt;
      const cy = Math.cos(photo.pitch);
      const fx = -Math.sin(photo.yaw) * cy, fy = Math.sin(photo.pitch), fz = -Math.cos(photo.yaw) * cy;
      const rx = Math.cos(photo.yaw), rz = -Math.sin(photo.yaw);
      photo.pos.x += (fx * y + rx * x) * v;
      photo.pos.y += fy * y * v + controls.rise() * v;
      photo.pos.z += (fz * y + rz * x) * v;
      const b = room.bounds;
      if (b) {
        photo.pos.x = THREE.MathUtils.clamp(photo.pos.x, b.x0 + 0.2, b.x1 - 0.2);
        photo.pos.z = THREE.MathUtils.clamp(photo.pos.z, b.z0 + 0.2, b.z1 - 0.2);
        photo.pos.y = THREE.MathUtils.clamp(photo.pos.y, 0.15, (b.h || 5) - 0.15);
      }
      camera.position.copy(photo.pos);
      camera.rotation.set(photo.pitch, photo.yaw, 0, 'YXZ');
    },
  };
}

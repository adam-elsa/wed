// Multiplayer: the other guests who are in the venue right now, as their own characters, with
// their names over their heads. Everyone keeps one WebSocket open to a small relay
// (multiplayer/, a Cloudflare Durable Object) that passes each guest's whereabouts on to the
// rest; GitHub Pages still serves the site itself.
//
// Without a relay (RELAY_URL empty and no ?relay= in the link), or if it can't be reached, the
// venue is exactly as it was: just you and the crowd of extras. ?relay=ws://127.0.0.1:8787/ws
// points a page at a relay running on this computer (npx wrangler dev in multiplayer/).
import * as THREE from 'three';
import { loadManifest, loadKit, createAvatar, tidyLook, defaultLook } from './avatar3d.js';

// the deployed relay (multiplayer/, on Adam's Cloudflare account); '' turns multiplayer off
export const RELAY_URL = 'wss://adam-elsa-venue.adam-ramdhan71.workers.dev/ws';

const SEND_HZ = 5;          // updates a second at most, and only when something changed
const KEEPALIVE = 4;        // seconds: say where I am now and then even standing still
const FOLLOW = 9;           // how quickly someone else's character catches up with their updates
const SNAP = 4;             // metres: a jump that far (they went through a door) is not walked
const NAME_KEY = 'ae-guest-name';

export function relayUrl() {
  try {
    const q = new URLSearchParams(location.search).get('relay');
    if (q && /^wss?:\/\//.test(q)) return q;
  } catch (err) { /* no URL */ }
  return RELAY_URL;
}

export function savedName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch (err) { return ''; }
}
export function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (err) { /* private mode */ }
}

// a name tag: the name in a dark pill, always facing the camera
function nameTag(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '600 38px Jost, sans-serif';
  g.font = font;
  const w = Math.min(600, Math.ceil(g.measureText(text).width) + 44), h = 64;
  c.width = w; c.height = h;
  g.font = font;
  g.fillStyle = 'rgba(21,17,14,0.78)';
  g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 30); g.fill();
  g.strokeStyle = 'rgba(226,199,138,0.7)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#f2ece1'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  const H = 0.24;   // metres tall: readable a few tables away
  s.scale.set((H * w) / h, H, 1);
  s.position.y = 2.1;
  s.renderOrder = 10;
  return s;
}

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// start({ name, look }) once the guest has chosen; update() every frame with where they are.
export function createNet(onCount) {
  const url = relayUrl();
  const peers = new Map(); // id -> { name, look, s, avatar, tag, pos, yaw, walking, loading }
  let ws = null, myId = null, me = null, retry = 1, timer = 0, closed = false;
  let sendAcc = 0, sinceSent = 0, last = null;
  const track = { x: null, z: null, yaw: 0, walking: false };

  // how many are here, me included (0 while not connected)
  const count = () => { if (onCount) onCount(ws && ws.readyState === 1 && myId ? 1 + peers.size : 0); };

  function connect() {
    if (!url || closed) return;
    try { ws = new WebSocket(url); } catch (err) { return later(); }
    ws.onopen = () => {
      retry = 1;
      ws.send(JSON.stringify({ t: 'hi', name: me.name, look: me.look }));
      last = null; // tell them where I am straight away
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === 'welcome') {
        myId = m.id;
        for (const p of peers.values()) drop(p);
        peers.clear();
        for (const p of m.peers) add(p);
      } else if (m.t === 'join') add(m);
      else if (m.t === 'leave') { const p = peers.get(m.id); if (p) { drop(p); peers.delete(m.id); } }
      else if (m.t === 's') { const p = peers.get(m.id); if (p) p.s = m; }
      else if (m.t === 'look') { const p = peers.get(m.id); if (p) { p.look = m.look; dress(p); } }
      else if (m.t === 'name') { const p = peers.get(m.id); if (p) { p.name = m.name; retag(p); } }
      count();
    };
    ws.onclose = () => { ws = null; count(); later(); };
    ws.onerror = () => { try { ws.close(); } catch (err) { /* closing anyway */ } };
  }
  function later() {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(connect, retry * 1000);
    retry = Math.min(15, retry * 2);
  }

  function add(p) {
    if (p.id === myId || peers.has(p.id)) return;
    const peer = { id: p.id, name: p.name || 'Tamu', look: p.look, s: p.s || null, avatar: null, tag: null, pos: null, yaw: 0, walking: false };
    peers.set(p.id, peer);
    dress(peer);
  }
  function drop(p) {
    if (p.avatar) p.avatar.dispose();
    if (p.tag) { p.tag.material.map.dispose(); p.tag.material.dispose(); }
    p.avatar = null; p.gone = true;
  }
  function retag(p) {
    if (!p.avatar) return;
    if (p.tag) { p.tag.removeFromParent(); p.tag.material.map.dispose(); p.tag.material.dispose(); }
    p.tag = nameTag(p.name);
    p.avatar.root.add(p.tag);
  }
  // their character, in their look (someone who went in without making one gets a default)
  function dress(p) {
    const want = p.look;
    loadManifest().then((Mf) => {
      const look = want ? tidyLook(Mf, want) : defaultLook(Mf, hash(p.id) % 2 ? 'male' : 'female');
      return loadKit(look.gender).then((kit) => {
        if (p.gone || p.look !== want) return;
        const old = p.avatar;
        p.avatar = createAvatar(kit, Mf);
        p.avatar.wear(look);
        p.avatar.play(p.walking ? 'Walk' : 'Idle', 0);
        // you walk through each other, as through the crowd of extras
        p.avatar.root.traverse((o) => { o.userData.noBlock = true; });
        p.avatar.root.visible = false;
        if (old) { p.avatar.root.position.copy(old.root.position); old.dispose(); }
        retag(p);
      });
    }).catch((err) => console.error(err));
  }

  return {
    enabled: !!url,
    start(info) {
      if (!url || me) return;
      me = { name: info.name || 'Tamu', look: info.look || null };
      connect();
    },
    setName(name) {
      if (!me || !name || name === me.name) return;
      me.name = name;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'name', name }));
    },
    setLook(look) {
      if (!me) return;
      me.look = look || null;
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'look', look: me.look }));
    },
    // every frame. room: 'lobby' | 'ballroom' | null (on the way through a door); eye: where the
    // guest is (the camera before third person steps it back); mine: whether they're walking
    // under their own steam (not riding a photo tour, so their spot is where they left it).
    update(dt, room, scene, eye, mine) {
      // my own whereabouts: facing the way I walk, as my character does
      if (eye && mine) {
        if (track.x !== null && dt > 0) {
          const vx = (eye.x - track.x) / dt, vz = (eye.z - track.z) / dt, v = Math.hypot(vx, vz);
          track.walking = v > 0.25 && v < 12;
          if (track.walking) track.yaw = Math.atan2(vx, vz);
        }
        track.x = eye.x; track.z = eye.z;
      } else { track.walking = false; }
      sendAcc += dt; sinceSent += dt;
      if (ws && ws.readyState === 1 && room && track.x !== null && sendAcc >= 1 / SEND_HZ) {
        sendAcc = 0;
        const s = { r: room, x: +track.x.toFixed(2), z: +track.z.toFixed(2), y: +track.yaw.toFixed(2), a: track.walking ? 1 : 0 };
        const changed = !last || s.r !== last.r || Math.abs(s.x - last.x) > 0.03 || Math.abs(s.z - last.z) > 0.03 || Math.abs(s.y - last.y) > 0.05 || s.a !== last.a;
        if (changed || sinceSent > KEEPALIVE) {
          ws.send(JSON.stringify({ t: 's', ...s }));
          last = s; sinceSent = 0;
        }
      }

      // everybody else
      const k = 1 - Math.exp(-dt * FOLLOW);
      for (const p of peers.values()) {
        const a = p.avatar;
        if (!a) continue;
        const here = !!(room && p.s && p.s.r === room);
        if (!here) { a.root.visible = false; continue; }
        if (a.root.parent !== scene) scene.add(a.root);
        const tx = p.s.x, tz = p.s.z;
        if (!p.pos || Math.hypot(tx - p.pos.x, tz - p.pos.z) > SNAP || !a.root.visible) {
          p.pos = new THREE.Vector2(tx, tz); p.yaw = p.s.y;
        } else {
          p.pos.x += (tx - p.pos.x) * k; p.pos.y += (tz - p.pos.y) * k;
          p.yaw += Math.atan2(Math.sin(p.s.y - p.yaw), Math.cos(p.s.y - p.yaw)) * k;
        }
        const walking = !!p.s.a;
        if (walking !== p.walking) { p.walking = walking; a.play(walking ? 'Walk' : 'Idle', 0.25); }
        a.root.position.set(p.pos.x, 0, p.pos.y);
        a.root.rotation.y = p.yaw;
        a.root.visible = true;
        a.update(dt);
      }
    },
    dispose() {
      closed = true;
      clearTimeout(timer);
      if (ws) try { ws.close(); } catch (err) { /* closing anyway */ }
      for (const p of peers.values()) drop(p);
      peers.clear();
    },
  };
}

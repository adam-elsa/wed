// Low-poly hotel lobby with the couple's photos on the walls.
// Seen right after the guest walks through the hotel doors (gate3d.js).
//
// Room layout (metres-ish): x -10..10, z -12..12, the entrance door is at z = +12
// behind the camera. Ahead: wood panel wall, reception desk, slatted column (right).
// Left wall: lounge. Photos hang on the front, left and right walls.
import * as THREE from 'three';
import { buildBlockers, slide, EYE_H } from './fps.js';
import { addGuests } from './guests3d.js';

const W = 20, D = 24, H = 5.2;
const SLAT_H = H - 0.4; // leave a gap at the top for the warm cove light

// Wall items, grouped by what clicking them opens:
//   couple  -> "Kedua Mempelai" tour (Adam -> Elsa -> together)
//   map     -> "Lokasi & Tempat" (map + Akad/Resepsi times)
//   story   -> "Cerita Kami": the column + right-wall photos; each zooms in on its own,
//              the label shows them all together
//   rsvp    -> RSVP card: the reception desk (set up below)
//   venue   -> the door to the ballroom, and the photo beside it: step through (gate3d.js)
//   invite  -> the framed 2D invitation on the left wall: opens the invitation page over the venue
const PHOTOS = [
  { id: 'venue', group: 'venue', src: 'assets/img/04_Venue.jpg', pos: [-9.84, 2.6, -9.6], normal: [1, 0, 0], max: 2.5 },
  { id: 'invite', group: 'invite', src: 'assets/img/inv/cover.jpg', pos: [-9.84, 2.7, -5.6], normal: [1, 0, 0], max: 2.3, aspect: 0.7 },
  { id: 'adam', group: 'couple', src: 'assets/img/02_ProfileAdam.jpg', pos: [-1.89, 2.6, -11.94], normal: [0, 0, 1], max: 2.4 },
  { id: 'elsa', group: 'couple', src: 'assets/img/02_ProfileElsa.jpg', pos: [0.63, 2.6, -11.94], normal: [0, 0, 1], max: 2.4 },
  { id: 'together', group: 'couple', src: 'assets/img/01_Banner.jpg', pos: [3.75, 2.65, -11.94], normal: [0, 0, 1], max: 2.8 },
  { id: 'story-a', group: 'story', src: 'assets/img/05_TimingAkadResepsi.jpg', pos: [5.84, 2.6, -9.2], normal: [-1, 0, 0], max: 2.6 },
  { id: 'story-b', group: 'story', src: 'assets/img/06_FooterThankyou.jpg', pos: [8.0, 2.6, -5.84], normal: [0, 0, 1], max: 2.8 },
  { id: 'story-c', group: 'story', src: 'assets/img/07_Story1.jpg', pos: [9.84, 2.6, -4.55], normal: [-1, 0, 0], max: 2.7 },
  { id: 'story-d', group: 'story', src: 'assets/img/08_Story2.jpg', pos: [9.84, 2.6, -1.35], normal: [-1, 0, 0], max: 3.0 },
];
// map board right beside the door
const MAP_BOARD = { id: 'map', group: 'map', pos: [-4.86, 2.6, -11.94], normal: [0, 0, 1], max: 2.5, aspect: 1.45 };
// how far down the night backdrop its horizon sits; the plane is hung so this lands at eye level
const NIGHT_HORIZON = 0.66;
const DESK_X = -3.4;
const DOOR = { x: -8.1, w: 2.5, h: 3.35 };

export function createLobby() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17110c);

  const T = makeTextures();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });
  const M = {
    oak: std(0xb98a58, { roughness: 0.75 }),
    // The wall behind the slats. Near enough the average of a slat and the gap beside it
    // (oak covers 0.11 of every 0.26), because at a grazing angle the slats compress to less
    // than a pixel each and the pixel lands somewhere between the two: against near-black it
    // swung between bright oak and nothing, which is what the colour fringing was.
    backing: std(0x4a3625),
    ceiling: new THREE.MeshBasicMaterial({ color: 0xc9c4bb }),
    panel: new THREE.MeshStandardMaterial({ map: T.panels, roughness: 0.75 }),
    blackMarble: new THREE.MeshStandardMaterial({ map: T.blackMarble, roughness: 0.25, metalness: 0.1 }),
    sofa: std(0x6c6c6f, { roughness: 0.95 }),
    sofaDark: std(0x5c5c5f, { roughness: 0.95 }),
    chair: std(0xcdc4b6, { roughness: 0.95 }),
    black: std(0x151515, { roughness: 0.5 }),
    silver: std(0xd9d9dc, { roughness: 0.35, metalness: 0.5 }),
    rug: new THREE.MeshStandardMaterial({ map: T.rug, roughness: 1 }),
    pot: std(0xefece6, { roughness: 0.3 }),
    leaf: std(0x3e6b35),
    leaf2: std(0x557f3f),
    frame: std(0x1a1410, { roughness: 0.5 }),
    mat: new THREE.MeshBasicMaterial({ color: 0xf4efe6 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xfff0d2 }),
  };

  function add(geo, mat, x = 0, y = 0, z = 0, parent = scene) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  const boxB = (w, h, d, mat, x, y, z, parent) => add(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, parent);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xfff1e0, 0x5a4a3a, 1.1));
  for (const [x, y, z, c, i] of [
    [-8.4, 4.5, -2, 0xffd29a, 28], [8.4, 4.5, 2.5, 0xffd29a, 28], [DESK_X, 4.6, -10.4, 0xffd29a, 26],
    [0, 4.9, -1, 0xfff4e6, 30], [0, 4.9, 7, 0xfff4e6, 20],
  ]) {
    const l = new THREE.PointLight(c, i, 18, 1.4);
    l.position.set(x, y, z);
    scene.add(l);
  }

  // ---------- shell ----------
  const floor = add(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: T.marble, roughness: 0.3, metalness: 0.05 }), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  T.marble.repeat.set(2, 2.4);
  const ceil = add(new THREE.PlaneGeometry(W, D), M.ceiling, 0, H, 0);
  ceil.rotation.x = Math.PI / 2;
  add(new THREE.PlaneGeometry(D, H), M.backing, -W / 2, H / 2, 0).rotation.y = Math.PI / 2;
  add(new THREE.PlaneGeometry(D, H), M.backing, W / 2, H / 2, 0).rotation.y = -Math.PI / 2;

  // ---------- the way in: the hotel's glass entrance, seen from inside ----------
  // The guest walked through these doors on the way in and can now turn round and look back
  // at them. Night outside, the portico lit; a gold-framed curtain wall with a pair of glass
  // doors in the middle, and the warm spill of the entrance light on the marble.
  {
    const Z = D / 2;                       // the back wall
    const BAY = { w: 15.2, h: 4.1 };       // the glazed opening
    const DOORW = 1.3, DOORH = 2.75;       // each leaf
    const MULL = 0.09;                     // gold mullions between the panes
    const gold = std(0xcaa268, { roughness: 0.45, metalness: 0.45 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0d1420, roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.7,
      transmission: 0, side: THREE.DoubleSide, depthWrite: false,
    });

    const doorGlass = glass.clone();
    doorGlass.opacity = 0.78; // the leaves a touch heavier than the fixed panes, so they read as doors

    // The night beyond. Set a long way out and scaled to subtend the same angle, so that as
    // the guest walks it slides much less than the window frame does — the parallax is what
    // sells it as somewhere else rather than a picture stuck to the glass. The texture is
    // blurred, standing in for a lens focused on the room rather than the street.
    const FAR = 34, NEAR = 1.35, VIEW = 8;            // how far out, where it used to be, a typical standing distance
    const k = (VIEW + FAR) / (VIEW + NEAR);
    const nw = (BAY.w + 5) * k, nh = (BAY.h + 2.4) * k;
    // Scaling it up moves its horizon too, and a horizon 8 m up means the window looks at
    // nothing but sky. Hang it so the horizon lands at eye level whatever the scale.
    const nightY = EYE_H + nh * (NIGHT_HORIZON - 0.5);
    const night = add(new THREE.PlaneGeometry(nw, nh), new THREE.MeshBasicMaterial({ map: T.night, toneMapped: false }), 0, nightY, Z + FAR);
    night.rotation.y = Math.PI;

    // The wall around the opening, panelled like the rest of the room. Carried well past the
    // room's own corners, because the night behind it is now 90 m wide against a 20 m room:
    // without this it shows in the sliver past the corner where nothing else covers it.
    const sideW = (W - BAY.w) / 2 + 20;
    for (const sx of [-1, 1]) {
      const wall = add(new THREE.PlaneGeometry(sideW, H), M.panel, sx * (BAY.w + sideW) / 2, H / 2, Z);
      wall.rotation.y = Math.PI;
    }
    const header = add(new THREE.PlaneGeometry(BAY.w, H - BAY.h), M.panel, 0, BAY.h + (H - BAY.h) / 2, Z);
    header.rotation.y = Math.PI;

    // glass: one sheet across the bay, then the frame drawn over it
    const sheet = add(new THREE.PlaneGeometry(BAY.w, BAY.h), glass, 0, BAY.h / 2, Z - 0.02);
    sheet.rotation.y = Math.PI;

    // y is the bar's top; boxB places a box on its bottom, so take the whole height off
    const bar = (w, h, x, y, z = Z - 0.06) => boxB(w, h, 0.1, gold, x, y - h, z);
    bar(BAY.w + 0.2, 0.16, 0, BAY.h + 0.08);                 // head
    bar(BAY.w + 0.2, 0.14, 0, 0.14);                          // sill
    bar(BAY.w, 0.12, 0, DOORH + 0.12);                        // transom over the doors
    for (const sx of [-1, 1]) {
      bar(MULL, BAY.h, sx * BAY.w / 2, BAY.h);                // jambs
      bar(MULL, BAY.h, sx * (DOORW + 0.14), BAY.h);           // door jambs, full height
      for (let i = 1; i <= 3; i++) bar(MULL, BAY.h - DOORH - 0.12, sx * (DOORW + 0.14 + i * 1.72), BAY.h);
      for (let i = 1; i <= 3; i++) bar(MULL, DOORH, sx * (DOORW + 0.14 + i * 1.72), DOORH + 0.06);
    }

    // the two leaves, with the long handles the guest pushed on the way in
    for (const sx of [-1, 1]) {
      const cx = sx * DOORW / 2;
      const leaf = add(new THREE.PlaneGeometry(DOORW - 0.06, DOORH - 0.06), doorGlass, cx, DOORH / 2, Z - 0.1);
      leaf.rotation.y = Math.PI;
      bar(DOORW, 0.08, cx, DOORH, Z - 0.14);                  // leaf rails
      bar(DOORW, 0.1, cx, 0.1, Z - 0.14);
      bar(0.07, DOORH, cx - sx * (DOORW / 2 - 0.035), DOORH, Z - 0.14); // stiles
      bar(0.07, DOORH, cx + sx * (DOORW / 2 - 0.035), DOORH, Z - 0.14);
      // handle: a vertical bar on standoffs, inside
      const handle = std(0xb9bcc2, { roughness: 0.42, metalness: 0.5 });
      boxB(0.05, 1.15, 0.05, handle, cx - sx * 0.42, 0.95, Z - 0.26);
      for (const hy of [0.98, 2.02]) boxB(0.04, 0.04, 0.16, handle, cx - sx * 0.42, hy, Z - 0.19);
    }

    // the entrance light, and the pool of it on the marble just inside the doors
    const lamp = new THREE.PointLight(0xffd9a6, 15, 16, 1.7);
    lamp.position.set(0, 3.4, Z - 3.2);
    scene.add(lamp);
    const spill = add(new THREE.PlaneGeometry(BAY.w * 0.8, 7), new THREE.MeshBasicMaterial({
      map: T.wash, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false,
    }), 0, 0.015, Z - 3.6);
    spill.rotation.x = -Math.PI / 2;
    spill.rotation.z = Math.PI;
  }

  add(new THREE.PlaneGeometry(16, H), M.panel, -2, H / 2, -D / 2);         // wood panel wall ahead
  boxB(4, H, 6, M.backing, 8, 0, -9);                                        // slatted column (right)

  // vertical oak slats, one instanced mesh for every wall
  const slatSpots = [];
  const along = (from, to, step, fn) => { for (let v = from; v <= to; v += step) slatSpots.push(fn(v)); };
  along(-11.9, 11.9, 0.26, (z) => [-W / 2 + 0.05, z, true]);
  along(-5.9, 11.9, 0.26, (z) => [W / 2 - 0.05, z, true]);
  along(-11.9, -6.1, 0.26, (z) => [5.95, z, true]);
  along(6.1, 9.9, 0.26, (x) => [x, -5.95, false]);
  // a little wider than they were (0.11): thinner than this and they fall under a pixel
  // sooner, and it is the sub-pixel ones that flicker as the guest walks
  const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, SLAT_H, 0.1), M.oak, slatSpots.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), qSide = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const one = new THREE.Vector3(1, 1, 1);
  slatSpots.forEach(([x, z, side], i) => {
    mtx.compose(new THREE.Vector3(x, SLAT_H / 2, z), side ? qSide : q, one);
    slats.setMatrixAt(i, mtx);
  });
  scene.add(slats);

  // warm cove light washing down each wall + a glowing line at the top
  const wash = new THREE.MeshBasicMaterial({
    map: T.wash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, // never flicker against the wall behind
  });
  const washes = [
    [D, -W / 2 + 0.12, 0, Math.PI / 2], [18, W / 2 - 0.12, 3, -Math.PI / 2],
    [16, -2, -D / 2 + 0.03, 0], [6, 5.88, -9, -Math.PI / 2], [4, 8, -5.88, 0],
  ];
  for (const [len, x, z, ry] of washes) {
    // step each layer out along the wall's normal so no two surfaces share a plane
    // (they used to z-fight): wall/slats -> wash (+5 cm) -> glowing line (+10 cm)
    const nx = Math.sin(ry), nz = Math.cos(ry);
    add(new THREE.PlaneGeometry(len, 2.6), wash, x + nx * 0.05, H - 1.3, z + nz * 0.05).rotation.y = ry;
    add(new THREE.PlaneGeometry(len, 0.06), M.glow, x + nx * 0.1, SLAT_H + 0.05, z + nz * 0.1).rotation.y = ry;
  }

  // linear ceiling lights (black channels dotted with LEDs)
  const strip = new THREE.MeshBasicMaterial({ map: T.dots });
  T.dots.repeat.set(1, 14);
  for (const x of [-7.5, -3.8, 0, 3.8]) {
    const s = add(new THREE.PlaneGeometry(0.2, 17), strip, x, H - 0.01, -1.5);
    s.rotation.set(Math.PI / 2, 0, 0.32);
  }

  // ---------- reception ----------
  const deskMat = M.blackMarble.clone();
  const desk = boxB(4.6, 1.1, 1.1, deskMat, DESK_X, 0, -9.2);
  boxB(0.5, 0.02, 0.35, M.silver, DESK_X + 0.8, 1.1, -9.45);
  const screen = boxB(0.5, 0.34, 0.015, M.silver, DESK_X + 0.8, 1.12, -9.28);
  screen.rotation.x = -0.15;
  // pendant lights hanging over the desk
  const glowTex = T.glowDot;
  const sprite = (x, y, z, s, color = 0xffe2b0, opacity = 0.9) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(s);
    scene.add(sp);
    return sp;
  };
  [[-2, 4.45], [-1, 4.3], [0, 4.55], [1, 4.3], [2, 4.45]].forEach(([dx, y]) => {
    const x = DESK_X + dx;
    add(new THREE.CylinderGeometry(0.012, 0.012, H - y, 4), M.black, x, y + (H - y) / 2, -10.4);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), M.black, x, y + 0.25, -10.4);
    add(new THREE.SphereGeometry(0.04, 6, 4), M.glow, x, y, -10.4);
    sprite(x, y - 0.05, -10.4, 0.8);
  });

  // ---------- door to the ballroom (front wall, far left) ----------
  const doorFrameMat = M.black.clone();
  const doorMat = new THREE.MeshStandardMaterial({ map: T.door, roughness: 0.6 });
  const doorFrame = boxB(DOOR.w, DOOR.h, 0.14, doorFrameMat, DOOR.x, 0, -11.95);
  // two leaves hinged at the jambs; they swing out into the lobby, and the ballroom's
  // warm light shows between them
  const LEAF_W = (DOOR.w - 0.3) / 2, LEAF_H = DOOR.h - 0.2;
  add(new THREE.PlaneGeometry(LEAF_W * 2, LEAF_H), new THREE.MeshBasicMaterial({ map: T.doorGlow, toneMapped: false }), DOOR.x, LEAF_H / 2, -11.87);
  const doorLeaves = [-1, 1].map((s) => {
    const hinge = new THREE.Group();
    hinge.position.set(DOOR.x + s * LEAF_W, 0, -11.82);
    scene.add(hinge);
    const leaf = boxB(LEAF_W, LEAF_H, 0.06, doorMat, -s * LEAF_W / 2, 0, 0, hinge);
    boxB(0.05, 0.9, 0.08, M.silver, -s * (LEAF_W - 0.14), 1.1, 0.05, hinge);
    return { hinge, leaf, s };
  });
  const doorLight = new THREE.PointLight(0xffd9a0, 0, 12, 1.5);
  doorLight.position.set(DOOR.x, 2.2, -10.4);
  scene.add(doorLight);
  // 0 = shut, 1 = wide open
  function setDoor(k) {
    for (const { hinge, s } of doorLeaves) hinge.rotation.y = s * k * 1.75;
    doorLight.intensity = 45 * k;
  }

  // ---------- lounge (left wall) ----------
  const rug = add(new THREE.PlaneGeometry(5.2, 7), M.rug, -7.1, 0.01, -2);
  rug.rotation.x = -Math.PI / 2;
  // sofa against the wall, facing +x
  const sofa = new THREE.Group();
  boxB(3.3, 0.42, 1.0, M.sofaDark, 0, 0.08, 0, sofa);
  boxB(3.3, 0.6, 0.28, M.sofaDark, 0, 0.3, -0.38, sofa);
  for (const s of [-1, 1]) boxB(0.22, 0.62, 1.0, M.sofaDark, s * 1.65, 0.08, 0, sofa);
  for (const s of [-1, 1]) {
    boxB(1.5, 0.16, 0.72, M.sofa, s * 0.78, 0.5, 0.1, sofa);
    const back = boxB(1.5, 0.5, 0.2, M.sofa, s * 0.78, 0.62, -0.2, sofa);
    back.rotation.x = -0.18;
  }
  for (const [x, z] of [[-1.5, 0.4], [1.5, 0.4], [-1.5, -0.4], [1.5, -0.4]]) boxB(0.06, 0.08, 0.06, M.black, x, 0, z, sofa);
  sofa.position.set(-9.3, 0, -2);
  sofa.rotation.y = Math.PI / 2;
  scene.add(sofa);
  // armchairs facing the coffee table
  for (const [x, z] of [[-5.4, -4.6], [-5.4, 0.6]]) {
    const c = new THREE.Group();
    boxB(1.0, 0.4, 0.95, M.chair, 0, 0.1, 0, c);
    boxB(1.0, 0.75, 0.22, M.chair, 0, 0.1, -0.42, c);
    for (const s of [-1, 1]) boxB(0.18, 0.62, 0.95, M.chair, s * 0.5, 0.1, 0, c);
    boxB(0.7, 0.14, 0.62, M.chair, 0, 0.5, 0.08, c);
    for (const [lx, lz] of [[-0.42, 0.38], [0.42, 0.38], [-0.42, -0.38], [0.42, -0.38]]) boxB(0.04, 0.1, 0.04, M.black, lx, 0, lz, c);
    c.position.set(x, 0, z);
    c.rotation.y = Math.atan2(-7.4 - x, -2 - z);
    scene.add(c);
  }
  boxB(1.3, 0.34, 2.2, M.blackMarble, -7.4, 0.04, -2);
  boxB(1.1, 0.04, 2.0, M.black, -7.4, 0, -2);
  add(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), std(0xcaa57a), -7.4, 0.41, -2.4);
  add(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0xdfe9ea, roughness: 0.1, transparent: true, opacity: 0.6 }), -7.3, 0.44, -1.6);
  // tripod floor lamp with a black pyramid shade
  const lamp = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = add(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4), M.black, Math.cos(a) * 0.18, 0.72, Math.sin(a) * 0.18, lamp);
    leg.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22);
  }
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), M.black, 0, 1.6, 0, lamp);
  const shade = add(new THREE.ConeGeometry(0.46, 0.55, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0x151515, side: THREE.DoubleSide, flatShading: true }), 0, 1.95, 0, lamp);
  shade.rotation.y = Math.PI / 4;
  lamp.position.set(-9.1, 0, 1.9);
  scene.add(lamp);
  sprite(-9.1, 1.72, 1.9, 1.4, 0xffd7a0, 0.8);
  plant(-9.0, 4.4, 1.15);

  // ---------- kotak angpao (left wall, next to the sofa) ----------
  // a burgundy-draped table with a cream gift box: ribbon band, bow with tails, slot, two roses
  const GIFT = { x: -9.45, z: -4.6 }; // right beside the end of the sofa
  const clothMat = std(0x8c1d2c, { roughness: 0.9 });
  const boxMat = std(0xf2ece0, { roughness: 0.7 });
  const ribbonMat = std(0x7a1a28, { roughness: 0.45 });
  const gift = new THREE.Group();
  boxB(0.8, 0.72, 0.8, clothMat, 0, 0, 0, gift);                 // floor-length tablecloth
  boxB(0.88, 0.05, 0.88, clothMat, 0, 0.7, 0, gift);             // its overhanging top
  add(new THREE.CylinderGeometry(0.36, 0.36, 0.012, 18), std(0xf4eee2), 0, 0.756, 0, gift); // lace doily
  boxB(0.56, 0.4, 0.42, boxMat, 0, 0.762, 0, gift);              // box
  boxB(0.6, 0.07, 0.46, boxMat, 0, 1.15, 0, gift);               // lid
  boxB(0.606, 0.05, 0.466, ribbonMat, 0, 1.1, 0, gift);          // ribbon band round the lid
  boxB(0.07, 0.34, 0.01, ribbonMat, 0, 0.77, 0.216, gift);       // ribbon down the front
  for (const s of [-1, 1]) {
    const loop = add(new THREE.SphereGeometry(0.07, 6, 4), ribbonMat, s * 0.075, 1.08, 0.24, gift);
    loop.scale.set(1.5, 0.75, 0.35);
    loop.rotation.z = s * 0.35;
    const tail = boxB(0.035, 0.3, 0.008, ribbonMat, s * 0.045, 0.8, 0.236, gift);
    tail.rotation.z = s * 0.22;
  }
  add(new THREE.SphereGeometry(0.03, 6, 4), ribbonMat, 0, 1.08, 0.25, gift);        // knot
  boxB(0.22, 0.006, 0.03, M.black, 0, 1.22, -0.02, gift);                           // slot on the lid
  for (const [x, c] of [[-0.17, 0xe7a1a1], [0.17, 0xf6ead8]]) {
    add(new THREE.IcosahedronGeometry(0.04, 0), std(c, { roughness: 0.6 }), x, 1.25, 0.06, gift);   // rose
    const leaf = add(new THREE.SphereGeometry(0.03, 5, 3), M.leaf2, x + 0.05 * Math.sign(-x), 1.235, 0.08, gift);
    leaf.scale.set(1.4, 0.35, 0.8);
  }
  gift.position.set(GIFT.x, 0, GIFT.z);
  gift.rotation.y = Math.PI / 2; // front faces into the room
  scene.add(gift);
  plant(9.0, 2.3, 0.95);

  function plant(x, z, sc) {
    const g = new THREE.Group();
    const pot = add(new THREE.SphereGeometry(0.5, 10, 6), M.pot, 0, 0.36, 0, g);
    pot.scale.set(1, 0.75, 1);
    for (let i = 0; i < 13; i++) {
      const pivot = new THREE.Group();
      pivot.position.y = 0.7;
      pivot.rotation.y = (i / 13) * Math.PI * 2 + i * 0.4;
      g.add(pivot);
      const tilt = 0.25 + (i % 4) * 0.18;
      const len = 1.3 + (i % 3) * 0.35;
      const leaf = add(new THREE.ConeGeometry(0.28, len, 3), i % 2 ? M.leaf : M.leaf2, 0, len / 2, 0, pivot);
      leaf.scale.set(1, 1, 0.22);
      pivot.rotation.x = tilt;
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(sc);
    scene.add(g);
  }

  // ---------- framed photos + the map board ----------
  const loader = new THREE.TextureLoader();
  const entries = {};      // id -> { id, group, center, normal, w, h, frameMat }
  const pickables = [];
  const GOLD = new THREE.Color(0xc9a24f), DARK = new THREE.Color(0x1a1410);

  function hang(p, texture) {
    const g = new THREE.Group();
    const center = new THREE.Vector3(...p.pos);
    const normal = new THREE.Vector3(...p.normal);
    g.position.copy(center);
    g.lookAt(center.clone().add(normal));
    scene.add(g);
    const frameMat = M.frame.clone();
    const frame = add(new THREE.BoxGeometry(1, 1, 0.06), frameMat, 0, 0, 0, g);
    // frame box front face at +3 cm, white mat just in front, photo well clear of both (no z-fighting)
    const mat = add(new THREE.PlaneGeometry(1, 1), M.mat, 0, 0, 0.04, g);
    const picMat = new THREE.MeshBasicMaterial({
      color: texture ? 0xffffff : 0x8a8580, map: texture || null, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const pic = add(new THREE.PlaneGeometry(1, 1), picMat, 0, 0, 0.07, g);
    const bar = add(new THREE.BoxGeometry(1, 0.05, 0.1), M.black, 0, 0, 0.12, g);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe0b0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(halo);
    const entry = { id: p.id, group: p.group, center, normal, w: 1, h: 1, frameMat };
    const layout = (aspect) => {
      const w = aspect >= 1 ? p.max : p.max * aspect;
      const h = aspect >= 1 ? p.max / aspect : p.max;
      entry.w = w; entry.h = h;
      pic.scale.set(w, h, 1);
      mat.scale.set(w + 0.24, h + 0.24, 1);
      frame.scale.set(w + 0.36, h + 0.36, 1);
      bar.scale.x = Math.max(0.6, w * 0.45);
      bar.position.y = h / 2 + 0.38;
      halo.position.set(0, h / 2 + 0.28, 0.22);
      halo.scale.set(Math.max(1.2, w * 0.9), 0.9, 1);
    };
    layout(p.aspect || 1.5);
    if (p.src) {
      loader.load(p.src, (tex) => {
        tex.image = downscale(tex.image, 1024);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        picMat.map = tex;
        picMat.color.set(0xffffff);
        picMat.needsUpdate = true;
        layout(tex.image.width / tex.image.height);
      });
    }
    for (const m of [frame, mat, pic]) { m.userData.entry = entry; pickables.push(m); }
    entries[p.id] = entry;
  }
  for (const p of PHOTOS) hang(p);
  hang(MAP_BOARD, T.mapBoard);
  // reception desk: clicking it opens the RSVP card
  entries.rsvp = {
    id: 'rsvp', group: 'rsvp',
    center: new THREE.Vector3(DESK_X, 0.55, -9.2), normal: new THREE.Vector3(0, 0, 1),
    w: 4.6, h: 1.1, glow: [deskMat],
  };
  desk.userData.entry = entries.rsvp;
  pickables.push(desk);
  // the door (+ the photo beside it): hovering either lights both, clicking walks into the ballroom
  entries.door = {
    id: 'door', group: 'venue',
    center: new THREE.Vector3(DOOR.x, DOOR.h / 2, -11.9), normal: new THREE.Vector3(0, 0, 1),
    w: DOOR.w, h: DOOR.h, glow: [doorFrameMat, doorMat],
  };
  for (const m of [doorFrame, ...doorLeaves.map((l) => l.leaf)]) { m.userData.entry = entries.door; pickables.push(m); }
  // the kotak angpao opens "Amplop Digital"
  entries.gift = {
    id: 'gift', group: 'gift',
    center: new THREE.Vector3(GIFT.x, 0.64, GIFT.z), normal: new THREE.Vector3(1, 0, 0),
    w: 0.9, h: 1.28, pad: 0.02, glow: [boxMat, clothMat], // its own size (no frame), so the card sits snug beside it
  };
  gift.traverse((m) => { if (m.isMesh) { m.userData.entry = entries.gift; pickables.push(m); } });

  // ---------- a few other guests (guests3d.js) ----------
  // Two in the armchairs and one on the sofa, two keeping the guest book behind the desk, one
  // checking in at it, two chatting on the right. The left of the room stays clear: the walk to the ballroom door runs along x = DOOR.x.
  // The lounge seats are a little higher than the ballroom's chairs (the pose is made for those),
  // and their cushions sit forward of the middle of the chair: `fwd` puts the hips over the cushion.
  const lounge = (x, z, yaw, y, fwd) => ({ x: x + Math.sin(yaw) * fwd, z: z + Math.cos(yaw) * fwd, y, yaw, pose: 'sit', lounge: true });
  const crowd = [
    lounge(-5.4, -4.6, Math.atan2(-7.4 + 5.4, -2 + 4.6), 0.245, 0.17),
    lounge(-5.4, 0.6, Math.atan2(-7.4 + 5.4, -2 - 0.6), 0.245, 0.17),
    lounge(-9.3, -2 + 0.78, Math.PI / 2, 0.265, 0.06),     // the sofa's left-hand cushion
    // two at the guest book, behind the reception desk, facing the room: one in a hijab, one not
    { x: DESK_X - 0.9, z: -9.95, yaw: 0.08, pose: 'stand', anim: 'Idle', outfit: 'hijab_kebaya' },
    { x: DESK_X + 0.35, z: -9.95, yaw: -0.08, pose: 'stand', anim: 'Listen', outfit: 'vest' },
    { x: DESK_X + 2.9, z: -8.5, yaw: -Math.PI / 2 - 0.5, pose: 'stand', anim: 'Talk' },
    { x: 4.3, z: 3.6, yaw: Math.atan2(0.9, -0.5), pose: 'stand', anim: 'Talk' },
    { x: 5.2, z: 3.1, yaw: Math.atan2(-0.9, 0.5), pose: 'stand', anim: 'Listen' },
  ];
  const guests = addGuests(scene, crowd, 5);
  guests.ready.then(() => { blockers = null; });

  // ---------- camera ----------
  const UP = new THREE.Vector3(0, 1, 0);
  const cam = {
    start: new THREE.Vector3(0, 1.7, 11.2),
    rest: new THREE.Vector3(0, 1.7, 7.2),
    restQ: new THREE.Quaternion(),
    euler: new THREE.Euler(0, 0, 0, 'YXZ'),
    fromPos: new THREE.Vector3(),
    fromQ: new THREE.Quaternion(),
    to: null,        // null = the swaying rest view, else a fixed { pos, q }
    k: 1,
    dur: 1,
    tour: null,      // continuous pan along several poses, started once the glide in lands
  };
  const m4 = new THREE.Matrix4();
  // smootherstep: speed and acceleration both ease to zero at the ends, no lurch at start/stop
  const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  // the pose the camera is heading for this frame; the camera itself follows it with light smoothing
  const raw = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), snap: true, prev: new THREE.Vector3(), vel: new THREE.Vector3() };
  const v0 = new THREE.Vector3(); // velocity carried into a new glide
  const SMOOTH = 0.12; // seconds

  // Walking around on foot. The glides above put the camera on rails for the photo tours;
  // the moment the guest moves or looks for themselves, `roam.on` takes over and drives
  // raw.pos/raw.q directly. Because glide() starts from raw, tapping a photo afterwards
  // picks the camera up wherever they left it.
  const roam = { on: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, vx: 0, vz: 0 };
  const BOUNDS = { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 };
  let blockers = null;
  const roamEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  // Take the wheel: carry on from exactly where the camera is looking now, so there is
  // no jump between the tour that was playing and the guest's own first step.
  function startRoam(camera) {
    if (roam.on) return;
    if (!blockers) blockers = buildBlockers(scene, { w: W, d: D });
    cam.tour = null;
    roam.pos.copy(raw.pos);
    roam.pos.y = EYE_H;
    roamEuler.setFromQuaternion(raw.q, 'YXZ');
    roam.yaw = roamEuler.y;
    roam.pitch = THREE.MathUtils.clamp(roamEuler.x, -0.62, 0.62);
    roam.vx = roam.vz = 0;
    roam.on = true;
  }

  // Hand back to the rails (a photo was tapped): the glide reads raw, which roam has
  // been writing, so it simply continues from here.
  function stopRoam() {
    roam.on = false;
    raw.prev.copy(raw.pos);
    raw.vel.set(0, 0, 0);
  }

  function stepRoam(dt, controls) {
    if (!controls) return;
    const look = controls.takeLook();
    roam.yaw += look.yaw;
    roam.pitch = controls.clampPitch(roam.pitch + look.pitch);
    const { x, y, speed } = controls.axes();
    // ease into the walk and out of it, so starting and stopping is not a jolt
    const sin = Math.sin(roam.yaw), cos = Math.cos(roam.yaw);
    const wantX = (x * cos - y * sin) * speed;
    const wantZ = (-x * sin - y * cos) * speed;
    const k = 1 - Math.exp(-dt * 9);
    roam.vx += (wantX - roam.vx) * k;
    roam.vz += (wantZ - roam.vz) * k;
    if (Math.abs(roam.vx) > 1e-4 || Math.abs(roam.vz) > 1e-4) {
      if (!blockers) blockers = buildBlockers(scene, { w: W, d: D }); // rebuilt once the guests arrive
      slide(roam.pos, roam.vx * dt, roam.vz * dt, blockers, BOUNDS);
      roam.pos.y = EYE_H;
    }
  }

  function fitCamera(camera) {
    const portrait = camera.aspect < 1;
    const fov = portrait ? 62 : 55;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // on a narrow screen, centre on the front wall
    cam.rest.set(portrait ? -0.4 : 0, 1.7, portrait ? 4.5 : 9.0);
  }

  function glide(camera, to, dur) {
    stopRoam();
    cam.tour = null;
    // start from where the camera was heading (not its lagging on-screen pose)
    cam.fromPos.copy(raw.pos);
    cam.fromQ.copy(raw.q);
    v0.copy(raw.vel);
    // longer trips get a little more time so they never whip across the room
    const dist = raw.pos.distanceTo(to ? to.pos : cam.rest);
    dur = Math.max(dur, 0.8 + dist * 0.1);
    cam.to = to;
    cam.k = 0;
    cam.dur = dur;
  }

  // Camera facing a wall item squarely. `layout` leaves room for an info card:
  // 'center' (no card), 'caption' (card beside/below), 'tall' (big card below on phones).
  // `reserve` (wide screens): fraction of the screen width kept free on the right for a card
  // attached beside the photo; the photo then fills everything to its left.
  function poseFor(camera, e, layout, reserve = 0) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const aspect = camera.aspect;
    let rx = 0, ry = 0, hx = 0.86, hy = 0.8; // where the frame lands on screen (NDC) and how much room it gets
    let zoom = e.group === 'map' || e.group === 'rsvp' || e.group === 'gift' ? 1 : 1.3;
    if (typeof layout === 'object') {
      // explicit framing: where the item lands on screen (NDC) and how much room it gets
      ({ rx = 0, ry = 0, hx = 0.86, hy = 0.8, zoom = 1 } = layout);
    } else if (layout !== 'center') {
      if (aspect >= 1 && reserve > 0) {
        const left = -0.92, right = 1 - 2 * reserve;
        rx = (left + right) / 2; hx = (right - left) / 2; hy = 0.84; zoom = 1;
      } else if (aspect >= 1) { rx = -0.38; hx = 0.54; hy = 0.78; }
      else if (layout === 'tall') { ry = 0.6; hy = 0.3; hx = 0.9; }
      // phones: photo on the left, slim card on the right (it only covers the wall at the photo's edge)
      else { rx = -0.3; hx = 0.68; hy = 0.8; zoom = 1; }
    }
    const fw = e.w + 0.36, fh = e.h + 0.36;
    const d = Math.max(fh / 2 / (hy * tanV), fw / 2 / (hx * tanV * aspect)) / zoom;
    const right = new THREE.Vector3().crossVectors(e.normal.clone().negate(), UP).normalize();
    const pos = e.center.clone().addScaledVector(e.normal, d)
      .addScaledVector(right, -rx * d * tanV * aspect)
      .addScaledVector(UP, -ry * d * tanV);
    const q = new THREE.Quaternion().setFromRotationMatrix(m4.lookAt(pos, pos.clone().sub(e.normal), UP));
    return { pos, q };
  }

  // Look into the right-hand corner, stepped back until every "Cerita Kami" photo fits.
  function storyPose(camera) {
    const list = Object.values(entries).filter((e) => e.group === 'story');
    const target = new THREE.Vector3();
    for (const e of list) target.add(e.center);
    target.divideScalar(list.length);
    const dir = target.clone().sub(new THREE.Vector3(0.5, target.y, 3.5)).normalize();
    const right = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let ext = 0;
    for (const e of list) ext = Math.max(ext, Math.abs(e.center.clone().sub(target).dot(right)) + e.w / 2 + 0.4);
    const d = Math.max(5, ext / (tanV * camera.aspect));
    const pos = target.clone().addScaledVector(dir, -d);
    pos.x = Math.max(-8.5, pos.x);
    pos.z = Math.min(11, pos.z);
    const q = new THREE.Quaternion().setFromRotationMatrix(m4.lookAt(pos, target, UP));
    return { pos, q };
  }

  // Continuous pan through `poses`, never pausing: it lingers (slow) on every pose and
  // moves quicker only in the gaps between them. `u` runs 0 .. poses.length - 1.
  function makeTour(poses, dur) {
    const N = 240;
    const gaps = poses.length - 1;
    const speed = (t) => {
      let v = 0.22;
      for (let k = 0; k < gaps; k++) v += Math.exp(-(((t - (k + 0.5) / gaps) / (0.2 / gaps)) ** 2)); // quicker between poses
      return v
        * Math.min(1, t / 0.1)             // ease out of the first pose
        * Math.min(1, (1 - t) / 0.12);     // come to rest on the last
    };
    const table = new Float32Array(N + 1);
    for (let i = 1; i <= N; i++) table[i] = table[i - 1] + speed((i - 0.5) / N);
    const total = table[N];
    for (let i = 0; i <= N; i++) table[i] = (table[i] / total) * (poses.length - 1);
    return {
      poses, dur, t: 0, active: false,
      curve: new THREE.CatmullRomCurve3(poses.map((p) => p.pos), false, 'centripetal'),
      at(tau) {
        const f = Math.min(1, Math.max(0, tau)) * N, i = Math.min(N - 1, Math.floor(f));
        return table[i] + (table[i + 1] - table[i]) * (f - i);
      },
      u: 0,
    };
  }

  function stepTour(dt) {
    const tour = cam.tour;
    tour.t = Math.min(tour.dur, tour.t + dt);
    tour.u = tour.at(tour.t / tour.dur);
    const last = tour.poses.length - 1;
    tour.curve.getPoint(tour.u / last, raw.pos);
    const i = Math.min(last - 1, Math.floor(tour.u));
    raw.q.slerpQuaternions(tour.poses[i].q, tour.poses[i + 1].q, tour.u - i);
  }

  // Facing the ballroom door squarely, far enough back to see all of it.
  function doorwayPose(camera) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(DOOR.h / 2 / (0.72 * tanV), DOOR.w / 2 / (0.8 * tanV * camera.aspect));
    return { pos: new THREE.Vector3(DOOR.x, 1.7, -11.9 + Math.min(d, 9)), q: new THREE.Quaternion() };
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  return {
    scene,
    // label anchors for the three clickable groups
    anchors: {
      couple: new THREE.Vector3(0.9, 4.45, -11.8),
      map: new THREE.Vector3(MAP_BOARD.pos[0], 4.2, -11.8),
      rsvp: new THREE.Vector3(DESK_X, 0.55, -8.64), // middle of the desk's black front: gold on black stands out
      venue: new THREE.Vector3(DOOR.x, 2.75, -11.7), // on the door itself, clear of the other labels on a phone
      story: new THREE.Vector3(8.0, 4.5, -5.7),
      gift: new THREE.Vector3(GIFT.x, 1.55, GIFT.z),
      invite: new THREE.Vector3(-9.7, 4.3, -5.6),
    },
    enter(camera) {
      // the room is ~24 m deep: a tight far plane gives the depth buffer far more precision
      // than the outdoor scene's 600 m, which keeps close layers (frame, mat, photo) from flickering
      camera.far = 95; // the night backdrop sits 34 m beyond the entrance, for the parallax
      camera.updateProjectionMatrix();
      fitCamera(camera);
      camera.position.copy(cam.start);
      camera.quaternion.identity();
      raw.pos.copy(cam.start);
      raw.prev.copy(cam.start);
      raw.vel.set(0, 0, 0);
      raw.q.identity();
      raw.snap = true;
      glide(camera, null, 3.5);
    },
    update(camera, t, dt, pointer, controls) {
      fitCamera(camera);
      guests.update(dt, camera);
      if (roam.on) {
        stepRoam(dt, controls);
        const a = raw.snap ? 1 : 1 - Math.exp(-dt / SMOOTH);
        raw.snap = false;
        raw.pos.copy(roam.pos);
        raw.prev.copy(roam.pos);
        raw.vel.set(0, 0, 0);
        roamEuler.set(roam.pitch, roam.yaw, 0);
        raw.q.setFromEuler(roamEuler);
        camera.position.lerp(raw.pos, a);
        camera.quaternion.slerp(raw.q, a);
        return;
      }
      cam.euler.set(0.03 - pointer.sy * 0.2, Math.sin(t * 0.15) * 0.03 - pointer.sx * 0.65, 0);
      cam.restQ.setFromEuler(cam.euler);
      cam.k = Math.min(1, cam.k + dt / cam.dur);
      if (cam.tour && cam.k >= 1) {
        cam.tour.active = true;
        stepTour(dt);
      } else {
        const e = ease(cam.k), k = cam.k;
        raw.pos.lerpVectors(cam.fromPos, cam.to ? cam.to.pos : cam.rest, e);
        // keep the motion we had when this glide began, fading it out (Hermite start tangent)
        raw.pos.addScaledVector(v0, cam.dur * k * (1 - k) * (1 - k));
        raw.q.slerpQuaternions(cam.fromQ, cam.to ? cam.to.q : cam.restQ, e);
      }
      // follow the target pose with a little lag, so a move interrupted mid-way
      // (or a new one starting) blends in instead of snapping
      if (dt > 0) raw.vel.subVectors(raw.pos, raw.prev).divideScalar(dt);
      raw.prev.copy(raw.pos);
      const a = raw.snap ? 1 : 1 - Math.exp(-dt / SMOOTH);
      raw.snap = false;
      camera.position.lerp(raw.pos, a);
      camera.quaternion.slerp(raw.q, a);
    },
    // The camera has arrived. Walking under their own steam counts: the glide's progress
    // freezes the moment roam takes over, so without this the answer depends on whether the
    // guest happened to interrupt a glide — which is why the labels behaved differently on
    // arriving than on coming back from the ballroom.
    settled() { return roam.on || cam.k >= 1; },
    // where an item's frame is on screen right now, in pixels (for cards attached beside it)
    screenRect(camera, id, w, h) {
      const e = entries[id];
      const right = new THREE.Vector3().crossVectors(e.normal.clone().negate(), UP).normalize();
      const pad = e.pad ?? 0.18; // photo frames stick out 18 cm past the picture
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const p = e.center.clone()
          .addScaledVector(right, sx * (e.w / 2 + pad))
          .addScaledVector(UP, sy * (e.h / 2 + pad))
          .project(camera);
        const px = ((p.x + 1) / 2) * w, py = ((1 - p.y) / 2) * h;
        l = Math.min(l, px); r = Math.max(r, px); t = Math.min(t, py); b = Math.max(b, py);
      }
      return { left: l, right: r, top: t, bottom: b };
    },
    goRest(camera, dur = 1.4) { glide(camera, null, dur); },
    roam(camera) { startRoam(camera); },
    roaming() { return roam.on; },
    // where the guest is standing and facing, for the walk through to the ballroom
    where() { return { x: roam.pos.x, z: roam.pos.z, yaw: roam.yaw }; },
    // Into the ballroom: face its door (returns how long the move takes, in seconds)...
    goDoorway(camera, dur) {
      glide(camera, doorwayPose(camera), dur);
      return cam.dur;
    },
    // ...and, once it is open, walk through
    goThrough(camera, dur) {
      const to = doorwayPose(camera);
      to.pos.z = -11.4;
      glide(camera, to, dur);
    },
    setDoor,
    // Back out of the ballroom: standing just inside the door (the caller then heads for goRest).
    comeBack(camera) {
      camera.near = 0.5;
      camera.far = 95; // the night backdrop sits 34 m beyond the entrance, for the parallax
      camera.updateProjectionMatrix();
      fitCamera(camera);
      const at = doorwayPose(camera);
      at.pos.z = -10.6;
      camera.position.copy(at.pos);
      camera.quaternion.copy(at.q);
      raw.pos.copy(at.pos);
      raw.prev.copy(at.pos);
      raw.vel.set(0, 0, 0);
      raw.q.copy(at.q);
      raw.snap = true;
      cam.tour = null;
      cam.fromPos.copy(at.pos);
      cam.fromQ.copy(at.q);
      cam.to = at;
      cam.k = 1;
    },
    goItem(camera, id, layout, dur, reserve) { glide(camera, poseFor(camera, entries[id], layout, reserve), dur); },
    goStory(camera, dur = 1.8) { glide(camera, storyPose(camera), dur); },
    // Stand at eye level in front of the kotak angpao and look slightly down at it.
    // The table + box fill `hy` of the screen height and land at (ndcX, ndcY) on screen.
    goGift(camera, { ndcX = 0, ndcY = 0, hy = 0.55 }, dur) {
      const e = entries.gift;
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const d = (e.h / 2 + 0.06) / (hy * tanV);
      const right = new THREE.Vector3().crossVectors(e.normal.clone().negate(), UP).normalize();
      const pos = e.center.clone().addScaledVector(e.normal, d).setY(1.7);
      const target = e.center.clone().setY(0.85)
        .addScaledVector(right, -ndcX * d * tanV * camera.aspect)
        .addScaledVector(UP, -ndcY * d * tanV);
      glide(camera, { pos, q: new THREE.Quaternion().setFromRotationMatrix(m4.lookAt(pos, target, UP)) }, dur);
    },
    // Look at the door from the right, turned slightly left (the map and desk stay in view),
    // sized so the door fills about `fx` x `fy` of the screen and lands at `ndcX` across it.
    // Returns where the door's centre will be on screen (0..1) so the RSVP card can cover it.
    goDoor(camera, fx, fy, ndcX, dur) {
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const tanH = tanV * camera.aspect;
      const angle = THREE.MathUtils.degToRad(camera.aspect >= 1 ? 36 : 24); // how far round to the right the camera stands
      const turn = Math.atan(-ndcX * tanH);                                  // extra turn right so the door sits at ndcX
      const center = new THREE.Vector3(DOOR.x, DOOR.h / 2, -11.95);
      const toCam = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const d = Math.max(
        DOOR.h / (2 * tanV * fy * Math.cos(turn)),
        (DOOR.w * Math.cos(angle)) / (2 * tanH * fx * Math.cos(turn)),
      );
      const pos = center.clone().addScaledVector(toCam, d);
      pos.y = 2.35; // a touch above eye level keeps the lounge chairs out of the bottom of the frame
      const lookDir = toCam.clone().negate().applyAxisAngle(UP, -turn);
      const q = new THREE.Quaternion().setFromRotationMatrix(m4.lookAt(pos, pos.clone().add(lookDir), UP));
      glide(camera, { pos, q }, dur);
      // where the door will sit once the camera arrives
      const probe = camera.clone();
      probe.position.copy(pos);
      probe.quaternion.copy(q);
      probe.updateMatrixWorld();
      const v = center.clone().project(probe);
      return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
    },
    // glide to the first item, then pan continuously through the rest
    goTour(camera, ids, layout, glideDur, panDur, reserve) {
      const poses = ids.map((id) => poseFor(camera, entries[id], layout, reserve));
      glide(camera, poses[0], glideDur);
      cam.tour = makeTour(poses, panDur);
    },
    // -1 until the pan starts, then 0 .. ids.length - 1
    tourProgress() { return cam.tour && cam.tour.active ? cam.tour.u : -1; },
    tourDone() { return !cam.tour || cam.tour.t >= cam.tour.dur; },
    // screen-space pick -> wall item (or null)
    pick(camera, x, y) {
      ndc.set(x, y);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      return hit ? hit.object.userData.entry : null;
    },
    // gold frames around the group under the cursor
    highlight(group) {
      for (const e of Object.values(entries)) {
        const on = group && e.group === group;
        if (e.glow) {
          for (const m of e.glow) m.emissive.copy(GOLD).multiplyScalar(on ? 0.22 : 0);
          continue;
        }
        e.frameMat.color.copy(on ? GOLD : DARK);
        e.frameMat.emissive.copy(on ? GOLD : DARK).multiplyScalar(on ? 0.45 : 0);
      }
    },
  };
}

// ================= helpers =================

function downscale(img, max) {
  const w = img.width, h = img.height;
  if (Math.max(w, h) <= max) return img;
  const s = max / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function veins(g, w, h, r, n, style, width) {
  g.strokeStyle = style;
  for (let i = 0; i < n; i++) {
    g.lineWidth = width * (0.4 + r());
    g.beginPath();
    let x = r() * w, y = r() * h;
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      const nx = x + (r() - 0.5) * w * 0.6, ny = y + (r() - 0.3) * h * 0.5;
      g.quadraticCurveTo(x + (r() - 0.5) * w * 0.3, y + (r() - 0.5) * h * 0.3, nx, ny);
      x = nx; y = ny;
    }
    g.stroke();
  }
}

function makeTextures() {
  const T = {};

  T.marble = canvasTex(1024, 1024, (g, w, h) => {
    const r = rng(11);
    g.fillStyle = '#c3c2bf'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, rad = 40 + r() * 160;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() > 0.5 ? '255,255,255' : '140,138,134';
      grd.addColorStop(0, `rgba(${c},0.18)`); grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    veins(g, w, h, r, 16, 'rgba(120,118,114,0.35)', 2);
    veins(g, w, h, r, 10, 'rgba(255,255,255,0.5)', 1.5);
    g.strokeStyle = 'rgba(150,148,144,0.6)'; g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      g.beginPath(); g.moveTo(0, (i * h) / 2); g.lineTo(w, (i * h) / 2); g.stroke();
      g.beginPath(); g.moveTo((i * w) / 2, 0); g.lineTo((i * w) / 2, h); g.stroke();
    }
  }, true);

  T.blackMarble = canvasTex(512, 256, (g, w, h) => {
    const r = rng(5);
    g.fillStyle = '#131314'; g.fillRect(0, 0, w, h);
    veins(g, w, h, r, 6, 'rgba(70,70,74,0.6)', 3);
    veins(g, w, h, r, 9, 'rgba(235,235,235,0.85)', 1.4);
  });

  // oak panels with thin black joints, like the wall behind the reception
  T.panels = canvasTex(1024, 336, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#d8a870'); grd.addColorStop(1, '#b7854f');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const r = rng(3);
    g.strokeStyle = 'rgba(120,80,40,0.18)';
    for (let i = 0; i < 160; i++) {
      g.lineWidth = 1 + r();
      const x = r() * w;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.7, x + 3, h); g.stroke();
    }
    g.strokeStyle = '#161210'; g.lineWidth = 3;
    const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    line(0, h * 0.52, w, h * 0.52);
    line(0, h * 0.8, w, h * 0.8);
    for (const x of [0.12, 0.3, 0.46, 0.6, 0.74, 0.88]) line(x * w, 0, x * w, h * 0.52);
    for (const x of [0.2, 0.4, 0.55, 0.7, 0.82]) line(x * w, h * 0.52, x * w, h * 0.8);
    for (const x of [0.08, 0.33, 0.62, 0.9]) line(x * w, h * 0.8, x * w, h);
  });

  // one leaf of the grooved wooden double door
  T.door = canvasTex(128, 384, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#6b4a2e'); grd.addColorStop(1, '#4e341f');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(20,12,6,0.55)'; g.lineWidth = 2;
    for (let x = 16; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.strokeStyle = '#140d07'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  });

  // the ballroom's light, seen through the doorway as the leaves swing open
  T.doorGlow = canvasTex(128, 192, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, h * 0.75);
    grd.addColorStop(0, '#fffdf4'); grd.addColorStop(0.45, '#ffe9bd'); grd.addColorStop(1, '#e3ad5e');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  const drawBoard = (g, w, h) => {
    g.fillStyle = '#f2ece1'; g.fillRect(0, 0, w, h);
    // stylised street map
    const top = 120, bottom = h - 150;
    g.fillStyle = '#e4ddd0'; g.fillRect(40, top, w - 80, bottom - top);
    const r = rng(17);
    g.fillStyle = '#d6cebf';
    for (let i = 0; i < 26; i++) g.fillRect(50 + r() * (w - 160), top + 10 + r() * (bottom - top - 70), 40 + r() * 70, 26 + r() * 40);
    g.strokeStyle = '#ffffff'; g.lineCap = 'round';
    const road = (pts, width) => { g.lineWidth = width; g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.stroke(); };
    road([[40, top + 90], [w - 40, top + 150]], 18);
    road([[260, top], [330, bottom]], 14);
    road([[w - 300, top], [w - 360, bottom]], 14);
    road([[40, bottom - 60], [w - 40, bottom - 110]], 10);
    g.strokeStyle = '#a9c4d6'; g.lineWidth = 14;
    g.beginPath(); g.moveTo(40, bottom - 20); g.bezierCurveTo(300, bottom - 70, 600, bottom + 10, w - 40, bottom - 40); g.stroke();
    // pin
    const px = w / 2 + 20, py = top + 170;
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(px, py + 6, 22, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b8862f';
    g.beginPath(); g.arc(px, py - 52, 30, Math.PI, 0); g.lineTo(px, py); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py - 52, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1d1712'; g.font = '600 26px Jost, sans-serif'; g.textAlign = 'center';
    g.fillText('Golden Boutique Hotel', px, py + 44);
    // header + times
    g.fillStyle = '#1d1712'; g.fillRect(0, 0, w, 96);
    g.fillStyle = '#d6ae5a'; g.font = '500 34px Jost, sans-serif';
    g.fillText('L O K A S I   &   T E M P A T', w / 2, 60);
    g.fillStyle = '#3a2e22'; g.font = 'italic 40px "Cormorant Garamond", Georgia, serif';
    g.fillText('Akad 12.30 WIB  ·  Resepsi 16.00 WIB', w / 2, h - 88);
    g.font = '500 24px Jost, sans-serif'; g.fillStyle = '#8a6326';
    g.fillText('SABTU, 24 OKTOBER 2026', w / 2, h - 40);
  };
  T.mapBoard = canvasTex(1024, 706, drawBoard);
  if (document.fonts) {
    document.fonts.ready.then(() => {
      drawBoard(T.mapBoard.image.getContext('2d'), 1024, 706);
      T.mapBoard.needsUpdate = true;
    });
  }

  // Out through the entrance glass: the portico at night, the way the guest saw it on the
  // walk in — warm light pooling under the canopy, the plaza and the fountain's glow beyond,
  // and the hotel's own columns standing against it.
  // Out through the entrance glass: the road the guests arrived along, at night. Painted on
  // its own canvas and laid down blurred — the eye is on the room, so the street beyond is
  // not the sharpest thing in the frame, and the blur turns the lamps and traffic into the
  // bokeh you actually see looking out of a lit room into the dark.
  T.night = canvasTex(1024, 384, (g, w, h) => {
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const n = off.getContext('2d');
    const HZ = h * NIGHT_HORIZON;        // the horizon, hung at eye level by the plane below
    const r = rng(7);
    const VX = w * 0.5;                  // where the road runs off to

    // ---- sky, lifted toward the horizon by the city underneath it ----
    const sky = n.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0, '#0a1326');
    sky.addColorStop(0.72, '#1d2c50');
    sky.addColorStop(1, '#46568a');
    n.fillStyle = sky; n.fillRect(0, 0, w, HZ);
    for (let i = 0; i < 120; i++) {
      const y = r() * HZ * 0.62;
      n.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.5})`;
      n.fillRect(r() * w, y, 1.6, 1.6);
    }

    // ---- the city, low on the horizon, with windows left on ----
    for (let i = 0; i < 26; i++) {
      const bw = 18 + r() * 54, bh = 14 + r() * 62;
      const x = r() * (w + 60) - 30;
      n.fillStyle = `rgba(${12 + r() * 10 | 0},${18 + r() * 12 | 0},${38 + r() * 16 | 0},0.95)`;
      n.fillRect(x, HZ - bh, bw, bh);
      for (let wy = HZ - bh + 5; wy < HZ - 4; wy += 7) {
        for (let wx = x + 4; wx < x + bw - 4; wx += 7) {
          if (r() > 0.55) continue;
          n.fillStyle = `rgba(255,${205 + r() * 40 | 0},${150 + r() * 60 | 0},${0.35 + r() * 0.5})`;
          n.fillRect(wx, wy, 3, 3.4);
        }
      }
    }

    // ---- the road, running away to the horizon ----
    const HALF = w * 0.3;                        // half its width at the near edge
    const edge = (t) => VX + t * HALF * (1 - 0);  // t in -1..1 at the bottom
    const roadY = (t) => HZ + t * (h - HZ);       // t 0 at the horizon, 1 at the bottom
    const across = (t, u) => VX + u * HALF * t;   // u -1..1 across, t 0..1 toward the viewer
    n.beginPath();
    n.moveTo(VX, HZ);
    n.lineTo(across(1, -1), h);
    n.lineTo(across(1, 1), h);
    n.closePath();
    n.fillStyle = '#464150'; n.fill();
    // wet tarmac catching the lamps
    const sheen = n.createLinearGradient(0, HZ, 0, h);
    sheen.addColorStop(0, 'rgba(200,190,214,0.55)');
    sheen.addColorStop(0.45, 'rgba(160,148,176,0.2)');
    sheen.addColorStop(1, 'rgba(130,120,146,0.08)');
    n.save(); n.clip(); n.fillStyle = sheen; n.fillRect(0, HZ, w, h - HZ);

    // the centre line, dashes closing up as they go
    n.fillStyle = 'rgba(255,250,232,1)';
    for (let i = 0; i < 16; i++) {
      const t0 = Math.pow(i / 16, 2.1), t1 = Math.pow((i + 0.45) / 16, 2.1);
      n.beginPath();
      n.moveTo(across(t0, -0.012), roadY(t0));
      n.lineTo(across(t1, -0.03), roadY(t1));
      n.lineTo(across(t1, 0.03), roadY(t1));
      n.lineTo(across(t0, 0.012), roadY(t0));
      n.closePath(); n.fill();
    }
    n.restore();

    // kerbs and the pavement either side, where the forecourt meets the road
    for (const sgn of [-1, 1]) {
      n.beginPath();
      n.moveTo(VX, HZ);
      n.lineTo(across(1, sgn), h);
      n.lineTo(across(1, sgn * 1.9), h);
      n.lineTo(VX + sgn * 10, HZ);
      n.closePath();
      n.fillStyle = '#4a4450'; n.fill();
      n.fillStyle = 'rgba(214,200,176,0.32)';
      n.beginPath();
      n.moveTo(VX, HZ); n.lineTo(across(1, sgn), h);
      n.lineTo(across(1, sgn * 1.07), h); n.lineTo(VX + sgn * 3, HZ);
      n.closePath(); n.fill();
    }

    // ---- street lamps down both sides, shrinking into the distance ----
    for (const sgn of [-1, 1]) {
      for (const t of [0.16, 0.3, 0.52, 0.86]) {
        const x = across(t, sgn * 1.26), y = roadY(t);
        const tall = 20 + t * 118;
        n.strokeStyle = '#141520'; n.lineWidth = 1.2 + t * 3;
        n.beginPath(); n.moveTo(x, y); n.lineTo(x, y - tall); n.stroke();
        n.beginPath(); n.moveTo(x, y - tall); n.lineTo(x - sgn * tall * 0.17, y - tall); n.stroke();
        const lx = x - sgn * tall * 0.17, ly = y - tall;
        const lamp = n.createRadialGradient(lx, ly, 1, lx, ly, 12 + t * 46);
        lamp.addColorStop(0, 'rgba(255,246,216,1)');
        lamp.addColorStop(0.25, 'rgba(255,214,150,0.72)');
        lamp.addColorStop(1, 'rgba(255,196,120,0)');
        n.fillStyle = lamp;
        n.beginPath(); n.arc(lx, ly, 12 + t * 46, 0, Math.PI * 2); n.fill();
        // and the pool it throws on the tarmac
        const pool = n.createRadialGradient(lx, y, 2, lx, y, 16 + t * 60);
        pool.addColorStop(0, 'rgba(255,224,170,0.95)');
        pool.addColorStop(1, 'rgba(255,196,120,0)');
        n.fillStyle = pool;
        n.beginPath(); n.ellipse(lx, y, 24 + t * 86, (24 + t * 86) * 0.38, 0, 0, Math.PI * 2); n.fill();
      }
    }

    // ---- traffic: tail lights going away, headlights coming on ----
    const car = (t, u, colour, rad) => {
      const x = across(t, u), y = roadY(t) - (3 + t * 10);
      const gl = n.createRadialGradient(x, y, 0.5, x, y, rad * (0.5 + t));
      gl.addColorStop(0, colour.replace('A', '1'));
      gl.addColorStop(0.3, colour.replace('A', '0.6'));
      gl.addColorStop(1, colour.replace('A', '0'));
      n.fillStyle = gl;
      n.beginPath(); n.arc(x, y, rad * (0.5 + t), 0, Math.PI * 2); n.fill();
    };
    for (const [t, u] of [[0.1, 0.42], [0.14, 0.58], [0.3, 0.4], [0.34, 0.56]]) car(t, u, 'rgba(255,90,70,A)', 30);
    for (const [t, u] of [[0.2, -0.46], [0.24, -0.62], [0.46, -0.44], [0.5, -0.6]]) car(t, u, 'rgba(240,248,255,A)', 34);

    // ---- the hotel's own forecourt light, spilling out past the doors ----
    const apron = n.createRadialGradient(VX, h, 10, VX, h, w * 0.4);
    apron.addColorStop(0, 'rgba(255,220,164,0.5)');
    apron.addColorStop(0.42, 'rgba(255,206,140,0.15)');
    apron.addColorStop(1, 'rgba(255,196,120,0)');
    n.fillStyle = apron; n.fillRect(0, HZ, w, h - HZ);

    // The plane is wider than the opening, and three.js clamps and stretches its edge column
    // wherever it shows past the side walls. Fade the sides into the night so there is
    // nothing there to stretch.
    const sides = n.createLinearGradient(0, 0, w, 0);
    sides.addColorStop(0, 'rgba(7,12,26,1)');
    sides.addColorStop(0.07, 'rgba(7,12,26,0)');
    sides.addColorStop(0.93, 'rgba(7,12,26,0)');
    sides.addColorStop(1, 'rgba(7,12,26,1)');
    n.fillStyle = sides; n.fillRect(0, 0, w, h);

    // a touch wider than the canvas so the blur does not darken its own edges
    if ('filter' in g) g.filter = 'blur(2.2px)';
    g.drawImage(off, -10, -10, w + 20, h + 20);
    g.filter = 'none';
  });

  T.rug = canvasTex(256, 256, (g, w, h) => {
    const r = rng(9);
    g.fillStyle = '#48484a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      g.fillRect(r() * w, r() * h, 2, 2);
    }
  });

  T.dots = canvasTex(16, 64, (g, w, h) => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 7);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, h / 2 - 8, w, 16);
  }, true);

  T.wash = canvasTex(4, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,214,160,0.75)');
    grd.addColorStop(0.35, 'rgba(255,200,140,0.25)');
    grd.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  T.glowDot = canvasTex(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  return T;
}

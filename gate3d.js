// Low-poly Golden Boutique Hotel — the opening scene behind the gate.
// After the doors open, the verse shows on the white flash and the guest lands
// in the lobby (lobby3d.js). The lobby's door leads on into the ballroom (ballroom3d.js).
// Exposes window.weddingGate = { flyIn(): Promise, dispose() } for script.js.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLobby } from './lobby3d.js';
import { createBallroom, planSvg, SPOTS } from './ballroom3d.js';
import { createControls, hasGyro } from './fps.js';

const gate = document.getElementById('gate');
const canvas = document.getElementById('gateCanvas');
if (gate && canvas) init();

function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    gate.classList.add('no-scene');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x1d2b52, 80, 260);

  // near plane at 0.5 m (the walk never comes closer than ~1.5 m to anything): on tall phone
  // screens the camera stands ~100 m back, where a 0.1 m near plane leaves too little depth
  // precision and the window panels flicker against the walls behind them
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);

  // ---------- lights (night) ----------
  scene.add(new THREE.HemisphereLight(0x8aa2e0, 0x3a2e24, 1.3));
  const moon = new THREE.DirectionalLight(0xb4c4ff, 1.1);
  moon.position.set(-25, 35, 40);
  scene.add(moon);
  const uplight = new THREE.DirectionalLight(0xffc98a, 0.9); // warm façade uplights
  uplight.position.set(12, 3, 30);
  scene.add(uplight);
  const porticoLight = new THREE.PointLight(0xffc27a, 45, 22, 1.6);
  porticoLight.position.set(0, 6, 2.5);
  scene.add(porticoLight);
  const fountainLight = new THREE.PointLight(0xffd79a, 22, 14, 1.6);
  fountainLight.position.set(0, 2.2, 16.5);
  scene.add(fountainLight);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // ---------- materials ----------
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
  const M = {
    white: std(0xebe6dc),
    trim: std(0x7d838e),
    dome: std(0x5f6773, { roughness: 0.6 }),
    dark: std(0x2a2c31),
    ceiling: std(0x4a3a2a, { emissive: 0x2a1a0a }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8ad52, metalness: 0.75, roughness: 0.3, emissive: 0x3a2608, envMap, flatShading: true }),
    trunk: std(0x4a3a2c),
    leaf: std(0x2c4a2c),
    leaf2: std(0x3a5a34),
    palm: std(0x3f6b3a),
    ground: std(0x2f323a, { roughness: 1 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    water: new THREE.MeshStandardMaterial({ color: 0x0f2438, roughness: 0.15, metalness: 0.4, emissive: 0x0b2030, envMap }),
  };

  const world = new THREE.Group();
  scene.add(world);

  // ---------- helpers ----------
  function add(geo, mat, x = 0, y = 0, z = 0, parent = world) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  // box anchored at its bottom face
  const boxB = (w, h, d, mat, x, y, z, parent) => add(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, parent);
  const plane = (w, h, mat, x, y, z, parent) => add(new THREE.PlaneGeometry(w, h), mat, x, y, z, parent);
  const texMat = (tex, extra = {}) => new THREE.MeshBasicMaterial({ map: tex, ...extra });
  // flat panels laid just in front of a wall (windows, bands, signs): nudged toward the camera in
  // the depth test too, so they always win over the wall instead of z-fighting with it on phones
  const decal = (mat) => Object.assign(mat, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const decalMat = (tex, extra = {}) => decal(texMat(tex, extra));

  const T = makeTextures();

  // ---------- background tower ----------
  // Like the real hotel: a wide, flat-fronted white slab with a grid of blue windows, around a
  // gently bowed blue-glass centre with a white band across its top, capped by a silver barrel crown.
  const TOWER_Z = -28, TOWER_H = 33, TOWER_D = 16; // front face, height, depth of the slab
  const GLASS_W = 22, WING_W = 26;                 // glass centre, and each white wing beside it
  const towerMat = new THREE.MeshStandardMaterial({ map: T.facade, emissiveMap: T.facadeGlow, emissive: 0xffffff, roughness: 0.9 }); // some windows lit for the night
  T.facade.repeat.set(1.5, 1); T.facadeGlow.repeat.set(1.5, 1); // ~12 windows across, 16 floors per wing
  for (const s of [-1, 1]) {
    const x = s * (GLASS_W + WING_W) / 2;
    add(new THREE.BoxGeometry(WING_W, TOWER_H, TOWER_D), towerMat, x, TOWER_H / 2, TOWER_Z - TOWER_D / 2);
    add(new THREE.BoxGeometry(WING_W + 0.6, 1.2, TOWER_D + 0.6), M.white, x, TOWER_H + 0.6, TOWER_Z - TOWER_D / 2); // roofline cornice
  }
  // white core behind the glass (its roof shows between the wings); set 0.6 m back so the glass,
  // whose edges curve back to ~0.1 m behind the wings' front, never z-fights with it on phones
  add(new THREE.BoxGeometry(GLASS_W, TOWER_H + 1.2, TOWER_D - 0.8), M.white, 0, (TOWER_H + 1.2) / 2, TOWER_Z - 0.6 - (TOWER_D - 0.8) / 2);
  // the glass bows ~2 m out past the wings and meets them flush at its edges
  const GR = 30, BOW = 2;
  const glassZ = TOWER_Z + BOW - GR;
  const arc = Math.asin(GLASS_W / 2 / GR);
  const glassMat = new THREE.MeshStandardMaterial({ map: T.glass, emissiveMap: T.glassGlow, emissive: 0xffffff, roughness: 0.25, metalness: 0.3, envMap });
  add(new THREE.CylinderGeometry(GR, GR, TOWER_H, 20, 1, true, -arc, arc * 2), glassMat, 0, TOWER_H / 2, glassZ);
  // white bands curving across the glass: a wide one near the top, a slimmer one at the roofline
  add(new THREE.CylinderGeometry(GR + 0.9, GR + 0.9, 1.8, 20, 1, false, -arc, arc * 2), M.white, 0, TOWER_H - 6, glassZ);
  add(new THREE.CylinderGeometry(GR + 0.4, GR + 0.4, 1.2, 20, 1, false, -arc, arc * 2), M.white, 0, TOWER_H + 0.6, glassZ);
  // silver crown on the roof over the glass centre: the lower half of a long capsule (flat on top,
  // rounded at the ends), stretched to twice its height, its base just below the cornice
  const CROWN_R = 4.6, CROWN_L = GLASS_W + 6, CROWN_SY = 1.4;
  const crownGeo = new THREE.CapsuleGeometry(CROWN_R, CROWN_L, 6, 24);
  crownGeo.rotateZ(Math.PI / 2);
  const cp = crownGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setY(i, Math.min(0, cp.getY(i))); // cut the upper half flat
  cp.needsUpdate = true;
  crownGeo.computeVertexNormals();
  const crown = add(crownGeo, new THREE.MeshStandardMaterial({ color: 0xd3d8df, metalness: 0.55, roughness: 0.35, envMap, flatShading: true }), 0, 0, TOWER_Z - 4.6);
  crown.scale.set(1, CROWN_SY, 0.9);
  crown.position.y = TOWER_H - 0.62 + CROWN_R * CROWN_SY; // flat top ~4.6 m above the roof

  // ---------- main façade ----------
  const warmWin = decalMat(T.warmWindow);
  const keyBand = decalMat(T.greekKey);
  const dentil = decalMat(T.dentil);

  // side wings with tall golden windows
  for (const s of [-1, 1]) {
    boxB(3.8, 13.2, 8, M.white, s * 9, 0, -4);
    boxB(4.2, 0.4, 8.4, M.trim, s * 9, 13.2, -4);
    boxB(3.0, 11.6, 0.1, M.dark, s * 9, 0.6, 0.01);
    plane(2.6, 5.6, warmWin, s * 9, 3.6, 0.1);
    plane(2.6, 4.8, warmWin, s * 9, 9.3, 0.1);
    plane(3.8, 0.7, keyBand, s * 9, 12.75, 0.03);
  }

  // towers with domes
  const balustradeMat = decalMat(T.balustrade);
  const squareWinMat = decalMat(T.squareWindow);
  const nicheGlow = decal(M.glow.clone());
  const roundelMat = decal(M.white.clone());
  for (const s of [-1, 1]) {
    const x = s * 5.6;
    boxB(3.6, 15.4, 9, M.white, x, 0, -4.1);
    boxB(4.0, 0.45, 9.4, M.trim, x, 9.2, -4.1);             // mid ledge
    plane(3.2, 0.7, balustradeMat, x, 8.7, 0.44);            // balustrade windows
    add(archGeometry(1.5, 2.4), nicheGlow, x, 5.2, 0.44);     // glowing niche
    add(new THREE.TorusGeometry(1.0, 0.13, 6, 20), M.trim, x, 12.6, 0.45);
    add(new THREE.CircleGeometry(0.98, 20), roundelMat, x, 12.6, 0.42);
    plane(0.9, 0.9, squareWinMat, x, 12.6, 0.46);
    plane(3.6, 0.5, dentil, x, 14.75, 0.42);
    boxB(4.3, 0.55, 9.6, M.trim, x, 15.0, -4.1);             // cornice
    boxB(3.3, 0.6, 8, M.white, x, 15.55, -4.1);
    add(new THREE.CylinderGeometry(1.2, 1.35, 0.6, 8), M.dome, x, 16.45, -1.5);
    const dome = add(new THREE.SphereGeometry(1.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.dome, x, 16.75, -1.5);
    dome.scale.y = 1.35;
    add(new THREE.SphereGeometry(0.2, 6, 4), M.dome, x, 18.65, -1.5);
    add(new THREE.ConeGeometry(0.2, 1.1, 6), M.dome, x, 19.3, -1.5);
  }

  // centre block + scalloped parapet — built around a door opening (DW × DH)
  const DW = 1.4, DH = 3.6;
  for (const s of [-1, 1]) boxB(3.8 - DW, 11, 8, M.white, s * (DW + (3.8 - DW) / 2), 0, -4.5);
  boxB(DW * 2, 11 - DH, 8, M.white, 0, DH, -4.5);
  boxB(7.6, 0.45, 0.4, M.trim, 0, 10.8, -0.35);
  plane(7.2, 0.35, keyBand, 0, 10.55, -0.14);
  const parapet = add(parapetGeometry(), M.white, 0, 11.25, -1.8);
  parapet.scale.set(1, 1, 1);
  add(new THREE.TorusGeometry(0.85, 0.24, 6, 20), M.dark, 0, 14.35, -0.55);
  add(new THREE.CircleGeometry(0.62, 20), M.white, 0, 14.35, -0.58);
  add(new THREE.CircleGeometry(0.22, 12), M.dark, 0, 14.35, -0.56);
  for (const s of [-1, 1]) {
    add(new THREE.TorusGeometry(0.42, 0.1, 5, 14), M.trim, s * 2.35, 13.4, -0.56);
    add(new THREE.CircleGeometry(0.34, 14), M.dark, s * 2.35, 13.4, -0.58);
  }
  // crest ornament on the parapet
  add(new THREE.SphereGeometry(0.34, 6, 4), M.white, 0, 16.9, -1.2);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.22, 6, 4), M.white, s * 0.42, 16.75, -1.2);
  add(new THREE.ConeGeometry(0.16, 0.7, 5), M.white, 0, 17.45, -1.2);

  // "GOLDEN" crest sign above the portico
  plane(3.6, 1.35, decalMat(T.sign, { transparent: true }), 0, 9.6, -0.44);

  // lobby glass wall around the entrance doors
  const lobbyMat = decalMat(T.lobby);
  for (const s of [-1, 1]) plane(3.3 - DW, 6.6, lobbyMat, s * (DW + (3.3 - DW) / 2), 3.3, -0.46);
  plane(DW * 2, 6.6 - DH, lobbyMat, 0, DH + (6.6 - DH) / 2, -0.46);
  for (const s of [-1, 1]) boxB(0.14, DH + 0.1, 0.22, M.gold, s * (DW + 0.07), 0, -0.5);
  boxB(DW * 2 + 0.28, 0.14, 0.22, M.gold, 0, DH, -0.5);

  // warm corridor behind the doors (the side/top blocks form its walls)
  const hall = new THREE.PointLight(0xffd9a0, 30, 14, 1.4);
  hall.position.set(0, 3, -4);
  scene.add(hall);
  const hallFloor = plane(DW * 2, 8, new THREE.MeshBasicMaterial({ color: 0xd9b27a }), 0, 0.01, -4.5);
  hallFloor.rotation.x = -Math.PI / 2;
  plane(DW * 2, DH, new THREE.MeshBasicMaterial({ color: 0xfff3dc }), 0, DH / 2, -8.4);

  // glass doors, hinged at the jambs, swinging inward
  const doors = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * DW, 0, -0.5);
    world.add(pivot);
    boxB(DW, DH, 0.08, texMat(s < 0 ? T.doorL : T.doorR), -s * DW / 2, 0, 0, pivot);
    return pivot;
  });
  function setDoors(k) {
    doors[0].rotation.y = k * 1.5;
    doors[1].rotation.y = -k * 1.5;
  }

  // red carpet from the doors out past the portico
  const carpet = plane(1.9, 12, new THREE.MeshStandardMaterial({ map: T.carpet, roughness: 1 }), 0, 0.04, 0.2);
  carpet.rotation.x = -Math.PI / 2;

  // ---------- semicircular portico ----------
  const PR = 6.2, PZ = -0.5;
  const half = [-Math.PI / 2, Math.PI];
  add(new THREE.CylinderGeometry(PR, PR, 1.4, 28, 1, true, ...half), new THREE.MeshStandardMaterial({ color: 0xebe6dc, side: THREE.DoubleSide, flatShading: true, roughness: 0.85 }), 0, 7.6, PZ);
  add(new THREE.CylinderGeometry(PR + 0.25, PR + 0.25, 0.3, 28, 1, true, ...half), M.trim, 0, 8.45, PZ);
  add(new THREE.CylinderGeometry(PR + 0.1, PR + 0.1, 0.22, 28, 1, true, ...half), M.trim, 0, 6.88, PZ);
  add(new THREE.CylinderGeometry(PR + 0.03, PR + 0.03, 0.28, 28, 1, true, ...half), M.gold, 0, 8.05, PZ);
  const roof = add(new THREE.CircleGeometry(PR + 0.25, 28, Math.PI, Math.PI), M.white, 0, 8.6, PZ);
  roof.rotation.x = -Math.PI / 2;
  const ceil = add(new THREE.CircleGeometry(PR, 28, 0, Math.PI), M.ceiling, 0, 6.9, PZ);
  ceil.rotation.x = Math.PI / 2;
  for (const th of [-1.2, -0.45, 0.45, 1.2]) {
    const x = Math.sin(th) * (PR - 0.6), z = PZ + Math.cos(th) * (PR - 0.6);
    boxB(1.0, 0.35, 1.0, M.trim, x, 0, z);
    add(new THREE.CylinderGeometry(0.36, 0.42, 6.2, 10), M.white, x, 3.45, z);
    boxB(0.95, 0.35, 0.95, M.gold, x, 6.55, z);
  }

  // ---------- fountain + gold statue ----------
  const FZ = 12.5;
  const tileMat = new THREE.MeshStandardMaterial({ map: T.tile, roughness: 0.6, flatShading: true });
  T.tile.repeat.set(14, 1);
  add(new THREE.CylinderGeometry(4.4, 4.4, 1.5, 28), tileMat, 0, 0.75, FZ);
  add(new THREE.CylinderGeometry(4.55, 4.55, 0.18, 28), M.dark, 0, 1.55, FZ);
  const water = add(new THREE.CircleGeometry(4.2, 28), M.water, 0, 1.4, FZ);
  water.rotation.x = -Math.PI / 2;
  const innerTile = new THREE.MeshStandardMaterial({ map: T.tileWarm, emissiveMap: T.tileWarm, emissive: 0x8a6a3a, roughness: 0.6, flatShading: true });
  T.tileWarm.repeat.set(10, 1);
  add(new THREE.CylinderGeometry(2.8, 2.8, 1.4, 24), innerTile, 0, 2.1, FZ);
  add(new THREE.CylinderGeometry(3.0, 3.0, 0.2, 24), M.trim, 0, 2.9, FZ);
  add(new THREE.CylinderGeometry(0.8, 1.05, 0.9, 8), M.dark, 0, 3.45, FZ);
  for (const th of [-1.05, -0.4, 0.4, 1.05]) {
    const x = Math.sin(th) * 4.9, z = FZ + Math.cos(th) * 4.9;
    boxB(0.75, 1.2, 0.75, M.dark, x, 0, z);
    add(new THREE.SphereGeometry(0.32, 8, 6), M.gold, x, 1.55, z);
  }
  const statue = buildStatue(M.gold);
  statue.position.set(0, 3.9, FZ);
  world.add(statue);

  // ---------- lower wings with scallop-shell awnings ----------
  const fanMat = new THREE.MeshBasicMaterial({ map: T.fan, side: THREE.DoubleSide });
  const wingWinMat = decalMat(T.wingWindows);
  for (const s of [-1, 1]) {
    boxB(15, 4.4, 10, M.white, s * 18.5, 0, -4);
    plane(15, 2.4, wingWinMat, s * 18.5, 2.0, 1.04);
    boxB(15.3, 0.35, 10.3, M.trim, s * 18.5, 4.4, -4);
    plane(15, 0.4, keyBand, s * 18.5, 4.1, 1.06);
    for (const fx of [13.5, 17.5, 21.5, 25.5]) {
      add(new THREE.CircleGeometry(1.9, 12, 0, Math.PI), fanMat, s * fx, 4.75, 0.6);
      add(new THREE.TorusGeometry(1.9, 0.1, 4, 12, Math.PI), M.trim, s * fx, 4.75, 0.62);
    }
  }

  // ---------- ground, plaza, curbs ----------
  const ground = add(new THREE.PlaneGeometry(500, 500), M.ground, 0, 0, 0);
  ground.rotation.x = -Math.PI / 2;
  const plaza = add(new THREE.CircleGeometry(16, 48), new THREE.MeshStandardMaterial({ map: T.paving, roughness: 1 }), 0, 0.02, FZ);
  plaza.rotation.x = -Math.PI / 2;
  const pool = add(new THREE.PlaneGeometry(46, 30), new THREE.MeshBasicMaterial({
    map: T.glowDot, color: 0xffb865, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false,
  }), 0, 0.05, FZ - 2);
  pool.rotation.x = -Math.PI / 2;
  const curbMat =new THREE.MeshStandardMaterial({ map: T.curb, roughness: 0.9 });
  T.curb.repeat.set(8, 1);
  for (const s of [-1, 1]) boxB(18, 0.25, 0.45, curbMat, s * 20, 0, 13);

  // ---------- greenery & lamps ----------
  bonsai(-12.5, 6.5, 1.25); bonsai(-16.5, 4.5, 1.0); bonsai(12.8, 6.8, 1.15); bonsai(17, 4.2, 1.05);
  cypress(-10.6, 2.6, 1.1); cypress(-22, 5, 1.3); cypress(22.5, 5.5, 1.2);
  palm(-8.4, 3.2, 0.75); palm(8.4, 3.2, 0.75); palm(25, 9, 1.35);
  for (const [x, z, sc] of [[-9, 1.8, 1.2], [9, 1.8, 1.2], [-11, 3.5, 1], [11, 3.5, 1], [-14.5, 2.4, 1.3], [14.5, 2.4, 1.3], [-6.8, 5.8, 0.8], [6.8, 5.8, 0.8]]) bush(x, z, sc);
  const glowTex = T.glowDot;
  const glows = [];
  function glowSprite(x, y, z, scale, color = 0xffc98a, opacity = 0.9) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(scale);
    world.add(sp);
    glows.push(sp);
    return sp;
  }
  for (const [x, z] of [[-7.4, 7.5], [7.4, 7.5], [-12, 12], [12, 12]]) {
    add(new THREE.CylinderGeometry(0.07, 0.1, 3, 5), M.dark, x, 1.5, z);
    add(new THREE.SphereGeometry(0.22, 8, 6), M.glow, x, 3.1, z);
    glowSprite(x, 3.1, z, 2.4);
  }
  // portico downlights
  for (const [r, th] of [[2, 0], [4, -0.7], [4, 0.7], [4.8, -1.3], [4.8, 1.3], [2.6, -1.1], [2.6, 1.1]]) {
    glowSprite(Math.sin(th) * r, 6.8, PZ + Math.cos(th) * r, 1.3, 0xfff0c8, 1);
  }
  for (const s of [-1, 1]) glowSprite(s * 5.6, 6.1, 0.8, 3.2, 0xffc070, 0.55);
  glowSprite(0, 2.4, -6.5, 6, 0xfff2d6, 0.9); // light at the end of the hall, seen once the doors open
  const statueGlow = glowSprite(0, 5.2, FZ + 0.5, 5, 0xffd48a, 0.25);

  // ---------- stars + gold motes ----------
  const stars = pointsCloud(260, () => [(Math.random() - 0.5) * 420, 45 + Math.random() * 150, -150 - Math.random() * 60], 1.4, 0xdfe6ff, false);
  scene.add(stars);
  const MOTES = 220;
  const motes = pointsCloud(MOTES, () => [(Math.random() - 0.5) * 60, Math.random() * 26, -6 + Math.random() * 34], 0.28, 0xffd98a, true);
  scene.add(motes);
  const moteSpeed = Float32Array.from({ length: MOTES }, () => 0.15 + Math.random() * 0.45);

  // ---------- camera framing ----------
  const EYE = 1.7; // camera height: a guest standing on the plaza
  const TARGET = new THREE.Vector3(0, 7.5, 0);
  const rest = { r: 40 };
  function fit() {
    const w = gate.clientWidth || window.innerWidth;
    const h = gate.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(40 / 2));
    // keep the front façade (≈27 wide, ≈22 tall) in frame at any aspect,
    // plus headroom above/below for the names and the open button
    const dW = 15 / (tanHalf * camera.aspect);
    const dH = 19 / tanHalf;
    const d = Math.max(dW, dH) + 9;
    rest.r = d;
    scene.fog.near = d + 20;
    scene.fog.far = d + 190;
    camera.updateProjectionMatrix();
  }
  fit();
  window.addEventListener('resize', fit);

  // The opening text sits at the top of the screen, so slide the picture down (without tilting
  // the camera) to put the hotel underneath it: a lot on phones, a little on wide screens.
  const frameShift = { f: 0, w: 0, h: 0 };
  // 0.28 of the screen on phones (aspect <= 0.6) down to 0.08 on wide monitors (aspect >= 1.7)
  const baseShift = () => 0.28 - 0.2 * THREE.MathUtils.clamp((camera.aspect - 0.6) / 1.1, 0, 1);
  function setViewShift(f) {
    const w = gate.clientWidth || window.innerWidth;
    const h = gate.clientHeight || window.innerHeight;
    if (Math.abs(f - frameShift.f) < 1e-4 && w === frameShift.w && h === frameShift.h) return;
    Object.assign(frameShift, { f, w, h });
    if (f === 0) camera.clearViewOffset();
    else camera.setViewOffset(w, h, 0, -f * h, w, h);
  }

  const look = new THREE.Vector3();
  // orbit the façade at eye level; lookY lets the view tilt up/down
  function placeCamera(az, r, lookY) {
    camera.position.set(Math.sin(az) * r, EYE, Math.cos(az) * r);
    look.set(TARGET.x, lookY, TARGET.z);
    camera.lookAt(look);
  }

  // ---------- sway input: mouse on desktop, gyro on phones ----------
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const tilt = { active: false, bx: null, by: null };
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  function onPointer(e) {
    if (tilt.active) return;
    // in the ballroom a drag looks around, so only a hovering mouse sways the view
    if (state === 'venue' && (e.pointerType !== 'mouse' || e.buttons)) return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }
  // The opening keeps the tilt sway it has always had: the hotel drifts with the phone while
  // the guest stands and watches, which is the whole charm of it. Inside the lobby and the
  // ballroom it is switched off — there the guest is walking, and a view pinned to how the
  // phone is held is what makes people queasy. Looking around in there is the thumbstick, a
  // drag, or (if they ask for it) the gyroscope, in fps.js.
  const inRoom = () => state !== 'intro' && state !== 'idle' && state !== 'walk';

  function onOrient(e) {
    if (inRoom()) {
      // let the sway ease back to centre rather than freezing wherever it was
      pointer.x = pointer.y = 0;
      return;
    }
    if (e.beta == null || e.gamma == null) return;
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let x = e.gamma, y = e.beta;
    if (angle === 90) { x = e.beta; y = -e.gamma; }
    else if (angle === -90 || angle === 270) { x = -e.beta; y = e.gamma; }
    if (tilt.bx === null) { tilt.bx = x; tilt.by = y; }
    // however the phone is held becomes "centre", re-centring slowly
    tilt.bx += (x - tilt.bx) * 0.003;
    tilt.by += (y - tilt.by) * 0.003;
    pointer.x = -clamp1((x - tilt.bx) / 18);
    pointer.y = -clamp1((y - tilt.by) / 18);
    if (!tilt.active && hint) hint.hidden = true;
    tilt.active = true;
  }
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  // walking around the lobby and the ballroom: thumbstick + drag on phones, WASD + mouse on computers
  const controls = createControls(canvas, document.getElementById('stick'));
  const crosshair = document.getElementById('crosshair');
  const hint = document.getElementById('motionHint');
  if (isTouch && typeof DeviceOrientationEvent !== 'undefined') {
    window.addEventListener('deviceorientation', onOrient);
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS: motion access must be requested from a tap (the hint goes away
      // on its own if tilt data turns out to be flowing already)
      if (hint) hint.hidden = false;
      const ask = (e) => {
        if (e.target.closest('#openBtn')) return;
        gate.removeEventListener('pointerdown', ask);
        if (hint) hint.hidden = true;
        if (!tilt.active) DeviceOrientationEvent.requestPermission().catch(() => {});
      };
      gate.addEventListener('pointerdown', ask);
    }
  }

  // ---------- animation state ----------
  // intro -> idle -> walk (verse overlaid on the way; doors open, white flash) -> arrive
  // -> lobby (look around, tap photos) -> leave (resolves flyIn's promise)
  // and from the lobby: toVenue -> venue (the ballroom) -> toLobby -> lobby, or -> leave
  const clock = new THREE.Clock();
  const INTRO = 7; // seconds of slow zoom-in from the left
  const CREEP = 0.25; // then keep strolling forward, closing up to 25% of the distance (never stopping dead)
  const CREEP_TIME = 80; // seconds: how gradually that stroll eases off
  const ARRIVE_MS = 1900; // white flash -> lobby
  const STORY_AT = 1300, STORY_MS = 7500; // our story over the lobby as the camera glides in (a tap skips)
  let state = 'intro';
  let paused = false; // the 2D invitation is covering the venue
  let walk = null;
  let arrive = null;
  let active = scene;
  let raf = 0;
  const flash = gate.querySelector('.gate-flash');
  const lobby = createLobby();

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  const DOOR_LOOK = new THREE.Vector3(0, 2.0, -8);
  const tmp = new THREE.Vector3();

  function frame() {
    if (paused) return;
    raf = requestAnimationFrame(frame);
    try {
      step();
    } catch (err) {
      // never leave a guest stuck behind a broken scene
      console.error(err);
      cancelAnimationFrame(raf);
      if (walk) walk.resolve();
    }
  }

  function step() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    pointer.sx += (pointer.x - pointer.sx) * 0.05;
    pointer.sy += (pointer.y - pointer.sy) * 0.05;

    if (active === scene) {
      // drifting motes
      const pos = motes.geometry.attributes.position;
      for (let i = 0; i < MOTES; i++) {
        let y = pos.getY(i) + moteSpeed[i] * dt;
        if (y > 26) y = 0;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 0.5 + i) * 0.004);
      }
      pos.needsUpdate = true;
      statueGlow.material.opacity = 0.22 + Math.sin(t * 1.4) * 0.06;
    }

    if (state === 'intro' || state === 'idle') {
      const k = easeOut(Math.min(1, t / INTRO));
      if (k >= 1) state = 'idle';
      const swayAz = Math.sin(t * 0.2) * 0.025 + pointer.sx * 0.16;
      // a very slow walk toward the hotel that starts with the swoop and carries on after it
      const creep = rest.r * CREEP * (1 - Math.exp(-t / CREEP_TIME));
      const r = THREE.MathUtils.lerp(rest.r * 1.6, rest.r, k) - creep;
      placeCamera(THREE.MathUtils.lerp(-0.34, 0, k) + swayAz, r, TARGET.y - pointer.sy * 1.6);
      camera.position.y += Math.abs(Math.sin(t * Math.PI * 0.8)) * 0.025; // unhurried footsteps
      setViewShift(baseShift());
    } else if (state === 'walk') {
      stepWalk(performance.now() - walk.start);
    } else if (state === 'arrive') {
      stepArrive(performance.now() - arrive.start);
    } else if (state === 'toVenue') {
      stepToVenue(performance.now() - hop.start);
    } else if (state === 'toLobby') {
      stepToLobby(performance.now() - hop.start);
    } else if (state === 'jump') {
      stepJump(performance.now() - hop.start);
    }
    if (fade && flash) {
      const k = Math.min(1, Math.max(0, (performance.now() - fade.start) / fade.ms));
      flash.style.opacity = String(THREE.MathUtils.lerp(fade.from, fade.to, k * k * (3 - 2 * k)));
      if (k >= 1) fade = null;
    }
    const driving = state === 'lobby' || state === 'venue';
    if (driving && controls.took()) takeWheel();
    if (crosshair) {
      const aiming = driving && controls.locked();
      crosshair.hidden = !aiming;
      if (aiming) {
        const at = state === 'venue' ? venue.pick(camera, 0, 0) : lobby.pick(camera, 0, 0);
        if (state === 'venue') setHot(at);
        else setHover(clickable(at) ? at.group : null);
        crosshair.classList.toggle('is-on', !!at);
      }
    }
    if (active === lobby.scene) lobby.update(camera, t, dt, pointer, state === 'lobby' ? controls : null);
    else if (venue && active === venue.scene) venue.update(camera, t, dt, pointer, state === 'venue' ? controls : null);
    if (state === 'lobby') tickLobby();
    else if (state === 'venue') tickVenue();
    renderer.render(active, camera);
  }

  // walk around the fountain, up the carpet, doors swing open, step inside
  function stepWalk(ms) {
    const W = walk;
    // ease the picture back to centre as the walk starts, so the doors are framed dead ahead
    setViewShift(baseShift() * (1 - smooth(0, W.walkMs * 0.45, ms)));
    if (ms < W.walkMs) {
      const u = ms / W.walkMs;
      const e = easeInOut(u);
      W.curve.getPointAt(e, camera.position);
      // footsteps: gentle head bob that fades in/out with walking speed
      const pace = Math.sin(Math.PI * u);
      camera.position.y += Math.abs(Math.sin((ms / 1000) * Math.PI * 1.0)) * 0.06 * pace;
      // look where we're walking, then settle on the doors
      W.curve.getTangentAt(e, tmp);
      tmp.y = 0;
      tmp.normalize().multiplyScalar(10).add(camera.position);
      tmp.y = EYE + 0.4;
      look.lerpVectors(W.lookFrom, tmp, smooth(0, 0.3, u));
      look.lerp(DOOR_LOOK, smooth(0.62, 0.95, u));
      camera.lookAt(look);
      camera.fov = THREE.MathUtils.lerp(40, W.doorFov, smooth(0.55, 1, u));
      camera.updateProjectionMatrix();
      camera.rotateZ(Math.sin((ms / 1000) * Math.PI * 0.95) * 0.008 * pace);
    } else {
      const stop = W.curve.points[W.curve.points.length - 1];
      const creep = smooth(W.walkMs, W.enterAt, ms) * 0.6;
      const enter = Math.pow(Math.min(1, Math.max(0, (ms - W.enterAt) / W.enterMs)), 2);
      camera.position.set(0, EYE, stop.z - creep - enter * 10);
      camera.lookAt(DOOR_LOOK);
      camera.fov = W.doorFov + enter * 10;
      camera.updateProjectionMatrix();
    }
    const doorK = easeOut(Math.min(1, Math.max(0, (ms - W.doorAt) / W.doorMs)));
    setDoors(doorK);
    hall.intensity = 30 + 90 * doorK;
    porticoLight.intensity = 45 + 60 * doorK;
    if (flash) flash.style.opacity = String(smooth(W.enterAt + W.enterMs * 0.4, W.endMs, ms));
    // the verse (QS. Az-Zariyat 49) overlays the whole walk, fading as the camera
    // steps through the doorway (~80% of the way in); our story follows inside
    gate.classList.toggle('show-ayat', ms >= 500 && ms < W.enterAt + W.enterMs * 0.8);
    if (ms >= W.endMs) startArrive();
  }

  // through the doors: under the white flash, swap to the lobby, then let the flash fade
  function startArrive() {
    state = 'arrive';
    arrive = { start: performance.now(), entered: false };
    setViewShift(0);
    gate.classList.remove('show-ayat', 'show-story');
    renderer.compile(lobby.scene, camera); // warm up shaders while the screen is white
    // ...and build the ballroom now too, so nothing stutters later when its door opens
    try {
      renderer.compile(getVenue().scene, camera);
    } catch (err) {
      console.error(err);
    }
  }

  function stepArrive(ms) {
    if (!arrive.entered && ms >= 250) {
      arrive.entered = true;
      active = lobby.scene;
      lobby.enter(camera);
    }
    if (arrive.entered && flash) flash.style.opacity = String(1 - smooth(250, ARRIVE_MS, ms));
    // our story rises over the lobby as the flash clears; then all but the last line fade.
    // "Dan kami ingin merayakannya bersama kalian." lingers, glides (full size) over to the
    // RSVP button, waits while the button appears beneath it, then shrinks into it.
    // leave: the other lines fade (0.7 s) -> linger: only once they're gone, the last line rises
    // to the centre (1.2 s) and holds -> move: it glides over the RSVP button -> arrive
    const leaveAt = STORY_AT + STORY_MS, lingerAt = leaveAt + 1200, moveAt = lingerAt + 2000, arriveAt = moveAt + 1300;
    if (ms >= STORY_AT) gate.classList.add('show-story');
    if (ms >= leaveAt) gate.classList.add('story-leave');
    if (ms >= moveAt) gate.classList.add('story-fly');
    if (ms >= lingerAt && !arrive.lingered) {
      arrive.lingered = true;
      lingerStoryLine();
    }
    if (ms >= moveAt && !arrive.moved) {
      arrive.moved = true;
      moveStoryToRsvp();
    }
    if (ms >= arriveAt) {
      // the lobby (and its RSVP button) fades in under the line; once it's up, the line shrinks away
      state = 'lobby';
      gate.classList.add('in-lobby');
      controls.start(isTouch);
      askMotion();
      setTimeout(shrinkStoryIntoRsvp, 700);
    }
  }

  // as the other lines fade, the last one drifts up to the centre and grows a little
  let storyBase = null; // its untransformed centre, so the moves can be measured from it
  let storyToRsvp = null; // translation that puts it over the RSVP button
  function lingerStoryLine() {
    const line = gate.querySelector('.story-line:last-child');
    if (!line) return;
    const r = line.getBoundingClientRect();
    storyBase = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const c = canvas.getBoundingClientRect();
    line.style.transition = 'transform 1.2s cubic-bezier(.3,.7,.2,1)';
    line.style.transform = `translateY(${c.top + c.height * 0.42 - storyBase.y}px) scale(1.12)`;
  }

  // glide over the RSVP button at full size
  function moveStoryToRsvp() {
    const line = gate.querySelector('.story-line:last-child');
    if (!line || !storyBase) return;
    const c = canvas.getBoundingClientRect();
    tmp.copy(lobby.anchors.rsvp).project(camera);
    storyToRsvp = {
      x: c.left + ((tmp.x + 1) / 2) * c.width - storyBase.x,
      y: c.top + ((1 - tmp.y) / 2) * c.height - storyBase.y,
    };
    line.style.transition = 'transform 1.3s cubic-bezier(.65,0,.35,1)';
    line.style.transform = `translate(${storyToRsvp.x}px, ${storyToRsvp.y}px)`;
  }

  // the RSVP button is showing: shrink the line down into it, with the button's gold pulse
  function shrinkStoryIntoRsvp() {
    const line = gate.querySelector('.story-line:last-child');
    const rsvp = gate.querySelector('.lobby-tag[data-group="rsvp"]');
    if (line && storyToRsvp) {
      line.style.transition = 'transform .6s cubic-bezier(.5,0,.75,0), opacity .6s ease';
      line.style.transform = `translate(${storyToRsvp.x}px, ${storyToRsvp.y}px) scale(0.15)`;
      line.style.opacity = '0';
    }
    setTimeout(() => {
      if (rsvp) {
        rsvp.classList.add('is-landing');
        setTimeout(() => rsvp.classList.remove('is-landing'), 1500);
      }
      if (line) line.style.visibility = 'hidden'; // hide before letting the overlay go
      gate.classList.remove('show-story', 'story-leave', 'story-fly');
      setTimeout(() => { if (line) line.style.cssText = ''; }, 1400);
    }, 550);
  }

  // ---------- how the guest looks around inside: asked once, remembered after ----------
  // The thumbstick and a drag always work. Taking the view from the phone's own movement is
  // opt-in, because for some people it brings on motion sickness, and it can be turned off
  // again at any point from the corner.
  const MOTION_KEY = 'adamelsa.phoneMotion';
  const motionAsk = document.getElementById('motionAsk');
  const motionToggle = document.getElementById('motionToggle');
  const motionState = motionToggle && motionToggle.querySelector('.motion-state');
  let motionAsked = false;
  let gyroThere = false;   // a gyroscope was actually found on this device

  const storedMotion = () => {
    try { return localStorage.getItem(MOTION_KEY); } catch (err) { return null; }
  };
  const rememberMotion = (on) => {
    try { localStorage.setItem(MOTION_KEY, on ? 'on' : 'off'); } catch (err) { /* private browsing */ }
  };
  function showMotionState(on) {
    if (!motionToggle || !gyroThere) return; // nothing to turn on: no toggle to offer
    motionToggle.hidden = false;
    motionToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (motionState) motionState.textContent = on ? 'Gerak ponsel: aktif' : 'Gerak ponsel: mati';
  }
  function setMotion(on) {
    return controls.setGyro(on).then((got) => {
      rememberMotion(got);
      showMotionState(got);
      return got;
    });
  }
  // ---------- how to get about: shown on arriving, gone on the first move ----------
  const coach = document.getElementById('coach');
  let coachTimer = 0;
  function showCoach() {
    if (!coach || state !== 'lobby') return;
    coach.dataset.mode = isTouch ? 'touch' : 'desk';
    const [move, look] = coach.querySelectorAll('.coach-text');
    if (isTouch) {
      move.textContent = 'Tuas untuk berjalan';
      look.textContent = 'Geser layar untuk melihat';
    } else {
      move.textContent = 'WASD untuk berjalan';
      look.textContent = 'Gerakkan mouse untuk melihat';
    }
    coach.hidden = false;
    coach.classList.remove('is-going');
    // if they just stand and read it, let it go on its own
    clearTimeout(coachTimer);
    coachTimer = setTimeout(hideCoach, 14000);
  }
  function hideCoach() {
    if (!coach || coach.hidden) return;
    clearTimeout(coachTimer);
    coach.classList.add('is-going');
    coachTimer = setTimeout(() => { coach.hidden = true; }, 600);
  }

  // called when the lobby first comes up
  function askMotion() {
    if (motionAsked) return;
    motionAsked = true;
    // a computer walks with the keys and looks with the mouse: nothing to choose between
    if (!isTouch) { showCoach(); return; }
    hasGyro().then((yes) => {
      gyroThere = yes;
      // a phone or tablet with no gyroscope has only one way to play, so just get on with it
      if (!yes) { showCoach(); return; }
      const saved = storedMotion();
      if (saved !== null) { setMotion(saved === 'on'); showCoach(); return; }
      if (motionAsk) motionAsk.hidden = false; // the hints follow the choice
    });
  }
  if (motionAsk) {
    const choose = (on) => {
      motionAsk.hidden = true;
      setMotion(on); // iOS hands the sensor over only from inside this tap
      showCoach();
    };
    const stickOnly = document.getElementById('motionStick');
    const withGyro = document.getElementById('motionGyro');
    if (stickOnly) stickOnly.addEventListener('click', () => choose(false));
    if (withGyro) withGyro.addEventListener('click', () => choose(true));
  }
  if (motionToggle) motionToggle.addEventListener('click', () => { if (gyroThere) setMotion(!controls.gyroOn()); });

  // The guest moved or looked for themselves: the lobby's rails give way to walking, any
  // open card closes, and on a computer the pointer locks so the mouse turns the view.
  function takeWheel() {
    hideCoach();
    if (state === 'lobby') {
      if (view.name !== 'rest') { setView({ name: 'rest' }); showCard(null); }
      lobby.roam(camera);
    }
    if (!isTouch && !controls.locked()) controls.lock();
  }

  // tap while the story is up to move on sooner
  gate.addEventListener('pointerdown', () => {
    if (state !== 'arrive') return;
    const ms = performance.now() - arrive.start;
    // skip to where the last line lingers, so it still flies into the RSVP button
    if (ms > STORY_AT + 1500 && ms < STORY_AT + STORY_MS) arrive.start = performance.now() - (STORY_AT + STORY_MS);
  });

  // ---------- lobby: labelled photo groups ----------
  // rest   -> look around; hover (or on phones, always) shows each group's label
  // couple -> tour: pans Adam (card) -> Elsa (card) -> together (card); a tap skips to the end
  // map    -> map board + card with Google Maps and the Akad/Resepsi times
  // rsvp   -> the reception desk (and its RSVP button): face the door, RSVP card over it
  // venue  -> the door ("Masuk Ballroom") or the photo beside it: walk through into the ballroom
  // story  -> tap a photo: zoom into it; the label: overview of the corner (back returns there)
  // couple tour: one continuous pan Adam -> Elsa -> together, lingering on each photo
  // and quicker only between them; the card follows the camera
  const COUPLE_TOUR = ['adam', 'elsa', 'together'];
  const TOUR_PAN = 15; // seconds for the pan itself
  const tourCard = (u) => (u < 0.5 ? 'groom' : u < 1.5 ? 'bride' : 'couple');
  const CARD_PHOTO = { groom: 'adam', bride: 'elsa', couple: 'together', gift: 'gift' };
  // wide screens: the couple cards ride along on the photo's right edge instead of the screen's
  const cardBeside = () => canvas.clientWidth / canvas.clientHeight >= 1 && canvas.clientWidth > 760;
  const cardReserve = () => {
    const W = canvas.clientWidth;
    return cardBeside() ? (Math.min(380, 0.36 * W) + 56) / W : 0;
  };
  const lobbyUi = document.getElementById('lobbyUi');
  const lobbyHint = document.getElementById('lobbyHint');
  const lobbyBack = document.getElementById('lobbyBack');
  const card = document.getElementById('lobbyCard');
  const lobbyTop = document.querySelector('.lobby-ui .lobby-top');
  const lobbyBottom = document.querySelector('.lobby-ui .lobby-bottom');
  const tags = [...document.querySelectorAll('.lobby-tag')];
  if (lobbyHint) {
    lobbyHint.textContent = isTouch
      ? 'Gunakan tuas untuk berjalan · geser layar untuk melihat · ketuk foto untuk membuka'
      : 'WASD untuk berjalan · gerakkan mouse untuk melihat · klik foto untuk membuka';
  }

  let view = { name: 'rest' };
  let hovered = null;
  let cardTimer = 0;

  function showCard(name, delay) {
    clearTimeout(cardTimer);
    // the RSVP card sits centred over the door; the others beside/below the photo
    if (lobbyUi) lobbyUi.classList.toggle('has-card', !!name && name !== 'rsvp');
    if (!card) return;
    card.classList.remove('is-open');
    if (!name) return;
    cardTimer = setTimeout(() => {
      card.dataset.show = name;
      card.classList.toggle('is-center', name === 'rsvp');
      if (name !== 'rsvp') card.style.left = card.style.top = ''; // back to the stylesheet's placement
      if (name === 'map') {
        // load the Google map only when someone actually opens it
        const frame = card.querySelector('iframe[data-src]');
        if (frame && !frame.src) frame.src = frame.dataset.src;
      }
      card.classList.add('is-open');
    }, delay);
  }

  function setView(next) {
    view = next;
    if (!lobbyUi) return;
    lobbyUi.classList.toggle('is-focused', next.name !== 'rest');
    lobbyUi.classList.toggle('is-story', next.name === 'story');
    setHover(null);
  }

  function setHover(group) {
    if (group === hovered) return;
    hovered = group;
    lobby.highlight(group);
    canvas.style.cursor = group ? 'pointer' : '';
  }

  function openGroup(group, entry) {
    if (group === 'venue') {
      enterVenue();
    } else if (group === 'couple') {
      setView({ name: 'couple', card: 'groom' });
      lobby.goTour(camera, COUPLE_TOUR, 'caption', 1.8, TOUR_PAN, cardReserve());
      showCard('groom', 1300);
    } else if (group === 'map') {
      setView({ name: 'map' });
      lobby.goItem(camera, 'map', 'tall', 1.6);
      showCard('map', 1100);
    } else if (group === 'gift') {
      setView({ name: 'gift', card: 'gift' });
      lobby.goGift(camera, giftFraming(), 1.6);
      showCard('gift', 1100);
    } else if (group === 'rsvp') {
      setView({ name: 'rsvp' });
      // measure the RSVP card, then frame the door to sit just inside it
      card.classList.remove('is-open');
      card.dataset.show = 'rsvp';
      card.classList.add('is-center');
      const r = card.getBoundingClientRect();
      const W = canvas.clientWidth, H = canvas.clientHeight;
      // look toward the door: just left of centre on wide screens, centred on phones
      const ndcX = W / H >= 1 ? -0.18 : 0;
      const at = lobby.goDoor(camera, (r.width * 0.72) / W, (r.height * 0.72) / H, ndcX, 1.6);
      card.style.left = `${Math.min(W - r.width / 2 - 16, Math.max(r.width / 2 + 16, at.x * W))}px`;
      card.style.top = `${Math.min(H - r.height / 2 - 90, Math.max(r.height / 2 + 16, at.y * H))}px`;
      showCard('rsvp', 1100);
    } else if (group === 'invite') {
      // the framed 2D invitation on the wall: zoom in, then open the page over the venue
      setView({ name: 'invite' });
      lobby.goItem(camera, 'invite', 'center', 1.3);
      showCard(null);
      clearTimeout(inviteTimer);
      inviteTimer = setTimeout(openInvite, 1300);
    } else if (group === 'story' && entry) {
      // a single photo: zoom straight into it
      setView({ name: 'photo', parent: view.name === 'story' ? 'story' : 'rest' });
      lobby.goItem(camera, entry.id, 'center', 1.3);
      showCard(null);
    } else if (group === 'story') {
      // the label: step back to see the whole corner
      setView({ name: 'story' });
      lobby.goStory(camera, 2.2);
      showCard(null);
    }
  }

  // tap during the pan: jump ahead to the last photo; tap once there: leave
  function skipTour() {
    if (lobby.tourDone()) return back();
    lobby.goItem(camera, COUPLE_TOUR[COUPLE_TOUR.length - 1], 'caption', 1.4, cardReserve());
    view.card = tourCard(COUPLE_TOUR.length - 1);
    showCard(view.card, 900);
  }

  let inviteTimer = 0;
  function openInvite() {
    if (state !== 'lobby' || view.name !== 'invite') return;
    if (!window.openInvitationOverlay) return; // no page to show: stay on the framed photo
    controls.stop();
    paused = true; // nothing to render while the invitation covers the venue
    cancelAnimationFrame(raf);
    window.openInvitationOverlay(() => {
      paused = false;
      controls.start(isTouch);
      clock.getDelta(); // drop the time spent reading, so nothing jumps on the first frame
      frame();
      back();
    });
  }

  function back() {
    if (view.name === 'photo' && view.parent === 'story') return openGroup('story');
    setView({ name: 'rest' });
    lobby.goRest(camera, 1.6);
    showCard(null);
  }

  // Wide screens: the kotak angpao and its card sit together as a pair in the middle of the
  // screen (box a little left of centre, card right beside it); phones keep box above, card below.
  function giftFraming() {
    if (!cardBeside()) return { ndcY: 0.45, hy: 0.36 }; // phones: box in the upper part, above the card
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const hy = 0.55;                                    // table + box fill ~55% of the height
    const boxW = (0.9 / 1.28) * hy * H;
    const cardW = Math.min(380, 0.36 * W);
    const left = (W - (boxW + 24 + cardW)) / 2;         // centre the pair
    return { ndcX: ((left + boxW / 2) / W) * 2 - 1, hy };
  }

  // Keep the couple (and angpao) card attached to the right side of its item (wide screens),
  // following it as the camera moves; everywhere else the stylesheet places the card.
  function placeCoupleCard() {
    const photo = (view.name === 'couple' || view.name === 'gift') && cardBeside() && CARD_PHOTO[view.card];
    if (!photo) {
      if (card.dataset.beside) {
        delete card.dataset.beside;
        card.style.left = card.style.top = card.style.right = '';
      }
      return;
    }
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const r = lobby.screenRect(camera, photo, W, H);
    const cw = card.offsetWidth;
    card.dataset.beside = '1';
    card.style.right = 'auto';
    card.style.left = `${Math.min(W - cw - 16, r.right + 24)}px`;
    card.style.top = `${Math.min(H - 120, Math.max(120, (r.top + r.bottom) / 2))}px`;
  }

  // called every frame while in the lobby
  function tickLobby() {
    if (view.name === 'couple') {
      const u = lobby.tourProgress();
      if (u >= 0 && tourCard(u) !== view.card) {
        view.card = tourCard(u);
        showCard(view.card, 250);
      }
    }
    placeCoupleCard();
    // Float each group's label over its photos.
    // On a phone there is no hovering, so the labels have to show themselves — but all six at
    // once, in portrait, piled on each other and on the title, is unreadable. Two things keep
    // it honest: a label only shows while its photos are actually on screen (the two buttons
    // are the exception, since they are what the guest came to press), and whatever is left is
    // spread out so no two overlap, inside the band between the heading and the bottom bar.
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const showAll = isTouch && view.name === 'rest' && lobby.settled();
    const want = [];
    for (const tag of tags) {
      const group = tag.dataset.group;
      tmp.copy(lobby.anchors[group]).project(camera);
      const inFront = tmp.z < 1;
      const half = tag.offsetWidth / 2 + 10;
      const x = ((tmp.x + 1) / 2) * w;
      const cx = Math.min(w - half, Math.max(half, x));
      const edge = x < 0 ? 'left' : x > w ? 'right' : '';
      tag.dataset.edge = edge;
      const cta = tag.classList.contains('lobby-tag--cta');
      const show = inFront && view.name === 'rest'
        && (cta || (showAll && !edge) || (hovered === group && !edge));
      tag.classList.toggle('is-visible', show);
      if (!show) continue;
      const hh = tag.offsetHeight;
      // labels float just above their anchor; the buttons sit on it (the desk front, the door)
      want.push({ tag, cx, cy: ((1 - tmp.y) / 2) * h - (cta ? 0 : hh / 2 + 6), hw: tag.offsetWidth / 2, hh, cta });
    }
    spreadTags(want, w, h);
    for (const t of want) t.tag.style.transform = `translate(${t.cx}px, ${t.cy}px) translate(-50%, -50%)`;
  }

  // Nudge labels down the screen until none sits on top of another. The buttons hold their
  // place — they point at a thing the guest is about to press — so the labels move around them.
  function spreadTags(list, w, h) {
    const top = lobbyTop ? lobbyTop.getBoundingClientRect().bottom + 10 : 80;
    const bottom = (lobbyBottom ? lobbyBottom.getBoundingClientRect().top : h) - 10;
    for (const t of list) t.cy = Math.min(bottom - t.hh / 2, Math.max(top + t.hh / 2, t.cy));
    const order = [...list].sort((a, b) => (a.cta === b.cta ? a.cy - b.cy : a.cta ? -1 : 1));
    const done = [];
    for (const t of order) {
      for (let pass = 0; pass < 8; pass++) {
        const hit = done.find((o) => Math.abs(o.cx - t.cx) < o.hw + t.hw + 6 && Math.abs(o.cy - t.cy) < (o.hh + t.hh) / 2 + 6);
        if (!hit) break;
        const below = hit.cy + (hit.hh + t.hh) / 2 + 6;
        t.cy = below + t.hh / 2 > bottom ? hit.cy - (hit.hh + t.hh) / 2 - 6 : below;
      }
      done.push(t);
    }
  }

  const toNdc = (e) => {
    if (controls.locked()) return [0, 0]; // mouse look: the crosshair is the cursor
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1];
  };
  // groups you can open from each view
  const clickable = (entry) => {
    if (!entry) return false;
    if (view.name === 'rest') return true;
    if (view.name === 'story') return entry.group === 'story';
    return false;
  };
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointercancel', () => { downAt = null; });
  canvas.addEventListener('pointerup', (e) => {
    if ((state !== 'lobby' && state !== 'venue') || !downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    // a drag that turned the view is not a tap on anything (the controls count the travel)
    const turned = !controls.locked() && (moved > 10 || controls.dragged() > 10);
    if (state === 'venue') {
      if (!turned) venueGo(venue.pick(camera, ...toNdc(e)));
      return;
    }
    if (turned) return;
    const entry = lobby.pick(camera, ...toNdc(e));
    if (clickable(entry)) {
      openGroup(entry.group, entry);
    } else if (view.name === 'couple') {
      skipTour();
    } else if (view.name !== 'rest') {
      back();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (state === 'venue') {
      if (e.pointerType === 'mouse') setHot(venue.pick(camera, ...toNdc(e)));
      return;
    }
    if (state !== 'lobby' || e.pointerType !== 'mouse') return;
    const entry = lobby.pick(camera, ...toNdc(e));
    setHover(clickable(entry) ? entry.group : null);
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.lobby-tag')) return;
    setHover(null);
  });
  for (const tag of tags) {
    tag.addEventListener('click', () => { if (state === 'lobby' && view.name === 'rest') openGroup(tag.dataset.group); });
    tag.addEventListener('pointerleave', (e) => { if (e.relatedTarget !== canvas && !isTouch) setHover(null); });
  }
  if (lobbyBack) lobbyBack.addEventListener('click', back);

  // ---------- ballroom (through the lobby's door) ----------
  // toVenue: face the door, it swings open, step through under a warm flash
  // venue:   stand at a spot; drag to look around; tap a label, the thing itself or a dot on
  //          the floor plan to walk there. "← Lobi" (the button, or the door) goes back
  // toLobby: flash, then step back from the door as it closes
  const venueUi = document.getElementById('venueUi');
  const venueTitle = document.getElementById('venueTitle');
  const venueHint = document.getElementById('venueHint');
  const venuePlan = document.getElementById('venuePlan');
  const VENUE_HINT = isTouch
    ? 'Gunakan tuas untuk berjalan · geser layar untuk melihat · ketuk label untuk ke sana'
    : 'WASD untuk berjalan · gerakkan mouse untuk melihat · klik label untuk ke sana';
  const venueTags = []; // { id, tag } for every spot with a label
  let venue = null;
  let hop = null;       // the walk between lobby and ballroom under way: { start, ... }
  let fade = null;      // the flash easing to a new opacity: { from, to, start, ms }
  let shownSpot = null; // the spot the title currently describes
  let hotSpot = null;   // the spot under the cursor
  let planYou = null;   // "you are here" on the floor plan

  function flashTo(to, ms, delay = 0) {
    fade = { from: Number(flash && flash.style.opacity) || 0, to, start: performance.now() + delay, ms };
  }

  // built once, the first time it is needed (while the screen is white on the way into the lobby)
  function getVenue() {
    if (venue) return venue;
    venue = createBallroom();
    if (!venueUi) return venue;
    for (const [id, spot] of Object.entries(SPOTS)) {
      if (!spot.tag) continue;
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'lobby-tag venue-tag';
      tag.textContent = spot.title;
      tag.addEventListener('click', () => venueGo(id));
      venueUi.appendChild(tag);
      venueTags.push({ id, tag });
    }
    if (venuePlan) {
      // floor plan: a dot on everything you can walk to, and an arrow for where you stand
      venuePlan.innerHTML = planSvg();
      const svg = venuePlan.firstElementChild;
      const el = (name, attrs) => {
        const node = document.createElementNS('http://www.w3.org/2000/svg', name);
        for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, val);
        svg.appendChild(node);
        return node;
      };
      for (const { id } of venueTags) {
        const [x, , z] = SPOTS[id].tag;
        const cx = Math.max(-12, x);
        el('circle', { cx, cy: z, r: 0.75, class: 'plan-dot' });
        el('circle', { cx, cy: z, r: 2.4, class: 'plan-spot' }).addEventListener('click', () => venueGo(id));
      }
      planYou = el('path', { d: 'M0 -1.9 L1.3 1.3 L0 0.6 L-1.3 1.3 Z', class: 'plan-you' });
    }
    return venue;
  }

  function venueGo(id) {
    if (state !== 'venue' || !id) return;
    venue.go(id);
    setHot(null);
  }
  function setHot(id) {
    if (id && id === venue.spot()) id = null; // already there (or on the way)
    hotSpot = id;
    canvas.style.cursor = id ? 'pointer' : '';
  }

  function enterVenue() {
    if (state !== 'lobby') return;
    try {
      getVenue();
    } catch (err) {
      console.error(err); // no ballroom: stay in the lobby
      return;
    }
    state = 'toVenue';
    controls.stop();
    setView({ name: 'rest' });
    showCard(null);
    gate.classList.remove('in-lobby');
    // the door starts to open just before the camera comes to rest in front of it
    hop = { start: performance.now(), openAt: lobby.goDoorway(camera, 1.9) * 1000 - 600 };
  }

  function stepToVenue(ms) {
    const walkAt = hop.openAt + 800, endAt = walkAt + 1500;
    lobby.setDoor(easeInOut(Math.min(1, Math.max(0, (ms - hop.openAt) / 1500))));
    if (ms >= walkAt && !hop.walking) {
      hop.walking = true;
      lobby.goThrough(camera, 1.6);
    }
    if (flash) flash.style.opacity = String(smooth(walkAt + 450, endAt, ms));
    if (ms >= endAt) arriveVenue();
  }

  // under the flash: swap to the ballroom, just inside its door
  function arriveVenue() {
    setViewShift(0);
    active = venue.scene;
    if (isTouch && !tilt.active) pointer.x = pointer.y = 0; // no leftover sway from the last tap
    venue.enter(camera);
    shownSpot = null;
    state = 'venue';
    controls.start(isTouch);
    gate.classList.add('in-venue');
    flashTo(0, 1300, 150);
  }

  function leaveVenue() {
    if (state !== 'venue') return;
    state = 'toLobby';
    controls.stop();
    gate.classList.remove('in-venue');
    setHot(null);
    hop = { start: performance.now() };
  }

  function stepToLobby(ms) {
    if (!hop.back) {
      if (flash) flash.style.opacity = String(smooth(0, 550, ms));
      if (ms < 600) return;
      hop.back = true;
      active = lobby.scene;
      lobby.comeBack(camera);
      lobby.setDoor(1);
      lobby.goRest(camera, 3.6);
      return;
    }
    if (flash) flash.style.opacity = String(1 - smooth(650, 1700, ms));
    lobby.setDoor(1 - easeInOut(Math.min(1, Math.max(0, (ms - 1300) / 1500))));
    if (ms >= 2800) {
      state = 'lobby';
      gate.classList.add('in-lobby');
      controls.start(isTouch);
      askMotion();
    }
  }

  // ?ballroom: straight from the opening screen into the ballroom
  function stepJump(ms) {
    if (flash) flash.style.opacity = String(smooth(0, 600, ms));
    if (ms < 650) return;
    getVenue();
    arriveVenue();
  }

  // called every frame while in the ballroom
  function tickVenue() {
    const here = venue.spot(), arrived = venue.arrived();
    if (arrived && here === 'door') return leaveVenue(); // walked back out
    if (arrived && here !== shownSpot) {
      shownSpot = here;
      // walking around freely, between the named spots: the room's own name instead
      if (venueTitle) venueTitle.textContent = here ? SPOTS[here].title : 'Selamat Datang di Hari Bahagia Kami';
      if (venueHint) venueHint.textContent = (here && SPOTS[here].desc) || VENUE_HINT;
    }
    // float each spot's label over it: nearest first, dropping any that would overlap
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const t of venueTags) {
      venue.anchor(t.id, tmp);
      t.dist = tmp.distanceTo(camera.position);
      tmp.project(camera);
      t.front = tmp.z < 1;
      t.x = ((tmp.x + 1) / 2) * w;
      t.y = ((1 - tmp.y) / 2) * h;
    }
    venueTags.sort((a, b) => a.dist - b.dist);
    const placed = [];
    for (const t of venueTags) {
      if (!t.w) t.w = t.tag.offsetWidth;
      const half = t.w / 2 + 8;
      const box = [t.x - half, t.y - 46, t.x + half, t.y + 6];
      // clear of the title at the top and the buttons at the bottom
      const show = t.front && t.id !== here && box[0] > 0 && box[2] < w && t.y > 150 && t.y < h - 110
        && !placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]);
      if (show) placed.push(box);
      t.tag.classList.toggle('is-visible', show);
      t.tag.classList.toggle('is-hot', show && hotSpot === t.id);
      t.tag.style.transform = `translate(${t.x}px, ${t.y}px) translate(-50%, -100%)`;
    }
    if (planYou) {
      const at = venue.where();
      planYou.setAttribute('transform', `translate(${at.x.toFixed(2)} ${at.z.toFixed(2)}) rotate(${(-at.yaw * 180 / Math.PI).toFixed(1)})`);
    }
  }

  const venueBack = document.getElementById('venueBack');
  if (venueBack) venueBack.addEventListener('click', leaveVenue);

  // ---------- public API ----------
  window.weddingGate = {
    // resolves once the guest leaves the lobby for the invitation
    flyIn() {
      if (walk) return walk.promise;
      gate.classList.add('is-flying');
      walk = {};
      walk.promise = new Promise((resolve) => { walk.resolve = resolve; });
      if (new URLSearchParams(window.location.search).has('ballroom')) {
        state = 'jump';
        hop = { start: performance.now() };
        return walk.promise;
      }
      const from = camera.position.clone();
      from.y = EYE;
      // route around the left of the fountain and between the portico columns
      walk.curve = new THREE.CatmullRomCurve3([
        from,
        new THREE.Vector3(Math.min(from.x, 0) * 0.5 - 3.5, EYE, Math.max(24, from.z * 0.55)),
        new THREE.Vector3(-6.6, EYE, FZ + 2.5),
        new THREE.Vector3(-5.4, EYE, FZ - 3.3),
        new THREE.Vector3(-2.2, EYE, 7.2),
        new THREE.Vector3(0, EYE, 6.6),
      ], false, 'centripetal');
      walk.lookFrom = look.clone();
      // widen the lens on narrow screens so both door leaves stay in view
      const dist = 6.6 + 0.5;
      const halfH = Math.atan(Math.tan(Math.atan(2.2 / dist)) / camera.aspect);
      walk.doorFov = Math.max(40, THREE.MathUtils.radToDeg(halfH * 2));
      walk.walkMs = Math.min(15000, Math.max(11000, 6400 + walk.curve.getLength() * 70)); // unhurried: half the original pace
      walk.doorAt = walk.walkMs - 500;
      walk.doorMs = 1700;
      walk.enterAt = walk.walkMs + 1000;
      walk.enterMs = 1900;
      walk.endMs = walk.enterAt + walk.enterMs;
      walk.start = performance.now();
      state = 'walk';
      return walk.promise;
    },
    dispose() {
      cancelAnimationFrame(raf);
      controls.dispose();
      window.removeEventListener('resize', fit);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('deviceorientation', onOrient);
      // some meshes carry an array of materials (the ballroom's cloth-covered tables use one
      // per cylinder face), so dispose each material rather than the array itself
      const freeMaterial = (m) => {
        for (const k of ['map', 'emissiveMap', 'alphaMap', 'bumpMap', 'normalMap']) {
          if (m[k] && m[k].dispose) m[k].dispose();
        }
        m.dispose();
      };
      for (const s of [scene, lobby.scene, ...(venue ? [venue.scene] : [])]) {
        s.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (!o.material) return;
          if (Array.isArray(o.material)) o.material.forEach(freeMaterial);
          else freeMaterial(o.material);
        });
      }
      envMap.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };

  frame();
  requestAnimationFrame(() => gate.classList.add('is-ready'));

  // ================= builders =================

  function parapetGeometry() {
    const s = new THREE.Shape();
    s.moveTo(-3.8, 0);
    s.lineTo(3.8, 0);
    s.lineTo(3.8, 3.1);
    s.lineTo(2.9, 3.1);
    s.quadraticCurveTo(2.2, 3.1, 1.9, 3.8);
    s.lineTo(1.3, 3.8);
    s.lineTo(1.3, 4.3);
    s.quadraticCurveTo(0, 5.6, -1.3, 4.3);
    s.lineTo(-1.3, 3.8);
    s.lineTo(-1.9, 3.8);
    s.quadraticCurveTo(-2.2, 3.1, -2.9, 3.1);
    s.lineTo(-3.8, 3.1);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false, curveSegments: 6 });
  }

  function archGeometry(w, h) {
    const s = new THREE.Shape();
    const r = w / 2;
    s.moveTo(-r, 0);
    s.lineTo(r, 0);
    s.lineTo(r, h - r);
    s.absarc(0, h - r, r, 0, Math.PI, false);
    s.closePath();
    return new THREE.ShapeGeometry(s, 8);
  }

  function buildStatue(mat) {
    const g = new THREE.Group();
    const cap = (r, l, x, y, z, rz = 0, rx = 0) => {
      const m = add(new THREE.CapsuleGeometry(r, l, 2, 6), mat, x, y, z, g);
      m.rotation.set(rx, 0, rz);
      return m;
    };
    const head = (r, x, y, z) => add(new THREE.IcosahedronGeometry(r, 0), mat, x, y, z, g);
    // standing figure lifting a second one skyward
    cap(0.15, 0.85, -0.18, 0.55, 0, 0.08);
    cap(0.15, 0.85, 0.2, 0.55, 0.05, -0.12);
    cap(0.3, 0.75, 0, 1.5, 0, 0.05);
    head(0.22, -0.02, 2.2, 0.05);
    cap(0.1, 0.75, -0.36, 2.3, 0, 0.35);
    cap(0.1, 0.75, 0.38, 2.35, 0, -0.3);
    cap(0.26, 0.8, 0.2, 2.95, 0.05, -0.65);
    head(0.2, 0.62, 3.45, 0.08);
    cap(0.12, 0.9, -0.3, 2.95, 0.05, 1.1);
    cap(0.09, 0.8, 0.55, 3.85, 0, 0.25);
    g.scale.setScalar(0.95);
    return g;
  }

  function bonsai(x, z, sc) {
    const g = new THREE.Group();
    const tr = add(new THREE.CylinderGeometry(0.14, 0.3, 2.4, 5), M.trunk, 0, 1.2, 0, g);
    tr.rotation.z = 0.18;
    const pads = [[0.1, 2.5, 0, 1.7, M.leaf], [1.1, 1.8, 0.3, 1.15, M.leaf2], [-0.9, 3.1, -0.2, 1.25, M.leaf], [0.3, 3.7, 0.1, 0.95, M.leaf2], [-1.3, 2.1, 0.4, 0.9, M.leaf2]];
    for (const [px, py, pz, r, mat] of pads) {
      const p = add(new THREE.IcosahedronGeometry(1, 0), mat, px, py, pz, g);
      p.scale.set(r, r * 0.4, r * 0.85);
      p.rotation.y = Math.random() * Math.PI;
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(sc);
    g.rotation.y = Math.random() * Math.PI * 2;
    world.add(g);
  }

  function cypress(x, z, sc) {
    const g = new THREE.Group();
    add(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5), M.trunk, 0, 0.6, 0, g);
    add(new THREE.ConeGeometry(1.0, 4.8, 6), M.leaf, 0, 3.4, 0, g);
    g.position.set(x, 0, z);
    g.scale.setScalar(sc);
    world.add(g);
  }

  function palm(x, z, sc) {
    const g = new THREE.Group();
    let y = 0, lean = 0;
    for (let i = 0; i < 4; i++) {
      const seg = add(new THREE.CylinderGeometry(0.16 - i * 0.02, 0.2 - i * 0.02, 1.4, 5), M.trunk, lean, y + 0.7, 0, g);
      seg.rotation.z = -0.06 * i;
      y += 1.35;
      lean += 0.05 * i;
    }
    const top = new THREE.Group();
    top.position.set(lean, y, 0);
    g.add(top);
    for (let i = 0; i < 7; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 7) * Math.PI * 2;
      top.add(pivot);
      const leaf = add(new THREE.ConeGeometry(0.4, 2.8, 3), M.palm, 0, 0, 1.2, pivot);
      leaf.rotation.x = Math.PI / 2 + 0.55;
      leaf.scale.set(1, 1, 0.25);
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(sc);
    world.add(g);
  }

  function bush(x, z, sc) {
    const b = add(new THREE.IcosahedronGeometry(0.8, 0), Math.random() > 0.5 ? M.leaf : M.leaf2, x, 0.35 * sc, z);
    b.scale.set(1.4 * sc, 0.75 * sc, 1.1 * sc);
    b.rotation.y = Math.random() * Math.PI;
  }

  function pointsCloud(n, gen, size, color, attenuate) {
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set(gen(i), i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      size, color, map: T.glowDot, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: attenuate, fog: false,
    });
    if (!attenuate) mat.size = size * renderer.getPixelRatio();
    return new THREE.Points(geo, mat);
  }
}

// ================= procedural textures =================

function canvasTex(w, h, draw, repeat) {
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

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skyTexture() {
  return canvasTex(8, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#050817');
    grd.addColorStop(0.4, '#101f4a');
    grd.addColorStop(0.75, '#28427e');
    grd.addColorStop(1, '#3d5288');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

function makeTextures() {
  const T = {};

  // tower façade: white wall with blue windows (+ matching glow map)
  {
    const cols = 8, rows = 16, cw = 32, ch = 32;
    const r = rng(7);
    const glow = document.createElement('canvas');
    glow.width = cols * cw; glow.height = rows * ch;
    const gg = glow.getContext('2d');
    gg.fillStyle = '#000'; gg.fillRect(0, 0, glow.width, glow.height);
    T.facade = canvasTex(cols * cw, rows * ch, (g, w, h) => {
      g.fillStyle = '#e4e6ea'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        g.fillStyle = '#d6d9df'; g.fillRect(0, y * ch + ch - 3, w, 3);
        for (let x = 0; x < cols; x++) {
          const px = x * cw + 6, py = y * ch + 7;
          g.fillStyle = '#23324a'; g.fillRect(px - 1, py - 1, 22, 20); // dark frame
          g.fillStyle = '#3f6f9f'; g.fillRect(px, py, 20, 18);
          const v = r();
          gg.fillStyle = v < 0.16 ? '#ffcf8a' : v < 0.5 ? '#1a3570' : '#0a1838';
          gg.fillRect(px, py, 20, 18);
        }
      }
    }, true);
    T.facadeGlow = new THREE.CanvasTexture(glow);
    T.facadeGlow.colorSpace = THREE.SRGBColorSpace;
    T.facadeGlow.wrapS = T.facadeGlow.wrapT = THREE.RepeatWrapping;
  }

  // bowed glass centre (blue-teal curtain wall)
  {
    const cols = 6, rows = 24, cw = 42, ch = 21;
    const r = rng(21);
    const glow = document.createElement('canvas');
    glow.width = cols * cw; glow.height = rows * ch;
    const gg = glow.getContext('2d');
    T.glass = canvasTex(cols * cw, rows * ch, (g, w, h) => {
      g.fillStyle = '#1b3550'; g.fillRect(0, 0, w, h);
      gg.fillStyle = '#000'; gg.fillRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        g.fillStyle = y % 2 ? '#3a7aa8' : '#347099'; g.fillRect(x * cw + 2, y * ch + 2, cw - 4, ch - 4);
        const v = r();
        gg.fillStyle = v < 0.1 ? '#ffd7a0' : v < 0.6 ? '#1f4bb0' : '#133276';
        gg.fillRect(x * cw + 2, y * ch + 2, cw - 4, ch - 4);
      }
    });
    T.glassGlow = new THREE.CanvasTexture(glow);
    T.glassGlow.colorSpace = THREE.SRGBColorSpace;
  }

  T.warmWindow = canvasTex(128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffe7b8'); grd.addColorStop(1, '#e9a95a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a8742e'; g.lineWidth = 3;
    for (let x = 1; x < 3; x++) { g.beginPath(); g.moveTo((x * w) / 3, 0); g.lineTo((x * w) / 3, h); g.stroke(); }
    for (let y = 1; y < 6; y++) { g.beginPath(); g.moveTo(0, (y * h) / 6); g.lineTo(w, (y * h) / 6); g.stroke(); }
    g.lineWidth = 8; g.strokeRect(0, 0, w, h);
  });

  T.lobby = canvasTex(128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#f8d596'); grd.addColorStop(0.6, '#f3c27a'); grd.addColorStop(1, '#c98c45');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,80,30,0.6)'; g.lineWidth = 4;
    for (let x = 1; x < 3; x++) { g.beginPath(); g.moveTo((x * w) / 3, 0); g.lineTo((x * w) / 3, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, h * 0.2); g.lineTo(w, h * 0.2); g.stroke();
  });

  const drawDoor = (flip) => (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffe9bf'); grd.addColorStop(1, '#e6ac62');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8973f'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, h * 0.55); g.lineTo(w, h * 0.55); g.stroke();
    g.strokeRect(18, 22, w - 36, h * 0.55 - 34);
    g.fillStyle = '#b8862f';
    g.fillRect(flip ? 16 : w - 26, h * 0.34, 10, h * 0.3); // pull handle on the meeting edge
  };
  T.doorL = canvasTex(128, 320, drawDoor(false));
  T.doorR = canvasTex(128, 320, drawDoor(true));

  T.carpet = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#7d1c2a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d2a54f'; g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
  });

  T.greekKey = canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = '#34373e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d6ae5a'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, 2); g.lineTo(w, 2); g.moveTo(0, h - 2); g.lineTo(w, h - 2); g.stroke();
    for (let x = 0; x < w; x += 32) {
      g.beginPath();
      g.moveTo(x + 2, 26); g.lineTo(x + 2, 7); g.lineTo(x + 26, 7); g.lineTo(x + 26, 21);
      g.lineTo(x + 11, 21); g.lineTo(x + 11, 13); g.lineTo(x + 19, 13);
      g.stroke();
    }
  });

  T.dentil = canvasTex(128, 16, (g, w, h) => {
    g.fillStyle = '#d6ae5a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5b4a2a';
    for (let x = 4; x < w; x += 10) g.fillRect(x, 5, 4, h - 5);
  });

  T.balustrade = canvasTex(128, 32, (g, w, h) => {
    g.fillStyle = '#2a2d33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e3da';
    for (let x = 3; x < w; x += 9) g.fillRect(x, 6, 4, h - 10);
    g.fillRect(0, 0, w, 5); g.fillRect(0, h - 4, w, 4);
  });

  T.squareWindow = canvasTex(32, 32, (g, w, h) => {
    g.fillStyle = '#6f7682'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b2030'; g.fillRect(4, 4, w - 8, h - 8);
  });

  T.sign = canvasTex(512, 192, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const path = new Path2D();
    path.moveTo(20, h - 14);
    path.lineTo(20, 70);
    path.quadraticCurveTo(w * 0.3, 70, w / 2, 14);
    path.quadraticCurveTo(w * 0.7, 70, w - 20, 70);
    path.lineTo(w - 20, h - 14);
    path.closePath();
    g.fillStyle = '#1e1a16'; g.fill(path);
    g.strokeStyle = '#d6ae5a'; g.lineWidth = 7; g.stroke(path);
    g.fillStyle = '#e9c46e';
    g.font = 'bold 76px Georgia, "Times New Roman", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('GOLDEN', w / 2, h * 0.64);
  });

  T.tile = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#2c2e33'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#18191c'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(0, (i * h) / 4); g.lineTo(w, (i * h) / 4); g.stroke();
      g.beginPath(); g.moveTo((i * w) / 4, 0); g.lineTo((i * w) / 4, h); g.stroke();
    }
  }, true);

  T.tileWarm = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#b39469'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6e5738'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(0, (i * h) / 4); g.lineTo(w, (i * h) / 4); g.stroke();
      g.beginPath(); g.moveTo((i * w) / 4, 0); g.lineTo((i * w) / 4, h); g.stroke();
    }
  }, true);

  T.fan = canvasTex(128, 128, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    const grd = g.createRadialGradient(cx, cy, 4, cx, cy, w / 2);
    grd.addColorStop(0, '#fff3d0'); grd.addColorStop(1, '#d9a45a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7a5a2e'; g.lineWidth = 2.5;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * h); g.stroke();
    }
  });

  T.wingWindows = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#e8e3da'; g.fillRect(0, 0, w, h);
    for (let x = 8; x < w; x += 40) {
      const grd = g.createLinearGradient(0, 8, 0, h - 6);
      grd.addColorStop(0, '#ffe2a6'); grd.addColorStop(1, '#d08f45');
      g.fillStyle = grd; g.fillRect(x, 10, 28, h - 16);
    }
  });

  T.paving = canvasTex(512, 512, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#4b4e55'; g.fillRect(0, 0, w, h);
    for (let r = w / 2; r > 20; r -= 18) {
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = (Math.round(r / 18) % 2) ? '#5b5e65' : '#50535a'; g.fill();
    }
    g.strokeStyle = 'rgba(30,30,34,0.5)'; g.lineWidth = 1.5;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
      g.beginPath(); g.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); g.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * h); g.stroke();
    }
  });

  T.curb = canvasTex(64, 8, (g, w, h) => {
    g.fillStyle = '#d7b43c'; g.fillRect(0, 0, w / 2, h);
    g.fillStyle = '#26282c'; g.fillRect(w / 2, 0, w / 2, h);
  }, true);

  T.glowDot = canvasTex(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  return T;
}

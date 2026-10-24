// The Golden Ballroom, dressed the way it is planned for the day.
// Reached through the lobby's door (lobby3d.js; gate3d.js runs the walk between the two).
//
// Floor plan (metres-ish): x -13 (west) .. 13 (east), z -18 (north) .. 18 (south).
//   north wall  the pelaminan (stage) in the middle, the VIP area to its west, the band to its east
//   the aisle   white petal carpet from the stage straight south: two pairs of crescent flower
//               gates ("gate sabit"), the gazebo, four standing flowers; then it turns west to
//               the entrance door on the west wall
//   west side   food stalls and a drinks table
//   east side   a drinks table, rows of chairs and round guest tables between the pillars
// The room itself (navy and gold carpet, cream walls with gilt frames, tray ceiling with
// chandeliers) follows photos of the real ballroom; the decoration follows the decorator's brief.
//
// The guest stands at named spots and walks between them along a small path graph, so the
// camera never cuts through furniture; from each spot they can look around.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, rng } from './lobby3d.js';
import { buildBlockers, slide } from './fps.js';
import { addGuests } from './guests3d.js';
import { addCouple } from './couple3d.js';
import { addLive } from './live3d.js';

// Indonesian, or English for guests from Malaysia (lang.js)
const L = window.L || ((id) => id);

const W = 26, D = 36, H = 5.4;
const EYE = 1.65;
const SWAY = { yaw: 0.5, pitch: 0.16 }; // how far the view follows the mouse / the phone's tilt (radians)
const NORTH = -D / 2, WEST = -W / 2;
const STAGE = { w: 9.6, d: 3.8, h: 0.5 };
const STAGE_Z = NORTH + STAGE.d;          // the stage's front edge
const AISLE = { w: 2.4, turnZ: 12.6, fanZ: -8.6, fanW: 9.2 }; // fans out to the stage's width north of fanZ
const GAZEBO = { z: 0.6, s: 3, h: 3 };
const SABIT_Z = [-5.8, -3.5];
const STANDING = [[-2, 4.6], [2, 4.6], [-2, 10.2], [2, 10.2]];
const VIP = { x: -5.8, z: -2.7, gap: [-9.0, -6.6], tables: [[-9.5, -14.6], [-9.5, -10.2], [-9.5, -5.8]] };
const GUEST_TABLES = [[5.2, 6.4], [9.2, 8.5], [6.4, 11.9], [10.6, 4.0]];
const DRINKS = [[-6.2, 1.9], [6.2, 1.3]];
const STALLS_Z = [2.4, 5.5, 8.6];
const BAND = { x: 10.2, z: -16.3, w: 5.2, d: 3 };
const ROWS = { xs: [8.3, 9.3, 10.3, 11.3], zs: [-10.2, -9.2, -8.2, -7.2, -6.2, -5.2] };
const PILLARS_Z = [-12.8, -3.0, 11.5];
const DOORS_Z = [-12.3, -1.4, AISLE.turnZ]; // west wall; the last one is the way in

// flower colours: the pelaminan is white to blush pink; the aisle is dusty pink with a
// little navy and white (both from the decorator's palettes)
const PAL = {
  stage: [0xfffaf2, 0xfffaf2, 0xf8eddc, 0xf7d6d4, 0xf2bcc3, 0xf2bcc3, 0xe99aa9, 0xe99aa9, 0xd97f92],
  aisle: [0xdb8c9b, 0xdb8c9b, 0xe7a4ae, 0xf4ced1, 0xfffaf2, 0xf8eddc, 0x2f4478],
  gazebo: [0xfffaf2, 0xfffaf2, 0xf8eddc, 0xf4ced1, 0xe7a4ae, 0xdb8c9b, 0x2f4478],
  wisteria: [0xfffaf2, 0xfbf3d4, 0xf8eddc, 0xf7dcd8],
  leaf: [0x6f8a5c, 0x86a06e, 0x5d7a52],
};

// Where the guest can stand. `look`: what they face on arriving; `tag`: where the label floats.
export const SPOTS = {
  south: { title: L('Selamat Datang di Hari Bahagia Kami', 'Welcome to Our Happy Day'), look: [0, 1.9, -6] },
  gazebo: { title: 'Gazebo', desc: L('Gazebo bunga di tengah jalan menuju pelaminan.', 'A flower gazebo halfway along the aisle to the stage.'), look: [0, 2.0, GAZEBO.z], tag: [0, 3.9, GAZEBO.z] },
  sabit: { title: L('Gate Bunga', 'Flower Gates'), desc: L('Dua pasang gate sabit penuh bunga, dengan lampu kristal.', 'Two pairs of crescent gates full of flowers, with crystal lights.'), look: [0, 2.1, -9], tag: [0, 3.75, -4.65] },
  stage: { title: L('Pelaminan', 'Wedding Stage'), desc: L('Tempat kami menyambut Bapak/Ibu/Saudara/i.', 'Where we welcome you.'), look: [0, 2.2, NORTH + 1.4], tag: [0, 4.75, NORTH + 1.4] },
  vip: { title: L('Area VIP', 'VIP Area'), desc: L('Untuk keluarga dan tamu kehormatan.', 'For family and guests of honour.'), look: [-9.5, 0.9, -10.2], tag: [-9.5, 2.3, -10.2] },
  band: { title: L('Band & Hiburan', 'Band & Entertainment'), desc: L('Musik dan hiburan sepanjang acara.', 'Music and entertainment all through the event.'), look: [BAND.x, 1.6, BAND.z], tag: [BAND.x, 3.7, BAND.z] },
  food: { title: 'Food Stall', desc: L('Aneka hidangan untuk para tamu.', 'All kinds of food for the guests.'), look: [WEST + 1.5, 1.5, 5.5], tag: [WEST + 1.6, 3.6, 5.5] },
  drinksW: { title: L('Minuman', 'Drinks'), desc: L('Pojok minuman.', 'The drinks corner.'), look: [DRINKS[0][0], 1.0, DRINKS[0][1]], tag: [DRINKS[0][0], 2.25, DRINKS[0][1]] },
  drinksE: { title: L('Minuman', 'Drinks'), desc: L('Pojok minuman.', 'The drinks corner.'), look: [DRINKS[1][0], 1.0, DRINKS[1][1]], tag: [DRINKS[1][0], 2.25, DRINKS[1][1]] },
  tables: { title: L('Meja Tamu', 'Guest Tables'), desc: L('Silakan duduk dan menikmati acara.', 'Please take a seat and enjoy the event.'), look: [8.2, 0.8, 7.9], tag: [8.2, 2.1, 7.9] },
  door: { title: L('← Lobi', '← Lobby'), look: [WEST, 1.5, AISLE.turnZ], tag: [WEST + 0.3, 3.15, AISLE.turnZ] },
};
// Path graph: [x, z] of every place the guest stands or passes. A narrow screen sees a
// narrower slice of the room, so there the gazebo and the pelaminan are viewed from further
// back (`narrow`: 0 wide screens, 1 squarish, 2 phones held upright; on phones the whole
// pelaminan only fits from this side of the flower gates).
const nodesFor = (narrow) => ({
  door: [WEST + 1.6, AISLE.turnZ], bend: [-5.5, AISLE.turnZ], south: [0, 11.6],
  gazebo: [0, narrow ? 8.4 : 6.9], porch: [0, 3.3], inside: [0, GAZEBO.z], sabit: [0, -1.7], between: [0, -4.65],
  fan: [0, -7.5], stage: [0, narrow === 2 ? -4.9 : -7.5], vip: [-4.3, -7.8], band: [4.8, -10.6],
  drinksW: [-3.4, 3.8], drinksE: [3.4, 3.8], toFood: [-3.3, 7.4], food: [-6.6, 6.1], tables: [3.5, 8.4],
});
const EDGES = [
  ['door', 'bend'], ['bend', 'south'], ['south', 'gazebo'], ['gazebo', 'porch'], ['porch', 'inside'],
  ['inside', 'sabit'], ['sabit', 'between'], ['between', 'stage'], ['between', 'fan'], ['stage', 'fan'],
  ['fan', 'vip'], ['fan', 'band'],
  ['porch', 'drinksW'], ['porch', 'drinksE'], ['gazebo', 'toFood'], ['toFood', 'food'], ['drinksW', 'food'],
  ['gazebo', 'tables'], ['drinksE', 'tables'],
];

export function createBallroom() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15110c);
  const rnd = rng(2410);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const lerp = THREE.MathUtils.lerp;

  const T = makeTextures();
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  const M = {
    ivory: lam(0xf3eadb),
    white: lam(0xfbf8f1),
    panel: lam(0xf5ecdc, { emissive: 0x2c2418 }),
    fluted: new THREE.MeshLambertMaterial({ map: T.flutes, emissive: 0x2c2418 }),
    gold: lam(0xc9a24f, { emissive: 0x3a2a0c }),
    wood: lam(0x4a2f1c),
    black: lam(0x18181b),
    silver: lam(0xd3d6da, { emissive: 0x1c1c1e }),
    rose: lam(0xcf8793),
    stageTop: lam(0xc6c8cc),
    cream: lam(0xf0e1bd, { emissive: 0x2a2212 }),
    amber: new THREE.MeshBasicMaterial({ color: 0xffc56a, toneMapped: false }),
    shade: new THREE.MeshBasicMaterial({ color: 0xfff6dd, toneMapped: false, side: THREE.DoubleSide }),
  };

  function add(geo, mat, x = 0, y = 0, z = 0, parent = scene) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  // box / cylinder standing on (x, y, z)
  const boxB = (w, h, d, mat, x, y, z, parent) => add(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, parent);
  const cylB = (rt, rb, h, seg, mat, x, y, z, parent) => add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y + h / 2, z, parent);
  const flat = (w, d, mat, x, y, z) => {
    const m = add(new THREE.PlaneGeometry(w, d), mat, x, y, z);
    m.rotation.x = -Math.PI / 2;
    return m;
  };
  const glow = (x, y, z, s, color = 0xffe2b0, opacity = 0.8, sy = s) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glowDot, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(x, y, z);
    sp.scale.set(s, sy, 1);
    scene.add(sp);
    return sp;
  };

  // Everything drawn many times over is collected here and built as one instanced mesh each:
  const flowers = [];   // x, y, z, sx, sy, sz, colour: every bloom and leaf in the room
  const cores = [];     // x, y, z, sx, sy, sz, colour: the soft mass the blooms sit on
  const crystals = [];  // x, y, z, size: chandelier drops
  const shadows = [];   // x, z, radius: soft contact shadows on the carpet
  const sparkles = [];  // x, y, z: fairy lights
  const chairs = [];    // x, z, yaw
  const posts = [];     // x, z: the VIP area's rope posts
  const shades = [];    // x, y, z: chandelier lamp shades
  const glasses = [];   // x, y, z

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x7a6850, 1.45));
  const key = new THREE.DirectionalLight(0xfff1dc, 0.75); // gives the blooms their facets
  key.position.set(5, 12, 9);
  scene.add(key);
  for (const [x, y, z, c, i, reach] of [
    [0, 2.6, NORTH + 3.4, 0xffd9a8, 45, 16],     // the pelaminan's uplights
    [0, 2.5, GAZEBO.z, 0xffe6c0, 26, 10],        // the gazebo's chandelier
    [0, 4.4, 10, 0xffe2b4, 30, 18],
  ]) {
    const l = new THREE.PointLight(c, i, reach, 1.5);
    l.position.set(x, y, z);
    scene.add(l);
  }

  // ---------- the room ----------
  flat(W, D, new THREE.MeshLambertMaterial({ map: T.carpet }), 0, 0, 0);
  T.carpet.repeat.set(W / 1.4, D / 1.4);
  const ceiling = add(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: T.ceiling }), 0, H, 0);
  ceiling.rotation.x = Math.PI / 2;
  T.ceiling.repeat.set(3, 4);
  const wallTex = (bays) => { const t = T.wall.clone(); t.repeat.set(bays, 1); t.needsUpdate = true; return t; };
  for (const [len, x, z, ry] of [[W, 0, NORTH, 0], [W, 0, -NORTH, Math.PI], [D, WEST, 0, Math.PI / 2], [D, -WEST, 0, -Math.PI / 2]]) {
    add(new THREE.PlaneGeometry(len, H), new THREE.MeshBasicMaterial({ map: wallTex(Math.round(len / 3.25)) }), x, H / 2, z).rotation.y = ry;
  }
  // pillars along the east wall
  for (const z of PILLARS_Z) {
    cylB(0.85, 0.85, H, 6, M.cream, -WEST - 0.5, 0, z);
    cylB(0.93, 0.93, 0.5, 6, M.white, -WEST - 0.5, 0, z);
    for (const y of [0.5, H - 0.5]) cylB(0.9, 0.9, 0.07, 6, M.gold, -WEST - 0.5, y, z);
    cylB(0.95, 0.88, 0.4, 6, M.white, -WEST - 0.5, H - 0.4, z);
  }
  // dark wooden double doors on the west wall; the way in stands open, lit from the lobby
  DOORS_Z.forEach((z, i) => {
    const open = i === DOORS_Z.length - 1;
    const x = WEST + 0.03;
    boxB(0.08, 2.9, 2.4, M.gold, x, 0, z);
    if (open) {
      add(new THREE.PlaneGeometry(2.1, 2.7), new THREE.MeshBasicMaterial({ color: 0xffe9c2 }), x + 0.06, 1.35, z).rotation.y = Math.PI / 2;
      for (const s of [-1, 1]) boxB(1.02, 2.7, 0.06, M.wood, x + 0.55, 0, z + s * 1.1);
      glow(x + 0.4, 1.5, z, 3.2, 0xffe2b0, 0.35);
    } else {
      for (const s of [-1, 1]) {
        boxB(0.06, 2.7, 1.02, M.wood, x + 0.04, 0, z + s * 0.53);
        boxB(0.05, 0.5, 0.04, M.gold, x + 0.09, 1.0, z + s * 0.08);
      }
    }
  });

  // tray ceiling lights: a chandelier in each tray down the middle, a glass bowl in the others
  function chandelier(x, z) {
    const y = H - 1.15;
    cylB(0.03, 0.03, 1.15, 5, M.gold, x, y, z);
    add(new THREE.SphereGeometry(0.42, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.amber, x, y + 0.12, z);
    for (const [r, n, dy] of [[0.85, 9, 0.1], [0.5, 6, 0.42]]) {
      const ring = add(new THREE.TorusGeometry(r, 0.025, 4, 18), M.gold, x, y + dy, z);
      ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + dy;
        shades.push(x + Math.cos(a) * r, y + dy + 0.1, z + Math.sin(a) * r);
        for (let k = 0; k < 3; k++) crystals.push(x + Math.cos(a) * r, y + dy - 0.08 - k * 0.09, z + Math.sin(a) * r, 1.6);
      }
    }
    glow(x, y + 0.15, z, 4.2, 0xffdca0, 0.5);
  }
  function bowlLight(x, z) {
    const y = H - 0.75;
    cylB(0.02, 0.02, 0.75, 4, M.gold, x, y, z);
    add(new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.amber, x, y + 0.2, z).scale.y = 0.6;
    cylB(0.52, 0.52, 0.04, 12, M.gold, x, y + 0.18, z);
    glow(x, y, z, 3, 0xffd08a, 0.45);
  }
  for (let j = 0; j < 4; j++) {
    const z = NORTH + (j + 0.5) * (D / 4);
    if (j > 0) chandelier(0, z); // the pelaminan's own lighting takes the first tray
    for (const s of [-1, 1]) bowlLight(s * (W / 3), z);
  }

  // ---------- flowers ----------
  const blob = (x, y, z, sx, sy, sz, c) => flowers.push(x, y, z, sx, sy, sz, c);
  // what shows between an arrangement's blooms: a smooth shape in the average of its colours
  const blend = new Map();
  const core = (x, y, z, sx, sy, sz, pal) => {
    if (!blend.has(pal)) {
      const sum = new THREE.Color(0), c = new THREE.Color();
      for (const hex of pal) sum.add(c.setHex(hex));
      blend.set(pal, sum.multiplyScalar(0.82 / pal.length).getHex());
    }
    cores.push(x, y, z, sx, sy, sz, blend.get(pal));
  };
  const bloom = (x, y, z, r, c) => blob(x, y, z, r, r * (0.7 + rnd() * 0.3), r, c);
  const leaf = (x, y, z, r) => blob(x, y, z, r * 0.4, r * 1.3, r * 0.4, pick(PAL.leaf));
  const shadow = (x, z, r) => shadows.push(x, z, r);
  const v = new THREE.Vector3(), dir = new THREE.Vector3();
  const anyDir = (out, up) => {
    const u = up ? rnd() : rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    return out.set(s * Math.cos(th), u, s * Math.sin(th));
  };
  const petal = (x, y, z, size, pal, leafy = 0.1) => {
    if (rnd() < leafy) leaf(x, y, z, size * 1.2);
    else bloom(x, y, z, size * (0.7 + rnd() * 0.7), pick(pal));
  };
  // how many blooms of a given size it takes to cover a surface (`cover` 1.5 hides about 80% of it)
  const blooms = (area, size, cover) => Math.round((area * cover) / (Math.PI * (size * 1.05) ** 2));
  // a dome of blooms sitting on (x, y, z)
  function mound(x, y, z, rx, h, rz, pal, { size = 0.085, cover = 1.5 } = {}) {
    core(x, y + h * 0.05, z, rx * 0.86, h * 0.86, rz * 0.86, pal);
    const n = blooms((2 * Math.PI * (rx * rz + rx * h + rz * h)) / 3, size, cover);
    for (let i = 0; i < n; i++) {
      anyDir(dir, true);
      const k = 0.9 + rnd() * 0.18;
      petal(x + dir.x * rx * k, y + dir.y * h * k, z + dir.z * rz * k, size, pal);
    }
  }
  // a ball of blooms centred on (x, y, z)
  function ball(x, y, z, r, pal, { size = 0.08, cover = 1.5 } = {}) {
    core(x, y, z, r * 0.86, r * 0.86, r * 0.86, pal);
    const n = blooms(4 * Math.PI * r * r, size, cover);
    for (let i = 0; i < n; i++) {
      anyDir(dir);
      const k = 0.9 + rnd() * 0.18;
      petal(x + dir.x * r * k, y + dir.y * r * k, z + dir.z * r * k, size, pal);
    }
  }
  // blooms packed around a curve through `pts`; radius(t) is its thickness along the way
  function garland(pts, radius, pal, { size = 0.085, cover = 1.5 } = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    const len = curve.getLength();
    const steps = Math.ceil(len / 0.22);
    let area = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, r = radius(t);
      curve.getPointAt(t, v);
      core(v.x, v.y, v.z, r * 0.84, r * 0.84, r * 0.84, pal);
      area += 2 * Math.PI * r * (len / steps);
    }
    const n = blooms(area, size, cover);
    for (let i = 0; i < n; i++) {
      const t = rnd(), r = radius(t) * (0.9 + rnd() * 0.18);
      curve.getPointAt(t, v);
      anyDir(dir);
      petal(v.x + dir.x * r, v.y + dir.y * r, v.z + dir.z * r, size * (0.7 + 0.3 * Math.min(1, radius(t) / 0.3)), pal);
    }
  }
  // a sprig of small blooms reaching out of an arrangement
  function spray(x, y, z, dx, dy, dz, len, pal) {
    const n = Math.round(len / 0.085);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      bloom(x + dx * len * t, y + dy * len * t, z + dz * len * t, 0.065 - 0.035 * t, pick(pal));
    }
  }
  const taper = (a, b) => (t) => lerp(a, b, t);
  const FAR = { size: 0.105, cover: 1.4 }; // seen from a few metres away: bigger blooms, fewer of them

  // a flower ball on a slim gold stand
  function standingFlower(x, y, z, pal, h = 1.35) {
    cylB(0.24, 0.27, 0.04, 10, M.gold, x, y, z);
    cylB(0.022, 0.022, h, 5, M.gold, x, y + 0.04, z);
    ball(x, y + h + 0.3, z, 0.42, pal);
    for (let i = 0; i < 18; i++) bloom(x + (rnd() - 0.5) * 0.34, y + h - rnd() * 0.55, z + (rnd() - 0.5) * 0.34, 0.055, pick(pal));
    if (y < 0.1) shadow(x, z, 0.8);
  }
  // a small crystal chandelier hanging from (x, y, z)
  function crystalLamp(x, y, z, s = 1) {
    cylB(0.16 * s, 0.16 * s, 0.025, 10, M.gold, x, y, z);
    for (let ring = 0; ring < 3; ring++) {
      const r = (0.16 - ring * 0.055) * s, n = 12 - ring * 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring;
        for (let k = 0; k <= ring + 2; k++) crystals.push(x + Math.cos(a) * r, y - (0.04 + k * 0.06) * s, z + Math.sin(a) * r, s);
      }
    }
    glow(x, y - 0.15 * s, z, 1.5 * s, 0xffe9c4, 0.8);
  }

  // ---------- the aisle: white carpet strewn with rose petals ----------
  {
    const a = AISLE.w / 2, far = AISLE.turnZ + a, near = AISLE.turnZ - a;
    const s = new THREE.Shape();
    // drawn as (x, -z) and laid flat
    s.moveTo(-AISLE.fanW / 2, -STAGE_Z);
    s.lineTo(AISLE.fanW / 2, -STAGE_Z);
    s.lineTo(a, -AISLE.fanZ);
    s.lineTo(a, -far);
    s.lineTo(WEST, -far);
    s.lineTo(WEST, -near);
    s.lineTo(-a, -near);
    s.lineTo(-a, -AISLE.fanZ);
    s.closePath();
    const runner = add(new THREE.ShapeGeometry(s), new THREE.MeshLambertMaterial({
      map: T.petals, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), 0, 0.012, 0);
    runner.rotation.x = -Math.PI / 2;
    T.petals.repeat.set(1 / 1.7, 1 / 1.7);
  }
  for (const [x, z] of STANDING) standingFlower(x, 0, z, PAL.aisle);

  // gate sabit: a pair of crescents curving in over the aisle. Thick at the foot, slimming
  // to a tip that keeps rising (never drooping), with a crystal lamp hanging under it.
  function sabit(s, z) {
    garland(
      [[s * 1.95, 0.1, z], [s * 2.25, 0.95, z], [s * 2.15, 1.85, z], [s * 1.7, 2.65, z], [s * 1.05, 3.12, z], [s * 0.42, 3.32, z]],
      (t) => 0.5 - 0.35 * Math.pow(t, 0.85), PAL.aisle,
    );
    mound(s * 1.95, 0, z, 0.62, 0.45, 0.62, PAL.aisle);
    shadow(s * 1.95, z, 1.2);
    cylB(0.008, 0.008, 0.38, 4, M.gold, s * 0.9, 2.6, z);
    crystalLamp(s * 0.9, 2.6, z, 1);
  }
  for (const z of SABIT_Z) for (const s of [-1, 1]) sabit(s, z);

  // gazebo, 3 x 3 m: four posts and a flat top, all flowers, wisteria hanging under the beams
  {
    const { z: gz, s: size, h } = GAZEBO, a = size / 2;
    const corners = [[-a, gz - a], [a, gz - a], [a, gz + a], [-a, gz + a]];
    corners.forEach(([x, z], i) => {
      const [x2, z2] = corners[(i + 1) % 4];
      boxB(0.1, h, 0.1, M.gold, x, 0, z);
      garland([[x, 0.3, z], [x, h, z]], () => 0.26, PAL.gazebo);
      mound(x, 0, z, 0.62, 0.5, 0.62, PAL.aisle);
      ball(x, h + 0.12, z, 0.5, PAL.gazebo);
      shadow(x, z, 1.15);
      garland([[x, h + 0.12, z], [x2, h + 0.12, z2]], () => 0.38, PAL.gazebo);
      // more strands over the two openings the aisle runs through than along the sides
      const strands = x === x2 ? 9 : 18;
      for (let j = 0; j < strands; j++) {
        const t = (j + rnd()) / strands, len = 0.3 + rnd() * 0.6;
        const px = lerp(x, x2, t) + (rnd() - 0.5) * 0.3, pz = lerp(z, z2, t) + (rnd() - 0.5) * 0.3;
        for (let k = 0; k * 0.1 < len; k++) bloom(px, h - 0.3 - k * 0.1, pz, 0.05 + rnd() * 0.03, pick(PAL.wisteria));
      }
      for (let j = 0; j < 5; j++) sparkles.push(lerp(x, x2, rnd()), h - 0.35 - rnd() * 0.3, lerp(z, z2, rnd()));
    });
    cylB(0.01, 0.01, 0.5, 4, M.gold, 0, h - 0.4, gz);
    crystalLamp(0, h - 0.4, gz, 2);
    // calla-lily lamps either side of the way in
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const lx = s * (2.35 + i * 0.22), lz = gz + a + 0.5 - i * 0.3, lh = 1.3 + i * 0.45;
        const stem = cylB(0.014, 0.018, lh, 4, M.white, lx, 0, lz);
        stem.rotation.z = -s * 0.07;
        const head = add(new THREE.ConeGeometry(0.1, 0.24, 6, 1, true), M.shade, lx - s * lh * 0.07, lh + 0.08, lz);
        head.rotation.x = Math.PI;
        glow(lx - s * lh * 0.07, lh + 0.1, lz, 0.75, 0xfff0d0, 0.8);
      }
      mound(s * 2.5, 0, gz + a + 0.3, 0.45, 0.32, 0.4, PAL.aisle);
    }
  }

  // ---------- pelaminan ----------
  {
    // black curtain sprinkled with fairy lights, behind everything ("kain belakang", 8 m)
    const ch = H - 0.15;
    add(new THREE.PlaneGeometry(8.6, ch), new THREE.MeshBasicMaterial({ map: T.stars }), 0, ch / 2, NORTH + 0.3);
    // platform: white skirt, light grey carpet, a step up at each end of the front
    boxB(STAGE.w, STAGE.h, STAGE.d, M.white, 0, 0, NORTH + STAGE.d / 2);
    flat(STAGE.w, STAGE.d, M.stageTop, 0, STAGE.h + 0.006, NORTH + STAGE.d / 2);
    for (const s of [-1, 1]) {
      boxB(1.5, STAGE.h / 2, 0.7, M.white, s * 3.95, 0, STAGE_Z + 0.35);
      flat(1.5, 0.7, M.stageTop, s * 3.95, STAGE.h / 2 + 0.006, STAGE_Z + 0.35);
    }
    // backdrop, 7 m: ivory panels of different heights with wavy tops, the two on the left fluted
    const PZ = NORTH + 1.15, y0 = STAGE.h;
    const panel = (x0, x1, h, wave, z, mat) => {
      const s = new THREE.Shape();
      s.moveTo(x0, 0);
      s.lineTo(x1, 0);
      for (let i = 0; i <= 24; i++) { const t = 1 - i / 24; s.lineTo(lerp(x0, x1, t), h + wave(t)); }
      s.closePath();
      add(new THREE.ShapeGeometry(s), mat, 0, y0, z);
    };
    panel(-3.55, -2.65, 1.95, (t) => 0.22 * Math.sin(t * 1.5), PZ + 0.1, M.fluted);
    panel(-2.75, -1.25, 2.75, (t) => 0.3 * Math.sin(t * 1.6), PZ + 0.05, M.fluted);
    panel(-1.35, 1.55, 3.35, (t) => 0.17 * Math.sin(t * 6.6 + 0.5), PZ, M.panel);
    panel(1.4, 2.45, 2.6, (t) => 0.3 * Math.cos(t * 1.5), PZ + 0.07, M.panel);
    panel(2.3, 3.55, 2.05, (t) => 0.3 * Math.cos(t * 1.6) - 0.1, PZ + 0.12, M.panel);
    // our names on the centre panel (styrofoam lettering)
    add(new THREE.PlaneGeometry(2.5, 0.78), new THREE.MeshBasicMaterial({ map: T.names, transparent: true, depthWrite: false }), 0.1, y0 + 2.15, PZ + 0.03);

    // flowers, white to blush: tall cascades left and right of the centre panel, a spray
    // hanging at its right shoulder, low mounds between, and a bed along the front edge
    const FZ = PZ + 0.55;
    garland([[-3.3, y0 + 0.35, FZ + 0.2], [-2.9, y0 + 1.1, FZ], [-2.45, y0 + 1.9, FZ - 0.1], [-2.15, y0 + 2.7, FZ - 0.2]], taper(0.85, 0.26), PAL.stage, FAR);
    garland([[-4.25, y0 + 0.3, FZ + 0.25], [-4.15, y0 + 1.0, FZ + 0.1], [-4.0, y0 + 1.6, FZ]], taper(0.62, 0.26), PAL.stage, FAR);
    garland([[1.75, y0 + 3.2, PZ + 0.3], [1.6, y0 + 2.65, PZ + 0.36], [1.5, y0 + 2.1, PZ + 0.36]], taper(0.42, 0.18), PAL.stage, FAR);
    garland([[1.9, y0 + 0.35, FZ + 0.25], [2.6, y0 + 0.95, FZ + 0.1], [3.1, y0 + 1.6, FZ], [3.3, y0 + 2.3, FZ - 0.15]], taper(0.85, 0.28), PAL.stage, FAR);
    mound(4.1, y0, FZ + 0.2, 0.6, 1.0, 0.5, PAL.stage, FAR);
    mound(-1.75, y0, FZ + 0.35, 0.75, 0.7, 0.5, PAL.stage, FAR);
    mound(1.2, y0, FZ + 0.4, 0.7, 0.6, 0.45, PAL.stage, FAR);
    mound(-3.75, y0, FZ + 0.45, 0.6, 0.55, 0.45, PAL.stage, FAR);
    mound(3.2, y0, FZ + 0.5, 0.75, 0.6, 0.45, PAL.stage, FAR);
    for (const [x, y, z, dx, dy, len] of [
      [-2.15, 2.7, FZ - 0.2, 0.25, 1, 0.75], [-2.35, 2.5, FZ - 0.2, -0.45, 1, 0.6], [-2.0, 2.6, FZ - 0.2, 0.6, 0.8, 0.5],
      [-4.0, 1.6, FZ, -0.2, 1, 0.6], [-3.9, 1.5, FZ, 0.4, 1, 0.5],
      [1.75, 3.2, PZ + 0.3, -0.5, 0.9, 0.6], [1.8, 3.2, PZ + 0.3, 0.35, 1, 0.7], [1.5, 2.1, PZ + 0.36, -0.2, -1, 0.5],
      [3.3, 2.3, FZ - 0.15, 0.15, 1, 0.75], [3.35, 2.2, FZ - 0.15, 0.6, 0.8, 0.55], [3.2, 2.2, FZ - 0.15, -0.5, 0.9, 0.5],
    ]) spray(x, y0 + y, z, dx, dy, 0, len, PAL.stage);
    garland([[-3.05, y0 + 0.1, STAGE_Z - 0.32], [0, y0 + 0.14, STAGE_Z - 0.32], [3.05, y0 + 0.1, STAGE_Z - 0.32]], () => 0.3, PAL.stage, FAR);
    for (let i = 0; i < 26; i++) sparkles.push(lerp(-3.1, 3.1, rnd()), y0 + 0.3 + rnd() * 0.25, STAGE_Z - 0.3 + rnd() * 0.3);
    // uplights at the foot of the panels
    for (const x of [-3.15, -2.0, -0.7, 0.75, 1.95, 2.95]) glow(x, y0 + 0.6, PZ + 0.22, 1.3, 0xffcf96, 0.14, 2.2);

    // one set of sofas: the two of us in the middle, our parents either side
    const seat = (x, w) => {
      const g = new THREE.Group();
      boxB(w, 0.26, 0.7, M.ivory, 0, 0.2, 0, g);
      boxB(w, 0.7, 0.16, M.ivory, 0, 0.3, -0.3, g);
      const crest = add(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 10, 1, false, 0, Math.PI), M.ivory, 0, 1.0, -0.3, g);
      crest.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      crest.scale.set(0.5, 1, w);
      for (const s of [-1, 1]) {
        boxB(0.15, 0.45, 0.7, M.ivory, s * (w / 2 + 0.03), 0.2, 0, g);
        for (const dz of [-0.28, 0.28]) boxB(0.05, 0.2, 0.05, M.gold, s * (w / 2 - 0.02), 0, dz, g);
      }
      g.position.set(x, y0, PZ + 1.45);
      g.rotation.y = -x * 0.06; // the side chairs turn in a little
      scene.add(g);
    };
    seat(0, 1.7);
    for (const x of [-3.15, -2.25, 2.25, 3.15]) seat(x, 0.6);
    standingFlower(-4.45, y0, PZ + 1.2, PAL.stage, 1.15);
    standingFlower(4.45, y0, PZ + 1.2, PAL.stage, 1.15);

    // mini garden on the floor in front of the stage, between the steps
    for (const [x, rx, h] of [[-1.6, 0.75, 0.42], [-0.45, 0.8, 0.55], [0.75, 0.8, 0.48], [1.8, 0.65, 0.38]]) {
      mound(x, 0, STAGE_Z + 0.75, rx, h, 0.6, PAL.stage, FAR);
    }
    for (let i = 0; i < 40; i++) leaf(lerp(-2.4, 2.4, rnd()), 0.3 + rnd() * 0.3, STAGE_Z + 0.75 + (rnd() - 0.5) * 0.9, 0.13);
    for (let i = 0; i < 30; i++) sparkles.push(lerp(-2.5, 2.5, rnd()), 0.3 + rnd() * 0.5, STAGE_Z + 0.75 + (rnd() - 0.5));
    shadow(0, STAGE_Z + 0.75, 3.2);
    standingFlower(3.6, 0, STAGE_Z + 1.4, PAL.stage);
  }

  // ---------- tables and chairs ----------
  // banquet chair: maroon seat and back on a gold frame, facing +z
  const MAROON = 0x7a2b33, GOLD = 0xc9a24f;
  const part = (w, h, d, x, y, z, hex) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const c = new THREE.Color(hex), n = g.attributes.position.count, tint = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) tint.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    return g;
  };
  const chairGeo = mergeGeometries([
    part(0.44, 0.07, 0.44, 0, 0.46, 0, MAROON),
    part(0.4, 0.42, 0.05, 0, 0.84, -0.2, MAROON),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => part(0.035, sz < 0 ? 1.05 : 0.43, 0.035, sx * 0.2, sz < 0 ? 0.525 : 0.215, sz * 0.2, GOLD)),
  ]);
  const chair = (x, z, yaw) => chairs.push(x, z, yaw);
  // floor-length tablecloth: pleats and a scalloped overlay round the side, plain on top
  const CLOTH = [new THREE.MeshLambertMaterial({ map: T.cloth }), M.ivory, M.ivory];

  function roundTable(x, z, r, seats) {
    cylB(r, r * 1.07, 0.76, 24, CLOTH, x, 0, z);
    cylB(0.07, 0.1, 0.34, 6, M.gold, x, 0.76, z);
    ball(x, 1.24, z, 0.24, PAL.stage, { size: 0.06 });
    for (let i = 0; i < seats; i++) {
      const a = (i / seats) * Math.PI * 2 + x; // each table turned a little differently
      chair(x + Math.sin(a) * (r + 0.42), z + Math.cos(a) * (r + 0.42), a + Math.PI);
    }
    shadow(x, z, r * 1.9);
  }
  for (const [x, z] of VIP.tables) roundTable(x, z, 0.95, 8);
  for (const [x, z] of GUEST_TABLES) roundTable(x, z, 0.9, 6);
  for (const x of ROWS.xs) for (const z of ROWS.zs) chair(x, z, Math.PI); // facing the stage end

  // VIP area: gold posts with a velvet rope, open toward the aisle
  {
    const run = (from, to, fn) => {
      const n = Math.round(Math.abs(to - from) / 1.7);
      return Array.from({ length: n + 1 }, (_, i) => fn(lerp(from, to, i / n)));
    };
    const lines = [
      run(NORTH + 0.9, VIP.gap[0], (z) => [VIP.x, z]),
      [...run(VIP.gap[1], VIP.z, (z) => [VIP.x, z]), ...run(VIP.x - 1.6, WEST + 0.6, (x) => [x, VIP.z])],
    ];
    const ropeMat = lam(0xa4505f);
    for (const line of lines) {
      line.forEach(([x, z], i) => {
        posts.push(x, z);
        if (!i) return;
        const [px, pz] = line[i - 1];
        const rope = boxB(Math.hypot(x - px, z - pz), 0.035, 0.035, ropeMat, (x + px) / 2, 0.8, (z + pz) / 2);
        rope.rotation.y = Math.atan2(-(z - pz), x - px);
      });
    }
  }

  // drinks tables: round, with a scalloped skirt, a flower tier and rings of glasses
  for (const [x, z] of DRINKS) {
    const r = 1.15;
    cylB(r, r * 1.06, 0.8, 28, CLOTH, x, 0, z);
    cylB(r * 1.01, r * 1.01, 0.03, 28, M.gold, x, 0.765, z); // a gold rim just under the table top
    cylB(0.42, 0.42, 0.3, 14, M.white, x, 0.8, z);
    cylB(0.05, 0.08, 0.3, 6, M.gold, x, 1.1, z);
    ball(x, 1.62, z, 0.32, PAL.aisle, { size: 0.07 });
    for (const [rr, n] of [[0.62, 14], [0.9, 22]]) {
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rr; glasses.push(x + Math.cos(a) * rr, 0.8, z + Math.sin(a) * rr); }
    }
    for (const [dx, dz, c] of [[0.72, 0.72, 0xf0a04a], [-0.72, -0.72, 0xe78fa0]]) {
      cylB(0.12, 0.12, 0.1, 8, M.gold, x + dx, 0.8, z + dz);
      cylB(0.14, 0.14, 0.34, 8, lam(c, { emissive: 0x2a1408 }), x + dx, 0.9, z + dz);
      cylB(0.15, 0.15, 0.04, 8, M.gold, x + dx, 1.24, z + dz);
    }
    shadow(x, z, r * 1.8);
  }

  // food stalls along the west wall: a skirted counter under a little tent roof
  {
    const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4); // a 1 x 1 pyramid
    const domeGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.5, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
    for (const z of STALLS_Z) {
      const x = WEST + 1.5;
      boxB(0.8, 0.9, 2.5, M.ivory, x + 0.45, 0, z);
      boxB(0.86, 0.05, 2.56, M.white, x + 0.45, 0.9, z);
      boxB(0.02, 0.55, 0.9, M.rose, x + 0.865, 0.38, z);
      for (const [dx, dz] of [[-0.75, -1.3], [0.9, -1.3], [-0.75, 1.3], [0.9, 1.3]]) boxB(0.07, 2.5, 0.07, M.gold, x + dx, 0, z + dz);
      const roof = add(roofGeo, M.ivory, x + 0.08, 2.5 + 0.375, z);
      roof.scale.set(1.9, 0.75, 2.85);
      boxB(0.03, 0.26, 2.85, M.rose, x + 1.02, 2.26, z);
      for (const s of [-1, 1]) boxB(1.9, 0.26, 0.03, M.rose, x + 0.08, 2.26, z + s * 1.42);
      for (const dz of [-0.62, 0.62]) {
        boxB(0.36, 0.14, 0.52, M.silver, x + 0.45, 0.95, z + dz);
        const dome = add(domeGeo, M.silver, x + 0.45, 1.09, z + dz);
        dome.rotation.y = Math.PI / 2;
      }
      cylB(0.12, 0.12, 0.16, 10, M.white, x + 0.55, 0.95, z);
      ball(x + 1.02, 2.3, z, 0.24, PAL.aisle, { size: 0.065 });
      for (const s of [-1, 1]) ball(x + 1.0, 2.3, z + s * 1.36, 0.17, PAL.aisle, { size: 0.06 });
      glow(x + 0.4, 1.9, z, 2.4, 0xffd9a0, 0.4);
      shadow(x + 0.1, z, 2.3);
    }
  }

  // band corner: a low riser with its own backdrop, a keyboard, a drum kit, mics and speakers
  {
    const { x, z, w, d } = BAND, y0 = 0.3;
    boxB(w, y0, d, M.black, x, 0, z);
    const s = new THREE.Shape();
    s.moveTo(-2.1, 0);
    s.lineTo(2.1, 0);
    for (let i = 0; i <= 20; i++) { const t = 1 - i / 20; s.lineTo(lerp(-2.1, 2.1, t), 2.5 + 0.2 * Math.sin(t * 5.2 + 1)); }
    s.closePath();
    add(new THREE.ShapeGeometry(s), M.panel, x, y0, z - d / 2 + 0.2);
    garland([[x - 2.0, y0 + 0.2, z - d / 2 + 0.5], [x - 1.8, y0 + 1.0, z - d / 2 + 0.4], [x - 1.55, y0 + 1.6, z - d / 2 + 0.35]], taper(0.45, 0.18), PAL.stage);
    garland([[x + 1.9, y0 + 2.6, z - d / 2 + 0.3], [x + 1.75, y0 + 2.1, z - d / 2 + 0.35]], taper(0.3, 0.15), PAL.stage);
    mound(x + 1.8, y0, z - d / 2 + 0.5, 0.45, 0.5, 0.35, PAL.stage);
    // keyboard on an X stand
    for (const r of [-0.5, 0.5]) boxB(0.04, 1.05, 0.04, M.black, x - 1.3, y0, z + 0.2).rotation.z = r;
    boxB(1.25, 0.09, 0.36, M.black, x - 1.3, y0 + 0.92, z + 0.2);
    boxB(1.15, 0.01, 0.14, M.white, x - 1.3, y0 + 1.01, z + 0.28);
    // drum kit
    const drum = lam(0x8c2a36), skin = lam(0xf2efe6);
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12), drum, x + 1.2, y0 + 0.3, z - 0.3).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12), skin, x + 1.2, y0 + 0.3, z - 0.09).rotation.x = Math.PI / 2;
    cylB(0.18, 0.18, 0.14, 10, drum, x + 0.75, y0 + 0.62, z - 0.2);
    cylB(0.18, 0.18, 0.01, 10, skin, x + 0.75, y0 + 0.76, z - 0.2);
    cylB(0.22, 0.22, 0.34, 10, drum, x + 1.75, y0 + 0.3, z - 0.15);
    for (const [dx, dz, hy] of [[0.55, -0.55, 1.2], [1.85, -0.6, 1.3]]) {
      cylB(0.012, 0.012, hy, 4, M.silver, x + dx, y0, z + dz);
      cylB(0.24, 0.24, 0.012, 12, M.gold, x + dx, y0 + hy, z + dz).rotation.z = 0.15;
    }
    // mic stands at the front
    for (const dx of [-0.3, 0.5]) {
      cylB(0.14, 0.14, 0.02, 8, M.black, x + dx, y0, z + 0.95);
      cylB(0.012, 0.012, 1.4, 4, M.silver, x + dx, y0, z + 0.95);
      add(new THREE.SphereGeometry(0.04, 6, 4), M.black, x + dx, y0 + 1.44, z + 1.0);
    }
    // speakers on stands either side
    for (const dx of [-w / 2 - 0.9, w / 2 - 0.2]) {
      cylB(0.02, 0.02, 1.35, 4, M.black, x + dx, 0, z + d / 2 + 0.2);
      boxB(0.42, 0.66, 0.38, M.black, x + dx, 1.35, z + d / 2 + 0.2);
      for (let i = 0; i < 3; i++) boxB(0.02, 0.9, 0.02, M.black, x + dx, 0, z + d / 2 + 0.2).rotation.set(Math.sin(i * 2.1) * 0.35, 0, Math.cos(i * 2.1) * 0.35);
    }
    shadow(x, z, 4.2);
  }

  // ---------- build the instanced sets ----------
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), tone = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);
  // `each(i, mesh)` puts instance i's position in v (and, if it wants, a rotation in q and a scale in sc)
  function instanced(geo, mat, count, each) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    for (let i = 0; i < count; i++) {
      q.identity();
      sc.set(1, 1, 1);
      each(i, mesh);
      m4.compose(v, q, sc);
      mesh.setMatrixAt(i, m4);
    }
    mesh.frustumCulled = false; // spread all over the room, so never out of view as a whole
    scene.add(mesh);
    return mesh;
  }
  instanced(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), cores.length / 7, (i, mesh) => {
    const f = i * 7;
    v.set(cores[f], cores[f + 1], cores[f + 2]);
    sc.set(cores[f + 3], cores[f + 4], cores[f + 5]);
    mesh.setColorAt(i, tone.setHex(cores[f + 6]));
  });
  // a bloom: a 20-sided ball shaded as if round, with petals drawn on it
  const bloomGeo = new THREE.IcosahedronGeometry(1, 0);
  bloomGeo.setAttribute('normal', bloomGeo.attributes.position.clone());
  instanced(bloomGeo, new THREE.MeshLambertMaterial({ map: T.rose }), flowers.length / 7, (i, mesh) => {
    const f = i * 7;
    v.set(flowers[f], flowers[f + 1], flowers[f + 2]);
    sc.set(flowers[f + 3], flowers[f + 4], flowers[f + 5]);
    q.setFromEuler(e.set(rnd() * 0.9 - 0.45, rnd() * 6.3, rnd() * 0.9 - 0.45));
    mesh.setColorAt(i, tone.setHex(flowers[f + 6]));
  });
  instanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xfff6e2 }), crystals.length / 4, (i) => {
    const c = i * 4, s = crystals[c + 3];
    v.set(crystals[c], crystals[c + 1], crystals[c + 2]);
    sc.set(0.014 * s, 0.03 * s, 0.014 * s);
  });
  instanced(new THREE.ConeGeometry(0.1, 0.2, 6, 1, true).rotateX(Math.PI), M.shade, shades.length / 3, (i) => {
    v.set(shades[i * 3], shades[i * 3 + 1], shades[i * 3 + 2]);
  });
  instanced(chairGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), chairs.length / 3, (i) => {
    v.set(chairs[i * 3], 0, chairs[i * 3 + 1]);
    q.setFromAxisAngle(yAxis, chairs[i * 3 + 2]);
  });
  instanced(mergeGeometries([
    new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6).translate(0, 0.45, 0),
    new THREE.CylinderGeometry(0.15, 0.17, 0.04, 8).translate(0, 0.02, 0),
    new THREE.CylinderGeometry(0.05, 0.03, 0.08, 6).translate(0, 0.92, 0),
  ]), M.gold, posts.length / 2, (i) => { v.set(posts[i * 2], 0, posts[i * 2 + 1]); });
  instanced(new THREE.CylinderGeometry(0.035, 0.025, 0.12, 6).translate(0, 0.06, 0), lam(0xe6f1f2, { emissive: 0x20282a }), glasses.length / 3, (i) => {
    v.set(glasses[i * 3], glasses[i * 3 + 1], glasses[i * 3 + 2]);
  });
  instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: T.shadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }), shadows.length / 3, (i) => {
    v.set(shadows[i * 3], 0.02, shadows[i * 3 + 1]);
    sc.set(shadows[i * 3 + 2], 1, shadows[i * 3 + 2]);
  });
  const lights = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sparkles, 3)),
    new THREE.PointsMaterial({ map: T.glowDot, color: 0xffe2a8, size: 0.2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  lights.frustumCulled = false;
  scene.add(lights);

  // ---------- the other guests (guests3d.js; they arrive once their models have loaded) ----------
  // Seats: some chairs at every table, the VIP area and the rows. Standing: little groups by the
  // drinks and the food, and in the corners, clear of the paths the walk-to spots follow. Two stroll.
  const crowdRnd = rng(77);
  const crowd = [];
  const SIT_Y = 0.1; // the pack's sitting pose has the hips at 0.54 m; the seats here are a touch higher
  const seats = [];
  for (let i = 0; i < chairs.length; i += 3) seats.push([chairs[i], chairs[i + 1], chairs[i + 2]]);
  const vipSeats = VIP.tables.length * 8, tableSeats = GUEST_TABLES.length * 6;
  seats.forEach(([x, z, yaw], i) => {
    const fill = i < vipSeats ? 0.35 : i < vipSeats + tableSeats ? 0.55 : 0.25;
    // a little forward of the middle of the seat, so they sit clear of the chair back
    if (crowdRnd() < fill) crowd.push({ x: x + Math.sin(yaw) * 0.03, z: z + Math.cos(yaw) * 0.03, y: SIT_Y, yaw, pose: 'sit' });
  });
  // a little circle of people, all facing its middle
  const huddle = (cx, cz, n, r = 0.62, a0 = 0) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      crowd.push({ x, z, yaw: Math.atan2(cx - x, cz - z), pose: 'stand', anim: i % 2 ? 'Listen' : 'Talk' });
    }
  };
  huddle(-7.9, -0.6, 3, 0.62, 0.4);          // by the west drinks table
  huddle(8.3, 0.0, 2, 0.5, 1.2);             // by the east drinks table
  huddle(-4.6, 10.1, 2, 0.5, 0.9);           // near the way in
  huddle(6.3, -12.9, 3, 0.62, 0.3);          // by the band, looking on
  for (const z of [STALLS_Z[0], STALLS_Z[2]]) crowd.push({ x: WEST + 2.7, z, yaw: -Math.PI / 2, pose: 'stand', anim: 'Idle' }); // at the food
  crowd.push({ x: 3.7, z: -11.4, yaw: Math.PI, pose: 'stand', anim: 'Clap' }, { x: -3.7, z: -11.6, yaw: Math.PI, pose: 'stand', anim: 'Happy' }); // either side of the stage, out of the way of the view
  crowd.push({ x: -8.9, z: 1.4, to: [-8.9, 9.4], pose: 'walk' }, { x: 3.8, z: -1.6, to: [10.2, -1.6], pose: 'walk' });
  const guests = addGuests(scene, crowd, 11);
  guests.ready.then(() => { blockers = null; }); // rebuilt once they're in (they don't block, but their meshes are new)
  // the chairs a guest can sit on (F, or the button): every one nobody in the crowd is sitting on
  const sat = crowd.filter((c) => c.pose === 'sit');
  const freeSeats = [];
  for (const [x, z, yaw] of seats) {
    const sx = x + Math.sin(yaw) * 0.03, sz = z + Math.cos(yaw) * 0.03;
    if (!sat.some((c) => Math.hypot(c.x - sx, c.z - sz) < 0.2)) freeSeats.push({ x: sx, z: sz, y: SIT_Y, yaw, lounge: false });
  }
  // and the two of us, standing on the pelaminan in front of our sofa to greet everyone (couple3d.js)
  const couple = addCouple(scene, { x: 0, y: STAGE.h, z: NORTH + 3.15, gap: 0.42 });
  couple.ready.then(() => { blockers = null; });
  // On the wedding day itself the room follows the day instead, moment by moment by the clock in
  // Jakarta (live3d.js): the guests above and the two of us are put away, and the rundown's people
  // take their places, the crowd walking in at 16.00 to the same seats and huddles.
  // reliving the day afterwards starts from the pelaminan spot, where the akad table is in view
  const live = addLive(scene, crowd, { watch: () => go('stage') });

  // ---------- what can be clicked: a box around each spot's subject ----------
  const proxies = [];
  const proxy = (spot, x, y, z, w, h, d) => {
    const m = add(new THREE.BoxGeometry(w, h, d), M.black, x, y, z);
    m.visible = false; // still hit by the raycaster
    m.userData.spot = spot;
    proxies.push(m);
  };
  proxy('stage', 0, 2.4, NORTH + STAGE.d / 2, STAGE.w, 4.8, STAGE.d);
  proxy('gazebo', 0, 1.7, GAZEBO.z, 3.8, 3.5, 3.8);
  proxy('sabit', 0, 1.7, -4.65, 4.9, 3.5, 3.2);
  proxy('vip', -9.5, 0.9, -10.2, 6, 1.8, 12);
  proxy('band', BAND.x, 1.5, BAND.z, BAND.w + 0.4, 3, BAND.d + 0.4);
  proxy('food', WEST + 1.5, 1.5, 5.5, 2.6, 3, 9.4);
  proxy('drinksW', DRINKS[0][0], 1, DRINKS[0][1], 2.6, 2, 2.6);
  proxy('drinksE', DRINKS[1][0], 1, DRINKS[1][1], 2.6, 2, 2.6);
  proxy('tables', 8, 0.7, 8, 8, 1.4, 9.5);
  proxy('door', WEST + 0.2, 1.4, AISLE.turnZ, 0.5, 2.8, 2.4);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // ---------- walking ----------
  let nodes = nodesFor(0), narrow = null;
  const nav = {
    spot: 'door',                 // where the guest is, or is walking to
    pos: new THREE.Vector3(), yaw: 0, pitch: 0,
    walk: null,
    lookYaw: 0, lookPitch: 0,     // the guest's own look-around (drag), on top of where the walk faces them
    camYaw: 0, camPitch: 0, snap: true,
  };
  // Walking under their own steam, alongside the path graph: the graph still runs the
  // walk when a label or a floor-plan dot is tapped, and the guest's own first step
  // cancels it and takes over from wherever they had got to.
  const roam = { vx: 0, vz: 0 };
  const BOUNDS = { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 };
  let blockers = null;

  const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  const turn = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t; // the short way round
  const nodeAt = (id, out = new THREE.Vector3()) => out.set(nodes[id][0], EYE, nodes[id][1]);
  const span = (a, b) => Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
  // yaw 0 looks north (-z); positive turns left
  function facing(id, from) {
    const [x, y, z] = SPOTS[id].look;
    return { yaw: Math.atan2(from.x - x, from.z - z), pitch: Math.atan2(y - from.y, Math.hypot(x - from.x, z - from.z)) };
  }
  // shortest way through the path graph
  function route(from, to) {
    const dist = {}, prev = {}, todo = new Set(Object.keys(nodes));
    for (const id of todo) dist[id] = Infinity;
    dist[from] = 0;
    while (todo.size) {
      let u = null;
      for (const id of todo) if (u === null || dist[id] < dist[u]) u = id;
      todo.delete(u);
      if (u === to) break;
      for (const [a, b] of EDGES) {
        const n = a === u ? b : b === u ? a : null;
        if (!n || !todo.has(n)) continue;
        const d = dist[u] + span(u, n);
        if (d < dist[n]) { dist[n] = d; prev[n] = u; }
      }
    }
    const path = [to];
    while (path[0] !== from) path.unshift(prev[path[0]]);
    return path;
  }
  function stepRoam(dt, controls) {
    const look = controls.takeLook();
    if (look.yaw || look.pitch) {
      nav.lookYaw += look.yaw;
      nav.lookPitch = controls.clampPitch(nav.lookPitch + look.pitch);
    }
    const { x, y, speed } = controls.axes();
    const moving = x || y;
    if (moving && nav.walk) {
      // taking over mid-walk: stop where we are, keeping the view we have
      nav.walk = null;
      nav.yaw = nav.camYaw - nav.lookYaw;
      nav.pitch = nav.camPitch - nav.lookPitch;
    }
    const k = 1 - Math.exp(-dt * 9);
    const yaw = nav.yaw + nav.lookYaw;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const wantX = moving ? (x * cos - y * sin) * speed : 0;
    const wantZ = moving ? (-x * sin - y * cos) * speed : 0;
    roam.vx += (wantX - roam.vx) * k;
    roam.vz += (wantZ - roam.vz) * k;
    if (nav.walk || (Math.abs(roam.vx) < 1e-4 && Math.abs(roam.vz) < 1e-4)) return;
    if (!blockers) blockers = buildBlockers(scene, { w: W, d: D });
    slide(nav.pos, roam.vx * dt, roam.vz * dt, blockers, BOUNDS);
    nav.pos.y = EYE;
    nav.spot = null; // wandering: no longer standing at a named spot
  }

  function go(id, stroll) {
    if (!nodes[id] || !SPOTS[id]) return;
    if (!nav.walk && nav.spot === id) { nav.lookYaw = nav.lookPitch = 0; return; } // already here: face it again
    roam.vx = roam.vz = 0; // the graph is driving again
    let from = nav.spot;
    if (nav.walk || !from || !nodes[from]) {
      // changing course mid-walk: carry on from the nearest point of the graph
      from = Object.keys(nodes).reduce((best, n) => (nodeAt(n, v).distanceTo(nav.pos) < nodeAt(best, dir).distanceTo(nav.pos) ? n : best));
    }
    const ids = route(from, id);
    const pts = [nav.pos.clone()];
    ids.forEach((n, i) => {
      const p = nodeAt(n);
      // don't double back to a node already passed
      if (i === 0 && ids.length > 1 && nav.pos.distanceTo(nodeAt(ids[1], v)) < p.distanceTo(v)) return;
      if (p.distanceTo(pts[pts.length - 1]) > 0.3) pts.push(p);
    });
    nav.spot = id;
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    nav.walk = {
      curve, len, k: 0,
      dur: Math.min(9, (stroll ? 1.8 : 1.2) + len / (stroll ? 2.3 : 3.1)),
      yaw0: nav.yaw + nav.lookYaw, pitch0: nav.pitch + nav.lookPitch,
      end: facing(id, pts[pts.length - 1]),
    };
    nav.yaw = nav.walk.yaw0;
    nav.pitch = nav.walk.pitch0;
    nav.lookYaw = nav.lookPitch = 0;
  }
  const tangent = new THREE.Vector3();
  function stepWalk(dt) {
    const w = nav.walk;
    w.k = Math.min(1, w.k + dt / w.dur);
    const k = w.k, at = ease(k);
    w.curve.getPointAt(at, nav.pos);
    // footsteps
    nav.pos.y = EYE + Math.abs(Math.sin((at * w.len * Math.PI) / 0.8)) * 0.03 * Math.sin(Math.PI * k);
    // look where we're walking, then turn to what we came to see (a short hop just turns)
    let yaw = w.yaw0, pitch = w.pitch0;
    if (w.len > 2.5) {
      w.curve.getTangentAt(at, tangent);
      yaw = turn(yaw, Math.atan2(-tangent.x, -tangent.z), smooth(0, 0.3, k));
      pitch = lerp(pitch, 0, smooth(0, 0.3, k));
    }
    const settle = smooth(w.len > 2.5 ? 0.6 : 0, 1, k);
    nav.yaw = turn(yaw, w.end.yaw, settle);
    nav.pitch = lerp(pitch, w.end.pitch, settle);
    if (k >= 1) nav.walk = null;
  }
  function fit(camera) {
    const fov = camera.aspect < 1 ? 64 : 55;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const now = camera.aspect >= 1 ? 0 : camera.aspect >= 0.7 ? 1 : 2;
    if (now === narrow) return;
    narrow = now;
    nodes = nodesFor(narrow);
    if (!nav.walk) { nodeAt(nav.spot, nav.pos); Object.assign(nav, facing(nav.spot, nav.pos)); }
  }

  return {
    scene,
    // step in through the door on the west wall and stroll to the foot of the aisle
    enter(camera) {
      camera.near = 0.3;
      camera.far = 90;
      camera.updateProjectionMatrix();
      narrow = null;
      nav.walk = null;
      nav.spot = 'door';
      fit(camera);
      nav.yaw = nav.camYaw = -Math.PI / 2; // facing east, into the room
      nav.pitch = nav.camPitch = nav.lookYaw = nav.lookPitch = 0;
      nav.snap = true;
      go('south', true);
    },
    update(camera, t, dt, pointer, controls) {
      fit(camera);
      if (controls) stepRoam(dt, controls);
      if (nav.walk) stepWalk(dt);
      const still = nav.walk ? 0.4 : 1; // sway less while walking
      const yaw = nav.yaw + nav.lookYaw - pointer.sx * SWAY.yaw * still + Math.sin(t * 0.15) * 0.02;
      const pitch = THREE.MathUtils.clamp(nav.pitch + nav.lookPitch - pointer.sy * SWAY.pitch * still, -0.7, 0.7);
      const a = nav.snap ? 1 : 1 - Math.exp(-dt / 0.14);
      nav.snap = false;
      camera.position.lerp(nav.pos, a);
      nav.camYaw = turn(nav.camYaw, yaw, a);
      nav.camPitch += (pitch - nav.camPitch) * a;
      camera.rotation.set(nav.camPitch, nav.camYaw, 0, 'YXZ');
      lights.material.opacity = 0.75 + Math.sin(t * 2.3) * 0.25;
      const today = live.update(dt, camera);
      guests.group.visible = couple.group.visible = !today;
      if (!today) {
        guests.update(dt, camera);
        couple.update(dt);
      }
    },
    go,
    spot() { return nav.spot; },
    // the room's walls, floor to ceiling (for the third-person camera to stay inside)
    bounds: { ...BOUNDS, h: H },
    seats: freeSeats,
    arrived() { return !nav.walk; },
    // look around: dx, dy as fractions of the screen dragged across
    drag(camera, dx, dy) {
      const fov = THREE.MathUtils.degToRad(camera.fov);
      nav.lookYaw += dx * fov * camera.aspect * 1.1;
      nav.lookPitch = THREE.MathUtils.clamp(nav.lookPitch + dy * fov, -0.55, 0.55);
    },
    // the cursor moved (by dx, dy of the sway's -1..1 range) while a drag held the sway still:
    // keep the view where the drag left it
    settle(dx, dy) {
      nav.lookYaw += dx * SWAY.yaw;
      nav.lookPitch += dy * SWAY.pitch;
    },
    anchor(id, out) { return out.set(...SPOTS[id].tag); },
    // screen-space pick -> spot id (or null)
    pick(camera, x, y) {
      ndc.set(x, y);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(proxies, false)[0];
      return hit ? hit.object.userData.spot : null;
    },
    // for the little floor plan: where the guest is and which way they face
    where() { return { x: nav.pos.x, z: nav.pos.z, yaw: nav.camYaw }; },
    node(id) { return nodes[id]; },
  };
}

// The floor plan as SVG markup (viewBox in metres), for the little map in the corner.
export function planSvg() {
  const a = AISLE.w / 2, f = AISLE.fanW / 2;
  const c = (x, z, r, cls) => `<circle cx="${x}" cy="${z}" r="${r}" class="${cls}"/>`;
  const r = (x, z, w, d, cls) => `<rect x="${x - w / 2}" y="${z - d / 2}" width="${w}" height="${d}" class="${cls}"/>`;
  const aisle = [[-f, STAGE_Z], [f, STAGE_Z], [a, AISLE.fanZ], [a, AISLE.turnZ + a], [WEST, AISLE.turnZ + a], [WEST, AISLE.turnZ - a], [-a, AISLE.turnZ - a], [-a, AISLE.fanZ]];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WEST} ${NORTH} ${W} ${D}">`,
    r(0, 0, W, D, 'plan-room'),
    `<polygon points="${aisle.map((p) => p.join(',')).join(' ')}" class="plan-aisle"/>`,
    r(0, NORTH + STAGE.d / 2, STAGE.w, STAGE.d, 'plan-stage'),
    r(BAND.x, BAND.z, BAND.w, BAND.d, 'plan-item'),
    r(0, GAZEBO.z, GAZEBO.s, GAZEBO.s, 'plan-flower'),
    ...SABIT_Z.flatMap((z) => [-1, 1].map((s) => c(s * 1.9, z, 0.55, 'plan-flower'))),
    ...STANDING.map(([x, z]) => c(x, z, 0.4, 'plan-flower')),
    ...VIP.tables.map(([x, z]) => c(x, z, 1.1, 'plan-item')),
    ...GUEST_TABLES.map(([x, z]) => c(x, z, 1.05, 'plan-item')),
    ...DRINKS.map(([x, z]) => c(x, z, 1.2, 'plan-item')),
    ...STALLS_Z.map((z) => r(WEST + 1.5, z, 1.9, 2.7, 'plan-item')),
    r((ROWS.xs[0] + ROWS.xs[3]) / 2, (ROWS.zs[0] + ROWS.zs[5]) / 2, 3.8, 5.8, 'plan-item plan-soft'),
    `<path d="M${VIP.x} ${NORTH} V${VIP.z} H${WEST}" class="plan-rope"/>`,
    '</svg>',
  ].join('');
}

// ================= textures =================

function makeTextures() {
  const T = {};

  // navy carpet with a gold ogee trellis and a small flower in every cell
  T.carpet = canvasTex(256, 256, (g, w, h) => {
    const r = rng(7);
    g.fillStyle = '#1c2343'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)';
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    // wavy verticals swinging half a tile left and right; each pair crosses into a chain of ogees
    const wave = (x0, x1) => {
      g.beginPath();
      g.moveTo(x0, -h);
      for (let y = -h; y < h * 2; y += h) {
        g.bezierCurveTo(x0, y + h * 0.27, x1, y + h * 0.23, x1, y + h / 2);
        g.bezierCurveTo(x1, y + h * 0.77, x0, y + h * 0.73, x0, y + h);
      }
      g.stroke();
    };
    g.lineCap = 'round';
    for (const [style, width] of [['#5f4a1f', 13], ['#b08b3e', 8], ['#d8b867', 2.5]]) {
      g.strokeStyle = style; g.lineWidth = width;
      for (const x of [-w / 2, 0, w / 2, w]) { wave(x, x + w / 2); wave(x + w / 2, x); }
    }
    // a four-petal flower at the heart of each ogee
    g.fillStyle = '#c29a48';
    for (const [x, y] of [[w / 4, 0], [w / 4, h], [(3 * w) / 4, 0], [(3 * w) / 4, h], [w / 4, h / 2], [(3 * w) / 4, h / 2]]) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        g.beginPath(); g.ellipse(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 8, 5, a, 0, Math.PI * 2); g.fill();
      }
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
  }, true);

  // one bay of wall: gilt-framed cream panel over white wainscot, crown moulding on top
  T.wall = canvasTex(512, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#f7e8c0'); grd.addColorStop(0.75, '#efdcae'); grd.addColorStop(1, '#e6d2a3');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const gold = '#b48d3d', line = (y, t) => { g.fillStyle = gold; g.fillRect(0, y, w, t); };
    g.fillStyle = '#fbf2d8'; g.fillRect(0, 0, w, h * 0.065);
    line(h * 0.065, 5); line(h * 0.09, 2); line(h * 0.018, 2);
    // the framed panel
    g.fillStyle = '#f8ebc8'; g.fillRect(w * 0.13, h * 0.16, w * 0.74, h * 0.58);
    g.strokeStyle = gold; g.lineWidth = 9; g.strokeRect(w * 0.13, h * 0.16, w * 0.74, h * 0.58);
    g.strokeStyle = '#d9bd72'; g.lineWidth = 3; g.strokeRect(w * 0.13 + 3, h * 0.16 + 3, w * 0.74 - 6, h * 0.58 - 6);
    g.strokeStyle = gold; g.lineWidth = 2; g.strokeRect(w * 0.17, h * 0.19, w * 0.66, h * 0.52);
    // wainscot
    g.fillStyle = '#f6eed9'; g.fillRect(0, h * 0.8, w, h * 0.2);
    line(h * 0.8, 5);
    g.strokeStyle = '#d6c69c'; g.lineWidth = 3; g.strokeRect(w * 0.06, h * 0.845, w * 0.88, h * 0.105);
    g.fillStyle = '#d3c39d'; g.fillRect(0, h * 0.975, w, h * 0.025);
  }, true);

  // one ceiling tray: a lit recess edged with gilt moulding, downlights at its corners
  T.ceiling = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#efdfb6'; g.fillRect(0, 0, w, h);
    const inset = (m, fill, stroke, width) => {
      if (fill) { g.fillStyle = fill; g.fillRect(m * w, m * h, w - 2 * m * w, h - 2 * m * h); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.strokeRect(m * w, m * h, w - 2 * m * w, h - 2 * m * h); }
    };
    inset(0.1, '#f6e8c2', '#b48d3d', 6);
    g.setLineDash([5, 5]); inset(0.118, null, '#c9a75a', 5); g.setLineDash([]); // carved moulding
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.42);
    grd.addColorStop(0, '#fff8de'); grd.addColorStop(1, '#f7e9c3');
    inset(0.2, grd, '#b48d3d', 4);
    inset(0.215, null, '#d9bd72', 2);
    inset(0.3, null, 'rgba(180,141,61,0.55)', 2);
    for (const [x, y] of [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95], [0.5, 0.05], [0.5, 0.95], [0.05, 0.5], [0.95, 0.5]]) {
      const d = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, 12);
      d.addColorStop(0, '#ffffff'); d.addColorStop(0.5, '#fff4d0'); d.addColorStop(1, 'rgba(255,244,208,0)');
      g.fillStyle = d; g.fillRect(x * w - 12, y * h - 12, 24, 24);
    }
  }, true);

  // white aisle carpet strewn with rose petals
  T.petals = canvasTex(256, 256, (g, w, h) => {
    const r = rng(21);
    g.fillStyle = '#f7f2ea'; g.fillRect(0, 0, w, h);
    const tones = ['#ffffff', '#fbe9e6', '#f5d3d6', '#efc0c8', '#fdf6ec'];
    for (let i = 0; i < 520; i++) {
      g.fillStyle = tones[Math.floor(r() * tones.length)];
      g.globalAlpha = 0.75 + r() * 0.25;
      const x = r() * w, y = r() * h, rx = 4 + r() * 4, ry = 2.5 + r() * 2, rot = r() * Math.PI;
      // drawn again a tile over wherever it crosses an edge, so the pattern repeats without a seam
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
  }, true);

  // black backdrop curtain with fairy lights
  T.stars = canvasTex(1024, 512, (g, w, h) => {
    const r = rng(31);
    g.fillStyle = '#0a0a0d'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 22) { // soft folds
      const grd = g.createLinearGradient(x, 0, x + 22, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.035)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(x, 0, 22, h);
    }
    for (let i = 0; i < 300; i++) {
      const x = r() * w, y = r() * h, s = 2 + r() * 4;
      const grd = g.createRadialGradient(x, y, 0, x, y, s);
      grd.addColorStop(0, 'rgba(255,240,205,1)'); grd.addColorStop(0.4, 'rgba(255,214,150,0.5)'); grd.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = grd; g.fillRect(x - s, y - s, s * 2, s * 2);
    }
  });

  // fluting on the two left backdrop panels (one flute per repeat)
  T.flutes = canvasTex(32, 4, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#e2d6c0'); grd.addColorStop(0.5, '#fbf5e8'); grd.addColorStop(1, '#dccfb8');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, true);
  T.flutes.repeat.set(1 / 0.15, 1);

  // our names, as raised lettering
  const drawNames = (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '200px "Great Vibes", "Brush Script MT", cursive';
    g.fillStyle = 'rgba(96,66,24,0.4)'; g.fillText('Adam & Elsa', w / 2 + 5, h / 2 + 9);
    const grd = g.createLinearGradient(0, h * 0.2, 0, h * 0.85);
    grd.addColorStop(0, '#e2c27a'); grd.addColorStop(1, '#b68b3a');
    g.fillStyle = grd; g.fillText('Adam & Elsa', w / 2, h / 2);
  };
  T.names = canvasTex(1024, 320, drawNames);
  if (document.fonts) {
    document.fonts.load('200px "Great Vibes"').then(() => {
      drawNames(T.names.image.getContext('2d'), 1024, 320);
      T.names.needsUpdate = true;
    }, () => {});
  }

  // tablecloth, wrapped round a table: soft pleats, and a scalloped overlay hanging from the top edge
  T.cloth = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#f3eadb'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const grd = g.createLinearGradient(x, 0, x + 16, 0);
      grd.addColorStop(0, 'rgba(150,125,95,0.22)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.3)'); grd.addColorStop(1, 'rgba(150,125,95,0.22)');
      g.fillStyle = grd; g.fillRect(x, 0, 16, h);
    }
    for (let x = 32; x < w; x += 64) {
      g.fillStyle = 'rgba(120,95,65,0.28)'; g.beginPath(); g.ellipse(x, 2, 34, 46, 0, 0, Math.PI); g.fill();
      g.fillStyle = '#fbf7ee'; g.beginPath(); g.ellipse(x, 0, 32, 42, 0, 0, Math.PI); g.fill();
      g.strokeStyle = '#c9a24f'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, 0, 32, 42, 0, 0, Math.PI); g.stroke();
    }
  }, true);

  T.cloth.repeat.set(2, 1);

  // petals for the blooms (tinted by each bloom's own colour): rose heads all round the ball
  T.rose = canvasTex(256, 128, (g, w, h) => {
    const r = rng(41);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const cx = (k + 0.5) * (w / 4), cy = h * (0.42 + 0.16 * (k % 2));
      const heart = g.createRadialGradient(cx, cy, 0, cx, cy, 34);
      heart.addColorStop(0, 'rgba(110,50,60,0.4)'); heart.addColorStop(1, 'rgba(110,50,60,0)');
      g.fillStyle = heart; g.fillRect(cx - 34, cy - 34, 68, 68);
      for (let ring = 0; ring < 5; ring++) {
        const rad = 5 + ring * 7.5;
        for (let p = 0; p < 2 + ring; p++) {
          const a = r() * Math.PI * 2;
          g.strokeStyle = `rgba(120,60,70,${0.5 - ring * 0.06})`; g.lineWidth = 2.2;
          g.beginPath(); g.arc(cx, cy, rad, a, a + Math.PI * (0.55 + r() * 0.5)); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.6;
          g.beginPath(); g.arc(cx, cy, rad + 2.5, a + 0.2, a + Math.PI * 0.5); g.stroke();
        }
      }
    }
  }, true);

  T.glowDot = canvasTex(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  T.shadow = canvasTex(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(6,8,20,0.55)');
    grd.addColorStop(0.55, 'rgba(6,8,20,0.3)');
    grd.addColorStop(1, 'rgba(6,8,20,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  return T;
}

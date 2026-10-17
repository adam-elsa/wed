# Peci for the men, added to the modular male file in place (re-runnable: it replaces what it added before):
#   python peci_textures.py tex
#   blender -b -P add_peci.py -- <repo>/assets/chars/blenderfilesmodular/male.blend tex
#
# A "Hat" collection, worn over the hair (the creator's Peci step; none is the default):
#   Peci_bordir   black songkok with a gold embroidered band and a gold star on the crown
#   Peci_polos    plain black songkok
#   Rajut_*       knitted skullcap (peci rajut) in white, black, blue, brown
# Both shapes are fitted round the skull and the hair, sitting above the ears. Hair that would still
# poke through (the quiffs) gets a shape key, Tuck_peci or Tuck_rajut, that tucks it under the cap;
# the creator turns the key on while that cap is worn.
import bpy, sys, os, math, numpy as np
from mathutils import Vector

blend, tex = sys.argv[sys.argv.index('--') + 1:][:2]
tex = os.path.abspath(tex)
bpy.ops.wm.open_mainfile(filepath=blend)
rig = bpy.data.objects["Guest_Rig"]
hairs = [o for o in bpy.data.collections["Hair"].objects if o.type == 'MESH']

# ---------- start clean: what an earlier run added goes
hat = bpy.data.collections.get("Hat")
if not hat:
    hat = bpy.data.collections.new("Hat"); bpy.context.scene.collection.children.link(hat)
for o in list(hat.objects):
    me = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(me)
for o in hairs:
    ks = o.data.shape_keys
    if ks:
        for k in [k for k in ks.key_blocks if k.name.startswith("Tuck_")]: o.shape_key_remove(k)
        if len(o.data.shape_keys.key_blocks) == 1: o.shape_key_remove(o.data.shape_keys.key_blocks[0])

# ---------- the head: skull (the head of the body) and the hair, in the rest pose
def pts(o, cond=None):
    names = [g.name for g in o.vertex_groups]; out = []
    for v in o.data.vertices:
        w = {names[g.group]: g.weight for g in v.groups}
        if cond is None or cond(w): out.append(o.matrix_world @ v.co)
    return np.array([tuple(p) for p in out])
body = next(o for o in bpy.data.collections["Skin"].objects if o.type == 'MESH')
skull = pts(body, lambda w: w.get("Head", 0) > 0.5)
quiff = lambda o: "quiff" in o.name
fit = np.vstack([skull] + [pts(o) for o in hairs if not quiff(o)])   # what the caps are sized round
up = fit[fit[:, 2] > 1.62]
CY = (up[:, 1].min() + up[:, 1].max()) / 2
C = Vector((0, CY, 1.60))  # inside the head: hair is tucked toward here
def polar(p): return math.atan2(p[1] - CY, p[0]), math.hypot(p[0], p[1] - CY)
def brim_at(th, front, back):  # front of the face is -y: higher on the forehead, lower at the back
    return (front + back) / 2 + (front - back) / 2 * -math.sin(th)

# ---------- materials, from the textures (made like the batik ones: a copy with its image swapped)
BASE = next(m for m in bpy.data.materials if m.name.startswith("Pat_"))
def mat(name, png):
    m = bpy.data.materials.get(name)
    if not m:
        m = BASE.copy(); m.name = name
    img = bpy.data.images.get(png) or bpy.data.images.load(os.path.join(tex, png))
    img.name = png; img.pack()
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = img
    return m

def make(name, verts, faces, uvs, fmats, mats, label, order):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    for p in me.polygons: p.use_smooth = True
    for m in mats: me.materials.append(m)
    uvl = me.uv_layers.new(name="UVMap").data
    for p, fm in zip(me.polygons, fmats):
        p.material_index = fm
        for li in p.loop_indices: uvl[li].uv = uvs[p.index][list(p.loop_indices).index(li)]
    o = bpy.data.objects.new(name, me); hat.objects.link(o)
    o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()
    o.vertex_groups.new(name="Head").add(list(range(len(verts))), 1.0, 'REPLACE')
    md = o.modifiers.new("Armature", 'ARMATURE'); md.object = rig
    o["label"] = label; o["order"] = order
    o.hide_set(True); o.hide_render = True  # no peci unless chosen
    return o

SEGS = 40
# ---------- songkok: an upright oval wall, a softened top edge, a flat crown
SK_F, SK_B = 1.656, 1.636
above = fit[fit[:, 2] > SK_B - 0.005]
ax = np.abs(above[:, 0]).max() + 0.011
bf = (CY - above[:, 1].min()) + 0.011; bb = (above[:, 1].max() - CY) + 0.011
SK_T = fit[:, 2].max() + 0.016
def sk_r(th):
    b = bf if math.sin(th) < 0 else bb
    return 1 / math.sqrt((math.cos(th) / ax) ** 2 + (math.sin(th) / b) ** 2)
def songkok(name, plain, label, order):
    V, F, U, M = [], [], [], []
    ring_h = lambda th: [brim_at(th, SK_F, SK_B), None, SK_T - 0.010, SK_T]
    cols = []
    for s in range(SEGS + 1):  # side: one extra column for the texture's seam
        th = 2 * math.pi * s / SEGS - math.pi / 2; r = sk_r(th); zb = brim_at(th, SK_F, SK_B)
        col = []
        for z, rr in ((zb, r), ((zb + SK_T) / 2, r), (SK_T - 0.010, r), (SK_T, r - 0.008)):
            col.append(len(V)); V.append((math.cos(th) * rr, CY + math.sin(th) * rr, z))
        cols.append((col, zb))
    for s in range(SEGS):
        (a, za), (b, zb2) = cols[s], cols[s + 1]
        for k in range(3):
            F.append((a[k], b[k], b[k + 1], a[k + 1])); M.append(0)
            uv = []
            for (c, zz), kk in (((a, za), k), ((b, zb2), k), ((b, zb2), k + 1), ((a, za), k + 1)):
                z = V[c[kk]][2]; ss = s if c is a else s + 1
                uv.append((ss / SEGS * (6 if plain else 3), (z - zz) / (SK_T - zz) if not plain else (z - 1.6) * 8))
            U.append(uv)
    # crown: a fan from the middle
    mid = len(V); V.append((0, CY, SK_T)); rr = max(ax, bf, bb)
    top = [cols[s][0][3] for s in range(SEGS)]
    for s in range(SEGS):
        a, b = top[s], top[(s + 1) % SEGS]
        F.append((mid, b, a)); M.append(0 if plain else 1)
        U.append([((V[i][0]) / (2 * rr) * 0.92 + 0.5, (V[i][1] - CY) / (2 * rr) * 0.92 + 0.5) if not plain else (V[i][0] * 6, V[i][1] * 6) for i in (mid, b, a)])
    mats = [mat("Peci_velvet", "velvet.png")] if plain else [mat("Peci_band", "songkok_side.png"), mat("Peci_crown", "songkok_top.png")]
    return make(name, V, F, U, M, mats, label, order)

# ---------- peci rajut: a soft dome following the head and hair, a little above the ears
RJ_F, RJ_B = 1.640, 1.618
RINGS = 9
top_z = fit[:, 2].max() + 0.012
def dome_rings():
    # a smooth dome: as wide as the head (and hair) just above the brim, rounding over to the top
    th_p = np.arctan2(fit[:, 1] - CY, fit[:, 0]); r_p = np.hypot(fit[:, 0], fit[:, 1] - CY)
    rb = np.zeros(SEGS); zb = np.zeros(SEGS)
    for s in range(SEGS):
        th = 2 * math.pi * s / SEGS - math.pi / 2; zb[s] = brim_at(th, RJ_F, RJ_B)
        near = np.abs((th_p - th + math.pi) % (2 * math.pi) - math.pi) < 2.5 * math.pi / SEGS
        sel = near & (fit[:, 2] > zb[s] - 0.005) & (fit[:, 2] < zb[s] + 0.05)
        rb[s] = (r_p[sel].max() if sel.any() else 0.1) + 0.009
    for _ in range(6): rb = (np.roll(rb, 1) + 2 * rb + np.roll(rb, -1)) / 4
    R = np.zeros((RINGS, SEGS)); Z = np.zeros((RINGS, SEGS)); n = 2.4
    for k in range(RINGS):
        t = k / RINGS  # the last ring sits just short of the top; the apex closes it
        Z[k] = zb + (top_z - zb) * t
        R[k] = rb * (1 - t ** n) ** (1 / n)
    return R, Z
DR, DZ = dome_rings()
def rajut(name, colour, label, order):
    V, F, U, M = [], [], [], []
    idx = np.zeros((RINGS, SEGS + 1), int); vcoord = np.zeros((RINGS, SEGS + 1))
    for s in range(SEGS + 1):
        th = 2 * math.pi * s / SEGS - math.pi / 2; acc = 0; prev = None
        for k in range(RINGS):
            r, z = DR[k, s % SEGS], DZ[k, s % SEGS]
            p = (math.cos(th) * r, CY + math.sin(th) * r, z)
            if prev: acc += math.dist(p, prev)
            prev = p; idx[k, s] = len(V); vcoord[k, s] = acc / 0.08; V.append(p)
    for s in range(SEGS):
        for k in range(RINGS - 1):
            F.append((idx[k, s], idx[k, s + 1], idx[k + 1, s + 1], idx[k + 1, s])); M.append(0)
            U.append([(ss / SEGS * 7, vcoord[kk, ss]) for kk, ss in ((k, s), (k, s + 1), (k + 1, s + 1), (k + 1, s))])
    apex = len(V); V.append((0, CY, top_z))
    for s in range(SEGS):
        F.append((idx[-1, s], idx[-1, s + 1], apex)); M.append(0)
        U.append([(s / SEGS * 7, vcoord[-1, s]), ((s + 1) / SEGS * 7, vcoord[-1, s + 1]), ((s + 0.5) / SEGS * 7, vcoord[-1, s] + 0.3)])
    return make(name, V, F, U, M, [mat("Rajut_" + colour, "knit_%s.png" % colour)], label, order)

caps = [songkok("Peci_bordir", False, "Peci bordir emas", 0), songkok("Peci_polos", True, "Peci hitam polos", 1)]
for i, (c, l) in enumerate((("white", "putih"), ("black", "hitam"), ("blue", "biru"), ("brown", "cokelat"))):
    caps.append(rajut("Rajut_" + c, c, "Peci rajut " + l, 2 + i))

# ---------- tuck the hair under each kind of cap
def inside_songkok(p):
    th, r = polar(p)
    return p[2] < brim_at(th, SK_F, SK_B) or (p[2] < SK_T - 0.007 and r < sk_r(th) - 0.006)
def inside_rajut(p):
    th, r = polar(p)
    if p[2] < brim_at(th, RJ_F, RJ_B): return True
    s = ((th + math.pi / 2) % (2 * math.pi)) / (2 * math.pi) * SEGS; s0 = int(s) % SEGS; f = s - int(s)
    col_z = DZ[:, s0]; col_r = DR[:, s0] * (1 - f) + DR[:, (s0 + 1) % SEGS] * f
    if p[2] >= top_z: return False
    if p[2] >= col_z[-1]: return r < col_r[-1] * (top_z - p[2]) / (top_z - col_z[-1]) - 0.004
    return r < np.interp(p[2], col_z, col_r) - 0.005
moved = {}
for o in hairs:
    inv = o.matrix_world.inverted()
    for key, inside in (("Tuck_peci", inside_songkok), ("Tuck_rajut", inside_rajut)):
        new = []; n = 0
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            if inside(p): new.append(None); continue
            lo, hi = 0.0, 1.0  # furthest point toward the head's middle that the cap still covers
            for _ in range(20):
                t = (lo + hi) / 2
                if inside(C + (p - C) * t): lo = t
                else: hi = t
            new.append(inv @ (C + (p - C) * lo * 0.985)); n += 1
        if not n: continue
        if not o.data.shape_keys: o.shape_key_add(name="Basis", from_mix=False)
        k = o.shape_key_add(name=key, from_mix=False)
        for v, q in zip(k.data, new):
            if q is not None: v.co = q
        moved[(o.name, key)] = n
print("PECI", [c.name for c in caps], "tucks", moved)
bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)

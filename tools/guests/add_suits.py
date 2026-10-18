# Blazers over a plain tee, for men and women, added to the modular files in place (re-runnable):
#   blender -b -P add_suits.py -- <repo>/assets/chars/blenderfilesmodular
#
# Made from the pack's jacket (Top_navy_blazer in male.blend) with its shirt taken out, collar,
# buttons and all, so nothing pokes up beside the lapels. In its place is a plain V-neck tee cut from
# the body's own chest (so it fits the women too), and the shirt cuffs turn the colour of the sleeves. For the women the same blazer is refitted to the female
# body: each point moves by however far the female body sits from the male one at that spot.
import bpy, sys, os, functools, numpy as np
from mathutils import Vector, kdtree, bvhtree

folder = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
MALE, FEMALE = os.path.join(folder, "male.blend"), os.path.join(folder, "female.blend")
SRC = "Top_navy_blazer"
SUITS = {
    "male": [("Top_blazer_lightblue", "Blazer biru muda & kaos", "#8fb0d4", "#f3f3f1"),
             ("Top_blazer_navy", "Blazer navy & kaos", "#27324c", "#f3f3f1"),
             ("Top_blazer_black", "Blazer hitam & kaos", "#1d1d20", "#f3f3f1"),
             ("Top_blazer_beige", "Blazer krem & kaos hitam", "#c7b08c", "#232325")],
    "female": [("Top_blazer_lightblue", "Blazer biru muda & kaos", "#8fb0d4", "#f3f3f1"),
               ("Top_blazer_black", "Blazer hitam & kaos", "#1d1d20", "#f3f3f1"),
               ("Top_blazer_cream", "Blazer krem & kaos hitam", "#e3d6bf", "#232325"),
               ("Top_blazer_pink", "Blazer dusty pink & kaos", "#c99a9e", "#f3f3f1")],
}

# ---------- colours (as in build_modular.py: the atlas when it has the colour, else the palette)
def hexrgb(h): return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
def sh(h, f): return '#%02x%02x%02x' % tuple(int(min(255, int(h[i:i + 2], 16) * f)) for i in (1, 3, 5))
class Paint:
    def __init__(self):
        self.px = {}
        self.atlas = bpy.data.images["Atlas"]; self.pal_mat = bpy.data.materials["Palette"]
        self.pal = next(n.image for n in self.pal_mat.node_tree.nodes if n.type == 'TEX_IMAGE'); self.N = 8
        self.used = set(); self.new = {}
        for o in bpy.data.objects:
            if o.type != 'MESH' or not o.data.uv_layers: continue
            uv = o.data.uv_layers[0].data
            for p in o.data.polygons:
                if p.material_index < len(o.data.materials) and o.data.materials[p.material_index] == self.pal_mat:
                    u, v = uv[p.loop_indices[0]].uv; self.used.add(int(v * self.N) * self.N + int(u * self.N))
        self.find_uv = functools.lru_cache(None)(self._find_uv)
    def pixels(self, img):
        if img.name not in self.px:
            w, h = img.size; self.px[img.name] = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]
        return self.px[img.name]
    def image(self, m): return next((n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'), None)
    def face_rgb(self, o, p):
        a = self.pixels(self.image(o.data.materials[p.material_index])); h, w, _ = a.shape; uv = o.data.uv_layers[0].data
        u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total; v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
        return a[int((v % 1) * h) % h, int((u % 1) * w) % w]
    def _find_uv(self, t):
        a = self.pixels(self.atlas); h, w, _ = a.shape; t = hexrgb(t)
        sub = a[::4, ::4]; d = ((sub - t) ** 2).sum(-1)
        hh, ww = d.shape; ys = np.arange(hh)[:, None]; xs = np.arange(ww)[None, :]
        bad = (np.minimum(np.abs(ys - 0), np.minimum(np.abs(ys - hh // 2), np.abs(ys - hh))) < 8) | (xs < 4) | (xs > ww - 16)
        gy, gx = np.gradient(sub.mean(-1)); d = d + bad * 10 + (np.abs(gx) + np.abs(gy)) * 0.5
        y, x = np.unravel_index(np.argmin(d), d.shape)
        return ((x * 4 + 2) / w, (y * 4 + 2) / h), float(np.abs(sub[y, x] - t).max())
    def pal_uv(self, c):
        if c not in self.new:
            i = next(k for k in range(self.N * self.N) if k not in self.used); self.used.add(i); self.new[c] = i
            n = self.N * 16; px = np.array(self.pal.pixels[:], dtype=np.float32).reshape(n, n, 4)
            x, y = (i % self.N) * 16, (i // self.N) * 16; px[y:y + 16, x:x + 16, :3] = hexrgb(c)
            self.pal.pixels = px.ravel().tolist(); self.px.pop(self.pal.name, None)
        i = self.new[c]; return ((i % self.N + 0.5) / self.N, (i // self.N + 0.5) / self.N)
    def face(self, o, p, c):
        (u, v), err = self.find_uv(c); mats = [m.name for m in o.data.materials]
        if err > 0.025:
            if self.pal_mat.name not in mats: o.data.materials.append(self.pal_mat); mats.append(self.pal_mat.name)
            p.material_index = mats.index(self.pal_mat.name); u, v = self.pal_uv(c)
        else:
            p.material_index = next(k for k, m in enumerate(o.data.materials) if self.image(m) == self.atlas)
        uv = o.data.uv_layers[0].data
        for li in p.loop_indices: uv[li].uv = (u, v)
    def done(self): self.pal.pack()

def clear(names):
    for n in names:
        o = bpy.data.objects.get(n)
        if o: me = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(me)

def cut_shirt(o, paint):
    """the shirt goes (collar, front and buttons); returns each kept face's kind: cuff, or the jacket's two shades"""
    import bmesh
    K = ["cuff", "dark", "main", "drop"]; tags = []
    for p in o.data.polygons:
        c = paint.face_rgb(o, p); w = o.matrix_world @ p.center
        if c.mean() > 0.8: tags.append("cuff" if abs(w.x) > 0.35 else "drop")
        elif abs(w.x) < 0.04 and w.y < -0.05 and 0.9 < w.z < 1.36 and p.area < 4e-4: tags.append("drop")  # a shirt button
        else: tags.append("dark" if c.mean() < 0.198 else "main")
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    lay = bm.faces.layers.int.new("kind")
    for f in bm.faces: f[lay] = K.index(tags[f.index])
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[lay] == 3], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.faces.ensure_lookup_table(); kept = [K[f[lay]] for f in bm.faces]
    bm.faces.layers.int.remove(lay); bm.to_mesh(o.data); bm.free()
    return kept

def tee(body, name, colour, paint, lift=0.006):
    """a V-neck tee front: the body's chest and stomach, lifted off the skin a little"""
    import bmesh
    o = body.copy(); o.data = body.data.copy(); o.name = name; o.data.name = name
    for c in body.users_collection: c.objects.link(o)
    if o.data.shape_keys: o.shape_key_clear()
    names = [g.name for g in o.vertex_groups]
    arm = lambda v: sum(g.weight for g in v.groups if names[g.group] in ("LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand", "Head"))
    mw = o.matrix_world; n3 = mw.to_3x3()
    co = [mw @ v.co for v in o.data.vertices]
    cy = sum(c.y for c in co if 1.1 < c.z < 1.3) / max(1, sum(1 for c in co if 1.1 < c.z < 1.3))
    V0, K, HEM, W = 1.305, 1.35, 0.86, 0.115  # the V's point, how steeply it rises, the hem, half its width
    # (only as wide as the blazer's opening: any wider and it shows through the blazer over the bust)
    def keep(c, v):  # roughly: the front, hips to shoulders (trimmed cleanly below)
        return c.y < cy + (0.04 if c.z < 1.12 else 0) and HEM - 0.03 < c.z < 1.45 and abs(c.x) < (W + 0.04 if c.z > 1.15 else 0.25) and arm(v) < 0.3
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i, v in enumerate(o.data.vertices) if not keep(co[i], v)], context='VERTS')
    # cut the V neck and the hem along straight lines, in world space, then drop what is outside them
    bmesh.ops.transform(bm, matrix=mw, verts=bm.verts)
    for n, q in (((-K, 0, 1), (0, 0, V0)), ((K, 0, 1), (0, 0, V0)), ((0, 0, 1), (0, 0, HEM)), ((0, 0, 1), (0, 0, 1.40)), ((1, 0, 0), (W, 0, 0)), ((1, 0, 0), (-W, 0, 0))):
        g = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=g, plane_co=Vector(q), plane_no=Vector(n).normalized())
    bm.faces.ensure_lookup_table()  # (wider below the bust, where the blazer flares open)
    out = [f for f in bm.faces if (lambda c: c.z > V0 + K * abs(c.x) or c.z < HEM or c.z > 1.40 or abs(c.x) > (W if c.z > 1.12 else 0.25))(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=out, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.transform(bm, matrix=mw.inverted(), verts=bm.verts)
    bm.to_mesh(o.data); bm.free(); o.data.update()
    inv = mw.inverted()
    for v in o.data.vertices: v.co = inv @ (mw @ v.co + (n3 @ v.normal).normalized() * lift)
    for p in o.data.polygons: paint.face(o, p, colour)
    return o

def join(into, other):
    if other.data.uv_layers and into.data.uv_layers: other.data.uv_layers[0].name = into.data.uv_layers[0].name
    bpy.ops.object.select_all(action='DESELECT')
    into.hide_set(False); other.hide_set(False)
    other.select_set(True); into.select_set(True); bpy.context.view_layer.objects.active = into
    bpy.ops.object.join()

def dress(base, kinds, body, name, label, order, coat, inner, paint, lift=0.006):
    o = base.copy(); o.data = base.data.copy(); o.name = name; o.data.name = name
    for c in base.users_collection: c.objects.link(o)
    for p, k in zip(o.data.polygons, kinds):
        paint.face(o, p, {"cuff": sh(coat, 0.9), "dark": sh(coat, 0.82), "main": coat}[k])
    join(o, tee(body, name + "_tee", inner, paint, lift))
    o["label"] = label; o["order"] = order
    o.hide_set(True); o.hide_render = True
    return o

# ---------- the men's: straight from the pack's jacket
bpy.ops.wm.open_mainfile(filepath=MALE)
clear([n for n, *_ in SUITS["male"]])
paint = Paint()
src = bpy.data.objects[SRC]
base = src.copy(); base.data = src.data.copy(); bpy.data.collections["Top"].objects.link(base)
kinds = cut_shirt(base, paint)
mbody = next(o for o in bpy.data.collections["Skin"].objects if o.type == 'MESH')
order0 = max(o.get("order", 0) for o in bpy.data.collections["Top"].objects if o.get("order", 999) < 999) + 1
made = [dress(base, kinds, mbody, n, l, order0 + i, c, t, paint) for i, (n, l, c, t) in enumerate(SUITS["male"])]
me = base.data; bpy.data.objects.remove(base, do_unlink=True); bpy.data.meshes.remove(me)
paint.done()
bpy.ops.wm.save_as_mainfile(filepath=MALE, compress=True)
print("SUITS male", [o.name for o in made])

# ---------- the women's: the same blazer, refitted to the female body
bpy.ops.wm.open_mainfile(filepath=FEMALE)
clear([n for n, *_ in SUITS["female"]] + [SRC, "Body_M_med"])
with bpy.data.libraries.load(MALE) as (a, b): b.objects = [SRC, "Body_M_med"]
rig = bpy.data.objects["Guest_Rig"]; top = bpy.data.collections["Top"]
jacket, mbody = b.objects
for o in (jacket, mbody):
    top.objects.link(o)
    for md in o.modifiers:
        if md.type == 'ARMATURE': md.object = rig
    mpi = o.matrix_parent_inverse.copy(); o.parent = rig; o.matrix_parent_inverse = mpi
# use this file's own atlas and palette materials (the appended copies would add a second atlas)
paint = Paint()
own = {"atlas": next(m for m in bpy.data.materials if m.node_tree and not m.library and paint.image(m) == paint.atlas), "pal": paint.pal_mat}
for i, m in enumerate(jacket.data.materials):
    jacket.data.materials[i] = own["pal"] if m.name.startswith("Palette") else own["atlas"]
for i, m in enumerate(mbody.data.materials):
    mbody.data.materials[i] = own["pal"] if m.name.startswith("Palette") else own["atlas"]
fbody = next(o for o in bpy.data.collections["Skin"].objects if o.type == 'MESH')
def world(o): return [o.matrix_world @ v.co for v in o.data.vertices]
def headw(o):
    names = [g.name for g in o.vertex_groups]
    return [sum(g.weight for g in v.groups if names[g.group] == "Head") for v in o.data.vertices]
fw = world(fbody); tree = bvhtree.BVHTree.FromPolygons(fw, [tuple(p.vertices) for p in fbody.data.polygons])
mw = [p for p, h in zip(world(mbody), headw(mbody)) if h < 0.5]
D = []
for p in mw:
    q, n, _, _ = tree.find_nearest(p); D.append(q - p)
kd = kdtree.KDTree(len(mw))
for i, p in enumerate(mw): kd.insert(p, i)
kd.balance()
inv = jacket.matrix_world.inverted()
for v in jacket.data.vertices:
    p = jacket.matrix_world @ v.co; acc = Vector(); tw = 0
    for (_, i, d) in kd.find_n(p, 10):
        f = 1 / (d + 0.004); acc += D[i] * f; tw += f
    p = p + acc / tw
    q, n, _, _ = tree.find_nearest(p)  # and never inside the body
    if n is not None and (p - q).dot(n) < 0.011: p = q + n * 0.011
    v.co = inv @ p
kinds = cut_shirt(jacket, paint)
order0 = max(o.get("order", 0) for o in top.objects if o.get("order", 999) < 999 and o not in (jacket, mbody)) + 1
made = [dress(jacket, kinds, fbody, n, l, order0 + i, c, t, paint, 0.004) for i, (n, l, c, t) in enumerate(SUITS["female"])]
for o in (jacket, mbody):
    me = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(me)
bpy.ops.outliner.orphans_purge(do_recursive=True)
paint.done()
bpy.ops.wm.save_as_mainfile(filepath=FEMALE, compress=True)
print("SUITS female", [o.name for o in made])

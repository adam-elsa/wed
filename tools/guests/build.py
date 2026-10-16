import bpy, bmesh, sys, os, math, json, mathutils
from mathutils import Vector, kdtree
S = sys.argv[sys.argv.index('--') + 1]; sys.path.insert(0, S + "/scripts"); import clib; clib.setup(S)
OUT = S + "/build"; os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- parts: one skeleton (all five rigs are identical), everything rebound to it
ARM, base, acts = clib.imp("1_Cashier")
ARM.name = "Guest_Rig"
P = {o.name: o for o in base}
for f in ["18_Security", "20_Showgirl", "36", "75"]:
    a, ms, ac = clib.imp(f); clib.rebind(ms, ARM); clib.drop_rig(a, ac)
    for o in ms: P[o.name] = o
KEEP = {"Security_Idle_1": "Idle", "Clap": "Clap", "Happy": "Happy", "TalkGestureActive": "Talk", "TalkGestureListen": "Listen",
        "Female_Sit_01": "Sit_F", "Female_Sit_01_Talk": "SitTalk_F", "Male_Sit_01": "Sit_M", "Male_Sit_01_Talk": "SitTalk_M", "Walk": "Walk"}
for a in list(bpy.data.actions):
    n = a.name.split("|")[-1].replace("Adult_", "")
    if n in KEEP: a.name = KEEP[n]; a.use_fake_user = True
    else: bpy.data.actions.remove(a)
ATLAS_MAT = P["Adult_Female_Cashier_Body"].data.materials[0]
def part(n): return P[[k for k in P if k.startswith(n)][0]]
SRC = {"fbody": part("Adult_Female_Cashier_Body"), "fface": part("Adult_Female_Cashier_Face"), "fhair": part("Adult_Female_Cashier_Hairstyle"),
       "fshirt": part("Adult_Female_Cashier_Shirt"), "fpants": part("Adult_Female_Cashier_Pants"), "fshoes": part("Adult_Female_Cashier_Shoes"),
       "heels": part("Adult_Female_Showgirl_HeelShoes"), "sghair": part("Adult_Female_Showgirl_Hairstyle"),
       "mbody": part("Adult_Male__Security_Body"), "mface": part("Adult_Male_Security_Face"), "mhair": part("Adult_Male_Security_Hairstyle"),
       "mshirt": part("Adult_Male_Security_Shirt"), "mpants": part("Adult_Male_Security_Pants"), "mshoes": part("Adult_Male_Security_Shoes"),
       "jacket": part("Adult_Male_Jacket_36"), "pants36": part("Adult_Male_Pants_36"), "shoes36": part("Adult_Male_Shoes_36"), "hair36": part("Adult_Male_Hat_Hairstyle"),
       "quiff": part("PlusSize_Male_Hairstyle"), "sneakers": part("PlusSize_Male_Shoes")}

def bone(n): return ARM.matrix_world @ ARM.data.bones[n].head_local, ARM.matrix_world @ ARM.data.bones[n].tail_local
def dup(src, name):
    o = src.copy(); o.data = src.data.copy(); o.name = name; o.data.name = name
    bpy.context.scene.collection.objects.link(o); return o
def weights(o):
    names = [g.name for g in o.vertex_groups]
    return [{names[g.group]: g.weight for g in v.groups} for v in o.data.vertices]
def wsum(w, keys): return sum(x for k, x in w.items() if any(s in k for s in keys))
def world_co(o): return [o.matrix_world @ v.co for v in o.data.vertices]
def delete_verts(o, pred):
    W = weights(o); co = world_co(o)
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in range(len(co)) if pred(co[i], W[i])], context='VERTS')
    bm.to_mesh(o.data); bm.free()
def set_world(o, cos):
    inv = o.matrix_world.inverted()
    for v, c in zip(o.data.vertices, cos): v.co = inv @ c
ARMW = ("LeftArm", "RightArm", "ForeArm", "Hand")

# ---------- recolour by moving UVs inside the shared atlas
def sh(hexc, f):
    c = [int(hexc[i:i + 2], 16) * f for i in (1, 3, 5)]; return '#%02x%02x%02x' % tuple(int(min(255, x)) for x in c)
def recolor(o, spec): clib.recolor2(o, spec, ATLAS_MAT)
def solid(o, hexc): recolor(o, {'all': hexc})
def skin(src, name, tone):
    o = dup(src, name); recolor(o, {0: tone, 1: sh(tone, 0.92)}); return o
_pat = {}
def pattern(o, tex, tile=0.22, cyl=False):
    if tex not in _pat:
        m = ATLAS_MAT.copy(); m.name = "Pat_" + tex
        img = bpy.data.images.load(S + f"/tex/{tex}.png"); img.name = tex
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE': n.image = img
        _pat[tex] = m
    o.data.materials.clear(); o.data.materials.append(_pat[tex])
    uv = o.data.uv_layers[0].data; mw = o.matrix_world
    for p in o.data.polygons:
        n = mw.to_3x3() @ p.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            c = mw @ o.data.vertices[o.data.loops[li].vertex_index].co
            if cyl: uv[li].uv = (math.atan2(c.y, c.x) / (2 * math.pi) * round(0.9 / tile), c.z / tile)
            elif ax == 0: uv[li].uv = (c.y / tile, c.z / tile)
            elif ax == 1: uv[li].uv = (c.x / tile, c.z / tile)
            else: uv[li].uv = (c.x / tile, c.y / tile)

# ---------- new garments
def short_sleeves(o, frac=0.5):
    arms = [bone(s + "Arm") for s in ("Left", "Right")]
    def cut(c, w):
        if wsum(w, ("ForeArm", "Hand")) > 0.2: return True
        for h, t in arms:
            d = t - h; s = (c - h).dot(d) / d.length_squared
            if s > frac and (c - (h + d * s)).length < 0.09: return True
        return False
    delete_verts(o, cut)
def sleeveless(o): delete_verts(o, lambda c, w: wsum(w, ARMW) > 0.45)
def skin_weights(dst, src, k=8):
    """copy deform weights from the nearest body vertices (inverse-distance blend), arms left out"""
    W = weights(src); co = world_co(src); idx = [i for i in range(len(co)) if wsum(W[i], ARMW) <= 0.3]
    kd = kdtree.KDTree(len(idx))
    for j, i in enumerate(idx): kd.insert(co[i], j)
    kd.balance()
    for g in list(dst.vertex_groups): dst.vertex_groups.remove(g)
    groups = {}
    for v in dst.data.vertices:
        acc = {}; tw = 0
        for (_, j, d) in kd.find_n(dst.matrix_world @ v.co, k):
            f = 1 / (d + 1e-3); tw += f
            for g, x in W[idx[j]].items(): acc[g] = acc.get(g, 0) + x * f
        for g, x in acc.items():
            if x / tw < 0.01: continue
            if g not in groups: groups[g] = dst.vertex_groups.new(name=g)
            groups[g].add([v.index], x / tw, 'REPLACE')
    if not any(m.type == 'ARMATURE' for m in dst.modifiers):
        m = dst.modifiers.new("Armature", 'ARMATURE'); m.object = ARM
def tube(name, body, z_top, z_bot, rings=8, segs=24, margin=0.026, taper=0.0, flare=0.0, pleats=0):
    W = weights(body); co = [c for c, w in zip(world_co(body), W) if wsum(w, ARMW) < 0.3]
    top = [c for c in co if abs(c.z - z_top) < 0.03]
    cx = (min(c.x for c in top) + max(c.x for c in top)) / 2; cy = (min(c.y for c in top) + max(c.y for c in top)) / 2
    verts = []; prev = None
    for r in range(rings + 1):
        t = r / rings; z = z_top + (z_bot - z_top) * t
        sl = [c for c in co if abs(c.z - z) < 0.03] or top; ring = []
        for s in range(segs):
            a = 2 * math.pi * s / segs; d = Vector((math.cos(a), math.sin(a), 0))
            e = max((c - Vector((cx, cy, z))).dot(d) for c in sl) + margin
            if prev: e = max(e, prev[s] * (1 - taper / rings) + flare / rings)
            ring.append(e)
        prev = ring
        for s in range(segs):
            a = 2 * math.pi * s / segs; e = ring[s] * (1 + (0.06 if (pleats and s % 2) else 0) * t)
            verts.append((cx + math.cos(a) * e, cy + math.sin(a) * e, z))
    faces = [(r * segs + s, r * segs + (s + 1) % segs, (r + 1) * segs + (s + 1) % segs, (r + 1) * segs + s) for r in range(rings) for s in range(segs)]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(ATLAS_MAT); me.uv_layers.new(name="UVMap")
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.parent = ARM; o.matrix_parent_inverse = ARM.matrix_world.inverted()
    skin_weights(o, body); return o
def wide_legs(o, amount=0.055):
    co = world_co(o); crotch = max(c.z for c in co) - 0.16; bot = min(c.z for c in co)
    new = []
    for c in co:
        if c.z > crotch: new.append(c); continue
        same = [d for d in co if (d.x > 0) == (c.x > 0) and abs(d.z - c.z) < 0.025]
        cx = sum(d.x for d in same) / len(same); cy = sum(d.y for d in same) / len(same)
        t = (crotch - c.z) / (crotch - bot); vv = Vector((c.x - cx, c.y - cy, 0))
        if vv.length > 1e-5: vv.normalize()
        n = c + vv * (0.008 + amount * t)
        if (c.x > 0) != (n.x > 0) or abs(n.x) < 0.004: n.x = math.copysign(0.004, c.x)
        n.z -= 0.03 * t; new.append(n)
    set_world(o, new)
def long_hair(o, drop=2.3):
    co = world_co(o); h, _ = bone("Head"); zc = h.z + 0.06
    set_world(o, [Vector((c.x * (1 + 0.12 * max(0, zc - c.z) / 0.1), c.y, zc - (zc - c.z) * drop)) if (c.z < zc and c.y > -0.05) else c for c in co])
def hijab(name, body, tone, drape=0.10, flare=0.05):
    o = dup(body, name); W = weights(o); co = world_co(o)
    hd = [c for c, w in zip(co, W) if w.get("Head", 0) > 0.5]
    zmin = min(c.z for c in hd); zmax = max(c.z for c in hd); ymin = min(c.y for c in hd); H = zmax - zmin
    shz = bone("LeftArm")[0].z; zcut = shz - drape
    face = lambda c: c.y < ymin + 0.045 and zmin + 0.10 * H < c.z < zmin + 0.80 * H and abs(c.x) < 0.055
    delete_verts(o, lambda c, w: c.z < zcut or wsum(w, ARMW) > 0.25 or face(c))
    hc = Vector((0, (ymin + max(c.y for c in hd)) / 2, (zmin + zmax) / 2))
    mw = o.matrix_world; new = []; zn = zmin + 0.08 * H
    for v in o.data.vertices:
        c = mw @ v.co; n = (mw.to_3x3() @ v.normal).normalized()
        if c.z > zn: d = c - hc; c = hc + Vector((d.x * 1.16, d.y * 1.08, d.z * 1.07)) + n * 0.016
        else:
            t = (zn - c.z) / max(1e-3, zn - zcut); r = Vector((c.x, c.y - hc.y * 0.5, 0))
            c = c + n * (0.026 + 0.02 * t) + (r.normalized() * flare * t if r.length > 1e-4 else Vector())
        new.append(c)
    set_world(o, new); solid(o, tone); return o

# ---------- skin tones (Indonesian range instead of the pack's peach)
T = {"light": "#e8b08a", "med": "#cf9468", "deep": "#a87048"}
B = {}
for k, val in T.items():
    B["f" + k] = skin(SRC["fbody"], "Body_F_" + k, val); B["m" + k] = skin(SRC["mbody"], "Body_M_" + k, val)
FACE_F = dup(SRC["fface"], "Face_F"); FACE_M = dup(SRC["mface"], "Face_M")
def v(src, name, spec=None, fn=None):
    o = dup(SRC[src], name)
    if fn: fn(o)
    if spec: recolor(o, spec)
    return o
hips = bone("Hips")[0]; foot = bone("LeftFoot")[0]
C = {}
# originals from the pack, kept
C["vest"] = [B["flight"], FACE_F, v("fhair", "Hair_F_bob"), v("fshirt", "Top_vest"), v("fpants", "Pants_F_black"), v("fshoes", "Shoes_F_black")]
C["suit"] = [B["mmed"], FACE_M, v("mhair", "Hair_M_brown"), v("mshirt", "Top_suit"), v("mpants", "Pants_M_black"), v("mshoes", "Shoes_M_black")]
C["purple"] = [B["mlight"], FACE_M, v("hair36", "Hair_M_side"), v("jacket", "Top_purple"), v("pants36", "Pants_purple"), v("shoes36", "Shoes_purple")]
# 1 hijab + embroidered kebaya + wide white trousers
keb = v("fshirt", "Top_kebaya"); pattern(keb, "floral", 0.2)
wp = v("fpants", "Pants_F_wide_white", fn=wide_legs); solid(wp, "#f1eee6")
C["hijab_kebaya"] = [B["flight"], FACE_F, hijab("Hijab_beige", B["flight"], "#c49f7c", 0.12, 0.04), keb, wp, v("fshoes", "Shoes_F_cream", {'all': "#e9dcc9"})]
# 2 black vest + long batik wrap skirt + blue heels, long hair
vs = v("fshirt", "Top_vest_black", {0: "#1c1b1b", 1: "#1c1b1b", 2: "#262525", 3: "#1c1b1b", 4: "#f2f2f2"}, fn=sleeveless)
sk = tube("Skirt_batik_kawung", B["fmed"], hips.z + 0.04, foot.z + 0.06, rings=8, segs=24, taper=0.08); pattern(sk, "kawung", 0.24, cyl=True)
C["vest_batik"] = [B["fmed"], FACE_F, v("fhair", "Hair_F_long", {'all': "#1a1818"}, fn=long_hair), vs, sk, v("heels", "Heels_blue", {'all': "#2c4fd6"})]
# 3 white puff shirt + light blue check mini skirt
mini = tube("Skirt_mini_check", B["flight"], hips.z + 0.04, hips.z - 0.26, rings=3, segs=24, flare=0.03); pattern(mini, "tweed", 0.18, cyl=True)
C["white_mini"] = [B["flight"], FACE_F, v("sghair", "Hair_F_bob_brown", {'all': "#3b2a22"}),
                   v("fshirt", "Top_white", {0: "#f4f4f3", 1: "#efefee", 2: "#e9e9e8", 3: "#e2e2e2", 4: "#d9b45a"}), mini, v("fshoes", "Shoes_F_white", {'all': "#f3f0ea"})]
# 4 pashmina + white blouse + maroon batik pleated skirt
pl = tube("Skirt_batik_maroon", B["fmed"], hips.z + 0.04, foot.z + 0.05, rings=8, segs=32, flare=0.02, pleats=1); pattern(pl, "maroon", 0.2, cyl=True)
C["pashmina_batik"] = [B["fmed"], FACE_F, hijab("Hijab_pink", B["fmed"], "#c08085", 0.20, 0.07),
                       v("fshirt", "Top_white_b", {0: "#f4f4f3", 1: "#f1f1f0", 2: "#ebebea", 3: "#e5e5e5", 4: "#efe6d0"}), pl, v("heels", "Heels_cream", {'all': "#efe4d2"})]
# 5 long-sleeve batik shirt + cream trousers
bs = v("mshirt", "Top_batik_long"); pattern(bs, "parang", 0.2)
C["batik_long"] = [B["mmed"], FACE_M, v("mhair", "Hair_M_black", {'all': "#1e1a18"}), bs, v("mpants", "Pants_M_cream", {'all': "#e6ddc8"}), v("mshoes", "Shoes_M_brown", {'all': "#5a3a22"})]
# 6 black short-sleeve shirt + navy trousers + white sneakers
snk = v("sneakers", "Sneakers_white", {0: "#ffffff", 1: "#e4e4e4", 2: "#d8d8d8"})
C["black_short"] = [B["mdeep"], FACE_M, v("quiff", "Hair_M_quiff", {'all': "#1b1919"}), v("mshirt", "Top_black_short", {'all': "#1f1f21"}, fn=short_sleeves),
                    v("mpants", "Pants_M_navy", {'all': "#2b3550"}), snk]
# 7 white short-sleeve shirt with a batik band + olive trousers
ws = v("mshirt", "Top_white_trim", fn=short_sleeves); pattern(ws, "trim", 0.3)
C["white_trim"] = [B["mlight"], FACE_M, v("hair36", "Hair_M_dark", {'all': "#2a201b"}), ws, v("mpants", "Pants_M_olive", {'all': "#6b6a50"}),
                   v("sneakers", "Sneakers_grey", {0: "#c9c9c4", 1: "#a9a9a4", 2: "#b4b4ae"})]
# 8 navy blazer over a white tee + navy trousers + white sneakers
C["navy_blazer"] = [B["mmed"], FACE_M, v("mhair", "Hair_M_brown2", {'all': "#3a2a20"}), v("jacket", "Top_navy_blazer", {0: "#2c3e5c", 1: "#f3f3f2", 2: "#24324b", 3: "#2c3e5c"}),
                    v("pants36", "Pants_navy", {0: "#2c3e5c", 1: "#24324b", 2: "#2c3e5c", 3: "#2c3e5c"}), snk]
# 9 black suit + orange shirt
C["suit_orange"] = [B["mlight"], FACE_M, v("quiff", "Hair_M_quiff_b", {'all': "#221d1b"}), v("jacket", "Top_black_orange", {0: "#1f1f22", 1: "#c8641e", 2: "#18181a", 3: "#1f1f22"}),
                    v("pants36", "Pants_black", {0: "#1f1f22", 1: "#18181a", 2: "#1f1f22", 3: "#1f1f22"}), v("shoes36", "Shoes_black", {'all': "#1a1a1a"})]

# ---------- clean up: drop pack parts that no outfit uses
used = {o for l in C.values() for o in l}
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o not in used]: bpy.data.objects.remove(o, do_unlink=True)
for m in bpy.data.materials: m.use_backface_culling = False
clib.save_palette(S + "/tex/palette.png")
json.dump({k: [o.name for o in l] for k, l in C.items()}, open(OUT + "/guests.json", "w"), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/guests.blend")
print("BUILT", len(used), "meshes")

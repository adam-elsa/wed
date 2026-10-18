# The character creator's parts, cut from guests.blend into one file per gender:
#   blender -b -P build_modular.py -- <guests.blend> <out folder>
# -> <out>/female.blend and <out>/male.blend
#
# Each file holds the shared skeleton (Guest_Rig) with every animation, and one collection per slot
# in the creator: Skin, Face, Hair, Hijab (female only), Top, Bottom, Shoes. Every mesh in a slot is
# one choice; its "label" custom property is the name the guest sees, and "order" sorts the list.
# One choice per slot is left showing, so the file opens on a dressed character.
# export_modular.py turns the two files into assets/chars/avatar_*.glb and avatar.json.
#
# On the way, a few choices the guest crowd doesn't have are added: the deepest skin tone for the
# women. The hijab and the pashmina are one model each, coloured in the creator.
import bpy, sys, os, functools, numpy as np

src, out = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src)

# ---------- one copy of the pack's atlas instead of five
imgs = [i for i in bpy.data.images if i.name.startswith("Textures_4")]
ATLAS = imgs[0]; ATLAS.name = "Atlas"
for m in bpy.data.materials:
    if m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image in imgs: n.image = ATLAS
for i in imgs[1:]: bpy.data.images.remove(i)

# ---------- colour helpers (as in clib.py, but reading the textures packed in the file)
_px = {}
def pixels(img):
    if img.name not in _px:
        w, h = img.size; _px[img.name] = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]
    return _px[img.name]
def mat_image(m):
    return next((n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'), None) if m and m.node_tree else None
def hexrgb(h): return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
def face_rgb(o, p):
    img = mat_image(o.data.materials[p.material_index]); a = pixels(img); h, w, _ = a.shape
    uv = o.data.uv_layers[0].data
    u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total; v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
    return a[min(h - 1, max(0, int((v % 1) * h))), min(w - 1, max(0, int((u % 1) * w)))]
@functools.lru_cache(None)
def find_uv(target):
    a = pixels(ATLAS); h, w, _ = a.shape; t = hexrgb(target)
    sub = a[::4, ::4]; d = ((sub - t) ** 2).sum(-1)
    hh, ww = d.shape; ys = np.arange(hh)[:, None]; xs = np.arange(ww)[None, :]
    bad = (np.minimum(np.abs(ys - 0), np.minimum(np.abs(ys - hh // 2), np.abs(ys - hh))) < 8) | (xs < 4) | (xs > ww - 16)
    gy, gx = np.gradient(sub.mean(-1)); d = d + bad * 10 + (np.abs(gx) + np.abs(gy)) * 0.5
    y, x = np.unravel_index(np.argmin(d), d.shape)
    return ((x * 4 + 2) / w, (y * 4 + 2) / h), np.abs(sub[y, x] - t).max()
PAL_MAT = bpy.data.materials["Palette"]; PAL = mat_image(PAL_MAT); PN = 8
def pal_used():
    used = set()
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        uv = o.data.uv_layers[0].data
        for p in o.data.polygons:
            if o.data.materials[p.material_index] == PAL_MAT:
                u, v = uv[p.loop_indices[0]].uv
                used.add(int(v * PN) * PN + int(u * PN))
    return used
USED = pal_used(); NEW = {}
def pal_uv(hexc):
    if hexc not in NEW:
        i = next(k for k in range(PN * PN) if k not in USED); USED.add(i); NEW[hexc] = i
        n = PN * 16; px = np.array(PAL.pixels[:], dtype=np.float32).reshape(n, n, 4)
        x, y = (i % PN) * 16, (i // PN) * 16; px[y:y + 16, x:x + 16, :3] = hexrgb(hexc)
        PAL.pixels = px.ravel().tolist(); _px.pop(PAL.name, None)
    i = NEW[hexc]; return ((i % PN + 0.5) / PN, (i // PN + 0.5) / PN)
def paint(o, p, hexc):
    """give one face a flat colour: from the atlas when it has it, else from the palette"""
    (u, v), err = find_uv(hexc)
    mats = [m.name for m in o.data.materials]
    if err > 0.025:
        if PAL_MAT.name not in mats: o.data.materials.append(PAL_MAT); mats.append(PAL_MAT.name)
        p.material_index = mats.index(PAL_MAT.name); u, v = pal_uv(hexc)
    else:
        p.material_index = next(k for k, m in enumerate(o.data.materials) if mat_image(m) == ATLAS)
    uv = o.data.uv_layers[0].data
    for li in p.loop_indices: uv[li].uv = (u, v)
def sh(hexc, f): return '#%02x%02x%02x' % tuple(int(min(255, int(hexc[i:i + 2], 16) * f)) for i in (1, 3, 5))
def dup(o, name):
    c = o.copy(); c.data = o.data.copy(); c.name = name; c.data.name = name
    for col in o.users_collection: col.objects.link(c)
    return c

# ---------- the extra choices
SKIN = {"light": "#e8b08a", "med": "#cf9468", "deep": "#a87048"}  # as build.py
fd = dup(bpy.data.objects["Body_F_med"], "Body_F_deep")
for p in fd.data.polygons:
    c = face_rgb(fd, p)
    for a, b in ((SKIN["med"], SKIN["deep"]), (sh(SKIN["med"], 0.92), sh(SKIN["deep"], 0.92))):
        if np.abs(c - hexrgb(a)).max() < 0.05: paint(fd, p, b); break
# one hijab and one pashmina, coloured in the creator (see tint_hijabs.py, which does the same to an existing file)
TINT_COLORS = "#c49f7c,#eeebe4,#1f1d1f,#2b3653,#93a184,#c08085,#8a6a55,#a99ab8,#7a2e3a,#3f5e4a"
for old, new, tint in (("Hijab_beige", "Hijab_basic", "#c49f7c"), ("Hijab_pink", "Pashmina_basic", "#c08085")):
    o = bpy.data.objects[old]; o.name = new; o.data.name = new; o["tint"] = tint; o["colors"] = TINT_COLORS
PAL.pack()

# ---------- which slot, which gender, and what the guest sees it called
LABELS = {
    "Body_F_light": "Kuning langsat", "Body_F_med": "Sawo matang", "Body_F_deep": "Cokelat",
    "Body_M_light": "Kuning langsat", "Body_M_med": "Sawo matang", "Body_M_deep": "Cokelat",
    "Hair_F_bob": "Bob", "Hair_F_bob_brown": "Bob cokelat", "Hair_F_long": "Panjang hitam",
    "Hijab_basic": "Hijab", "Pashmina_basic": "Pashmina",
    "Top_kebaya": "Kebaya bordir", "Top_white_b": "Blus putih", "Top_white": "Kemeja putih", "Top_vest": "Rompi & kemeja", "Top_vest_black": "Rompi hitam",
    "Skirt_batik_maroon": "Rok batik merah marun", "Skirt_batik_kawung": "Rok batik kawung", "Skirt_mini_check": "Rok pendek kotak",
    "Pants_F_wide_white": "Kulot putih", "Pants_F_black": "Celana hitam",
    "Heels_cream": "Hak krem", "Heels_blue": "Hak biru", "Shoes_F_cream": "Flat krem", "Shoes_F_white": "Flat putih", "Shoes_F_black": "Flat hitam",
    "Hair_M_black": "Rapi hitam", "Hair_M_brown": "Pendek cokelat", "Hair_M_brown2": "Rapi cokelat tua", "Hair_M_side": "Pendek cokelat muda",
    "Hair_M_dark": "Rapi gelap", "Hair_M_quiff": "Jambul hitam", "Hair_M_quiff_b": "Jambul",
    "Top_batik_long": "Batik lengan panjang", "Top_white_trim": "Kemeja putih list batik", "Top_black_short": "Kemeja hitam lengan pendek",
    "Top_suit": "Kemeja & dasi", "Top_navy_blazer": "Blazer navy", "Top_black_orange": "Jas hitam", "Top_purple": "Jas ungu",
    "Pants_M_black": "Celana hitam", "Pants_M_cream": "Celana krem", "Pants_M_navy": "Celana navy", "Pants_M_olive": "Celana zaitun",
    "Pants_black": "Celana bahan hitam", "Pants_navy": "Celana bahan navy", "Pants_purple": "Celana bahan ungu",
    "Shoes_M_black": "Pantofel hitam", "Shoes_M_brown": "Pantofel cokelat", "Shoes_black": "Sepatu hitam", "Shoes_purple": "Sepatu ungu",
    "Sneakers_white": "Sneakers putih", "Sneakers_grey": "Sneakers abu",
}
def slot(n):
    for pre, s in (("Body", "Skin"), ("Face", "Face"), ("Hair", "Hair"), ("Hijab", "Hijab"), ("Pashmina", "Hijab"), ("Top", "Top"),
                   ("Pants", "Bottom"), ("Skirt", "Bottom"), ("Shoes", "Shoes"), ("Heels", "Shoes"), ("Sneakers", "Shoes")):
        if n.startswith(pre): return s
def female(n):
    return "_F" in n or n.startswith(("Hijab", "Pashmina", "Skirt", "Heels")) or n in ("Top_kebaya", "Top_white", "Top_white_b", "Top_vest", "Top_vest_black")
SLOTS = {"female": ["Skin", "Face", "Hair", "Hijab", "Top", "Bottom", "Shoes"], "male": ["Skin", "Face", "Hair", "Top", "Bottom", "Shoes"]}
DEFAULT = {"female": ["Body_F_light", "Face_F", "Hijab_basic", "Top_kebaya", "Skirt_batik_maroon", "Heels_cream"],
           "male": ["Body_M_med", "Face_M", "Hair_M_black", "Top_batik_long", "Pants_M_cream", "Shoes_M_brown"]}
order = list(LABELS)
for o in bpy.data.objects:
    if o.type == 'MESH':
        o["label"] = LABELS.get(o.name, o.name)
        o["order"] = order.index(o.name) if o.name in order else 999

full = os.path.join(out, "_all.blend")
bpy.ops.wm.save_as_mainfile(filepath=full)
for g, slots in SLOTS.items():
    bpy.ops.wm.open_mainfile(filepath=full)
    sc = bpy.context.scene
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and (female(o.name) != (g == "female"))]:
        bpy.data.objects.remove(o, do_unlink=True)
    rig = bpy.data.objects["Guest_Rig"]
    cols = {}
    for s in ["Rig"] + slots:
        c = bpy.data.collections.new(s); sc.collection.children.link(c); cols[s] = c
    for o in list(bpy.data.objects):
        s = "Rig" if o is rig else slot(o.name) if o.type == 'MESH' else None
        if not s: continue
        for c in list(o.users_collection): c.objects.unlink(o)
        cols[s].objects.link(o)
    lc = bpy.context.view_layer.layer_collection.children
    for o in bpy.data.objects:
        if o.type == 'MESH':
            show = o.name in DEFAULT[g]; o.hide_set(not show); o.hide_render = not show
    # open standing, in the rest pose, with every animation kept for the Action editor
    for a in bpy.data.actions: a.use_fake_user = True
    if rig.animation_data:
        for t in list(rig.animation_data.nla_tracks): rig.animation_data.nla_tracks.remove(t)
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
    t = bpy.data.texts.new("README")
    t.write("Character creator parts (%s).\n\n"
            "Each collection is one step of the creator; each mesh in it is one choice.\n"
            "  label  (custom property): the name the guest sees\n"
            "  order  (custom property): position in the list (lower first)\n"
            "To add a choice: duplicate a mesh in the same collection (Shift+D, then Esc), keep it parented to\n"
            "Guest_Rig with its Armature modifier, recolour or reshape it, rename it and set its label.\n"
            "Then: blender -b -P tools/guests/export_modular.py -- assets/chars/blenderfilesmodular assets/chars\n" % g)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    bpy.ops.file.pack_all()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, g + ".blend"), compress=True)
    print("SAVED", g, {s: sorted(o.name for o in cols[s].objects) for s in slots})
os.remove(full)

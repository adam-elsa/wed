# More batik choices, added to the modular files in place (re-runnable):
#   python batik_textures.py tex
#   blender -b -P add_batik.py -- <repo>/assets/chars/blenderfilesmodular tex
#
# Each one is an existing garment's shape (the long- or short-sleeved shirt, the kebaya-cut blouse, the
# straight or the pleated long skirt) with a new batik projected onto it the way build.py's pattern() does.
import bpy, sys, os, math

folder, tex = [os.path.abspath(a) for a in sys.argv[sys.argv.index('--') + 1:][:2]]
# name, made from, texture, tile (m), wrapped round (skirts), label
ITEMS = {
    "male": [
        ("Top_batik_megamendung", "Top_batik_long", "mega_mendung", 0.30, False, "Batik mega mendung"),
        ("Top_batik_truntum", "Top_batik_long", "truntum", 0.18, False, "Batik truntum"),
        ("Top_batik_parang_short", "Top_white_trim", "parang_blue", 0.22, False, "Batik parang lengan pendek"),
        ("Top_batik_kawung_short", "Top_white_trim", "kawung_brown", 0.22, False, "Batik kawung lengan pendek"),
    ],
    "female": [
        ("Top_batik_buketan", "Top_kebaya", "buketan", 0.24, False, "Kebaya batik buketan"),
        ("Top_batik_megamendung", "Top_kebaya", "mega_mendung", 0.30, False, "Blus batik mega mendung"),
        ("Top_batik_truntum", "Top_kebaya", "truntum", 0.18, False, "Blus batik truntum"),
        ("Skirt_batik_parang", "Skirt_batik_kawung", "parang_blue", 0.24, True, "Rok batik parang"),
        ("Skirt_batik_megamendung", "Skirt_batik_kawung", "mega_mendung", 0.30, True, "Rok batik mega mendung"),
        ("Skirt_batik_truntum", "Skirt_batik_maroon", "truntum", 0.20, True, "Rok batik truntum"),
        ("Skirt_batik_sidomukti", "Skirt_batik_kawung", "sidomukti", 0.24, True, "Rok batik sidomukti"),
    ],
}

def material(name):
    m = bpy.data.materials.get("Pat_" + name)
    if not m:
        base = next(m for m in bpy.data.materials if m.name.startswith("Pat_"))
        m = base.copy(); m.name = "Pat_" + name
    img = bpy.data.images.get(name)
    if img: bpy.data.images.remove(img)
    img = bpy.data.images.load(os.path.join(tex, name + ".png")); img.name = name; img.pack()
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = img
    return m

def pattern(o, m, tile, cyl):  # as build.py
    o.data.materials.clear(); o.data.materials.append(m)
    for p in o.data.polygons: p.material_index = 0
    uv = o.data.uv_layers[0].data; mw = o.matrix_world
    for p in o.data.polygons:
        n = mw.to_3x3() @ p.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            c = mw @ o.data.vertices[o.data.loops[li].vertex_index].co
            if cyl: uv[li].uv = (math.atan2(c.y, c.x) / (2 * math.pi) * round(0.9 / tile), c.z / tile)
            elif ax == 0: uv[li].uv = (c.y / tile, c.z / tile)
            elif ax == 1: uv[li].uv = (c.x / tile, c.z / tile)
            else: uv[li].uv = (c.x / tile, c.y / tile)

for g, items in ITEMS.items():
    path = os.path.join(folder, g + ".blend")
    bpy.ops.wm.open_mainfile(filepath=path)
    for name, *_ in items:
        o = bpy.data.objects.get(name)
        if o: me = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(me)
    made = []
    for name, src, png, tile, cyl, label in items:
        s = bpy.data.objects[src]
        o = s.copy(); o.data = s.data.copy(); o.name = name; o.data.name = name
        if o.data.shape_keys: o.shape_key_clear()
        for c in s.users_collection: c.objects.link(o)
        pattern(o, material(png), tile, cyl)
        col = s.users_collection[0]
        o["label"] = label
        o["order"] = max(x.get("order", 0) for x in col.objects if x.get("order", 999) < 999 and x is not o) + 1
        o.hide_set(True); o.hide_render = True
        made.append(name)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print("BATIK", g, made)

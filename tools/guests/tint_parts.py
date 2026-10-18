# Trousers, shoes and the peci rajut as one colourable model per shape instead of a model per colour
# (as tint_hijabs.py did for the hijab). Run it once on the files (it has been, on the ones in the repo's folder):
#   blender -b -P tint_parts.py -- <repo>/assets/chars/blenderfilesmodular
#
# For each family, one model is kept and the others (same shape, other colours) removed; their colours
# become its swatches. The kept model's main colour, and a darker shade of it where it has one, go to
# their own materials, "Tint.<name>" and "TintDark.<name>"; the page paints those in the colour the guest
# picks (the dark one a little darker) and leaves the rest alone: soles, buckles, the belt's stitching.
# The peci rajut's knitted texture stays, tinted: its material is "TintMap.<name>".
# Custom properties, as on the hijab: tint (the starting colour), colors (the swatches).
import bpy, os, sys, numpy as np

folder = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
PANTS = ["#1f1f22", "#3b3b40", "#8a8a8a", "#e6ddc8", "#b59d72", "#2b3550", "#6b6a50", "#5a4030", "#7a2e3a", "#f1eee6"]
SHOES = ["#1a1a1a", "#5a3a22", "#8a6448", "#e9dcc9", "#f3f0ea", "#9a9a96", "#2c4fd6", "#7a2e3a", "#c08085", "#2b3550"]
KNIT = ["#ffffff", "#3a3a3c", "#9fb4dc", "#8a6448", "#7a2e3a", "#93a184", "#2b3550", "#c9a96e"]
# new name, kept model, the other colours of it (removed), label, swatches, knitted
FAMILIES = {
    "male": [
        ("Pants_M_basic", "Pants_M_cream", ["Pants_M_black", "Pants_M_navy", "Pants_M_olive"], "Celana bahan", PANTS, False),
        ("Pants_belt_basic", "Pants_navy", ["Pants_black", "Pants_purple"], "Celana bersabuk", PANTS, False),
        ("Shoes_M_basic", "Shoes_M_brown", ["Shoes_M_black"], "Pantofel", SHOES, False),
        ("Shoes_basic", "Shoes_black", ["Shoes_purple"], "Sepatu", SHOES, False),
        ("Sneakers_basic", "Sneakers_white", ["Sneakers_grey"], "Sneakers", SHOES, False),
        ("Rajut_basic", "Rajut_white", ["Rajut_black", "Rajut_blue", "Rajut_brown"], "Peci rajut", KNIT, True),
    ],
    "female": [
        ("Pants_F_basic", "Pants_F_black", [], "Celana panjang", PANTS, False),
        ("Pants_F_wide_basic", "Pants_F_wide_white", [], "Kulot", PANTS, False),
        ("Shoes_F_basic", "Shoes_F_cream", ["Shoes_F_black", "Shoes_F_white"], "Flat", SHOES, False),
        ("Heels_basic", "Heels_cream", ["Heels_blue"], "Hak tinggi", SHOES, False),
    ],
}

# the sneakers: what covers most of them is the white sole and laces; the upper is the next colour,
# and that is the one the guest picks (no darker shade: the sole stays white)
UPPER = {"Sneakers_basic"}
_px = {}
def image(m): return next((n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'), None) if m and m.node_tree else None
def face_rgb(o, p):
    m = o.data.materials[p.material_index]; img = image(m)
    if img is None:  # a plain material (an earlier run): its own colour
        b = m.node_tree.nodes.get("Principled BSDF") if m.node_tree else None
        return np.array(b.inputs[0].default_value[:3] if b else m.diffuse_color[:3]) ** (1 / 2.2)
    if img.name not in _px:
        w, h = img.size; _px[img.name] = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]
    a = _px[img.name]; h, w, _ = a.shape; uv = o.data.uv_layers[0].data
    u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total; v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
    return a[int((v % 1) * h) % h, int((u % 1) * w) % w]
def hexc(c): return '#%02x%02x%02x' % tuple(int(max(0, min(1, x)) * 255) for x in c)
def main_colour(o, skip=None):
    """the colour covering most of the mesh (leaving out `skip`, to find the next one)"""
    tally = {}
    for p in o.data.polygons:
        c = face_rgb(o, p); k = tuple((c * 10).round().astype(int))
        if skip is not None and np.abs(c - skip).max() < 0.06: continue
        s, n = tally.get(k, (np.zeros(3), 0.0)); tally[k] = (s + c * p.area, n + p.area)
    s, n = max(tally.values(), key=lambda t: t[1]); return s / n
def plain(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; b = m.node_tree.nodes.get("Principled BSDF")
    lin = [x ** 2.2 for x in rgb] + [1]
    b.inputs[0].default_value = lin; m.diffuse_color = lin; m.use_backface_culling = False
    return m

for g, fams in FAMILIES.items():
    path = os.path.join(folder, g + ".blend")
    bpy.ops.wm.open_mainfile(filepath=path)
    _px.clear()  # each file has its own palette
    for new, keep, others, label, swatches, knit in fams:
        o = bpy.data.objects.get(keep) or bpy.data.objects.get(new)
        if o is None: print("MISSING", keep); continue
        colours = []
        for n in [o.name] + others:
            x = bpy.data.objects.get(n)
            if x: colours.append(hexc(main_colour(x)))
        for n in others:
            x = bpy.data.objects.get(n)
            if x: me = x.data; bpy.data.objects.remove(x, do_unlink=True); bpy.data.meshes.remove(me)
        main = main_colour(o)
        if new in UPPER:
            main = main_colour(o, skip=main)
        if knit:
            # the white knit, tinted: keep its textured material, renamed so the page knows to tint it
            o.data.materials[0].name = "TintMap." + new
            tint = "#ffffff"
        else:
            tm, dm = plain("Tint." + new, main), plain("TintDark." + new, main * 0.8)
            mats = list(o.data.materials)
            o.data.materials.append(tm); o.data.materials.append(dm)
            ti, di = len(mats), len(mats) + 1
            moved = {"main": 0, "dark": 0}
            for p in o.data.polygons:
                c = face_rgb(o, p) if p.material_index < len(mats) else None
                if c is None: continue
                if np.abs(c - main).max() < 0.06: p.material_index = ti; moved["main"] += 1
                else:
                    # a darker shade of the same colour (creases, seams): it follows the tint too
                    r = c / np.maximum(main, 1e-3)
                    if new not in UPPER and 0.45 < r.mean() < 0.97 and np.ptp(r) < 0.12 and main.max() > 0.08:
                        p.material_index = di; moved["dark"] += 1
            tint = hexc(main)
            print("  ", new, moved, "of", len(o.data.polygons), "faces")
        o.name = new; o.data.name = new
        o["label"] = label; o["tint"] = tint
        o["colors"] = ",".join(dict.fromkeys([tint] + ([] if knit else colours) + swatches))  # a knit's old colours are its texture's, too grey
        print("TINT", g, new, tint, "was", colours)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)

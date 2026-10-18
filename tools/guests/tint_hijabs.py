# One hijab and one pashmina, coloured in the creator, instead of a model per colour:
#   blender -b -P tint_hijabs.py -- <repo>/assets/chars/blenderfilesmodular/female.blend
# Keeps Hijab_beige's and Pashmina_pink's shapes (renamed Hijab_basic and Pashmina_basic) and removes
# the other colours. Each keeps two custom properties for the creator:
#   tint    the colour it starts in, as #rrggbb
#   colors  the ready-made colours offered beside the colour wheel, comma-separated
# (the page paints the whole piece in the chosen colour; the colour it has in Blender is just for show).
import bpy, sys

blend = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.open_mainfile(filepath=blend)
COLORS = "#c49f7c,#eeebe4,#1f1d1f,#2b3653,#93a184,#c08085,#8a6a55,#a99ab8,#7a2e3a,#3f5e4a"
KEEP = {"Hijab": ("Hijab_beige", "Hijab_basic", "Hijab", "#c49f7c", 0),
        "Pashmina": ("Pashmina_pink", "Pashmina_basic", "Pashmina", "#c08085", 1)}
for kind, (old, new, label, tint, order) in KEEP.items():
    keep = bpy.data.objects.get(old) or bpy.data.objects.get(new)
    for o in [o for o in bpy.data.collections["Hijab"].objects if o.name.startswith(kind + "_") and o is not keep]:
        me = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(me)
    keep.name = new; keep.data.name = new
    keep["label"] = label; keep["order"] = order; keep["tint"] = tint; keep["colors"] = COLORS
    print("KEPT", new, len(keep.data.vertices), "verts")
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)

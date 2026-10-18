# Give every hijab the shape of Hijab_beige (after editing it by hand), keeping each one's own colour:
#   blender -b -P sync_hijabs.py -- <repo>/assets/chars/blenderfilesmodular/female.blend
# Pashminas are left alone. Each hijab is a solid colour, so its colour is one spot on its texture:
# the copy of the beige mesh gets that spot on every face, and the hijab's name, label and order.
import bpy, sys
from collections import Counter

blend = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.open_mainfile(filepath=blend)
src = bpy.data.objects["Hijab_beige"]
for old in [o for o in bpy.data.collections["Hijab"].objects if o.name.startswith("Hijab_") and o is not src]:
    # the colour it has now: its material and UV spot (the one most of its faces use)
    uv = old.data.uv_layers[0].data
    spot = Counter((old.data.materials[p.material_index], tuple(uv[p.loop_indices[0]].uv)) for p in old.data.polygons).most_common(1)[0][0]
    name, props = old.name, dict(old.items())
    hidden, hidden_r, cols = old.hide_get(), old.hide_render, list(old.users_collection)
    me = old.data; bpy.data.objects.remove(old, do_unlink=True); bpy.data.meshes.remove(me)
    o = src.copy(); o.data = src.data.copy(); o.name = name; o.data.name = name
    for c in cols: c.objects.link(o)
    o.data.materials.clear(); o.data.materials.append(spot[0])
    nuv = o.data.uv_layers[0].data
    for p in o.data.polygons:
        p.material_index = 0
        for li in p.loop_indices: nuv[li].uv = spot[1]
    for k, v in props.items(): o[k] = v
    o.hide_set(hidden); o.hide_render = hidden_r
    print("SYNCED", name, len(o.data.vertices), "verts,", spot[0].name, tuple(round(x, 3) for x in spot[1]))
bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)

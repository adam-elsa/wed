# The character creator's parts, from the modular .blend files to the web:
#   blender -b -P export_modular.py -- <folder with female.blend, male.blend> <assets/chars>
# -> avatar_female.glb, avatar_male.glb (every part on the skeleton, all 12 animations)
#    avatar.json: per gender, each slot's choices in order ({id, label, swatch}) and the default look
#    (whichever choice is left showing in the .blend).
import bpy, sys, os, json, numpy as np

src, dst = sys.argv[sys.argv.index('--') + 1:][:2]
SLOTS = ["Skin", "Face", "Hair", "Hijab", "Hat", "Top", "Bottom", "Shoes"]
OPTIONAL = {"Hat"}  # nothing is a choice too: no default unless one is left showing
# the hair's shape key that tucks it under each kind of cap (add_peci.py)
TUCK = {"Peci": "Tuck_peci", "Rajut": "Tuck_rajut"}

_px = {}
def pixels(img):
    if img.name not in _px:
        w, h = img.size; _px[img.name] = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]
    return _px[img.name]
def swatch(o):
    """the colour covering most of the mesh, as the button's dot"""
    uv = o.data.uv_layers[0].data; tally = {}
    for p in o.data.polygons:
        m = o.data.materials[p.material_index]
        img = next((n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'), None) if m and m.node_tree else None
        if not img: continue
        a = pixels(img); h, w, _ = a.shape
        # a patterned cloth is tiled over its UVs: average a few texels around the face's centre
        u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total; v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
        c = a[int((v % 1) * h) % h, int((u % 1) * w) % w]
        k = tuple((c * 7).round().astype(int))
        s, n = tally.get(k, (np.zeros(3), 0.0)); tally[k] = (s + c * p.area, n + p.area)
    s, n = max(tally.values(), key=lambda t: t[1])
    return '#%02x%02x%02x' % tuple(int(x) for x in np.clip(s / n * 255, 0, 255))

manifest = {}
for g in ("female", "male"):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(src, g + ".blend"))
    rig = bpy.data.objects["Guest_Rig"]
    slots, default = {}, {}
    for s in SLOTS:
        c = bpy.data.collections.get(s)
        if not c: continue
        obs = sorted([o for o in c.all_objects if o.type == 'MESH'], key=lambda o: (o.get("order", 999), o.name))
        slots[s] = [{"id": o.name, "label": o.get("label", o.name), "swatch": swatch(o)} for o in obs]
        for c in slots[s]:
            t = TUCK.get(c["id"].split("_")[0])
            if s == "Hat" and t: c["tuck"] = t
        shown = [o for o in obs if not o.hide_get() and not o.hide_render]
        default[s] = shown[0].name if shown else None if s in OPTIONAL else obs[0].name
    for o in bpy.data.objects:
        o.hide_set(False); o.hide_render = False; o.hide_viewport = False
    for lc in bpy.context.view_layer.layer_collection.children: lc.exclude = False; lc.hide_viewport = False
    for c in bpy.data.collections: c.hide_viewport = False; c.hide_render = False
    ad = rig.animation_data or rig.animation_data_create(); ad.action = None
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for act in bpy.data.actions:
        tr = ad.nla_tracks.new(); tr.name = act.name; st = tr.strips.new(act.name, int(act.frame_range[0]), act); st.name = act.name
    glb = "avatar_%s.glb" % g
    bpy.ops.export_scene.gltf(filepath=os.path.join(dst, glb), export_format='GLB', export_animation_mode='NLA_TRACKS',
                              export_image_format='JPEG', export_jpeg_quality=90, export_extras=False)
    manifest[g] = {"glb": glb, "slots": slots, "default": default}
    print("EXPORTED", g, {s: len(v) for s, v in slots.items()})
json.dump(manifest, open(os.path.join(dst, "avatar.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("WROTE avatar.json")

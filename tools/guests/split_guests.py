# One .blend per guest, cut from guests.blend: just that guest's meshes, the shared skeleton
# (Guest_Rig) and every animation, with the textures packed in, so each file opens on its own.
#   blender -b -P split_guests.py -- <guests.blend> <guests.json> <out folder>
import bpy, sys, json, os

blend, manifest, out = sys.argv[sys.argv.index('--') + 1:][:3]
os.makedirs(out, exist_ok=True)
G = json.load(open(manifest))
for key, names in G.items():
    bpy.ops.wm.open_mainfile(filepath=blend)
    keep = set(names)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    for a in bpy.data.actions:
        a.use_fake_user = True  # keep the animations even with nothing playing them
    rig = bpy.data.objects["Guest_Rig"]
    if rig.animation_data:
        for t in list(rig.animation_data.nla_tracks):
            rig.animation_data.nla_tracks.remove(t)
        rig.animation_data.action = None
    for pb in rig.pose.bones:  # open standing in the rest pose, not wherever the last animation left it
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    bpy.ops.file.pack_all()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in bpy.data.objects:
        o.select_set(o.type == 'MESH')
    bpy.context.view_layer.objects.active = rig
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, key + ".blend"), compress=True)
    print("SAVED", key, len(meshes), "meshes", sorted(o.name for o in meshes))

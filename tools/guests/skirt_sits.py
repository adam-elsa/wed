# The pack's sitting animations all cross the legs, which no skirt can follow. Make skirt versions:
# the same upper body, with both legs held in the pose of the leg that stays down (mirrored), knees together.
import bpy, sys
f = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.open_mainfile(filepath=f)
rig = bpy.data.objects["Guest_Rig"]; sc = bpy.context.scene
ad = rig.animation_data or rig.animation_data_create()
LEG = ["UpLeg", "Leg", "Foot", "ToeBase"]
print("MODE", rig.pose.bones["LeftUpLeg"].rotation_mode)
for src_name, new_name in [("SitTalk_F", "SitTalk_Skirt"), ("Sit_F", "Sit_Skirt")]:
    if new_name in bpy.data.actions: bpy.data.actions.remove(bpy.data.actions[new_name])
    src = bpy.data.actions[src_name]; ad.action = src
    f0 = int(sum(src.frame_range) / 2); sc.frame_set(f0)
    feet = {s: (rig.matrix_world @ rig.pose.bones[s + "Foot"].head).z for s in ("Left", "Right")}
    down = min(feet, key=feet.get); up = "Right" if down == "Left" else "Left"
    pose = {}
    for b in LEG:
        pb = rig.pose.bones[down + b]
        q = pb.rotation_quaternion.copy(); loc = pb.location.copy()
        pose[down + b] = (q, loc)
        pose[up + b] = ((q.w, q.x, -q.y, -q.z), (-loc.x, loc.y, loc.z))   # mirror across x
    new = src.copy(); new.name = new_name; new.use_fake_user = True
    for fc in list(new.fcurves):
        if any(f'pose.bones["{s}{b}"]' in fc.data_path for s in ("Left", "Right") for b in LEG): new.fcurves.remove(fc)
    fs, fe = src.frame_range
    for bn, (q, loc) in pose.items():
        g = new.groups.get(bn) or new.groups.new(bn)
        for i, val in enumerate(q):
            fc = new.fcurves.new(f'pose.bones["{bn}"].rotation_quaternion', index=i, action_group=bn)
            fc.keyframe_points.insert(fs, val); fc.keyframe_points.insert(fe, val)
        for i, val in enumerate(loc):
            fc = new.fcurves.new(f'pose.bones["{bn}"].location', index=i, action_group=bn)
            fc.keyframe_points.insert(fs, val); fc.keyframe_points.insert(fe, val)
    print("MADE", new_name, "from", src_name, "down leg", down, "frames", fs, fe)
ad.action = None
bpy.ops.wm.save_as_mainfile(filepath=f)

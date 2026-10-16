import bpy, sys, os, math, json
S = sys.argv[sys.argv.index('--') + 1]; OUT = S + "/build"
args = sys.argv[sys.argv.index('--') + 2:]
view = args[0] if args else "front"   # front | side | pose
bpy.ops.wm.open_mainfile(filepath=OUT + "/guests.blend")
G = json.load(open(OUT + "/guests.json"))
sc = bpy.context.scene; arm = bpy.data.objects["Guest_Rig"]
if view == "pose":
    arm.animation_data_create(); arm.animation_data.action = bpy.data.actions[args[1] if len(args)>1 else "SitTalk_F"]; sc.frame_set(int(args[2]) if len(args)>2 else 20)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.9
a = math.radians(0 if view == "front" else 60)
cam.location = (10 * math.sin(a), -10 * math.cos(a), 0.88); cam.rotation_euler = (math.radians(90), 0, a)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", 'SUN')); sun.data.energy = 3; sun.rotation_euler = (math.radians(50), 0, math.radians(-30)); sc.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x = 240; sc.render.resolution_y = 440
for k, names in [(k, n) for k, n in G.items() if len(args) < 4 or k in args[3].split(",")]:
    for o in bpy.data.objects:
        if o.type == 'MESH': o.hide_render = o.name not in names
    tag = ("_" + args[1]) if len(args) > 1 else ""
    sc.render.filepath = f"{OUT}/r_{view}{tag}_{k}.png"; bpy.ops.render.render(write_still=True)

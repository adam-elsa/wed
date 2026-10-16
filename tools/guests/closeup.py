import bpy, sys, math, json
a = sys.argv[sys.argv.index('--') + 1:]; blend, out, tag = a[0], a[1], a[2]
bpy.ops.wm.open_mainfile(filepath=blend)
G = json.load(open(out + "/guests.json")); sc = bpy.context.scene; arm = bpy.data.objects["Guest_Rig"]
arm.animation_data_create(); arm.animation_data.action = bpy.data.actions["SitTalk_Skirt"]; sc.frame_set(60)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 0.9
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", 'SUN')); sun.data.energy = 3; sun.rotation_euler = (math.radians(50), 0, math.radians(-30)); sc.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x = 300; sc.render.resolution_y = 300
for k in ["vest_batik", "white_mini", "pashmina_batik"]:
    for o in bpy.data.objects:
        if o.type == 'MESH': o.hide_render = o.name not in G[k]
    for ang in (60, 130, 230):
        r = math.radians(ang); el = math.radians(20)
        cam.location = (10 * math.sin(r) * math.cos(el), -10 * math.cos(r) * math.cos(el), 0.55 + 10 * math.sin(el)); cam.rotation_euler = (math.radians(90) - el, 0, r)
        sc.render.filepath = f"{out}/c_{tag}_{k}_{ang}.png"; bpy.ops.render.render(write_still=True)

import bpy, sys
a=sys.argv[sys.argv.index('--')+1:]; S,P=a
bpy.ops.wm.open_mainfile(filepath=S+"/build/guests.blend")
arm=bpy.data.objects["Guest_Rig"]; ad=arm.animation_data or arm.animation_data_create(); ad.action=None
for act in bpy.data.actions:
    tr=ad.nla_tracks.new(); tr.name=act.name; st=tr.strips.new(act.name,int(act.frame_range[0]),act); st.name=act.name
bpy.ops.export_scene.gltf(filepath=P+"/guests.glb",export_format='GLB',export_animation_mode='NLA_TRACKS',export_image_format='JPEG',export_jpeg_quality=90)
print("EXPORTED")

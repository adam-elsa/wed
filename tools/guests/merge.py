import bpy, sys, numpy as np
D=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.open_mainfile(filepath=D+"/guests.blend")
RIG=bpy.data.objects["Guest_Rig"]
SETS={"hijab_kebaya":["Hijab_beige","Top_kebaya","Body_F_light"],"pashmina_batik":["Hijab_pink","Top_white_b","Skirt_batik_maroon","Heels_cream","Body_F_med"]}
basepal=np.array(bpy.data.images["Palette"].pixels[:]) if "Palette" in bpy.data.images else None
for key,names in SETS.items():
    with bpy.data.libraries.load(f"{D}/{key}.blend") as (src,dst): dst.objects=[n for n in src.objects if n in names]
    for new in dst.objects:
        name=new.name.split(".")[0]; old=bpy.data.objects[name]
        bpy.context.scene.collection.objects.link(new)
        for i,m in enumerate(new.data.materials):
            if m and m.name.startswith("Palette") and basepal is not None:
                img=[n.image for n in m.node_tree.nodes if n.type=='TEX_IMAGE'][0]
                if not np.allclose(np.array(img.pixels[:]),basepal,atol=0.01): print("WARN palette edited in",key)
            om=old.data.materials[i] if i<len(old.data.materials) else None
            if m and om and m.name.split(".")[0]==om.name.split(".")[0]: new.data.materials[i]=om
        mpi=new.matrix_parent_inverse.copy(); new.parent=RIG; new.matrix_parent_inverse=mpi
        for md in new.modifiers:
            if md.type=='ARMATURE': md.object=RIG
        bpy.data.objects.remove(old,do_unlink=True); new.name=name; new.data.name=name
        print("MERGED",key,name,len(new.data.vertices),[m.name for m in new.data.materials])
for o in [o for o in bpy.data.objects if o.type=='ARMATURE' and o is not RIG]: bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
for a in bpy.data.actions: a.use_fake_user=True
bpy.ops.wm.save_as_mainfile(filepath=D+"/guests.blend")
import shutil; shutil.copy(D+"/guests.blend", sys.argv[sys.argv.index('--')+2])
print("SAVED")

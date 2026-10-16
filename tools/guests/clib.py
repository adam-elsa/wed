import bpy, os, math, mathutils, numpy as np
X=None
def setup(scratch):
    global X; X=scratch+"/chars_x"
C=lambda: X+"/Casino_Free_fbx/Casino_Free_Characters_fbx/"
def fix_images():
    for im in bpy.data.images:
        for d in ["Casino_Free_fbx/textures","Separate_assets_fbx"]:
            p=os.path.join(X,d,os.path.basename(im.filepath))
            if os.path.exists(p): im.filepath=p; im.reload(); break
def imp(name):
    before=set(bpy.data.objects); bact=set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=C()+name+".fbx")
    fix_images()
    new=[o for o in bpy.data.objects if o not in before]
    return [o for o in new if o.type=='ARMATURE'][0], [o for o in new if o.type=='MESH'], [a for a in bpy.data.actions if a not in bact]
_atlas=None
def atlas():
    global _atlas
    if _atlas is None:
        im=bpy.data.images.load(X+"/Casino_Free_fbx/textures/Textures_4.png",check_existing=True)
        w,h=im.size; a=np.array(im.pixels[:],dtype=np.float32).reshape(h,w,4)[:,:,:3]
        _atlas=a
    return _atlas
def face_colors(o):
    a=atlas(); h,w,_=a.shape; uv=o.data.uv_layers[0].data
    cols=[]; areas=[]
    for p in o.data.polygons:
        u=sum(uv[i].uv.x for i in p.loop_indices)/p.loop_total; v=sum(uv[i].uv.y for i in p.loop_indices)/p.loop_total
        x=min(w-1,max(0,int((u%1)*w))); y=min(h-1,max(0,int((v%1)*h)))
        cols.append(a[y,x]); areas.append(p.area)
    return np.array(cols), np.array(areas)
def clusters(o, thr=0.12):
    cols,areas=face_colors(o); lab=-np.ones(len(cols),int); cents=[]
    for i,c in enumerate(cols):
        for k,ce in enumerate(cents):
            if np.abs(c-ce).max()<thr: lab[i]=k; break
        else: cents.append(c); lab[i]=len(cents)-1
    tot=[areas[lab==k].sum() for k in range(len(cents))]
    order=np.argsort(tot)[::-1]
    remap={int(k):r for r,k in enumerate(order)}
    lab=np.array([remap[int(l)] for l in lab]); cents=[cents[k] for k in order]; tot=[tot[k] for k in order]
    return lab, cents, np.array(tot)/sum(tot)
def hexc(c): return '#%02x%02x%02x'%tuple(int(max(0,min(1,x))*255) for x in c)
import functools
@functools.lru_cache(None)
def find_uv(target):
    a=atlas(); h,w,_=a.shape; t=np.array([int(target[i:i+2],16)/255 for i in (1,3,5)]) if isinstance(target,str) else np.array(target)
    sub=a[::4,::4]; d=((sub-t)**2).sum(-1)
    # stay off the seams between the atlas's two halves and its edges (mipmaps bleed white there),
    # and prefer flat spots so a collapsed UV still reads as one colour
    hh,ww=d.shape; ys=np.arange(hh)[:,None]; xs=np.arange(ww)[None,:]
    bad=(np.minimum(np.abs(ys-0),np.minimum(np.abs(ys-hh//2),np.abs(ys-hh)))<8)|(xs<4)|(xs>ww-16)
    gy,gx=np.gradient(sub.mean(-1)); d=d+bad*10+(np.abs(gx)+np.abs(gy))*0.5
    y,x=np.unravel_index(np.argmin(d),d.shape)
    return ((x*4+2)/w,(y*4+2)/h), hexc(sub[y,x])
def recolor(o, spec, thr=0.12):
    """spec: {cluster_rank:int or 'all' or 'rest': '#rrggbb'}"""
    lab,cents,frac=clusters(o,thr); uv=o.data.uv_layers[0].data
    for i,p in enumerate(o.data.polygons):
        r=int(lab[i]); t=spec.get(r, spec.get('rest') if r!=0 or 0 not in spec else None)
        if 'all' in spec: t=spec['all']
        if t is None: continue
        (u,v),_=find_uv(t)
        for li in p.loop_indices: uv[li].uv=(u,v)
def rebind(meshes, arm):
    for o in meshes:
        mw=o.matrix_world.copy(); o.parent=arm; o.matrix_world=mw
        for m in o.modifiers:
            if m.type=='ARMATURE': m.object=arm
def delete_obj(o):
    bpy.data.objects.remove(o, do_unlink=True)
def drop_rig(arm, actions):
    for a in actions: bpy.data.actions.remove(a)
    delete_obj(arm)

# ---- colours the pack's atlas doesn't have (beige, khaki, dusty pink...) go to a small palette texture
PAL=[]; PAL_MAT=None; PAL_N=8
def pal_material(base_mat):
    global PAL_MAT
    if PAL_MAT is None:
        img=bpy.data.images.new("Palette",PAL_N*16,PAL_N*16,alpha=False)
        PAL_MAT=base_mat.copy(); PAL_MAT.name="Palette"
        for n in PAL_MAT.node_tree.nodes:
            if n.type=='TEX_IMAGE': n.image=img; n.interpolation='Closest'
    return PAL_MAT
def pal_uv(hexc):
    if hexc not in PAL: PAL.append(hexc)
    i=PAL.index(hexc); return ((i%PAL_N+0.5)/PAL_N, (i//PAL_N+0.5)/PAL_N)
def save_palette(path):
    if PAL_MAT is None: return
    img=bpy.data.images["Palette"]; n=PAL_N*16; px=np.ones((n,n,4),np.float32)
    for i,h in enumerate(PAL):
        c=[int(h[k:k+2],16)/255 for k in (1,3,5)]; x,y=(i%PAL_N)*16,(i//PAL_N)*16
        px[y:y+16,x:x+16,:3]=c
    img.pixels=px.ravel().tolist(); img.filepath_raw=path; img.file_format='PNG'; img.save()
def recolor2(o, spec, base_mat, tol=0.025):
    """like recolor, but a colour the atlas can't match within tol goes to the palette instead"""
    lab,cents,frac=clusters(o); uv=o.data.uv_layers[0].data
    pm=None
    for i,p in enumerate(o.data.polygons):
        r=int(lab[i]); t=spec.get('all', spec.get(r))
        if t is None: continue
        (u,v),got=find_uv(t)
        err=max(abs(int(t[k:k+2],16)-int(got[k:k+2],16)) for k in (1,3,5))/255
        if err>tol:
            if pm is None:
                pm=pal_material(base_mat)
                if pm.name not in [m.name for m in o.data.materials]: o.data.materials.append(pm)
                pmi=[m.name for m in o.data.materials].index(pm.name)
            u,v=pal_uv(t); p.material_index=pmi
        for li in p.loop_indices: uv[li].uv=(u,v)

# Skirts: smooth weights so a skirt bends as one piece when seated or walking, instead of each
# vertex following whichever leg it happened to be nearest (which tears it open between the legs).
# Top of the skirt rides the hips; down the skirt it hands over to the thighs, then the shins;
# left/right is a smooth blend across the middle, so no vertex is pulled two ways.
import bpy, sys
f = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.open_mainfile(filepath=f)
rig = bpy.data.objects["Guest_Rig"]
def head(n): return rig.matrix_world @ rig.data.bones[n].head_local
hipz, kneez = head("LeftUpLeg").z, head("LeftLeg").z
lx = head("LeftUpLeg").x  # sign of x on the left leg
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
for o in bpy.data.objects:
    if not o.name.startswith("Skirt"): continue
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    G = {n: o.vertex_groups.new(name=n) for n in ["Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]}
    for v in o.data.vertices:
        c = o.matrix_world @ v.co
        side = smooth(-0.07, 0.07, c.x if lx > 0 else -c.x)       # 1 = left leg, 0 = right
        hip = 1 - smooth(hipz - 0.02, hipz - 0.22, c.z) if c.z < hipz else 1.0
        hip = max(0.0, min(1.0, hip))
        shin = smooth(kneez + 0.06, kneez - 0.12, c.z) * 0.85      # below the knee: follow the shins, a bit
        thigh = (1 - hip) * (1 - shin)
        w = {"Hips": hip, "LeftUpLeg": thigh * side, "RightUpLeg": thigh * (1 - side),
             "LeftLeg": (1 - hip) * shin * side, "RightLeg": (1 - hip) * shin * (1 - side)}
        tot = sum(w.values()) or 1
        for n, x in w.items():
            if x / tot > 0.001: G[n].add([v.index], x / tot, 'REPLACE')
    print("REWEIGHTED", o.name, len(o.data.vertices))
bpy.ops.wm.save_as_mainfile(filepath=f)

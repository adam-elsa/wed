# Guests (assets/chars/guests.glb)

12 low-poly guests in ITHappy's Casino Free style, for filling the lobby and ballroom.
All share one skeleton and 12 animations: Idle, Talk, Listen, Clap, Happy, Walk, Sit_F, SitTalk_F, Sit_M, SitTalk_M, and Sit_Skirt / SitTalk_Skirt
(the women's sitting poses with the legs uncrossed, since a skirt can't follow a crossed knee).
`assets/chars/guests.json` lists which meshes make up each guest; show those and hide the rest
(a mesh with two materials loads as a group of two skinned meshes).

Built from Casino_Free_fbx.zip (ithappystudios.com/free/casino-free/) with Blender 4.2, headless:

1. Unzip the pack into `<work>/chars_x/`, and copy `tex/` and these scripts to `<work>/tex/` and `<work>/scripts/`.
2. `python textures.py <work>/tex` (batik, floral and check patterns)
3. `blender -b --factory-startup -P build.py -- <work>` → `<work>/build/guests.blend` + `guests.json`
4. `blender -b -P export_all.py -- <work> <repo>/assets/chars`
5. Optional previews: `blender -b -P render.py -- <work> front|side|pose`, then `python sheet.py <work>/build front`

Colours come from moving UVs inside the pack's gradient atlas; colours it lacks (beige, dusty pink, olive)
go to a small generated palette texture. New garments (hijab, skirts, wide trousers, short sleeves,
sleeveless vest, long hair) are made from the pack's own meshes in `build.py`.

After step 3, two more passes (run on `guests.blend`):

- `blender -b -P reweight_skirts.py -- <work>/build/guests.blend`: smooth skirt weights (hips → thighs → shins,
  left/right blended across the middle) so a skirt bends in one piece instead of tearing between the legs.
- `blender -b -P skirt_sits.py -- <work>/build/guests.blend`: adds Sit_Skirt and SitTalk_Skirt.

Hand edits made in Blender (the two hijab guests were tweaked this way) live in `guests.blend` and its per-guest
copies; `merge.py` copies edited meshes from a per-guest file back into `guests.blend`. Re-running `build.py` would
overwrite them, so re-export from `guests.blend` (step 4) instead. The .blend files are not in git (50 MB).

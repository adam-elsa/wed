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

## The character creator's parts (assets/chars/avatar_*.glb)

The guest's own character is put together from parts instead of fixed outfits. They live in two modular files,
`assets/chars/blenderfilesmodular/female.blend` and `male.blend` (not in git, about 8 MB each): the skeleton with all 12 animations,
and one collection per creator step: Skin, Face, Hair, Hijab (female only), Hat (male only, optional), Top, Bottom, Shoes. Every mesh in a collection is one
choice; its `label` custom property is the name the guest sees and `order` sorts the list. The choice left showing in each
collection is the default. Any top goes with any bottom (checked for clipping at the waist).

- `blender -b -P build_modular.py -- guests.blend <repo>/assets/chars/blenderfilesmodular`: cuts the two files out of `guests.blend`,
  adding what the crowd doesn't have (the deepest skin tone for women), with one hijab and one pashmina to colour.
  Re-running it overwrites hand edits in the modular files, so after editing them only run the export.
- `blender -b -P export_modular.py -- <repo>/assets/chars/blenderfilesmodular <repo>/assets/chars`: writes `avatar_female.glb`,
  `avatar_male.glb` and `avatar.json` (each choice's id, label and colour dot, and the defaults).

Three more scripts add to the modular files in place (each can be run again: it replaces what it added before). Run them after
`build_modular.py`, then export:

- `python peci_textures.py tex`, then `blender -b -P add_peci.py -- <repo>/assets/chars/blenderfilesmodular/male.blend tex`: a Hat
  collection for the men (songkok with a gold embroidered band, a plain one, and peci rajut in four colours), fitted round the
  head and every hairstyle above the ears. Hair that would poke through gets a shape key (`Tuck_peci`, `Tuck_rajut`) that the
  page turns on while that cap is worn.
- `blender -b -P add_suits.py -- <repo>/assets/chars/blenderfilesmodular`: blazers over a plain V-neck tee for both genders (the
  pack's jacket with its shirt and collar taken out; the tee is cut from the body's own chest; the women's blazer is refitted
  to the female body).
- `python batik_textures.py tex`, then `blender -b -P add_batik.py -- <repo>/assets/chars/blenderfilesmodular tex`: more batik
  (mega mendung, truntum, parang, kawung, sidomukti, buketan) on men's long- and short-sleeved shirts, women's blouses and long skirts.

The hijab and the pashmina are one model each (`Hijab_basic`, `Pashmina_basic`) that the guest colours in the creator, from
swatches or a colour wheel. Their custom properties `tint` (the starting colour) and `colors` (the swatches, comma-separated) go
into avatar.json; any mesh given a `tint` becomes colourable the same way. `tint_hijabs.py` turned the earlier one-model-per-colour
file into this (`blender -b -P tint_hijabs.py -- .../female.blend`).

female.blend is now saved with Blender 5.2, which Blender 4.2 can't open: run these scripts with 5.2.

To add a choice: in the modular file, duplicate a mesh inside its collection, keep it parented to Guest_Rig with its Armature
modifier, recolour or reshape it, rename it (the name prefix, e.g. `Top_`, `Skirt_`, `Hijab_`, is how the page knows the slot
when hiding the others; a `Skirt_` bottom also gets the skirt sitting poses), set `label`, and run the export.

`split_guests.py` makes the per-guest files in `assets/chars/blenderfiles/` (one per crowd outfit; also not in git).

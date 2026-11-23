# Wrestler body credits

All three files are built by `game/tools/bodies/build_bodies.py` (Blender 4.5, headless) from Quaternius packs
downloaded from quaternius.com. Every source pack is CC0 1.0 (public domain), per the License.txt in each zip:
https://creativecommons.org/publicdomain/zero/1.0/  Models by @Quaternius (https://www.patreon.com/quaternius).

| File | Source pack | Parts used | License |
|---|---|---|---|
| body_male.glb | Universal Base Characters [Standard] | Superhero_Male_FullBody + Hair_Beard, Hair_Buzzed, Hair_Long, Hair_SimpleParted (rigged to head bone) | CC0 1.0 |
| body_female.glb | Universal Base Characters [Standard] | Superhero_Female_FullBody + Hair_Buns | CC0 1.0 |
| clips.glb | Universal Animation Library [Standard] (UAL1_Standard.glb) | Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Punch_Jab, Hit_Chest | CC0 1.0 |

Textures are downscaled to 1024 px JPEG in the build. Per-character gear (trunks, singlet, stripes, tights,
boots) is painted at runtime by `game/arena/bodies.js` from `game/shared/roster-assets.js`.

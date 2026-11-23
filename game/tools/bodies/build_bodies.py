"""Blender (4.5) build: Quaternius CC0 parts -> compact wrestler GLBs.

blender -b -P build_bodies.py -- <assets-raw dir> <out dir>
  body_male.glb    male base + hair/beard options skinned to its armature (no clips)
  body_female.glb  female base + buns + long hair (no clips)
  clips.glb        armature + the UAL1/UAL2 clips game/shared/anims.js maps (blender ... -- raw out --clips-only)
Textures are downscaled to 1024 and written as JPEG to keep each file small.
"""
import os
import sys

import bpy

RAW, OUT = sys.argv[sys.argv.index("--") + 1:][:2]
UBC = os.path.join(RAW, "x_Universal_Base_Characters", "Universal Base Characters[Standard]")
BASE = os.path.join(UBC, "Base Characters", "Godot - UE")
HAIR = os.path.join(UBC, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)")
UAL = os.path.join(RAW, "x_Universal_Animation_Library", "Universal Animation Library[Standard]", "Unreal-Godot", "UAL1_Standard.glb")
UAL2 = os.path.join(RAW, "x_Universal_Animation_Library_2", "Universal Animation Library 2[Standard]", "Unreal-Godot", "UAL2_Standard.glb")
# Only the clips game/shared/anims.js maps (same skeleton in both libraries).
CLIPS = {
    UAL: ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Crouch_Idle_Loop", "Punch_Jab", "Punch_Cross",
          "Hit_Chest", "Hit_Head", "Death01", "Dance_Loop", "Push_Loop", "Roll", "Jump_Start", "Jump_Land"],
    UAL2: ["Hit_Knockback", "LayToIdle", "Melee_Hook", "Sword_Block", "Idle_Shield_Loop", "Idle_FoldArms_Loop", "Yes",
           "Idle_No_Loop", "ClimbUp_1m"],
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def shrink_images(size=1024):
    for im in bpy.data.images:
        if im.size[0] > size:
            im.scale(size, size)


def export(path, **kw):
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_image_format="JPEG",
                              export_jpeg_quality=82, **kw)
    print("wrote", path, os.path.getsize(path))


def body(base_file, hairs, out_name):
    reset()
    objs = imp(os.path.join(BASE, base_file))
    arm = next(o for o in objs if o.type == "ARMATURE")
    for h in hairs:
        new = imp(os.path.join(HAIR, h + ".gltf"))
        for o in new:
            if o.type == "MESH":
                o.name = h
                o.parent = arm
                for m in o.modifiers:
                    if m.type == "ARMATURE":
                        m.object = arm
        for o in new:
            if o.type == "ARMATURE":
                bpy.data.objects.remove(o)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    shrink_images()
    export(os.path.join(OUT, out_name), export_animations=False)


def clips():
    reset()
    keep = []
    for i, (path, names) in enumerate(CLIPS.items()):
        before = set(bpy.data.actions)
        objs = imp(path)
        for a in bpy.data.actions:
            if a in before:
                continue
            base = a.name.split(".")[0]
            if base in names:
                a.name = base; a.use_fake_user = True; keep.append(a)
        for o in objs:  # the second library's armature duplicates the first: keep only its actions
            if o.type == "MESH" or i > 0:
                bpy.data.objects.remove(o)
    for a in list(bpy.data.actions):
        if a not in keep:
            bpy.data.actions.remove(a)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.animation_data_create()
    for a in keep:  # one NLA track per clip so the exporter writes every action against this armature
        arm.animation_data.nla_tracks.new().strips.new(a.name, 0, a)
    print("kept", sorted(a.name for a in keep))
    export(os.path.join(OUT, "clips.glb"), export_animation_mode="ACTIONS", export_force_sampling=True)


os.makedirs(OUT, exist_ok=True)
if "--clips-only" in sys.argv:
    clips(); sys.exit(0)
body("Superhero_Male_FullBody.gltf", ["Hair_Beard", "Hair_Buzzed", "Hair_Long", "Hair_SimpleParted"], "body_male.glb")
body("Superhero_Female_FullBody.gltf", ["Hair_Buns"], "body_female.glb")
clips()

"""Blender (4.5) build: Quaternius CC0 parts -> compact wrestler GLBs.

blender -b -P build_bodies.py -- <assets-raw dir> <out dir>
  body_male.glb    male base + hair/beard options skinned to its armature (no clips)
  body_female.glb  female base + buns + long hair (no clips)
  clips.glb        armature + the few Universal Animation Library clips the game plays
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
CLIPS = ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Punch_Jab", "Hit_Chest"]


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
    objs = imp(UAL)
    for o in objs:
        if o.type == "MESH":
            bpy.data.objects.remove(o)
    for a in list(bpy.data.actions):
        if not any(a.name.startswith(c) for c in CLIPS):
            bpy.data.actions.remove(a)
    print("kept", [a.name for a in bpy.data.actions])
    export(os.path.join(OUT, "clips.glb"), export_animation_mode="ACTIONS", export_force_sampling=True)


os.makedirs(OUT, exist_ok=True)
body("Superhero_Male_FullBody.gltf", ["Hair_Beard", "Hair_Buzzed", "Hair_Long", "Hair_SimpleParted"], "body_male.glb")
body("Superhero_Female_FullBody.gltf", ["Hair_Buns"], "body_female.glb")
clips()

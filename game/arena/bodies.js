// Wrestler and referee bodies: Quaternius Universal Base Characters (CC0) dressed per roster id.
// Config lives in shared/roster-assets.js; this file loads the GLBs once and builds a dressed clone per id.
// Gear is painted in the body shader (bind-space regions), so one texture serves every character.
import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ROSTER_ASSETS, BODY_URLS, CLIPS_URL, CLIP_NAMES } from '../shared/roster-assets.js';

// Clips come from the Universal Animation Library mannequin: keep rotations, and only the pelvis/root
// translation, so each body keeps its own proportions.
function prepClips(anims) {
  const out = [];
  for (const c of anims) {
    const name = CLIP_NAMES[c.name];
    if (!name) continue;
    const tracks = c.tracks.filter((t) => t.name.endsWith('.quaternion') || /^(pelvis|root)\.position$/.test(t.name));
    out.push(new THREE.AnimationClip(name, c.duration, tracks));
  }
  return out;
}

// The base meshes bind in an A-pose; the move rig (moves/rig.js) poses from a T-pose, so raise the
// upper arms to horizontal before the rig captures rest. Clips are absolute, so they are unaffected.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
function tposeArms(obj) {
  obj.updateMatrixWorld(true);
  for (const [arm, fore, side] of [['upperarm_l', 'lowerarm_l', 1], ['upperarm_r', 'lowerarm_r', -1]]) {
    const A = obj.getObjectByName(arm), F = obj.getObjectByName(fore);
    if (!A || !F) continue;
    A.getWorldPosition(_a); F.getWorldPosition(_b);
    const dir = _b.sub(_a).normalize();
    // Which world side the arm points to decides the target; this works whatever the model's facing.
    const target = new THREE.Vector3(Math.sign(dir.x) || side, 0, 0);
    if (Math.abs(dir.dot(target)) > 0.98) continue;
    _q.setFromUnitVectors(dir, target);
    A.parent.getWorldQuaternion(_pq); A.getWorldQuaternion(_wq);
    A.quaternion.copy(_pq.invert().multiply(_q).multiply(_wq));
    obj.updateMatrixWorld(true);
  }
}

const VERT_HEAD = 'varying vec3 vBind;\n';
const FRAG_HEAD = `varying vec3 vBind;
uniform vec3 uUp, uSide, uFwd; uniform float uMin, uH;
uniform vec3 uSkin, uTrunks, uTop, uTopAlt, uLegs, uBoots;
uniform float uTopKind, uHasLegs;
`;
// Region tests in normalized bind height h (0 feet, 1 head top) and lateral offset s (in body heights).
const FRAG_BODY = `
{
  vec3 base = diffuseColor.rgb;
  float h = (dot(vBind, uUp) - uMin) / uH;
  float s = dot(vBind, uSide) / uH;
  float f = dot(vBind, uFwd) / uH;
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float mx = max(base.r, max(base.g, base.b)), mn = min(base.r, min(base.g, base.b));
  float sat = (mx - mn) / max(mx, 1e-3);
  float gear = 1.0 - smoothstep(0.18, 0.32, sat);           // base trunks/top are desaturated
  float shade = clamp(lum * 3.2, 0.35, 1.15);                // keep the baked folds
  vec3 col = base * uSkin * 1.08;
  col = mix(col, uTrunks * shade, gear);
  float torso = step(0.53, h) * step(h, 0.815) * step(abs(s), 0.105);
  if (uTopKind > 0.5 && uTopKind < 1.5) {                    // singlet: torso, open at the upper chest sides
    float strap = step(h, 0.76) + step(abs(abs(s) - 0.055), 0.022);
    col = mix(col, uTop * shade * 1.6, torso * clamp(strap, 0.0, 1.0));
  } else if (uTopKind > 1.5) {                               // referee stripes: shirt with short sleeves
    float shirt = step(0.53, h) * step(h, 0.825) * step(abs(s), mix(0.105, 0.2, step(0.74, h)));
    float stripe = step(0.5, fract(s * 32.0 + 0.25));
    col = mix(col, mix(uTop, uTopAlt, stripe) * clamp(lum * 2.6, 0.55, 1.1), shirt);
  }
  float legs = step(0.07, h) * step(h, 0.53) * uHasLegs;
  col = mix(col, uLegs * shade * 1.4, legs);
  float boots = step(h, 0.075);
  col = mix(col, uBoots * clamp(lum * 2.0, 0.6, 1.2) + vec3(0.02), boots);
  diffuseColor.rgb = col;
}
`;

function dressMaterial(mat, mesh, cfg) {
  const geo = mesh.geometry; geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  const ax = ['y', 'x', 'z'];                                            // glTF is Y-up; the body faces +Z
  const unit = (k) => new THREE.Vector3(k === 'x' ? 1 : 0, k === 'y' ? 1 : 0, k === 'z' ? 1 : 0);
  const center = geo.boundingBox.getCenter(new THREE.Vector3());
  const up = unit(ax[0]), side = unit(ax[1]), fwd = unit(ax[2]);
  const c = (hex) => new THREE.Color(hex);
  const u = {
    uUp: { value: up }, uSide: { value: side }, uFwd: { value: fwd },
    uMin: { value: geo.boundingBox.min[ax[0]] }, uH: { value: size[ax[0]] },
    uSkin: { value: c(cfg.skin) }, uTrunks: { value: c(cfg.trunks) },
    uTop: { value: c(cfg.top?.color ?? 0) }, uTopAlt: { value: c(cfg.top?.alt ?? 0) },
    uTopKind: { value: cfg.top?.kind === 'singlet' ? 1 : cfg.top?.kind === 'stripes' ? 2 : 0 },
    uLegs: { value: c(cfg.legs ?? 0) }, uHasLegs: { value: cfg.legs == null ? 0 : 1 },
    uBoots: { value: c(cfg.boots) },
  };
  // Side offsets are measured from the body's centerline.
  u.uSideCenter = center[ax[1]];
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>\nvBind = position - vec3(${side.clone().multiplyScalar(u.uSideCenter).toArray().map((n) => n.toFixed(5)).join(',')});`);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_BODY);
  };
  // One program per dressed id: three only runs onBeforeCompile (and binds these uniforms) on a cache miss.
  mat.customProgramCacheKey = () => 'heel-body-' + cfg.key;
}

export async function loadBodies(loader) {
  const [male, female, clipsGltf] = await Promise.all([
    loader.loadAsync(BODY_URLS.male), loader.loadAsync(BODY_URLS.female), loader.loadAsync(CLIPS_URL),
  ]);
  const src = { male, female };
  const animations = prepClips(clipsGltf.animations);
  function make(id) {
    const cfg = ROSTER_ASSETS[id] || ROSTER_ASSETS.vex;
    const obj = skClone(src[cfg.body].scene);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      if (o.name.startsWith('Hair_')) { o.visible = cfg.hair.some((h) => o.name.startsWith(h)); }
      o.material = o.material.clone();
      const mn = o.material.name || '';
      if (mn.startsWith('MI_Superhero')) dressMaterial(o.material, o, { ...cfg, key: ROSTER_ASSETS[id] ? id : 'vex' });
      else if (o.name.startsWith('Hair_') || mn.startsWith('MI_Hair')) o.material.color.set(cfg.hairColor);
    });
    tposeArms(obj);
    obj.scale.set(...cfg.scale);
    return { obj, animations };
  }
  return { make, animations };
}

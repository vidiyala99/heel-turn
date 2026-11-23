// Wrestler and referee bodies: Quaternius Universal Base Characters (CC0) dressed from the character bible.
// Each garment is a skinned shell: a clone of the body mesh that shares its skeleton, pushed out along the
// normal and cut to the garment's shape in the fragment shader. Shells follow every clip and move exactly.
// Cuts use bind-space height plus skin weights (which bone region a vertex belongs to), and the rig's own
// landmarks (hip, knee, ankle, shoulder, elbow, wrist), so they fit both bodies and every build.
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
    const target = new THREE.Vector3(Math.sign(dir.x) || side, 0, 0);
    if (Math.abs(dir.dot(target)) > 0.98) continue;
    _q.setFromUnitVectors(dir, target);
    A.parent.getWorldQuaternion(_pq); A.getWorldQuaternion(_wq);
    A.quaternion.copy(_pq.invert().multiply(_q).multiply(_wq));
    obj.updateMatrixWorld(true);
  }
}

// Bone -> body region. Regions: 0 torso, 1 upper arm, 2 forearm, 3 hand, 4 thigh, 5 calf, 6 foot, 7 head.
function regionOf(name) {
  const n = name.toLowerCase();
  if (/^(hand|thumb|index|middle|ring|pinky)/.test(n)) return 3;
  if (n.includes('lowerarm')) return 2;
  if (n.includes('upperarm')) return 1;
  if (n.includes('calf')) return 5;
  if (n.includes('foot') || n.includes('ball')) return 6;
  if (n.includes('thigh')) return 4;
  if (n.includes('neck') || n.includes('head')) return 7;
  return 0;
}

// Bind-space landmarks, normalized: p = (pos - (sideCenter, min, 0)) / height, mirrored to +x.
function landmarks(mesh, min, H, sideCenter) {
  const sk = mesh.skeleton, out = {};
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  sk.bones.forEach((b, i) => {
    m.copy(sk.boneInverses[i]).invert();
    p.setFromMatrixPosition(m).applyMatrix4(mesh.bindMatrixInverse);
    out[b.name] = new THREE.Vector3(Math.abs(p.x - sideCenter) / H, (p.y - min) / H, p.z / H);
  });
  const g = (n, fb) => out[n] || out[fb] || new THREE.Vector3();
  return {
    sh: g('upperarm_l'), el: g('lowerarm_l'), wr: g('hand_l'),
    hip: g('thigh_l').y, knee: g('calf_l').y, ankle: g('foot_l').y,
    waist: g('spine_01', 'pelvis').y, chest: g('spine_03', 'spine_02').y, neck: g('neck_01', 'head').y,
  };
}

const VERT_HEAD = `varying vec3 vP; varying vec3 vN; varying vec4 vRA; varying vec4 vRB;
uniform float uRegion[96]; uniform float uInflate; uniform float uMin, uH, uSideC;
void addRegion(float idx, float w) {
  int r = int(uRegion[int(idx)] + 0.5);
  if (r == 0) vRA.x += w; else if (r == 1) vRA.y += w; else if (r == 2) vRA.z += w; else if (r == 3) vRA.w += w;
  else if (r == 4) vRB.x += w; else if (r == 5) vRB.y += w; else if (r == 6) vRB.z += w; else vRB.w += w;
}
`;
const VERT_BODY = `
vP = vec3((position.x - uSideC) / uH, (position.y - uMin) / uH, position.z / uH);
vN = normal;
vRA = vec4(0.0); vRB = vec4(0.0);
#ifdef USE_SKINNING
addRegion(skinIndex.x, skinWeight.x); addRegion(skinIndex.y, skinWeight.y);
addRegion(skinIndex.z, skinWeight.z); addRegion(skinIndex.w, skinWeight.w);
#endif
transformed += normalize(normal) * uInflate * uH;
`;

// Garment cuts. Each returns coverage m (discard when < 0.5) and writes col / shine (0 matte .. 1 sequin).
const FRAG_HEAD = `varying vec3 vP; varying vec3 vN; varying vec4 vRA; varying vec4 vRB;
uniform int uKind; uniform vec3 uC0, uC1, uC2;
uniform vec3 uSh, uEl, uWr; uniform float uHip, uKnee, uAnkle, uWaist, uChest, uNeck;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float band(float x, float a, float b) { return step(a, x) * step(x, b); }
// parameter along the arm polyline: 0 shoulder, 1 elbow, 2 wrist
float armT(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  vec3 a = uEl - uSh; float t1 = clamp(dot(q - uSh, a) / dot(a, a), 0.0, 1.0);
  vec3 b = uWr - uEl; float t2 = clamp(dot(q - uEl, b) / dot(b, b), 0.0, 1.0);
  float d1 = length(q - (uSh + a * t1)), d2 = length(q - (uEl + b * t2));
  return d1 < d2 ? t1 : 1.0 + t2;
}
`;
const FRAG_BODY = `
{
  vec3 p = vP; float h = p.y, s = p.x, f = p.z, as = abs(s);
  float torso = vRA.x, uarm = vRA.y, farm = vRA.z, hand = vRA.w, thigh = vRB.x, calf = vRB.y, foot = vRB.z, head = vRB.w;
  float arm = uarm + farm + hand, legs = thigh + calf + foot;
  float m = 0.0; vec3 col = uC0; float shine = 0.0;
  float bootTop = uAnkle + 0.5 * (uKnee - uAnkle);
  float front = smoothstep(0.15, 0.6, normalize(vN).z);
  if (uKind == 1) {                                   // trunks: low-rise, waistband in trim
    float top = uHip + 0.055, low = uHip - 0.07 + 0.35 * max(0.0, as - 0.02);
    m = step(0.5, torso + thigh) * band(h, low, top);
    col = mix(uC0, uC1, band(h, top - 0.014, top));
    col = mix(col, uC1, band(h, low, low + 0.008));
  } else if (uKind == 2) {                            // singlet with straps; optional side panel
    float top = uChest + 0.03, low = uHip - 0.07 + 0.35 * max(0.0, as - 0.02);
    float body = band(h, low, top);
    float strap = band(h, top, uNeck - 0.01) * step(abs(as - 0.052), 0.016);
    m = step(0.5, torso + thigh) * step(arm, 0.4) * max(body, strap);
    float panel = step(0.072, as) * band(h, low + 0.02, top);
    col = mix(uC0, uC2, panel);
    col = mix(col, uC1, max(band(h, low, low + 0.009), band(h, top - 0.009, top) * (1.0 - strap)));
    col = mix(col, uC1, strap * step(abs(as - 0.052), 0.005));
  } else if (uKind == 3 || uKind == 9) {              // tights (3) / slacks (9): waist to boot
    float top = uWaist + (uKind == 9 ? 0.02 : 0.005);
    m = step(0.5, torso + legs) * step(arm, 0.4) * band(h, uKind == 9 ? 0.012 : bootTop - 0.02, top);
    col = uC0;
    col = mix(col, uKind == 9 ? vec3(0.02) : uC1, band(h, top - 0.016, top));                 // waistband / belt
    if (uKind == 9) col = mix(col, vec3(0.75), band(h, top - 0.014, top - 0.002) * step(as, 0.012) * front); // buckle
    shine = uKind == 3 ? 0.35 : 0.0;
  } else if (uKind == 4) {                            // boots with laces, toe cap and sole
    m = step(0.5, legs) * step(h, bootTop);
    float lace = front * band(h, uAnkle - 0.015, bootTop - 0.012) * step(0.5, fract(h * 160.0)) * step(abs(fract(s * 70.0) - 0.5), 0.35);
    col = mix(uC0, uC1, lace * step(0.02, as));
    col = mix(col, uC1, band(h, bootTop - 0.01, bootTop));
    col = mix(col, uC2, step(h, 0.012));
    shine = 0.25;
  } else if (uKind == 10) {                           // dress shoes
    m = step(0.5, legs) * step(h, uAnkle + 0.012);
    col = mix(uC0, vec3(0.01), step(h, 0.008)); shine = 0.5;
  } else if (uKind == 5) {                            // knee pads
    float d = abs(h - uKnee + 0.008);
    m = step(0.5, legs) * step(d, 0.034);
    col = mix(uC0, uC1, step(0.027, d));
  } else if (uKind == 6) {                            // elbow tape
    float t = armT(p);
    m = step(0.5, arm) * band(t, 0.86, 1.12);
    col = uC0 * (0.9 + 0.1 * step(0.5, fract(t * 40.0)));
  } else if (uKind == 7) {                            // wrist tape
    float t = armT(p);
    m = step(0.5, farm + hand) * band(t, 1.72, 1.97);
    col = uC0 * (0.88 + 0.12 * step(0.5, fract(t * 55.0)));
  } else if (uKind == 8) {                            // sequin vest: sleeveless, open V front
    float low = uWaist + 0.015;
    float vee = front * step(as, 0.012 + (h - low) * 0.22) * step(0.0, f);
    m = step(0.5, torso) * step(uarm, 0.35) * band(h, low, uNeck - 0.012) * (1.0 - vee);
    float edge = front * step(as, 0.02 + (h - low) * 0.22) + band(h, low, low + 0.008);
    float spark = hash(floor(p * 420.0));
    col = uC0 * (0.75 + 0.6 * spark);
    col = mix(col, uC2 * 0.95, clamp(edge, 0.0, 1.0));
    shine = 1.0;
  } else if (uKind == 11) {                           // long coat: body to mid-thigh, long sleeves, open front
    float low = uHip - 0.16;
    float open = front * step(as, 0.018 + max(0.0, h - uChest) * 0.5) * step(0.0, f);
    float sleeve = step(0.5, uarm + farm) * step(armT(p), 1.82);
    float trunk = step(0.5, torso + thigh) * step(arm, 0.5) * band(h, low, uNeck + 0.005);
    m = max(trunk * (1.0 - open), sleeve);
    float lapel = front * step(as, 0.034 + max(0.0, h - uChest) * 0.5) * (1.0 - open) * trunk;
    float cuff = sleeve * step(1.7, armT(p));
    col = mix(uC0, uC1, clamp(lapel + cuff + band(h, low, low + 0.012) * trunk, 0.0, 1.0));
    shine = 0.2;
  } else if (uKind == 12) {                           // referee shirt: vertical stripes, short sleeves, black collar
    float low = uHip - 0.01;
    float sleeve = step(0.5, uarm) * step(armT(p), 0.55);
    float trunk = step(0.5, torso) * step(arm, 0.5) * band(h, low, uNeck + 0.008);
    m = max(trunk, sleeve);
    float stripe = step(0.5, fract(s * 34.0 + 0.25));
    float sl = step(0.5, fract(p.z * 34.0 + 0.25));
    col = mix(uC0, uC1, sleeve > 0.5 && trunk < 0.5 ? sl : stripe);
    col = mix(col, uC1, trunk * band(h, uNeck - 0.008, uNeck + 0.008));
    col = mix(col, uC1, sleeve * step(0.48, armT(p)));
  }
  if (m < 0.5) discard;
  diffuseColor.rgb = col;
  vShine = shine;
}
`;
const KIND = { trunks: 1, singlet: 2, tights: 3, boots: 4, kneepads: 5, elbowTape: 6, wristTape: 7, vest: 8, slacks: 9, shoes: 10, coat: 11, refShirt: 12 };
// Push-out per garment (fraction of body height); layered pieces sit further out.
const INFLATE = { trunks: 0.0035, singlet: 0.003, tights: 0.0028, boots: 0.006, kneepads: 0.011, elbowTape: 0.004, wristTape: 0.0045,
  vest: 0.007, slacks: 0.0055, shoes: 0.006, coat: 0.011, refShirt: 0.006 };
const FINISH = { // roughness, metalness
  vest: [0.28, 0.55], tights: [0.45, 0.1], boots: [0.42, 0.05], shoes: [0.3, 0.1], kneepads: [0.55, 0], coat: [0.6, 0.05],
};

function garmentMaterial(src, item, cfg, lm, geoInfo, key) {
  const pal = cfg.palette;
  const pick = (k) => new THREE.Color(pal[k] ?? k ?? 0);
  const [rough, metal] = FINISH[item.kind] || [0.7, 0];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: metal, side: THREE.FrontSide });
  mat.normalMap = src.normalMap || null;
  const u = {
    uRegion: { value: geoInfo.region }, uInflate: { value: INFLATE[item.kind] ?? 0.004 },
    uMin: { value: geoInfo.min }, uH: { value: geoInfo.H }, uSideC: { value: geoInfo.sideC },
    uKind: { value: KIND[item.kind] }, uC0: { value: pick(item.color) },
    uC1: { value: pick(item.trim || item.laces || item.stripe || item.color) },
    uC2: { value: pick(item.panel || item.sole || item.trim || item.color) },
    uSh: { value: lm.sh }, uEl: { value: lm.el }, uWr: { value: lm.wr },
    uHip: { value: lm.hip }, uKnee: { value: lm.knee }, uAnkle: { value: lm.ankle },
    uWaist: { value: lm.waist }, uChest: { value: lm.chest }, uNeck: { value: lm.neck },
  };
  if (item.kind === 'boots') u.uC1.value = pick(item.laces);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    sh.fragmentShader = FRAG_HEAD + 'float vShine;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_BODY)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.18, vShine);');
  };
  mat.customProgramCacheKey = () => 'heel-garment-' + key + '-' + item.kind;
  return mat;
}

// Base body: skin tint, and the base texture's built-in briefs recolored to the secondary color.
function skinMaterial(mat, cfg, key) {
  const u = { uSkin: { value: new THREE.Color(cfg.palette.skin) }, uUnder: { value: new THREE.Color(cfg.palette.secondary) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform vec3 uSkin, uUnder;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 base = diffuseColor.rgb;
  float mx = max(base.r, max(base.g, base.b)), mn = min(base.r, min(base.g, base.b));
  float gear = 1.0 - smoothstep(0.18, 0.32, (mx - mn) / max(mx, 1e-3));
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(base * uSkin * 1.08, uUnder * clamp(lum * 3.0, 0.4, 1.1), gear);
}`);
  };
  mat.customProgramCacheKey = () => 'heel-skin-' + key;
}

function dress(mesh, cfg, key) {
  const geo = mesh.geometry; geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const H = bb.max.y - bb.min.y, sideC = (bb.max.x + bb.min.x) / 2;
  const region = new Array(96).fill(0);
  mesh.skeleton.bones.forEach((b, i) => { if (i < 96) region[i] = regionOf(b.name); });
  const lm = landmarks(mesh, bb.min.y, H, sideC);
  const info = { min: bb.min.y, H, sideC, region };
  const shells = cfg.attire.map((item, i) => {
    const s = mesh.clone();                     // SkinnedMesh.copy shares the skeleton and bind matrix
    s.name = 'Garment_' + item.kind;
    s.material = garmentMaterial(mesh.material, item, cfg, lm, info, key);
    s.castShadow = true; s.frustumCulled = false; s.renderOrder = i + 1;
    return s;
  });
  skinMaterial(mesh.material, cfg, key);
  return shells;
}

// The coat's skirt: legs are separate in the base mesh, so a shell cannot bridge them. A flared open-front
// cone hangs from the pelvis bone to just above the knees, in the coat color with a trim hem.
function coatTails(obj, cfg, coat) {
  obj.updateMatrixWorld(true);
  const pelvis = obj.getObjectByName('pelvis');
  const tl = obj.getObjectByName('thigh_l'), tr = obj.getObjectByName('thigh_r'), kn = obj.getObjectByName('calf_l');
  if (!pelvis || !tl || !tr || !kn) return;
  const pl = tl.getWorldPosition(new THREE.Vector3()), pr = tr.getWorldPosition(new THREE.Vector3());
  const k = kn.getWorldPosition(new THREE.Vector3());
  const hipY = (pl.y + pr.y) / 2 + 0.07, w = pl.distanceTo(pr);
  const len = hipY - k.y - 0.04;
  const pal = cfg.palette, open = 1.05;                         // radians left open at the front
  const geo = new THREE.CylinderGeometry(w * 1.02, w * 1.32, len, 32, 24, true, open / 2, 2 * Math.PI - open);
  // hem: vertex colors, trim on the bottom row and the front edges
  const c0 = new THREE.Color(pal[coat.color]), c1 = new THREE.Color(pal[coat.trim]);
  const pos = geo.attributes.position, cols = [];
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const edge = uv.getY(i) < 0.045 || uv.getX(i) < 0.012 || uv.getX(i) > 0.988;
    const c = edge ? c1 : c0; cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide });
  const skirt = new THREE.Mesh(geo, mat);
  skirt.name = 'Garment_coatTails'; skirt.castShadow = true;
  skirt.position.set((pl.x + pr.x) / 2, hipY - len / 2, (pl.z + pr.z) / 2 - w * 0.08);
  obj.add(skirt); obj.updateMatrixWorld(true);
  pelvis.attach(skirt);
}

export async function loadBodies(loader) {
  const [male, female, clipsGltf] = await Promise.all([
    loader.loadAsync(BODY_URLS.male), loader.loadAsync(BODY_URLS.female), loader.loadAsync(CLIPS_URL),
  ]);
  const src = { male, female };
  const animations = prepClips(clipsGltf.animations);
  function make(id) {
    const key = ROSTER_ASSETS[id] ? id : 'vex';
    const cfg = ROSTER_ASSETS[key];
    const obj = skClone(src[cfg.body].scene);
    const adds = [];
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      if (o.name.startsWith('Hair_')) { o.visible = cfg.hair.some((h) => o.name.startsWith(h)); }
      o.material = o.material.clone();
      const mn = o.material.name || '';
      if (mn.startsWith('MI_Superhero') && o.isSkinnedMesh) adds.push([o, dress(o, cfg, key)]);
      else if (o.name.startsWith('Hair_') || mn.startsWith('MI_Hair')) o.material.color.set(cfg.hairColor);
    });
    for (const [o, shells] of adds) for (const s of shells) o.parent.add(s);
    tposeArms(obj);
    const coat = cfg.attire.find((a) => a.kind === 'coat');
    if (coat) coatTails(obj, cfg, coat);
    obj.scale.set(...cfg.scale);
    return { obj, animations };
  }
  return { make, animations };
}

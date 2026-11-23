// CPU render of the ladder scenes, for machines where headless Chromium cannot start.
// Builds the same scene graph ladder.html builds (real Xbot rig, real mountLadder, the SCENES
// in scenes.js, the main.js wrestler tints, a primitive ring), skins every vertex on the CPU,
// and rasterizes flat-shaded triangles with a z-buffer into a PNG. No lights, shadows, textures
// or post: it shows geometry and poses, not the WebGL look.
// Usage (from game/): node ladder/render-cpu.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mountLadder } from './mount.js';
import { SCENES } from './scenes.js';
import { createMatch } from './state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || path.resolve(here, '..', '..', 'docs', 'shots');
const W = 1280, H = 720, SS = 2; // supersample 2x2
const MAT_Y = 1.1, RING = 3.2;

const buf = fs.readFileSync(path.join(here, '..', 'public', 'models', 'Xbot.glb'));
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
const clip = (n) => gltf.animations.find((a) => a.name === n);

function ring(scene) {
  const box = (w, h, d, color, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color })); o.position.set(x, y, z); scene.add(o); };
  box(RING * 2 + 0.6, 0.2, RING * 2 + 0.6, 0xb9bec6, 0, MAT_Y - 0.1, 0);
  box(RING * 2 + 0.7, MAT_Y - 0.2, RING * 2 + 0.7, 0x0b1024, 0, (MAT_Y - 0.2) / 2, 0);
  box(40, 0.02, 40, 0x0c0d12, 0, -0.01, 0);
  const P = RING + 0.15, corners = [[P, P], [-P, P], [-P, -P], [P, -P]];
  for (const [x, z] of corners) box(0.18, 1.5, 0.18, 0xb8c0cc, x, MAT_Y + 0.65, z);
  const ropeColors = [0xd62828, 0xf1f1f1, 0x1d4ed8];
  for (let k = 0; k < 3; k++) for (let s = 0; s < 4; s++) {
    const a = corners[s], b = corners[(s + 1) % 4], y = MAT_Y + 0.4 + k * 0.38;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.07;
    if (a[0] === b[0]) box(0.07, 0.07, len, ropeColors[k], a[0], y, 0); else box(len, 0.07, 0.07, ropeColors[k], 0, y, a[1]);
  }
}

function setup() {
  const scene = new THREE.Scene();
  ring(scene);
  const bot = (tint) => {
    const obj = skClone(gltf.scene);
    obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(tint); if (o.name.includes('Joints')) o.material.color.multiplyScalar(0.45); } });
    scene.add(obj);
    return { obj, mixer: new THREE.AnimationMixer(obj) };
  };
  const a = bot(0xd2563f), b = bot(0x4f7fbf);
  const players = [
    { id: 'p1', name: 'You', human: true, x: -1.8, z: 0.6, yaw: Math.PI / 2, ...a, clips: { idle: clip('idle'), walk: clip('walk') } },
    { id: 'ai', name: 'Silas Crane', x: 1.8, z: -0.9, yaw: -Math.PI / 2, ai: {}, ...b, clips: { idle: clip('idle'), walk: clip('walk') } },
  ];
  const events = [];
  const mode = mountLadder(scene, { players, matY: MAT_Y, ladderStart: { x: 0, z: 2.2, yaw: Math.PI / 2 }, onEvent: (e) => events.push(e) });
  const fresh = () => createMatch({ players, ladder: { x: 0, z: 2.2, yaw: Math.PI / 2 } });
  return { scene, mode, fresh, events };
}

const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
function colorOf(mat, groups, tri) {
  if (!Array.isArray(mat)) return mat;
  const g = groups.find((gr) => tri * 3 >= gr.start && tri * 3 < gr.start + gr.count);
  return mat[g ? g.materialIndex : 0];
}

function render(scene, camPos, camTarget) {
  scene.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.1, 200);
  cam.position.set(...camPos); cam.lookAt(...camTarget); cam.updateMatrixWorld(true);
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const w = W * SS, h = H * SS;
  const rgb = new Float32Array(w * h * 3), zb = new Float32Array(w * h).fill(Infinity);
  for (let y = 0; y < h; y++) { const t = y / h; for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; rgb[i] = 0.05 + 0.04 * (1 - t); rgb[i + 1] = 0.05; rgb[i + 2] = 0.08 + 0.05 * (1 - t); } }
  const light = new THREE.Vector3(0.35, 0.85, 0.4).normalize();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], s = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), toCam = new THREE.Vector3();
  let tris = 0;
  scene.traverse((o) => {
    if (!o.isMesh || !visible(o)) return;
    const g = o.geometry, idx = g.index, count = idx ? idx.count : g.attributes.position.count;
    for (let t = 0; t < count / 3; t++) {
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
        o.getVertexPosition(vi, v[k]); v[k].applyMatrix4(o.matrixWorld);
        s[k].set(v[k].x, v[k].y, v[k].z, 1).applyMatrix4(vp);
      }
      if (s[0].w < 0.1 || s[1].w < 0.1 || s[2].w < 0.1) continue;
      const mat = colorOf(o.material, g.groups, t);
      if (!mat.visible || !mat.color) continue;
      n.crossVectors(e1.subVectors(v[1], v[0]), e2.subVectors(v[2], v[0])).normalize();
      toCam.subVectors(cam.position, v[0]);
      if (n.dot(toCam) < 0) n.negate();
      const shade = mat.isMeshBasicMaterial ? 0.55 + 0.45 * Math.abs(n.dot(light)) : 0.22 + 0.78 * Math.max(0, n.dot(light));
      const em = mat.emissive ? mat.emissiveIntensity || 0 : 0;
      const c = mat.color, cr = c.r * shade + (em ? mat.emissive.r * em : 0), cg = c.g * shade + (em ? mat.emissive.g * em : 0), cb = c.b * shade + (em ? mat.emissive.b * em : 0);
      const P = s.map((q) => [(q.x / q.w * 0.5 + 0.5) * w, (1 - (q.y / q.w * 0.5 + 0.5)) * h, q.z / q.w]);
      const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      if (x0 > x1 || y0 > y1) continue;
      tris++;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const b0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
        const b1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
        const b2 = 1 - b0 - b1;
        if (b0 < 0 || b1 < 0 || b2 < 0) continue;
        const z = b0 * P[0][2] + b1 * P[1][2] + b2 * P[2][2];
        const i = y * w + x;
        if (z < -1 || z > 1 || z >= zb[i]) continue;
        zb[i] = z; rgb[i * 3] = cr; rgb[i * 3 + 1] = cg; rgb[i * 3 + 2] = cb;
      }
    }
  });
  // Downsample, linear -> sRGB, encode PNG.
  const toS = (c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) for (let ch = 0; ch < 3; ch++) {
      let sum = 0;
      for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) sum += rgb[((y * SS + dy) * w + x * SS + dx) * 3 + ch];
      raw[y * (W * 3 + 1) + 1 + x * 3 + ch] = Math.max(0, Math.min(255, toS(Math.min(1, sum / (SS * SS)))));
    }
  }
  return { png: png(raw), tris };
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(raw) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const name of Object.keys(SCENES)) {
  const { scene, mode, fresh, events } = setup();
  mode.setPolicy('ai', null);
  const camera = SCENES[name](mode, fresh, MAT_Y);
  const L = mode.state.ladder;
  const { png: out, tris } = render(scene, camera.pos, camera.target);
  const file = path.join(outDir, `ladder-${name}.png`);
  fs.writeFileSync(file, out);
  console.log(`${name}: ladder ${L.state} rung ${L.rung} holder ${L.holder} winner ${mode.state.winner}; events ${events.map((e) => e.kind).join(',')}; ${tris} tris -> ${file}`);
}

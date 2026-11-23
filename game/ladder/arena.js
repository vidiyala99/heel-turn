// Ring, lights, crowd and big screen, copied from game/main.js so the ladder page looks like the
// main arena. Crowd placement uses a seeded RNG so screenshots are repeatable.
import * as THREE from 'three';

export const RING = 3.2;   // half-size of the mat
export const MAT_Y = 1.1;  // mat height

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function matTexture() {
  const rand = rng(7);
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#b9bec6'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.04})`; g.fillRect(rand() * 1024, rand() * 1024, 3, 3); }
  g.strokeStyle = '#c1121f'; g.lineWidth = 22; g.strokeRect(30, 30, 964, 964);
  g.save(); g.translate(512, 512); g.rotate(-0.12);
  g.font = '900 150px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(193,18,31,0.85)'; g.fillText('HEEL TURN', 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function screenTex(text, sub) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 1024, 512); grd.addColorStop(0, '#2a0508'); grd.addColorStop(1, '#05060a');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
  g.font = '900 150px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#f5c542'; g.fillText(text, 512, 230);
  g.font = '600 40px Inter, sans-serif'; g.fillStyle = '#fff'; g.fillText(sub, 512, 390);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Builds the arena into `scene`. Returns { update(t, hype), ropes, dispose() }.
export function buildArena(scene, { crowd: crowdCount = 1000 } = {}) {
  const added = [];
  const add = (...o) => { scene.add(...o); added.push(...o); };
  add(new THREE.HemisphereLight(0x6677aa, 0x0a0a10, 0.35));

  const mat = new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 0.6, 0.2, RING * 2 + 0.6),
    [0, 0, 0, 0, 0, 0].map((_, i) => i === 2 ? new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.85 })
      : new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.9 })));
  mat.position.y = MAT_Y - 0.1; mat.receiveShadow = true; add(mat);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 0.7, MAT_Y - 0.2, RING * 2 + 0.7),
    new THREE.MeshStandardMaterial({ color: 0x0b1024, roughness: 0.6, metalness: 0.2 }));
  apron.position.y = (MAT_Y - 0.2) / 2; add(apron);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0c0d12, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; add(floor);

  const P = RING + 0.15;
  const postMat = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.9, roughness: 0.25 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0xc1121f, roughness: 0.5 });
  const corners = [[P, P], [-P, P], [-P, -P], [P, -P]];
  for (const [x, z] of corners) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 16), postMat);
    post.position.set(x, MAT_Y + 0.65, z); post.castShadow = true; add(post);
    for (let k = 0; k < 3; k++) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), padMat);
      pad.position.set(x, MAT_Y + 0.4 + k * 0.38, z); add(pad);
    }
  }
  const ropeColors = [0xd62828, 0xf1f1f1, 0x1d4ed8];
  const ropes = [];
  for (let k = 0; k < 3; k++) for (let s = 0; s < 4; s++) {
    const a = corners[s], b = corners[(s + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 10),
      new THREE.MeshStandardMaterial({ color: ropeColors[k], roughness: 0.4, emissive: ropeColors[k], emissiveIntensity: 0.08 }));
    rope.position.set((a[0] + b[0]) / 2, MAT_Y + 0.4 + k * 0.38, (a[1] + b[1]) / 2);
    rope.rotation.set(0, 0, Math.PI / 2);
    if (a[0] === b[0]) rope.rotation.set(Math.PI / 2, 0, 0);
    rope.castShadow = true; add(rope); ropes.push(rope);
  }

  const spots = [];
  for (const [x, z, c] of [[4, 4, 0xffffff], [-4, 4, 0xfff1d6], [-4, -4, 0xffffff], [4, -4, 0xd6e4ff]]) {
    const s = new THREE.SpotLight(c, 55, 30, 0.5, 0.55, 1.4);
    s.position.set(x, 11, z); s.target.position.set(0, MAT_Y, 0);
    s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004;
    add(s, s.target); spots.push(s);
  }
  // A narrow gold key light on the briefcase: the one thing everyone is reaching for.
  const caseKey = new THREE.SpotLight(0xffe2a0, 40, 14, 0.16, 0.6, 1.2);
  caseKey.position.set(0, 11, 0.01); caseKey.target.position.set(0, MAT_Y + 4.5, 0); add(caseKey, caseKey.target);
  const rimA = new THREE.PointLight(0xe8333b, 40, 25); rimA.position.set(-9, 4, -6); add(rimA);
  const rimB = new THREE.PointLight(0x2b8cff, 40, 25); rimB.position.set(9, 4, -6); add(rimB);
  const truss = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.08, 8, 64), postMat);
  truss.rotation.x = Math.PI / 2; truss.position.y = 11; add(truss);

  const rand = rng(42);
  const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.5, 2, 6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowdCount);
  const seats = [];
  const col = new THREE.Color();
  for (let i = 0; i < crowdCount; i++) {
    const row = Math.floor(rand() * 14);
    const r = 8.5 + row * 0.9, a = rand() * Math.PI * 2;
    seats.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.4 + row * 0.55, p: rand() * 6.28 });
    col.setHSL(rand(), 0.35, 0.18 + rand() * 0.25); crowd.setColorAt(i, col);
  }
  add(crowd);
  for (let row = 0; row < 14; row++) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(8.9 + row * 0.9, 8.9 + row * 0.9, 0.55, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x111319, side: THREE.DoubleSide, roughness: 1 }));
    ring.position.y = row * 0.55; add(ring);
  }
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: screenTex('LADDER MATCH', 'HEEL TURN  ·  LIVE') }));
  screen.position.set(0, 10, -19); add(screen);

  const tmp = new THREE.Object3D();
  function update(t, hype = 1) {
    for (let i = 0; i < crowdCount; i++) {
      const s = seats[i];
      tmp.position.set(s.x, s.y + 0.45 + Math.max(0, Math.sin(t * 6 * hype + s.p)) * 0.08 * hype, s.z);
      tmp.lookAt(0, s.y, 0); tmp.updateMatrix(); crowd.setMatrixAt(i, tmp.matrix);
    }
    crowd.instanceMatrix.needsUpdate = true;
    spots.forEach((s, i) => { s.intensity = 52 + Math.sin(t * 0.7 + i) * 5; });
  }
  update(0);
  return {
    update, ropes,
    dispose() { for (const o of added) scene.remove(o); },
  };
}

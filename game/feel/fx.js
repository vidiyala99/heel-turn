// Impact particles: mat dust that rolls outward low and slow, sweat that sprays fast and falls.
// One Points mesh, a fixed pool, per-particle size and alpha in a tiny shader.
import * as THREE from 'three';

const N = 420;
const MAT_Y = 1.1;

export function createFx(scene) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), grav = new Float32Array(N), grow = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;
      void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = size * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard;
      gl_FragColor = vec4(vC, vA * smoothstep(0.25, 0.0, r)); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  let next = 0;

  function spawn(x, y, z, vx, vy, vz, l, s, g, gr, r, gg, b) {
    const i = next; next = (next + 1) % N;
    pos.set([x, y, z], i * 3); vel.set([vx, vy, vz], i * 3); col.set([r, gg, b], i * 3);
    life[i] = max[i] = l; size[i] = s; grav[i] = g; grow[i] = gr;
  }

  return {
    // dust ring where a body lands; power 0..1
    dust(x, z, power = 0.6) {
      const n = Math.round(26 + power * 50);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.2 * (0.5 + power);
        const c = 0.62 + Math.random() * 0.15;
        spawn(x, MAT_Y + 0.05, z, Math.cos(a) * sp, 0.2 + Math.random() * 0.9 * power, Math.sin(a) * sp,
          0.6 + Math.random() * 0.7, 0.08 + Math.random() * 0.1, -0.6, 0.35 + power * 0.3, c, c * 0.96, c * 0.9);
      }
    },
    // sweat spray off a struck body, thrown along the hit direction
    sweat(x, y, z, dirX = 0, dirZ = 0, power = 0.4) {
      const n = Math.round(10 + power * 24);
      for (let k = 0; k < n; k++) {
        const sp = 2 + Math.random() * 3.5;
        spawn(x, y + 1.35 + Math.random() * 0.25, z,
          dirX * sp + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 2, dirZ * sp + (Math.random() - 0.5) * 2,
          0.35 + Math.random() * 0.3, 0.025 + Math.random() * 0.03, -9.8, 0, 0.85, 0.93, 1);
      }
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { alpha[i] = 0; continue; }
        life[i] -= dt; const k = Math.max(0, life[i] / max[i]);
        vel[i * 3 + 1] += grav[i] * dt;
        const damp = Math.pow(grav[i] < -1 ? 0.6 : 0.08, dt);
        vel[i * 3] *= damp; vel[i * 3 + 2] *= damp;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(MAT_Y + 0.02, pos[i * 3 + 1] + vel[i * 3 + 1] * dt); pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] += grow[i] * dt;
        alpha[i] = (grav[i] < -1 ? 0.9 : 0.45) * k * k; // ease-out fade: most of the opacity goes early
      }
      for (const a of ['position', 'size', 'alpha']) geo.attributes[a].needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

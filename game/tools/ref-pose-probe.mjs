// Probe: how upright is Lou in each phase? Loads the real bodies + clips in node.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', 'public');
// node has no image decoder: textures fail to load (logged), geometry and skeletons still parse
globalThis.self ??= globalThis;
const fileLoader = {
  async loadAsync(url) {
    const buf = fs.readFileSync(path.join(pub, url));
    const loader = new GLTFLoader();
    return new Promise((res, rej) => loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
  },
};
export async function loadLou() {
  const { loadBodies } = await import('../arena/bodies.js');
  const bodies = await loadBodies(fileLoader);
  return bodies;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
// Torso lean: angle between pelvis->neck and world up, in degrees.
export function lean(obj) {
  obj.updateMatrixWorld(true);
  obj.getObjectByName('pelvis').getWorldPosition(_a);
  obj.getObjectByName('neck_01').getWorldPosition(_b);
  return THREE.MathUtils.radToDeg(_b.sub(_a).angleTo(new THREE.Vector3(0, 1, 0)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bodies = await loadLou();
  const { obj, animations } = bodies.make('lou');
  console.log('clips', animations.map((c) => c.name).join(','));
  console.log('bind lean', lean(obj).toFixed(1));
  const mixer = new THREE.AnimationMixer(obj);
  for (const name of ['idle', 'walk']) {
    mixer.stopAllAction(); mixer.clipAction(animations.find((c) => c.name === name)).play();
    let mx = 0; for (let i = 0; i < 90; i++) { mixer.update(1 / 30); mx = Math.max(mx, lean(obj)); }
    console.log(name, 'max lean over 3 s', mx.toFixed(1));
  }
}

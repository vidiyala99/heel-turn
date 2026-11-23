// Character studio: one dressed wrestler (or referee Lou) alone on a dark backdrop.
// /studio.html?id=kane&size=1024&yaw=18&frame=full|bust  -> window.STUDIO = { ready, bones, height }
// tools/render_cards.py screenshots this page for the card renders; it is also the attire close-up bench.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadBodies } from '../arena/bodies.js';
import { CHARACTERS } from '../shared/characters.js';

const q = new URLSearchParams(location.search);
const id = q.get('id') || 'kane';
const size = +(q.get('size') || 1024);
const yaw = +(q.get('yaw') || 18) * Math.PI / 180;
const frame = q.get('frame') || 'full';
const ch = CHARACTERS[id];

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(size, size);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080b);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

// three-point light; the rims carry the character's primary and accent colors
const key = new THREE.SpotLight(0xfff3e6, 70, 20, 0.5, 0.6, 1.2); key.position.set(2.5, 4.2, 3.5); key.castShadow = true;
const fill = new THREE.DirectionalLight(0x9fb4ff, 0.7); fill.position.set(-3, 2, 2);
const rim = new THREE.PointLight(ch?.palette.primary ?? 0xffffff, 30, 10); rim.position.set(-1.4, 2.4, -1.8);
const rim2 = new THREE.PointLight(ch?.palette.accent ?? 0xffffff, 16, 10); rim2.position.set(1.6, 1.8, -1.6);
scene.add(key, key.target, fill, rim, rim2);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.85 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const camera = new THREE.PerspectiveCamera(frame === 'bust' ? 22 : 30, 1, 0.05, 50);
const bodies = await loadBodies(new GLTFLoader());
const { obj, animations } = bodies.make(id);
obj.rotation.y = yaw; scene.add(obj);
const mixer = new THREE.AnimationMixer(obj);
const idle = animations.find((c) => c.name === 'idle');
if (idle && q.get('pose') !== 'bind') { mixer.clipAction(idle).play(); mixer.update(+(q.get('t') || 0.6)); }
obj.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(obj);
const h = box.max.y - box.min.y;
if (frame === 'bust') { camera.position.set(0, box.min.y + h * 0.8, h * 1.55); camera.lookAt(0, box.min.y + h * 0.74, 0); }
else if (frame === 'legs') { camera.position.set(0, box.min.y + h * 0.25, h * 1.1); camera.lookAt(0, box.min.y + h * 0.25, 0); }
else { camera.position.set(0, box.min.y + h * 0.55, h * 1.95); camera.lookAt(0, box.min.y + h * 0.5, 0); }
key.target.position.set(0, h * 0.6, 0);

const bones = {};
obj.traverse((o) => { if (o.isBone) { const p = o.getWorldPosition(new THREE.Vector3()); bones[o.name] = [+(p.x / h).toFixed(3), +((p.y - box.min.y) / h).toFixed(3), +(p.z / h).toFixed(3)]; } });
function render() { renderer.render(scene, camera); }
render();
window.STUDIO = { ready: true, bones, height: h, minY: box.min.y, render };

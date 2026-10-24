import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
const list = window.LIST, human = window.HUMAN;
const W = 300, H = 300;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
r.shadowMap.enabled = true;
document.body.appendChild(r.domElement);
const pm = new THREE.PMREMGenerator(r);
const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
const loader = new GLTFLoader();
const load = u => new Promise((res, rej) => loader.load(u, g => res(g.scene), undefined, rej));
const hum = human ? await load(human) : null;
const out = {};
for (const name of list) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#dfe3e8'); scene.environment = env;
  const sun = new THREE.DirectionalLight('#fff', 1.5); sun.position.set(3, 6, 4); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#b9a68c' })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  let m;
  try { m = await load(name); } catch { out[name] = null; continue; }
  scene.add(m);
  const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3());
  if (hum && window.VIEW !== 'front' && window.VIEW !== 'nohuman') { const h = hum.clone(); h.position.set(b.max.x + 0.45, 0, 0); scene.add(h); b.expandByObject(h); }
  // Flèche rouge : direction +Z (face avant attendue par le jeu).
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.03, b.max.z + 0.05), 0.7, 0xff0000, 0.25, 0.18));
  const c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
  if (window.VIEW === 'front') cam.position.set(c.x + size * 0.25, c.y + size * 0.45, c.z + size * 1.35);
  else cam.position.set(c.x + size * 0.75, c.y + size * 0.55, c.z + size * 1.15);
  cam.lookAt(c);
  r.render(scene, cam);
  out[name] = r.domElement.toDataURL('image/jpeg', 0.85);
}
window.RESULT = out;

// Modèles procéduraux pour les objets sans asset libre disponible (voir docs/ASSETS.md).
// Construits à partir de primitives Three.js, avec des matériaux PBR simples.
import * as THREE from 'three';
import { treeModel } from './nature.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0, emissive: opts.emissive || '#000000', emissiveIntensity: opts.ei ?? 1, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 }));
  return matCache.get(k);
}
function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, opts, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, opts));
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function sphere(r, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(color, opts));
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

export function buildProcModel(kind, def, loadGLB) {
  // Arbres et sapins réalistes générés par ez-tree (modèle partagé par essence, orientation aléatoire).
  if (kind === 'tree' || kind === 'pine' || kind === 'bush') return treeModel(kind, Math.floor(Math.random() * 100000), !!globalThis.__liteNature);
  const g = new THREE.Group();
  const add = (...ms) => ms.forEach(m => g.add(m));
  switch (kind) {
    case 'tv':
      add(box(1.8, 0.45, 0.45, '#5b4636', 0, 0, -0.1), box(1.5, 0.85, 0.06, '#111', 0, 0.75, -0.15, { rough: 0.3 }));
      { const scr = box(1.4, 0.75, 0.01, '#3a7bd5', 0, 0.8, -0.11, { emissive: '#2d6fd0', ei: 0.6 }); scr.name = 'screen'; add(scr); }
      break;
    case 'stereo':
      add(box(0.7, 0.5, 0.4, '#2a2a2e', 0, 0, 0), cyl(0.12, 0.12, 0.05, '#555', -0.18, 0.15, 0.2), cyl(0.12, 0.12, 0.05, '#555', 0.18, 0.15, 0.2));
      g.children[1].rotation.x = Math.PI / 2; g.children[2].rotation.x = Math.PI / 2;
      add(box(0.25, 0.7, 0.25, '#1d1d20', -0.55, 0, 0), box(0.25, 0.7, 0.25, '#1d1d20', 0.55, 0, 0));
      break;
    case 'bookshelf': {
      add(box(1.8, 1.9, 0.4, '#7a5230', 0, 0, -0.25));
      const colors = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400'];
      for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) add(box(0.14, 0.3 + (i % 3) * 0.04, 0.3, colors[(i + r * 3) % colors.length], -0.75 + i * 0.18, 0.15 + r * 0.45, -0.2));
      break;
    }
    case 'crib':
      add(box(0.9, 0.1, 0.6, '#f5d6c6', 0, 0.35, 0));
      for (const x of [-0.42, 0.42]) for (const z of [-0.28, 0.28]) add(cyl(0.03, 0.03, 0.8, '#e8c9a8', x, 0, z));
      for (let i = -4; i <= 4; i++) { add(cyl(0.015, 0.015, 0.35, '#fff', i * 0.1, 0.45, 0.28), cyl(0.015, 0.015, 0.35, '#fff', i * 0.1, 0.45, -0.28)); }
      add(box(0.85, 0.08, 0.55, '#9ad1f0', 0, 0.45, 0));
      break;
    case 'toilet':
      add(box(0.45, 0.4, 0.55, '#f4f4f4', 0, 0, 0, { rough: 0.2 }), box(0.45, 0.5, 0.18, '#f4f4f4', 0, 0.35, -0.3, { rough: 0.2 }), box(0.47, 0.04, 0.5, '#e6e6e6', 0, 0.4, 0.03, { rough: 0.2 }));
      break;
    case 'shower':
      add(box(0.95, 0.08, 0.95, '#e9eef2', 0, 0, 0), box(0.95, 2.1, 0.04, '#cfe8f5', 0, 0, -0.46, { opacity: 0.4, rough: 0.05 }), box(0.04, 2.1, 0.95, '#cfe8f5', -0.46, 0, 0, { opacity: 0.4, rough: 0.05 }), box(0.04, 2.1, 0.95, '#cfe8f5', 0.46, 0, 0, { opacity: 0.4, rough: 0.05 }));
      add(cyl(0.02, 0.02, 0.4, '#bbb', 0, 1.8, -0.4, { metal: 0.8 }), cyl(0.12, 0.12, 0.03, '#ccc', 0, 2.0, -0.3, { metal: 0.8 }));
      break;
    case 'bathtub':
      // Baignoire creuse : fond + 4 parois, pour qu'un Sim allongé soit visible dedans.
      add(box(1.8, 0.1, 0.85, '#f7f7f7', 0, 0, 0, { rough: 0.15 }),
        box(1.8, 0.55, 0.1, '#f7f7f7', 0, 0, -0.375, { rough: 0.15 }), box(1.8, 0.55, 0.1, '#f7f7f7', 0, 0, 0.375, { rough: 0.15 }),
        box(0.1, 0.55, 0.85, '#f7f7f7', -0.85, 0, 0, { rough: 0.15 }), box(0.1, 0.55, 0.85, '#f7f7f7', 0.85, 0, 0, { rough: 0.15 }),
        box(1.6, 0.02, 0.65, '#8fd3f4', 0, 0.4, 0, { opacity: 0.45, rough: 0.05 }), cyl(0.03, 0.03, 0.3, '#bbb', -0.8, 0.5, 0, { metal: 0.8 }));
      break;
    case 'sink':
      add(box(0.6, 0.8, 0.45, '#ffffff', 0, 0, -0.2, { rough: 0.2 }), box(0.5, 0.06, 0.35, '#cfd8dc', 0, 0.8, -0.2), box(0.5, 0.6, 0.04, '#bcd9e8', 0, 1.2, -0.42, { metal: 0.6, rough: 0.05 }));
      break;
    case 'computer':
      add(box(0.95, 0.06, 0.6, '#8a6a4a', 0, 0.72, -0.15));
      for (const x of [-0.42, 0.42]) add(box(0.05, 0.72, 0.55, '#6d5238', x, 0, -0.15));
      add(box(0.55, 0.35, 0.04, '#111', 0, 0.85, -0.35, { rough: 0.3 }), box(0.5, 0.3, 0.01, '#4fb3ff', 0, 0.88, -0.325, { emissive: '#3aa0ff', ei: 0.5 }), box(0.4, 0.02, 0.14, '#333', 0, 0.78, -0.08));
      // Chaise devant le bureau.
      add(box(0.45, 0.06, 0.45, '#333', 0, 0.42, 0.62), box(0.45, 0.45, 0.06, '#333', 0, 0.48, 0.85), cyl(0.03, 0.03, 0.42, '#777', 0, 0, 0.62, { metal: 0.7 }));
      break;
    case 'easel':
      add(cyl(0.025, 0.025, 1.6, '#8a5a3c', -0.25, 0, 0), cyl(0.025, 0.025, 1.6, '#8a5a3c', 0.25, 0, 0), cyl(0.025, 0.025, 1.6, '#8a5a3c', 0, 0, -0.3));
      g.children[0].rotation.z = 0.12; g.children[1].rotation.z = -0.12; g.children[2].rotation.x = 0.25;
      add(box(0.7, 0.55, 0.03, '#fdfaf2', 0, 0.75, 0.05));
      add(box(0.2, 0.15, 0.01, '#e74c3c', -0.12, 0.9, 0.07), box(0.25, 0.1, 0.01, '#3498db', 0.1, 1.05, 0.07));
      break;
    case 'guitar': {
      add(cyl(0.02, 0.02, 1.0, '#7a5230', 0.3, 0, -0.25));
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat('#c46a2b', { rough: 0.3 })); body.scale.set(1, 1.3, 0.35); body.position.set(0, 0.45, 0); body.castShadow = true;
      const neck = box(0.07, 0.6, 0.04, '#3d2a1a', 0, 0.68, 0);
      add(body, neck);
      g.rotation.z = -0.1;
      break;
    }
    case 'piano':
      add(box(1.6, 1.25, 0.6, '#1b1b1f', 0, 0, -0.15, { rough: 0.2 }), box(1.4, 0.06, 0.25, '#f2f2f2', 0, 0.72, 0.25), box(0.9, 0.08, 0.35, '#1b1b1f', 0, 0.45, 0.8));
      for (let i = 0; i < 10; i++) add(box(0.05, 0.04, 0.14, '#111', -0.6 + i * 0.13, 0.76, 0.2));
      break;
    case 'treadmill':
      add(box(0.8, 0.15, 1.8, '#2d3436', 0, 0, 0), box(0.7, 0.03, 1.6, '#111', 0, 0.15, 0), cyl(0.03, 0.03, 1.2, '#636e72', -0.35, 0, -0.85, { metal: 0.6 }), cyl(0.03, 0.03, 1.2, '#636e72', 0.35, 0, -0.85, { metal: 0.6 }), box(0.8, 0.25, 0.2, '#2d3436', 0, 1.1, -0.85));
      break;
    case 'punchingbag':
      add(cyl(0.04, 0.04, 2.2, '#555', -0.4, 0, -0.3, { metal: 0.6 }), box(0.6, 0.05, 0.05, '#555', -0.1, 2.15, -0.3), cyl(0.2, 0.2, 0.9, '#c0392b', 0.15, 1.0, -0.3, { rough: 0.8 }));
      break;
    case 'chess':
      add(cyl(0.35, 0.35, 0.05, '#c9a26b', 0, 0.7, 0), cyl(0.05, 0.08, 0.7, '#7a5230', 0, 0, 0));
      { const t = new THREE.CanvasTexture(chessCanvas()); const b = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshStandardMaterial({ map: t })); b.rotation.x = -Math.PI / 2; b.position.y = 0.756; add(b); }
      for (let i = 0; i < 6; i++) add(cyl(0.02, 0.025, 0.06, i % 2 ? '#111' : '#f5f5f5', -0.15 + i * 0.06, 0.75, i % 2 ? 0.15 : -0.15));
      break;
    case 'arcade':
      add(box(0.75, 1.8, 0.7, '#5f27cd', 0, 0, -0.1), box(0.6, 0.45, 0.02, '#00d2d3', 0, 1.15, 0.26, { emissive: '#00d2d3', ei: 0.7 }), box(0.7, 0.1, 0.3, '#341f97', 0, 0.9, 0.3));
      add(sphere(0.04, '#ff3f34', -0.1, 1.0, 0.4), sphere(0.04, '#ffd32a', 0.1, 1.0, 0.4));
      break;
    case 'podium':
      add(box(0.6, 1.1, 0.45, '#6d4c41', 0, 0, -0.1), box(0.65, 0.05, 0.5, '#8d6e63', 0, 1.1, -0.1), cyl(0.01, 0.01, 0.3, '#333', 0, 1.15, 0));
      break;
    case 'grill':
      add(cyl(0.35, 0.3, 0.35, '#2d2d2d', 0, 0.55, 0, { metal: 0.5 }), cyl(0.36, 0.36, 0.03, '#888', 0, 0.88, 0, { metal: 0.8 }));
      for (const a of [0, 2.1, 4.2]) add(cyl(0.025, 0.025, 0.6, '#444', Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25));
      break;
    case 'garden':
      add(box(1.9, 0.25, 0.9, '#6b4423', 0, 0, 0));
      for (let i = 0; i < 6; i++) { add(cyl(0.01, 0.01, 0.25, '#3b7d2b', -0.75 + i * 0.3, 0.25, 0)); add(sphere(0.1, i % 2 ? '#e74c3c' : '#4caf50', -0.75 + i * 0.3, 0.55, 0)); }
      break;
    case 'tree': {
      add(cyl(0.12, 0.18, 1.4, '#7a5230'));
      const leaves = ['#3f8f3a', '#4ea54a', '#5cb85c'];
      add(sphere(0.8, leaves[0], 0, 1.9, 0), sphere(0.6, leaves[1], 0.4, 2.3, 0.2), sphere(0.55, leaves[2], -0.35, 2.2, -0.2));
      break;
    }
    case 'palm': {
      const t = cyl(0.1, 0.15, 3, '#9c7a4a'); t.rotation.z = 0.12; add(t);
      for (let i = 0; i < 7; i++) { const l = box(1.4, 0.04, 0.35, '#3fa34d', 0, 0, 0); l.position.set(Math.cos(i) * 0.6 + 0.35, 3.0, Math.sin(i) * 0.6); l.rotation.y = -i; l.rotation.z = -0.4; add(l); }
      break;
    }
    case 'pine':
      add(cyl(0.1, 0.14, 0.8, '#6b4423'));
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.9 - i * 0.22, 1.2, 10), mat(i % 2 ? '#2f7a3b' : '#276b33')); c.position.y = 1.2 + i * 0.7; c.castShadow = true; add(c); }
      break;
    case 'fence': {
      // Clôture blanche à piquets, le long du bord avant de la case.
      const white = '#f4f1ea';
      add(box(1.0, 0.07, 0.04, white, 0, 0.28, 0.46), box(1.0, 0.07, 0.04, white, 0, 0.72, 0.46));
      for (let i = 0; i < 6; i++) {
        const p = box(0.07, 0.95, 0.025, white, -0.42 + i * 0.168, 0, 0.48);
        add(p);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), mat(white)); tip.position.set(-0.42 + i * 0.168, 1.0, 0.48); tip.rotation.y = Math.PI / 4; tip.castShadow = true; add(tip);
      }
      break;
    }
    case 'mailbox': {
      // Boîte aux lettres américaine sur poteau, drapeau rouge.
      add(box(0.08, 1.05, 0.08, '#6b4f36', 0, 0, 0), box(0.24, 0.24, 0.48, '#2f3b4a', 0, 1.05, 0.05, { metal: 0.4, rough: 0.4 }));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.48, 16, 1, false, 0, Math.PI), mat('#2f3b4a', { metal: 0.4, rough: 0.4 }));
      top.rotation.x = Math.PI / 2; top.rotation.z = Math.PI / 2; top.position.set(0, 1.29, 0.05); add(top);
      add(box(0.02, 0.22, 0.02, '#b8b8b8', 0.13, 1.12, -0.08), box(0.02, 0.09, 0.12, '#d63031', 0.13, 1.26, -0.03));
      break;
    }
    case 'flowers':
      for (let i = 0; i < 9; i++) {
        const x = ((i % 3) - 1) * 0.28, z = (Math.floor(i / 3) - 1) * 0.28;
        add(cyl(0.01, 0.01, 0.3, '#3b7d2b', x, 0, z), sphere(0.07, ['#ff6b81', '#feca57', '#ff9ff3', '#ffffff', '#5f27cd'][i % 5], x, 0.32, z));
      }
      break;
    case 'painting': {
      const colors = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6'];
      add(box(0.8, 0.6, 0.05, '#b8860b', 0, -0.3, 0.02));
      for (let i = 0; i < 4; i++) add(box(0.3, 0.2, 0.01, colors[(i * 3 + (def.seed || 0)) % 5], -0.18 + (i % 2) * 0.36, -0.22 + Math.floor(i / 2) * -0.2 + 0.1, 0.05));
      break;
    }
    case 'ceilinglight':
      add(cyl(0.25, 0.15, 0.12, '#f5f1e6', 0, 2.75, 0, { emissive: '#fff1c4', ei: 0.4 }));
      break;
    case 'workbench':
      add(box(1.8, 0.08, 0.7, '#a0522d', 0, 0.85, -0.1), box(0.08, 0.85, 0.6, '#6d4c41', -0.8, 0, -0.1), box(0.08, 0.85, 0.6, '#6d4c41', 0.8, 0, -0.1), box(0.3, 0.1, 0.15, '#7f8c8d', 0.3, 0.93, -0.1, { metal: 0.7 }));
      break;
    case 'stairs':
      for (let i = 0; i < 10; i++) add(box(0.95, 0.3, 0.3, '#a1887f', 0, i * 0.3, 1.35 - i * 0.3));
      add(box(0.05, 0.9, 3, '#5d4037', 0.47, 1.5, 0), box(0.05, 0.9, 3, '#5d4037', -0.47, 1.5, 0));
      g.children.slice(-2).forEach(r => { r.rotation.x = Math.atan2(3, 3); r.position.y = 1.9; });
      break;
    case 'mealplate':
      add(cyl(0.18, 0.15, 0.03, '#ffffff', 0, 0.86, 0), sphere(0.09, '#e67e22', 0.02, 0.92, 0), sphere(0.05, '#27ae60', -0.07, 0.91, 0.04));
      break;
    case 'restotable': {
      add(cyl(0.6, 0.6, 0.05, '#f5f5f5', 0, 0.75, 0), cyl(0.06, 0.15, 0.75, '#555', 0, 0, 0), cyl(0.12, 0.12, 0.2, '#e74c3c', 0, 0.8, 0, { opacity: 0.8 }));
      for (const z of [1.45, -1.45]) add(box(0.45, 0.06, 0.45, '#8e5b3a', 0, 0.42, z), box(0.45, 0.5, 0.06, '#8e5b3a', 0, 0.48, z + Math.sign(z) * 0.22));
      break;
    }
    case 'dummy':
      add(cyl(0.25, 0.3, 0.1, '#795548'), cyl(0.04, 0.04, 1.0, '#8d6e63', 0, 0.1, 0), cyl(0.22, 0.22, 0.6, '#d7b98e', 0, 0.9, 0), sphere(0.17, '#d7b98e', 0, 1.7, 0));
      { const t = cyl(0.12, 0.12, 0.02, '#e53935', 0, 1.15, 0.22); t.rotation.x = Math.PI / 2; add(t); }
      break;
    case 'portal': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 10, 32), mat('#8a2be2', { emissive: '#b266ff', ei: 1 }));
      ring.position.y = 1.1; add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), new THREE.MeshBasicMaterial({ color: '#c39bff', transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      disc.position.y = 1.1; disc.name = 'portalDisc'; add(disc);
      break;
    }
    case 'crystal': {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), mat('#5ce1e6', { emissive: '#2ec5d3', ei: 0.8, rough: 0.1 }));
      c.position.y = 1; c.scale.y = 1.8; c.name = 'spin'; add(c, cyl(0.35, 0.45, 0.25, '#555'));
      break;
    }
    case 'statue':
      add(box(0.8, 0.5, 0.8, '#9e9e9e'), cyl(0.15, 0.2, 1.0, '#bdbdbd', 0, 0.5, 0), sphere(0.2, '#bdbdbd', 0, 1.7, 0), box(1.0, 0.1, 0.1, '#e0e0e0', 0, 1.4, 0));
      break;
    default:
      add(box(0.8, 0.8, 0.8, '#ff4fd8', 0, 0, 0, { opacity: 0.6 }));
  }
  return g;
}

function chessCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 ? '#3b2a1a' : '#f0d9b5'; ctx.fillRect(x * 8, y * 8, 8, 8); }
  return c;
}

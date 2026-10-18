// Nature et sol réalistes : terrain texturé (herbe photo, terre, bitume, trottoirs), arbres procéduraux ez-tree
// (écorces Poly Haven / TextureCan, MIT), touffes d'herbe 3D et fleurs instanciées autour de la caméra.
import * as THREE from 'three';
import { Tree, TreePreset } from '@dgreenheck/ez-tree';
import { loadGLB } from './assets.js';

const TEX = 'assets/textures/';
const loader = new THREE.TextureLoader();
const texCache = new Map();
function photo(name, srgb = true) {
  if (!texCache.has(name)) {
    const t = loader.load(TEX + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(name, t);
  }
  return texCache.get(name);
}

// ------------------------------------------------------------------ textures procédurales (bitume, dalles)
function noiseCanvas(size, paint) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  paint(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
let asphaltTex, concreteTex;
function asphalt() {
  return asphaltTex ||= noiseCanvas(512, (g, n) => {
    const img = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      // Granulats : bruit fin + quelques gravillons clairs.
      const v = 52 + Math.random() * 22 + (Math.random() < 0.015 ? 40 : 0);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v + 3; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.08;
    for (let k = 0; k < 40; k++) { g.fillStyle = Math.random() < 0.5 ? '#000' : '#888'; g.beginPath(); g.ellipse(Math.random() * n, Math.random() * n, 20 + Math.random() * 60, 10 + Math.random() * 40, Math.random() * 3, 0, 7); g.fill(); }
  });
}
function concrete() {
  return concreteTex ||= noiseCanvas(512, (g, n) => {
    const img = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = 178 + Math.random() * 18;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v - 3; img.data[i * 4 + 2] = v - 8; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // Joints des dalles (1 dalle = 1 m ; la texture couvre 2 m).
    g.strokeStyle = 'rgba(70,65,60,0.55)'; g.lineWidth = 3;
    for (const p of [0, n / 2]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, n); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(n, p); g.stroke(); }
    g.globalAlpha = 0.06;
    for (let k = 0; k < 30; k++) { g.fillStyle = '#3a3020'; g.beginPath(); g.arc(Math.random() * n, Math.random() * n, 8 + Math.random() * 40, 0, 7); g.fill(); }
  });
}

// ------------------------------------------------------------------ matériau du terrain
// mask : texture basse résolution (4 px par case) — R = trottoir, G = terre/sable, B = route ; herbe = le reste.
// marks : marquage au sol (lignes, passages piétons) en surimpression avec alpha.
export function terrainMaterial(mask, marks, size, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0 });
  const grass = photo('grass_photo.jpg'), grass2 = photo('grass_ez.jpg'), dirt = photo('dirt.jpg');
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      tGrass: { value: grass }, tGrass2: { value: grass2 }, tDirt: { value: dirt }, tAsphalt: { value: asphalt() }, tConcrete: { value: concrete() },
      tMask: { value: mask }, tMarks: { value: marks }, uSize: { value: new THREE.Vector2(size[0], size[1]) }, uTint: { value: new THREE.Color(opts.tint || '#ffffff') },
      uAllGrass: { value: opts.allGrass ? 1 : 0 },
    });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform sampler2D tGrass, tGrass2, tDirt, tAsphalt, tConcrete, tMask, tMarks;
uniform vec2 uSize; uniform vec3 uTint; uniform float uAllGrass;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `
vec2 xz = vWPos.xz;
// Herbe : deux photos à deux échelles mélangées par un bruit large, pour casser la répétition.
float macro = vnoise(xz * 0.045) * 0.65 + vnoise(xz * 0.17) * 0.35;
vec3 g1 = texture2D(tGrass, xz / 3.2).rgb, g2 = texture2D(tGrass2, xz / 5.5 + 0.37).rgb;
vec3 gcol = mix(g1, g2 * vec3(0.95, 1.02, 0.9), smoothstep(0.35, 0.7, macro));
gcol *= mix(0.82, 1.08, vnoise(xz * 0.6)) * uTint;
vec4 mk = uAllGrass > 0.5 ? vec4(0.0) : texture2D(tMask, xz / uSize);
vec3 dcol = texture2D(tDirt, xz / 2.5).rgb * vec3(1.05, 0.98, 0.88);
vec3 acol = texture2D(tAsphalt, xz / 4.0).rgb * mix(0.9, 1.08, vnoise(xz * 0.3));
vec3 ccol = texture2D(tConcrete, xz / 2.0).rgb;
vec3 col = gcol;
col = mix(col, dcol, clamp(mk.g, 0.0, 1.0));
col = mix(col, ccol, clamp(mk.r, 0.0, 1.0));
col = mix(col, acol, clamp(mk.b, 0.0, 1.0));
if (uAllGrass < 0.5) { vec4 mm = texture2D(tMarks, xz / uSize); col = mix(col, mm.rgb, mm.a * 0.9); }
diffuseColor.rgb *= col;`);
  };
  m.customProgramCacheKey = () => `terrain-${opts.allGrass ? 1 : 0}`;
  return m;
}

// ------------------------------------------------------------------ arbres (ez-tree)
// Un modèle est généré une fois par essence puis cloné (géométrie et matériaux partagés).
const SPECIES = {
  tree: [['Oak Medium', 8], ['Ash Medium', 9], ['Aspen Medium', 9.5], ['Oak Small', 6]],
  pine: [['Pine Medium', 10], ['Pine Small', 7]],
  bush: [['Bush 1', 1.3], ['Bush 2', 1.1], ['Bush 3', 1.4]],
};
const treeTemplates = new Map();
const windMaterials = new Set();
function treeTemplate(preset, height, lite) {
  const key = `${preset}|${lite}`;
  if (treeTemplates.has(key)) return treeTemplates.get(key);
  const t = new Tree();
  t.options = structuredClone(TreePreset[preset]);
  // Version allégée (mobile) : moins de feuilles, plus grandes, et moins de segments.
  if (lite) {
    t.options.leaves.count = Math.max(4, Math.round(t.options.leaves.count * 0.55));
    t.options.leaves.size *= 1.25;
    for (const k of Object.keys(t.options.branch.segments)) t.options.branch.segments[k] = Math.max(3, Math.round(t.options.branch.segments[k] * 0.6));
  }
  t.generate();
  const box = new THREE.Box3().setFromObject(t);
  const s = height / Math.max(0.01, box.max.y - box.min.y);
  for (const mesh of [t.branchesMesh, t.leavesMesh]) { mesh.castShadow = true; mesh.receiveShadow = true; }
  windMaterials.add(t.leavesMesh.material);
  if (t.branchesMesh.material) windMaterials.add(t.branchesMesh.material);
  const tpl = { branches: t.branchesMesh, leaves: t.leavesMesh, scale: s, minY: box.min.y };
  treeTemplates.set(key, tpl);
  return tpl;
}
export function treeModel(kind, seed = 0, lite = false) {
  const list = SPECIES[kind] || SPECIES.tree;
  const [preset, h] = list[Math.abs(seed) % list.length];
  const tpl = treeTemplate(preset, h * (0.85 + ((seed * 9301 + 49297) % 233280) / 233280 * 0.3), lite);
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(tpl.scale);
  inner.position.y = -tpl.minY * tpl.scale;
  inner.rotation.y = (seed % 628) / 100;
  for (const src of [tpl.branches, tpl.leaves]) { const m = new THREE.Mesh(src.geometry, src.material); m.castShadow = true; m.receiveShadow = true; inner.add(m); }
  g.add(inner);
  return g;
}
export function updateNature(t) {
  for (const m of windMaterials) { const sh = m.userData.shader; if (sh?.uniforms.uTime) sh.uniforms.uTime.value = t; }
  if (grassShader) grassShader.uniforms.uTime.value = t;
}

// ------------------------------------------------------------------ herbe 3D et fleurs autour de la caméra
let grassShader = null;
export class GrassField {
  constructor(root, world, quality) {
    this.root = root; this.world = world;
    this.count = quality.particles ? 9000 : 3500;
    this.radius = quality.particles ? 26 : 18;
    this.center = new THREE.Vector2(1e9, 1e9);
    this.ready = false;
    Promise.all([loadGLB('nature-real/grass_clump'), loadGLB('nature-real/flower_white'), loadGLB('nature-real/flower_yellow'), loadGLB('nature-real/flower_blue')]).then(([g, ...flowers]) => {
      const src = g.scene.getObjectByProperty('isMesh', true);
      const mat = new THREE.MeshStandardMaterial({ map: src.material.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, color: new THREE.Color('#c4e39a') });
      mat.onBeforeCompile = sh => {
        sh.uniforms.uTime = { value: 0 };
        grassShader = sh;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 wp = instanceMatrix * vec4(transformed, 1.0);
float sway = sin(uTime * 1.6 + wp.x * 0.35 + wp.z * 0.27) * 0.5 + sin(uTime * 3.1 + wp.x * 0.9) * 0.2;
transformed.x += sway * 0.08 * max(0.0, position.y);
transformed.z += sway * 0.05 * max(0.0, position.y);`);
      };
      this.mesh = new THREE.InstancedMesh(src.geometry, mat, this.count);
      this.mesh.receiveShadow = true;
      this.mesh.frustumCulled = false;
      this.root.add(this.mesh);
      this.flowers = flowers.map(f => {
        const fm = f.scene.getObjectByProperty('isMesh', true);
        // ~790 triangles par fleur : on en garde peu (quelques touffes visibles près de la caméra).
        const im = new THREE.InstancedMesh(fm.geometry, fm.material, quality.particles ? 45 : 12);
        im.frustumCulled = false; this.root.add(im); return im;
      });
      // Taille d'une touffe : environ 30 cm de haut.
      const b = new THREE.Box3().setFromBufferAttribute(src.geometry.attributes.position);
      this.unit = 0.32 / Math.max(0.001, b.max.y - b.min.y);
      const fb = new THREE.Box3().setFromBufferAttribute(this.flowers[0].geometry.attributes.position);
      this.funit = 0.35 / Math.max(0.001, fb.max.y - fb.min.y);
      this.ready = true;
    }).catch(() => {});
  }
  // Herbe seulement sur les cases d'herbe sans sol construit ni objet.
  grassy(x, y) {
    const w = this.world;
    if (!w.inBounds(x, y)) return true;
    return w.terrainAt(x, y) === 0 && !w.getFloor(0, x, y) && !w.objectAtTile(0, x, y);
  }
  update(target, force) {
    if (!this.ready) return;
    if (!force && Math.hypot(target.x - this.center.x, target.z - this.center.y) < this.radius * 0.35) return;
    this.center.set(target.x, target.z);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0, seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // Positions stables (graine dépendant de la cellule de 4 m) pour éviter le scintillement quand on se déplace.
    const R = this.radius, cell = 4;
    for (let cy = Math.floor((target.z - R) / cell); cy <= Math.floor((target.z + R) / cell) && n < this.count; cy++) {
      for (let cx = Math.floor((target.x - R) / cell); cx <= Math.floor((target.x + R) / cell) && n < this.count; cx++) {
        seed = Math.abs((cx * 73856093) ^ (cy * 19349663)) % 2147483646 + 1;
        const per = Math.round(this.count / ((2 * R / cell) ** 2 * 0.8));
        for (let k = 0; k < per && n < this.count; k++) {
          const x = cx * cell + rnd() * cell, z = cy * cell + rnd() * cell;
          if ((x - target.x) ** 2 + (z - target.z) ** 2 > R * R) continue;
          if (!this.grassy(Math.floor(x), Math.floor(z))) continue;
          const sc = this.unit * (0.7 + rnd() * 0.7);
          q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * 6.28);
          m.compose(p.set(x, 0, z), q, s.set(sc, sc * (0.8 + rnd() * 0.5), sc));
          this.mesh.setMatrixAt(n++, m);
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    // Fleurs : quelques touffes dispersées.
    this.flowers.forEach((im, fi) => {
      let c = 0; seed = 977 + fi * 131 + Math.floor(target.x / 8) * 7 + Math.floor(target.z / 8) * 13;
      for (let k = 0; k < im.instanceMatrix.count * 3 && c < im.instanceMatrix.count; k++) {
        const x = target.x + (rnd() - 0.5) * 2 * R, z = target.z + (rnd() - 0.5) * 2 * R;
        if (!this.grassy(Math.floor(x), Math.floor(z))) continue;
        const sc = this.funit * (0.7 + rnd() * 0.6);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * 6.28);
        m.compose(p.set(x, 0, z), q, s.set(sc, sc, sc));
        im.setMatrixAt(c++, m);
      }
      im.count = c; im.instanceMatrix.needsUpdate = true;
    });
  }
  dispose() { if (this.mesh) this.root.remove(this.mesh); for (const f of this.flowers || []) this.root.remove(f); }
}

// ------------------------------------------------------------------ ciel photographique (Poly Haven, CC0)
export function skyTexture() {
  const t = photo('sky_spruit_sunrise.jpg');
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

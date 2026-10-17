// Chargement des modèles GLB (KayKit, Kenney, Khronos) et recoloration des personnages.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildProcModel } from './procmodels.js';

const loader = new GLTFLoader();
const cache = new Map();
export const BASE = 'assets/models/';

export function loadGLB(path) {
  if (!cache.has(path)) {
    cache.set(path, new Promise((resolve, reject) => {
      loader.load(BASE + path + '.glb', gltf => {
        gltf.scene.traverse(o => {
          if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) o.material.side = THREE.FrontSide; }
        });
        resolve(gltf);
      }, undefined, err => { console.warn('Modèle introuvable', path, err?.message); reject(err); });
    }));
  }
  return cache.get(path);
}

// Modèle d'objet prêt à poser (clone partagé des géométries/matériaux).
export async function objectModel(def) {
  if (!def) return placeholder();
  if (def.model?.startsWith('proc:')) return buildProcModel(def.model.slice(5), def, loadGLB);
  try {
    const gltf = await loadGLB(def.model);
    const m = gltf.scene.clone(true);
    if (def.tint) m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(def.tint)); } });
    return m;
  } catch {
    return placeholder();
  }
}

export function placeholder(color = '#ff4fd8') {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.6 }));
  m.position.y = 0.4;
  g.add(m);
  return g;
}

// ---------------------------------------------------------------------------- personnages
export const CHAR_SCALE = 0.7;
const ANIM_SOURCE = { Knight: 'characters/Knight', Mage: 'characters/Knight', Rogue: 'characters/Knight', Rogue_Hooded: 'characters/Knight', Barbarian: 'characters/Knight',
  Skeleton_Warrior: 'characters/Skeleton_Warrior', Skeleton_Mage: 'characters/Skeleton_Warrior', Skeleton_Minion: 'characters/Skeleton_Warrior', Skeleton_Rogue: 'characters/Skeleton_Warrior' };

export async function characterTemplate(body) {
  const path = `characters/${body}`;
  const [gltf, animG] = await Promise.all([loadGLB(path), loadGLB(ANIM_SOURCE[body] || 'characters/Knight')]);
  return { scene: gltf.scene, animations: animG.animations };
}

export function cloneCharacter(tpl) {
  const root = skeletonClone(tpl.scene);
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
  return root;
}

// Analyse de l'atlas KayKit : grille de cellules 8x4 (128x256 px) ; on classe chaque cellule
// (peau, tenue principale, accent, cheveux/cuir, métal) pour la recolorer.
const atlasInfo = new WeakMap();
function analyzeAtlas(img) {
  if (atlasInfo.has(img)) return atlasInfo.get(img);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const cols = 8, rows = 4, cw = c.width / cols, ch = c.height / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = r * ch + 4; y < (r + 1) * ch - 4; y += 8) for (let x = q * cw + 4; x < (q + 1) * cw - 4; x += 8) {
      const i = (y * c.width + x) * 4;
      R += data.data[i]; G += data.data[i + 1]; B += data.data[i + 2]; n++;
    }
    const col = new THREE.Color(R / n / 255, G / n / 255, B / n / 255);
    const hsl = {}; col.getHSL(hsl);
    let group = 'keep';
    const hDeg = hsl.h * 360;
    if (r === 0 && q === 0) group = 'skin';
    else if (hsl.s < 0.12) group = hsl.l > 0.85 || hsl.l < 0.12 ? 'keep' : 'secondary';
    else if ((hDeg > 340 || hDeg < 12) && hsl.s > 0.45) group = 'primary';
    else if (hDeg >= 38 && hDeg < 65 && hsl.s > 0.5) group = 'accent';
    else if (hDeg >= 12 && hDeg < 38 && hsl.l > 0.62 && hsl.s > 0.3) group = 'skin';
    else if (hDeg >= 8 && hDeg < 45) group = 'hair';
    else if (hDeg >= 180 && hDeg < 260) group = 'secondary';
    else group = 'primary';
    cells.push({ r, q, group, l: hsl.l || 0.5 });
  }
  const info = { cells, cw, ch, w: c.width, h: c.height, data };
  atlasInfo.set(img, info);
  return info;
}

const texCache = new Map();
export function recoloredTexture(baseTex, ap, key) {
  const ck = `${key}|${ap.skin}|${ap.hair}|${ap.primary}|${ap.secondary}|${ap.accent}|${ap.monster ? 1 : 0}`;
  if (texCache.has(ck)) return texCache.get(ck);
  const img = baseTex.image;
  if (!img || !img.width) return baseTex;
  const info = analyzeAtlas(img);
  const c = document.createElement('canvas');
  c.width = info.w; c.height = info.h;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(info.w, info.h);
  const src = info.data.data, dst = out.data;
  dst.set(src);
  const target = {
    skin: new THREE.Color(ap.monster ? '#6fae4a' : ap.skin), hair: new THREE.Color(ap.hair), primary: new THREE.Color(ap.primary),
    secondary: new THREE.Color(ap.secondary), accent: new THREE.Color(ap.accent),
  };
  for (const cell of info.cells) {
    if (cell.group === 'keep') continue;
    const tc = target[cell.group];
    const x0 = cell.q * info.cw, y0 = cell.r * info.ch;
    for (let y = y0; y < y0 + info.ch; y++) for (let x = x0; x < x0 + info.cw; x++) {
      const i = (y * info.w + x) * 4;
      // Conserve le dégradé (luminosité relative) de l'atlas d'origine.
      const lum = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) / 255;
      const k = Math.min(1.6, lum / Math.max(0.08, cell.l));
      const mix = cell.group === 'secondary' ? 0.7 : 1;
      dst[i] = Math.min(255, (tc.r * 255 * k) * mix + src[i] * (1 - mix));
      dst[i + 1] = Math.min(255, (tc.g * 255 * k) * mix + src[i + 1] * (1 - mix));
      dst[i + 2] = Math.min(255, (tc.b * 255 * k) * mix + src[i + 2] * (1 - mix));
    }
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = baseTex.flipY;
  tex.colorSpace = baseTex.colorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  texCache.set(ck, tex);
  if (texCache.size > 120) texCache.delete(texCache.keys().next().value);
  return tex;
}

// Correspondance entre animations abstraites et clips KayKit.
export const ANIM_MAP = {
  idle: 'Idle', walk: 'Walking_A', run: 'Running_A', sit: 'Sit_Chair_Idle', sit_down: 'Sit_Chair_Down', stand_up: 'Sit_Chair_StandUp',
  sit_use: 'Sit_Chair_Idle', sit_floor: 'Sit_Floor_Idle', lie: 'Lie_Idle', lie_down: 'Lie_Down', lie_up: 'Lie_StandUp', talk: 'Interact',
  cheer: 'Cheer', interact: 'Interact', use: 'Use_Item', pickup: 'PickUp', wave: 'Cheer', dance: 'Cheer', workout: 'Unarmed_Melee_Attack_Punch_A',
  hammer: '1H_Melee_Attack_Chop', throw: 'Throw', hit: 'Hit_A', hit_hard: 'Hit_B', block: 'Blocking', cast: 'Spellcast_Shoot', cast_long: 'Spellcasting',
  cast_raise: 'Spellcast_Raise', jump: 'Jump_Idle', fly: 'Jump_Idle', dodge: 'Dodge_Forward', punch: 'Unarmed_Melee_Attack_Punch_B', kick: 'Unarmed_Melee_Attack_Kick',
  faint: 'Death_A', scared: 'Block', angry: 'Unarmed_Melee_Attack_Punch_A', laugh: 'Cheer', refuse: 'Hit_B', sad: 'Sit_Floor_Idle',
};
export const ONE_SHOT = new Set(['sit_down', 'stand_up', 'lie_down', 'lie_up', 'pickup', 'hit', 'hit_hard', 'throw', 'faint']);

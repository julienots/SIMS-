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

// Personnages réalistes Rocketbox : modèle + bibliothèque d'animations du même squelette (Biped).
const REAL_IDS = new Set();
export function registerRealBodies(list) { for (const b of list) REAL_IDS.add(b.id); }
export async function characterTemplate(body) {
  if (REAL_IDS.has(body)) {
    const female = /female/i.test(body);
    const [gltf, animG] = await Promise.all([loadGLB(`real/${body}`), loadGLB(`real/anims_${female ? 'f' : 'm'}`)]);
    return { scene: gltf.scene, animations: animG.animations, real: true };
  }
  const path = `characters/${body}`;
  const [gltf, animG] = await Promise.all([loadGLB(path), loadGLB(ANIM_SOURCE[body] || 'characters/Knight')]);
  return { scene: gltf.scene, animations: animG.animations };
}

export function cloneCharacter(tpl) {
  const root = skeletonClone(tpl.scene);
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
  return root;
}

// Analyse de l'atlas KayKit : grille de cellules 8x4 (128x256 px). On détermine, pour chaque cellule,
// quels maillages l'utilisent (tête ou corps) via les UV, puis on la classe : peau, cheveux,
// tenue principale / secondaire / accent, ou intacte (yeux, bouche, détails).
const analysisCache = new Map();
function cellUsage(model) {
  const head = new Map(), body = new Map();
  model.traverse(o => {
    if (!(o.isMesh || o.isSkinnedMesh) || !o.material?.map) return;
    if (/sword|shield|staff|wand|spellbook|knife|throwable|crossbow|axe|mug|arrow|quiver|blade/i.test(o.name || o.parent?.name || '')) return;
    const uv = o.geometry.attributes.uv;
    if (!uv) return;
    const target = /head/i.test(o.name) ? head : body;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const c = Math.min(7, Math.max(0, Math.floor(u * 8))) + 8 * Math.min(3, Math.max(0, Math.floor(v * 4)));
      target.set(c, (target.get(c) || 0) + 1);
    }
  });
  return { head, body };
}
function analyzeAtlas(img, model, key) {
  if (analysisCache.has(key)) return analysisCache.get(key);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const cols = 8, rows = 4, cw = c.width / cols, ch = c.height / rows;
  const usage = cellUsage(model);
  const cells = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = r * ch + 4; y < (r + 1) * ch - 4; y += 8) for (let x = q * cw + 4; x < (q + 1) * cw - 4; x += 8) {
      const i = (y * c.width + x) * 4;
      R += data.data[i]; G += data.data[i + 1]; B += data.data[i + 2]; n++;
    }
    const col = new THREE.Color(R / n / 255, G / n / 255, B / n / 255);
    const hsl = {}; col.getHSL(hsl);
    const idx = q + r * 8;
    cells.push({ r, q, idx, hsl, l: hsl.l || 0.5, head: usage.head.get(idx) || 0, body: usage.body.get(idx) || 0, group: 'keep' });
  }
  const hueDeg = h => h * 360;
  const skinLike = x => (x.r === 0 && x.q === 0) || (hueDeg(x.hsl.h) >= 12 && hueDeg(x.hsl.h) <= 42 && x.hsl.s >= 0.2 && x.hsl.s <= 0.8 && x.hsl.l >= 0.55 && x.hsl.l <= 0.92);
  for (const x of cells) {
    if (!x.head && !x.body) continue;
    if (skinLike(x)) { x.group = 'skin'; continue; }
    if (x.head > x.body) {
      const hd = hueDeg(x.hsl.h);
      if (x.hsl.l < 0.16 || x.hsl.l > 0.92) x.group = 'keep';                 // yeux, bouche, reflets
      else if ((hd < 50 || hd > 340) && x.hsl.s > 0.15) x.group = 'hair';
      else x.group = 'keep';
    }
  }
  // Vêtements : les cellules du corps les plus utilisées deviennent principale, secondaire, accent.
  const cloth = cells.filter(x => x.group === 'keep' && x.body > x.head && x.body > 0 && x.hsl.l > 0.1 && x.hsl.l < 0.95).sort((a, b) => b.body - a.body);
  const order = ['primary', 'secondary', 'accent', 'accent'];
  cloth.forEach((x, i) => { x.group = order[i] || 'keep'; });
  const info = { cells, cw, ch, w: c.width, h: c.height, data };
  analysisCache.set(key, info);
  return info;
}

const texCache = new Map();
export function recoloredTexture(baseTex, ap, key, model) {
  const ck = `${key}|${ap.skin}|${ap.hair}|${ap.primary}|${ap.secondary}|${ap.accent}|${ap.monster ? 1 : 0}`;
  if (texCache.has(ck)) return texCache.get(ck);
  const img = baseTex.image;
  if (!img || !img.width) return baseTex;
  const info = analyzeAtlas(img, model, key);
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
      const k = Math.min(1.5, lum / Math.max(0.08, cell.l));
      dst[i] = Math.min(255, tc.r * 255 * k);
      dst[i + 1] = Math.min(255, tc.g * 255 * k);
      dst[i + 2] = Math.min(255, tc.b * 255 * k);
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
  listen: 'Idle', phone: 'Interact', music: 'Idle', photo: 'Interact', think: 'Idle', clap: 'Cheer', yawn: 'Idle', accept: 'Cheer', shrug: 'Idle', idle2: 'Idle',
};
// Animations réalistes (Rocketbox) : plusieurs variantes possibles, choisies selon l'émotion.
export const REAL_ANIM_MAP = {
  idle: 'idle_neutral_01', idle2: 'idle_look_around_01', walk: 'walk_neutral_01', run: 'run_neutral_01',
  sit: 'sit_chair_idle_neutral_01', sit_down: 'sit_down_chair_01', stand_up: 'sit_stand_up_chair_01', sit_use: 'sit_table_idle_neutral_01',
  sit_floor: 'crouch_idle', lie: 'idle_breathe_01', lie_down: 'idle_breathe_01', lie_up: 'idle_breathe_01', faint: 'idle_breathe_01',
  talk: 'gestic_talk_neutral_01', listen: 'gestic_listen_neutral_01', cheer: 'cheer_01', interact: 'work_table', use: 'drink_drinking',
  pickup: 'crouch_idle', wave: 'wave_01', dance: 'dancing_neutral', workout: 'run_neutral_01', hammer: 'work_table', throw: 'gestic_presentation_right_01',
  hit: 'gestic_listen_deny_01', hit_hard: 'gestic_listen_deny_01', block: 'idle_nervous_01', cast: 'gestic_presentation_right_01',
  cast_long: 'gestic_presentation_right_01', cast_raise: 'cheer_01', jump: 'cheer_01', fly: 'idle_breathe_01', dodge: 'idle_nervous_01',
  punch: 'gestic_talk_angry_01', kick: 'gestic_talk_angry_01', scared: 'idle_nervous_01', angry: 'idle_angry_01', laugh: 'gestic_laugh_loud',
  refuse: 'gestic_listen_deny_01', sad: 'gestic_talk_sad_01', phone: 'cell_phone_talk_01', music: 'headphones_idle', photo: 'take_picture',
  think: 'gestic_thoughtful_01', clap: 'claphands_01', yawn: 'idle_yawn_01', accept: 'gestic_listen_accept_01', shrug: 'gestic_shrug_01', run_run: 'run_neutral_01',
};
export const REAL_TALK = { angry: 'gestic_talk_angry_01', happy: 'gestic_talk_excited_01', playful: 'gestic_talk_excited_01', confident: 'gestic_talk_neutral_02', sad: 'gestic_talk_sad_01', flirty: 'gestic_talk_excited_01' };
export const ONE_SHOT = new Set(['sit_down', 'stand_up', 'lie_down', 'lie_up', 'pickup', 'hit', 'hit_hard', 'throw', 'faint']);

// Pipeline d'assets : convertit les packs CC0 téléchargés (KayKit, Kenney, Khronos)
// en fichiers GLB autonomes, optimisés pour le mobile, dans game/assets/models.
// Usage : ASSET_SRC=/chemin/vers/les/depots/clones node tools/process-assets.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.env.ASSET_SRC;
if (!SRC) { console.error('ASSET_SRC non défini'); process.exit(1); }
const OUT = path.resolve('game/assets/models');
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const P = {
  adv: `${SRC}/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf`,
  skel: `${SRC}/KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons/Characters/gltf`,
  furn: `${SRC}/KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf`,
  rest: `${SRC}/KayKit-Restaurant-Bits-1.0/addons/kaykit_restaurant_bits/Assets/gltf`,
  city: `${SRC}/KayKit-City-Builder-Bits-1.0/addons/kaykit_city_builder_bits/Assets/gltf`,
  space: `${SRC}/KayKit-Space-Base-Bits-1.0/addons/kaykit_space_base_bits/Assets/gltf`,
  kenney: `${SRC}/Starter-Kit-City-Builder/models`,
  fox: `${SRC}/khr/Models/Fox/glTF-Binary`,
};

async function convert(src, dst, { stripAnims = false } = {}) {
  const doc = await io.read(src);
  if (stripAnims) for (const a of doc.getRoot().listAnimations()) a.dispose();
  await doc.transform(dedup(), prune());
  await io.write(dst, doc);
  return fs.statSync(dst).size;
}

const jobs = [];
// Personnages : les animations ne sont gardées que dans un fichier par rig.
fs.mkdirSync(`${OUT}/characters`, { recursive: true });
jobs.push([`${P.adv}/Knight.glb`, 'characters/Knight.glb', { stripAnims: false }]);
for (const c of ['Mage', 'Rogue', 'Rogue_Hooded', 'Barbarian'])
  jobs.push([`${P.adv}/${c}.glb`, `characters/${c}.glb`, { stripAnims: true }]);
jobs.push([`${P.skel}/Skeleton_Warrior.glb`, 'characters/Skeleton_Warrior.glb', { stripAnims: false }]);
for (const c of ['Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue'])
  jobs.push([`${P.skel}/${c}.glb`, `characters/${c}.glb`, { stripAnims: true }]);

function pack(dir, folder, names) {
  fs.mkdirSync(`${OUT}/${folder}`, { recursive: true });
  for (const n of names) jobs.push([`${dir}/${n}.gltf`, `${folder}/${n}.glb`, {}]);
}
pack(P.furn, 'furniture', fs.readdirSync(P.furn).filter(f => f.endsWith('.gltf')).map(f => f.replace('.gltf', '')));
pack(P.rest, 'kitchen', ['fridge_A', 'fridge_B', 'stove_multi', 'stove_single', 'oven', 'kitchencounter_straight_A',
  'kitchencounter_straight_B', 'kitchencounter_sink', 'kitchencabinet', 'kitchentable_A', 'table_round_A', 'table_round_B',
  'chair_A', 'chair_B', 'chair_stool', 'food_burger', 'food_dinner', 'food_stew', 'plate', 'bowl', 'stew_pot', 'extractorhood',
  'crate_tomatoes', 'menu', 'towelrail', 'dishrack_plates', 'pan_A']);
pack(P.city, 'city', ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G',
  'building_H', 'car_taxi', 'car_sedan', 'car_police', 'car_hatchback', 'car_stationwagon', 'bench', 'streetlight', 'bush',
  'trafficlight_A', 'firehydrant', 'dumpster', 'trash_A', 'watertower', 'box_A', 'road_straight', 'road_corner', 'road_junction',
  'road_tsplit', 'road_straight_crossing', 'base']);
pack(P.space, 'space', ['basemodule_A', 'basemodule_B', 'basemodule_garage', 'lander_A', 'lander_B', 'landingpad_large',
  'solarpanel', 'windturbine_tall', 'rocks_A', 'rocks_B', 'rock_A', 'spacetruck', 'cargo_A', 'containers_A', 'structure_tall',
  'drill_structure', 'roofmodule_solarpanels', 'lights']);
fs.mkdirSync(`${OUT}/nature`, { recursive: true });
for (const n of ['grass-trees', 'grass-trees-tall', 'pavement-fountain'])
  jobs.push([`${P.kenney}/${n}.glb`, `nature/${n}.glb`, {}]);
fs.mkdirSync(`${OUT}/animals`, { recursive: true });
jobs.push([`${P.fox}/Fox.glb`, 'animals/Fox.glb', {}]);

const manifest = {};
let total = 0;
for (const [src, dst, opt] of jobs) {
  try {
    const size = await convert(src, `${OUT}/${dst}`, opt);
    total += size;
    const [folder, file] = dst.split('/');
    (manifest[folder] ||= []).push(file.replace('.glb', ''));
  } catch (e) {
    console.error('ÉCHEC', src, e.message);
  }
}
fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(`${jobs.length} assets, ${(total / 1048576).toFixed(1)} Mo`);

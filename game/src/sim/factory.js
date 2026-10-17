// Création de sims : génération aléatoire cohérente, héritage, gabarits réutilisables.
import { uid } from '../core/util.js';
import { NEED_IDS, LIKES, FEARS } from './data/core-data.js';
import { registry } from '../mods/registry.js';

export const FIRST_F = ['Léa', 'Emma', 'Chloé', 'Inès', 'Jade', 'Manon', 'Zoé', 'Lina', 'Nina', 'Camille', 'Sarah', 'Maya', 'Aïcha', 'Yuki', 'Sofia', 'Lou', 'Alice', 'Rose', 'Anaïs', 'Mila'];
export const FIRST_M = ['Hugo', 'Lucas', 'Nathan', 'Léo', 'Adam', 'Noah', 'Tom', 'Malik', 'Enzo', 'Rayan', 'Jules', 'Sacha', 'Kenji', 'Diego', 'Arthur', 'Louis', 'Yanis', 'Gabin', 'Omar', 'Théo'];
export const FIRST_X = ['Alex', 'Charlie', 'Sam', 'Eden', 'Noa', 'Andrea', 'Morgan', 'Ash', 'Robin', 'Lior'];
export const LAST = ['Martin', 'Bernard', 'Dubois', 'Lefèvre', 'Moreau', 'Laurent', 'Garcia', 'Nguyen', 'Diallo', 'Rossi', 'Kowalski', 'Tanaka', 'Benali', 'Silva', 'Fontaine', 'Mercier', 'Chevalier', 'Blanc', 'Okafor', 'Lambert'];

export const BODIES = [
  { id: 'Knight', name: 'Athlétique' },
  { id: 'Barbarian', name: 'Costaud' },
  { id: 'Mage', name: 'Élancé' },
  { id: 'Rogue', name: 'Agile' },
  { id: 'Rogue_Hooded', name: 'Agile à capuche' },
];
export const SKIN_TONES = ['#ffdcc2', '#f6c9a3', '#e8b088', '#d39a6a', '#b07850', '#8d5a3a', '#6b4128', '#4a2c1c', '#c9e3b0', '#b8c8ff'];
export const HAIR_COLORS = ['#2b1b12', '#4a2e1c', '#7a4a26', '#b07a45', '#e0c27a', '#f3e4b5', '#a83a2a', '#d65a8f', '#5a7ae0', '#e8e8e8', '#141414', '#3fae6b'];
export const OUTFIT_COLORS = ['#d8344a', '#2f6fd6', '#2fae66', '#f2b632', '#8a4fd6', '#222831', '#f2f2f2', '#ff7aa8', '#ff8a2a', '#21b5b5', '#7a5230', '#9aa5b1'];
export const EXTRAS = [
  { id: 'glasses', name: 'Lunettes' }, { id: 'sunglasses', name: 'Lunettes de soleil' }, { id: 'headphones', name: 'Casque audio' },
  { id: 'crown', name: 'Couronne' }, { id: 'flower', name: 'Fleur dans les cheveux' }, { id: 'mustache', name: 'Moustache' },
  { id: 'beard', name: 'Barbe' }, { id: 'earrings', name: 'Boucles d’oreilles' }, { id: 'scar', name: 'Cicatrice' },
  { id: 'freckles', name: 'Taches de rousseur' }, { id: 'makeup', name: 'Maquillage' }, { id: 'necklace', name: 'Collier' },
  { id: 'bow', name: 'Nœud' }, { id: 'cap', name: 'Casquette' }, { id: 'tophat', name: 'Haut-de-forme' },
];
export const EYE_COLORS = ['#3a2a1a', '#2f6fd6', '#2fae66', '#7a7a7a', '#b5651d', '#8a4fd6'];

export function defaultAppearance(rng) {
  const r = rng || { pick: a => a[Math.floor(Math.random() * a.length)], range: (a, b) => a + Math.random() * (b - a), chance: p => Math.random() < p };
  return {
    body: r.pick(BODIES).id,
    skin: r.pick(SKIN_TONES.slice(0, 8)),
    hair: r.pick(HAIR_COLORS),
    eyes: r.pick(EYE_COLORS),
    primary: r.pick(OUTFIT_COLORS),
    secondary: r.pick(OUTFIT_COLORS),
    accent: r.pick(OUTFIT_COLORS),
    height: +r.range(0.92, 1.08).toFixed(2),
    build: +r.range(0.88, 1.15).toFixed(2),
    head: +r.range(0.95, 1.08).toFixed(2),
    shoulders: +r.range(0.92, 1.08).toFixed(2),
    legs: +r.range(0.95, 1.05).toFixed(2),
    arms: 1,
    hat: r.chance(0.25),
    cape: r.chance(0.3),
    extras: r.chance(0.5) ? [r.pick(EXTRAS).id] : [],
  };
}

export function pickTraits(rng, n = 3, exclude = []) {
  const all = [...registry.traits.values()].filter(t => !t.hidden);
  const chosen = [];
  rng.shuffle(all);
  for (const t of all) {
    if (chosen.length >= n) break;
    if (exclude.includes(t.id)) continue;
    if (chosen.some(c => (registry.trait(c).conflicts || []).includes(t.id) || (t.conflicts || []).includes(c))) continue;
    chosen.push(t.id);
  }
  return chosen;
}

export function createSim(rng, opts = {}) {
  const gender = opts.gender || rng.pick(['f', 'm', 'f', 'm', 'x']);
  const first = opts.first || rng.pick(gender === 'f' ? FIRST_F : gender === 'm' ? FIRST_M : FIRST_X);
  const careers = [...registry.careers.values()].filter(c => c.id !== 'unemployed');
  const stage = opts.stage || rng.pick(['young', 'young', 'adult', 'adult', 'elder', 'teen']);
  const needs = {};
  for (const id of NEED_IDS) needs[id] = rng.range(55, 95);
  needs.safety = 90;
  const skills = {};
  for (const s of registry.skills.values()) skills[s.id] = rng.chance(0.35) ? rng.range(0, 3) : 0;
  const sim = {
    id: uid('sim'),
    first, last: opts.last || rng.pick(LAST), gender,
    stage, ageDays: 0,
    householdId: opts.householdId || null,
    traits: opts.traits || pickTraits(rng, 3),
    aspiration: opts.aspiration || rng.pick([...registry.aspirations.keys()]),
    career: { id: opts.career || (['teen', 'child', 'baby'].includes(stage) ? 'unemployed' : rng.chance(0.85) ? rng.pick(careers).id : 'unemployed'), level: 0, perf: 0, days: 0 },
    skills,
    needs,
    moodlets: [],
    emotion: 'fine',
    appearance: opts.appearance || defaultAppearance(rng),
    likes: { music: rng.pick(LIKES.music), activity: rng.pick(LIKES.activities), color: rng.pick(LIKES.colors) },
    dislikes: { activity: rng.pick(LIKES.activities) },
    fears: [rng.pick(FEARS)],
    secrets: [],
    backstory: opts.backstory || '',
    goals: [],
    memories: [],
    pos: { x: 0, y: 0, l: 0 },
    rot: 0,
    queue: [],
    autonomy: true,
    works: 0,
    creations: 0,
    modData: {},
    flags: {},
  };
  if (rng.chance(0.4)) sim.secrets.push({ text: rng.pick(SECRETS), knownBy: [] });
  return sim;
}

export const SECRETS = [
  'Chante sous la douche des tubes des années 80.', 'A peur des pigeons.', 'Collectionne des cailloux en forme de cœur.',
  'A déjà mangé le dessert de son voisin.', 'Rêve secrètement de devenir astronaute.', 'Parle à ses plantes tous les soirs.',
  'A un journal intime rempli de poèmes.', 'Ne sait pas nager.', 'A été champion de danse en ligne.', 'Écrit des fanfictions la nuit.',
  'A un faible pour un voisin.', 'Est allergique au fromage mais en mange quand même.',
];

// Gabarits : un sim enregistré dans la galerie, réutilisable dans un autre monde.
export function simToTemplate(sim) {
  const { id, householdId, pos, rot, queue, moodlets, _rt, needs, ...rest } = sim;
  return JSON.parse(JSON.stringify({ ...rest, templateId: uid('tpl'), savedAt: Date.now() }));
}
export function simFromTemplate(tpl, rng) {
  const base = createSim(rng, {});
  const { templateId, savedAt, ...rest } = JSON.parse(JSON.stringify(tpl));
  return { ...base, ...rest, id: base.id, queue: [], moodlets: [], needs: base.needs, pos: base.pos };
}

export function childOf(rng, a, b) {
  const pa = a.appearance, pb = b.appearance;
  const mix = (x, y) => (rng.chance(0.5) ? x : y);
  const traits = [];
  const pool = [...a.traits, ...b.traits];
  rng.shuffle(pool);
  for (const t of pool) if (traits.length < 2 && !traits.includes(t)) traits.push(t);
  const extra = pickTraits(rng, 1, traits);
  const sim = createSim(rng, {
    stage: 'baby', last: a.last, householdId: a.householdId,
    traits: [...traits, ...extra].slice(0, 3),
    appearance: {
      ...defaultAppearance(rng), body: mix(pa.body, pb.body), skin: mix(pa.skin, pb.skin), hair: mix(pa.hair, pb.hair), eyes: mix(pa.eyes, pb.eyes),
      primary: mix(pa.primary, pb.primary), hat: false, cape: false, extras: [],
    },
  });
  sim.career = { id: 'unemployed', level: 0, perf: 0, days: 0 };
  sim.likes.music = mix(a.likes.music, b.likes.music);
  sim.parents = [a.id, b.id];
  return sim;
}

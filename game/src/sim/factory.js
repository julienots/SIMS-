// Création de sims : génération aléatoire cohérente, héritage, gabarits réutilisables.
import { uid } from '../core/util.js';
import { NEED_IDS, LIKES, FEARS } from './data/core-data.js';
import { registry } from '../mods/registry.js';

export const FIRST_F = ['Léa', 'Emma', 'Chloé', 'Inès', 'Jade', 'Manon', 'Zoé', 'Lina', 'Nina', 'Camille', 'Sarah', 'Maya', 'Aïcha', 'Yuki', 'Sofia', 'Lou', 'Alice', 'Rose', 'Anaïs', 'Mila'];
export const FIRST_M = ['Hugo', 'Lucas', 'Nathan', 'Léo', 'Adam', 'Noah', 'Tom', 'Malik', 'Enzo', 'Rayan', 'Jules', 'Sacha', 'Kenji', 'Diego', 'Arthur', 'Louis', 'Yanis', 'Gabin', 'Omar', 'Théo'];
export const FIRST_X = ['Alex', 'Charlie', 'Sam', 'Eden', 'Noa', 'Andrea', 'Morgan', 'Ash', 'Robin', 'Lior'];
export const LAST = ['Martin', 'Bernard', 'Dubois', 'Lefèvre', 'Moreau', 'Laurent', 'Garcia', 'Nguyen', 'Diallo', 'Rossi', 'Kowalski', 'Tanaka', 'Benali', 'Silva', 'Fontaine', 'Mercier', 'Chevalier', 'Blanc', 'Okafor', 'Lambert'];

// Personnages humains réalistes Microsoft Rocketbox (licence MIT) : corps, visage et tenue d'origine.
const RB = (id, name, gender, age, group) => ({ id, name, gender, age, group, real: true });
export const REAL_BODIES = [
  ...Array.from({ length: 10 }, (_, i) => RB(`Female_Adult_${String(i + 1).padStart(2, '0')}`, `Femme ${i + 1}`, 'f', 'adult', 'Adultes')),
  ...Array.from({ length: 10 }, (_, i) => RB(`Male_Adult_${String(i + 1).padStart(2, '0')}`, `Homme ${i + 1}`, 'm', 'adult', 'Adultes')),
  RB('Female_Party_01', 'Tenue de soirée', 'f', 'adult', 'Adultes'),
  RB('Business_Female_01', 'Femme d’affaires', 'f', 'adult', 'Métiers'), RB('Business_Male_01', 'Homme d’affaires', 'm', 'adult', 'Métiers'),
  RB('Chef_Female_01', 'Cheffe cuisinière', 'f', 'adult', 'Métiers'), RB('Medical_Female_01', 'Médecin (femme)', 'f', 'adult', 'Métiers'),
  RB('Medical_Male_01', 'Médecin (homme)', 'm', 'adult', 'Métiers'), RB('Police_Female_01', 'Policière', 'f', 'adult', 'Métiers'),
  RB('Police_Male_01', 'Policier', 'm', 'adult', 'Métiers'), RB('Sports_Female_01', 'Sportive', 'f', 'adult', 'Métiers'),
  RB('Sports_Male_01', 'Sportif', 'm', 'adult', 'Métiers'), RB('Construction_Male_01', 'Ouvrier du bâtiment', 'm', 'adult', 'Métiers'),
  RB('Fire_Male_01', 'Pompier', 'm', 'adult', 'Métiers'), RB('Gardener_Male_01', 'Jardinier', 'm', 'adult', 'Métiers'),
  RB('Pilot_Male_01', 'Pilote', 'm', 'adult', 'Métiers'), RB('Military_Male_01', 'Militaire', 'm', 'adult', 'Métiers'),
  RB('Female_Child_01', 'Fille 1', 'f', 'child', 'Enfants'), RB('Female_Child_02', 'Fille 2', 'f', 'child', 'Enfants'),
  RB('Male_Child_01', 'Garçon 1', 'm', 'child', 'Enfants'), RB('Male_Child_02', 'Garçon 2', 'm', 'child', 'Enfants'),
];
export const isRealBody = id => REAL_BODIES.some(b => b.id === id);
export const realBody = id => REAL_BODIES.find(b => b.id === id);
// Corps adapté au sexe et à l'âge (les vêtements des métiers sont réservés aux sims de ce métier).
export function pickRealBody(rng, gender, stage, career) {
  const child = ['baby', 'child'].includes(stage);
  const prof = { chef: ['Chef_Female_01'], athlete: ['Sports_Female_01', 'Sports_Male_01'], employee: ['Business_Female_01', 'Business_Male_01'], entrepreneur: ['Business_Female_01', 'Business_Male_01'], scientist: ['Medical_Female_01', 'Medical_Male_01'] }[career];
  let pool = REAL_BODIES.filter(b => (child ? b.age === 'child' : b.age === 'adult' && b.group === 'Adultes') && (gender === 'x' || b.gender === gender));
  if (!child && prof && rng.chance(0.5)) { const p = REAL_BODIES.filter(b => prof.includes(b.id) && (gender === 'x' || b.gender === gender)); if (p.length) pool = p; }
  if (!pool.length) pool = REAL_BODIES.filter(b => (child ? b.age === 'child' : b.age === 'adult'));
  return rng.pick(pool).id;
}

// Corps « cartoon » KayKit (style alternatif).
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
  // Corps réaliste par défaut, choisi selon le sexe, l'âge et le métier.
  const appearance = opts.appearance || defaultAppearance(rng);
  if (!opts.appearance) { appearance.body = pickRealBody(rng, gender, stage, opts.career); appearance.hat = false; appearance.cape = false; appearance.extras = rng.chance(0.25) ? [rng.pick(['glasses', 'sunglasses', 'cap', 'headphones', 'necklace'])] : []; }
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
    appearance,
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
  sim.appearance.body = pickRealBody(rng, sim.gender, 'child');
  sim.likes.music = mix(a.likes.music, b.likes.music);
  sim.parents = [a.id, b.id];
  return sim;
}

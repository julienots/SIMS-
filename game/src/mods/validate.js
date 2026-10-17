// Validation des mods : structure, identifiants, références, valeurs. Messages en clair pour les créateurs.
import { parseVersion } from '../core/util.js';
import { EFFECT_TYPES } from '../sim/powers.js';
import { NEED_IDS } from '../sim/data/core-data.js';

export const GAME_VERSION = '1.0.0';
export const MOD_FORMAT = 1;
const ID_RE = /^[a-z0-9][a-z0-9_.-]{1,63}$/;
const EVENT_EFFECTS = ['moodlet', 'need', 'relationship', 'skill', 'money', 'journal', 'notify', 'bubble', 'trait_add', 'trait_remove', 'social', 'animation', 'grant_power', 'use_power', 'alignment', 'spawn_object', 'grant_random_power', 'duel', 'spawn_villain', 'form_team'];
const TRIGGERS = ['hourly', 'daily', 'social', 'power_used'];
const POSES = ['sit', 'lie', 'stand', 'hidden'];
const EMOTIONS = ['fine', 'happy', 'sad', 'angry', 'flirty', 'energized', 'inspired', 'embarrassed', 'tense', 'bored', 'playful', 'confident', 'focused', 'scared', 'uncomfortable'];

export function validateMod(mod, knownIds = {}) {
  const errors = [], warnings = [];
  const err = m => errors.push(m), warn = m => warnings.push(m);
  if (!mod || typeof mod !== 'object') return { errors: ['Le fichier ne contient pas un objet JSON.'], warnings };
  if (!mod.id || !ID_RE.test(mod.id)) err('Identifiant du mod manquant ou invalide (lettres minuscules, chiffres, « . », « _ », « - »).');
  if (!mod.name || String(mod.name).length > 60) err('Nom du mod manquant ou trop long (60 caractères max).');
  if (!mod.version || !parseVersion(mod.version)) err('Version invalide (format attendu : 1.0.0).');
  if (mod.format && mod.format > MOD_FORMAT) err(`Ce mod utilise un format plus récent (${mod.format}) que le jeu (${MOD_FORMAT}). Mettez le jeu à jour.`);
  if (mod.gameVersion && !/^[<>=^]*\d/.test(mod.gameVersion)) warn('Contrainte de version du jeu illisible : elle sera ignorée.');
  if (mod.dependencies && !Array.isArray(mod.dependencies)) err('« dependencies » doit être une liste.');
  for (const d of mod.dependencies || []) if (!d.id) err('Une dépendance n’a pas d’identifiant.');
  if (mod.script || mod.code || mod.js) err('Les mods ne peuvent pas contenir de code exécutable : utilisez les effets déclaratifs.');
  const c = mod.content || {};
  if (typeof c !== 'object') { err('« content » doit être un objet.'); return { errors, warnings }; }
  const ids = new Set();
  const checkId = (type, e, i) => {
    if (!e || typeof e !== 'object') { err(`${type}[${i}] n’est pas un objet.`); return false; }
    if (!e.id || !ID_RE.test(e.id)) { err(`${type}[${i}] : identifiant manquant ou invalide.`); return false; }
    const k = `${type}:${e.id}`;
    if (ids.has(k)) err(`${type} : identifiant en double « ${e.id} ».`);
    ids.add(k);
    if (!e.name && type !== 'rules') warn(`${type} « ${e.id} » n’a pas de nom affichable.`);
    return true;
  };
  const affIds = new Set([...(knownIds.affordances || []), ...(c.affordances || []).map(a => a.id)]);
  const modelOk = m => typeof m === 'string' && (m.startsWith('proc:') || /^[a-z]+\/[A-Za-z0-9_\-]+$/.test(m));
  (c.traits || []).forEach((t, i) => {
    if (!checkId('traits', t, i)) return;
    for (const k of Object.keys(t.needDecay || {})) if (!NEED_IDS.includes(k)) err(`Trait « ${t.id} » : besoin inconnu « ${k} ».`);
    for (const v of Object.values(t.needDecay || {})) if (typeof v !== 'number' || v < 0 || v > 5) err(`Trait « ${t.id} » : multiplicateur de besoin hors limites (0 à 5).`);
    for (const k of Object.keys(t.emotionBias || {})) if (!EMOTIONS.includes(k)) warn(`Trait « ${t.id} » : émotion inconnue « ${k} ».`);
  });
  (c.affordances || []).forEach((a, i) => {
    if (!checkId('affordances', a, i)) return;
    if (a.pose && !POSES.includes(a.pose)) err(`Interaction « ${a.id} » : posture inconnue « ${a.pose} » (${POSES.join(', ')}).`);
    for (const [k, v] of Object.entries(a.needs || {})) {
      if (!NEED_IDS.includes(k)) err(`Interaction « ${a.id} » : besoin inconnu « ${k} ».`);
      if (typeof v !== 'number' || Math.abs(v) > 10) err(`Interaction « ${a.id} » : gain de besoin « ${k} » hors limites (-10 à 10 par minute).`);
    }
    if (!(a.minMin > 0)) err(`Interaction « ${a.id} » : durée minimale (minMin) requise et positive.`);
    if (a.maxMin !== undefined && a.maxMin < a.minMin) err(`Interaction « ${a.id} » : maxMin doit être ≥ minMin.`);
  });
  (c.objects || []).forEach((o, i) => {
    if (!checkId('objects', o, i)) return;
    if (!modelOk(o.model)) err(`Objet « ${o.id} » : modèle invalide (ex. « furniture/couch » ou « proc:tree »).`);
    if (!Array.isArray(o.size) || o.size.length !== 2 || o.size.some(n => !Number.isInteger(n) || n < 1 || n > 16)) err(`Objet « ${o.id} » : taille invalide ([largeur, profondeur] entre 1 et 16).`);
    if (typeof o.price !== 'number' || o.price < 0) err(`Objet « ${o.id} » : prix invalide.`);
    for (const a of o.aff || []) if (!affIds.has(a)) err(`Objet « ${o.id} » : interaction inconnue « ${a} ».`);
    if (o.scale !== undefined && (o.scale <= 0 || o.scale > 20)) err(`Objet « ${o.id} » : échelle hors limites.`);
  });
  (c.socials || []).forEach((s, i) => {
    if (!checkId('socials', s, i)) return;
    if (typeof s.base !== 'number' || s.base < 0 || s.base > 100) err(`Interaction sociale « ${s.id} » : chance de base entre 0 et 100.`);
    if (!['friendly', 'funny', 'romantic', 'mean', 'deep', 'power'].includes(s.cat)) err(`Interaction sociale « ${s.id} » : catégorie inconnue.`);
  });
  (c.moodlets || []).forEach((m, i) => { if (checkId('moodlets', m, i) && !EMOTIONS.includes(m.emotion)) err(`Humeur « ${m.id} » : émotion inconnue « ${m.emotion} ».`); });
  (c.careers || []).forEach((k, i) => {
    if (!checkId('careers', k, i)) return;
    if (!Array.isArray(k.levels) || !k.levels.length) err(`Métier « ${k.id} » : au moins un niveau requis.`);
    if (!(k.start >= 0 && k.start < 24 && k.end > 0 && k.end <= 24)) err(`Métier « ${k.id} » : horaires invalides.`);
  });
  (c.events || []).forEach((e, i) => {
    if (!checkId('events', e, i)) return;
    if (!e.trigger || !TRIGGERS.includes(e.trigger.type)) err(`Événement « ${e.id} » : déclencheur invalide (${TRIGGERS.join(', ')}).`);
    if (e.trigger?.chance !== undefined && (e.trigger.chance < 0 || e.trigger.chance > 1)) err(`Événement « ${e.id} » : chance entre 0 et 1.`);
    if (!Array.isArray(e.effects) || !e.effects.length) err(`Événement « ${e.id} » : au moins un effet requis.`);
    for (const f of e.effects || []) if (!EVENT_EFFECTS.includes(f.type)) err(`Événement « ${e.id} » : effet inconnu « ${f.type} ».`);
  });
  (c.powers || []).forEach((p, i) => {
    if (!checkId('powers', p, i)) return;
    if (!EFFECT_TYPES.includes(p.effect)) err(`Pouvoir « ${p.id} » : effet inconnu « ${p.effect} ».`);
    for (const k of ['intensity', 'range', 'duration', 'cost', 'cooldown']) if (p[k] !== undefined && (typeof p[k] !== 'number' || p[k] < 0 || p[k] > 1000)) err(`Pouvoir « ${p.id} » : ${k} invalide.`);
    if (p.instability !== undefined && (p.instability < 0 || p.instability > 1)) err(`Pouvoir « ${p.id} » : instabilité entre 0 et 1.`);
    if (p.effect === 'mutation' && !['wings', 'arms', 'claws', 'tentacles', 'shell', 'monster'].includes(p.mutation)) err(`Pouvoir « ${p.id} » : mutation inconnue.`);
  });
  (c.skills || []).forEach((s, i) => checkId('skills', s, i));
  (c.rules || []).forEach((r, i) => checkId('rules', r, i));
  (c.aspirations || []).forEach((a, i) => checkId('aspirations', a, i));
  const total = Object.values(c).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
  if (!total) warn('Ce mod ne contient aucun contenu.');
  return { errors, warnings };
}

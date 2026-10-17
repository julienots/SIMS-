// Gestionnaire de mods SUPERESSENCE STUDIO : installation, activation par monde, dépendances,
// compatibilité, ordre de chargement, export. Aucun code arbitraire n'est exécuté : les mods sont des données.
import { storage } from '../save/storage.js';
import { registry } from './registry.js';
import { validateMod, GAME_VERSION } from './validate.js';
import { satisfies } from '../core/util.js';

export const BUILTIN_MODS = ['superessence.superpowers', 'example.cuisine-du-monde', 'example.metiers-insolites', 'example.emotions-plus', 'example.vilains-extremes'];
const BUILTIN_FILES = {
  'superessence.superpowers': 'mods/superpowers.json',
  'example.cuisine-du-monde': 'mods/cuisine-du-monde.json',
  'example.metiers-insolites': 'mods/metiers-insolites.json',
  'example.emotions-plus': 'mods/emotions-plus.json',
  'example.vilains-extremes': 'mods/vilains-extremes.json',
};

export class ModManager {
  constructor() {
    this.installed = new Map();   // id -> { mod, builtin, installedAt, valid, errors, warnings }
  }

  async init(fetchJSON = defaultFetch) {
    for (const [id, file] of Object.entries(BUILTIN_FILES)) {
      try {
        const mod = await fetchJSON(file);
        this.register(mod, true);
      } catch (e) { console.warn('Mod intégré introuvable', id, e?.message); }
    }
    const user = (await storage.get('mods')) || [];
    for (const m of user) this.register(m, false);
  }

  register(mod, builtin) {
    const knownAff = [...registry.affordances.keys()];
    const v = validateMod(mod, { affordances: knownAff });
    this.installed.set(mod.id, { mod, builtin, valid: !v.errors.length, errors: v.errors, warnings: v.warnings });
    return v;
  }

  list() { return [...this.installed.values()]; }
  get(id) { return this.installed.get(id); }

  async persistUserMods() {
    const user = this.list().filter(m => !m.builtin).map(m => m.mod);
    await storage.set('mods', user);
  }

  // Installe un mod depuis un texte JSON. Renvoie { ok, errors, warnings, replaced }.
  async install(text) {
    let mod;
    try { mod = typeof text === 'string' ? JSON.parse(text) : text; }
    catch (e) { return { ok: false, errors: [`Fichier illisible : ${e.message}`], warnings: [] }; }
    if (mod?.id && this.installed.get(mod.id)?.builtin) return { ok: false, errors: ['Un mod officiel porte déjà cet identifiant.'], warnings: [] };
    const replaced = this.installed.has(mod?.id);
    const v = validateMod(mod, { affordances: [...registry.affordances.keys()] });
    if (v.errors.length) return { ok: false, ...v };
    this.register(mod, false);
    await this.persistUserMods();
    return { ok: true, replaced, ...v, mod };
  }

  async uninstall(id) {
    const m = this.installed.get(id);
    if (!m || m.builtin) return false;
    this.installed.delete(id);
    await this.persistUserMods();
    return true;
  }

  export(id) {
    const m = this.installed.get(id);
    return m ? JSON.stringify(m.mod, null, 2) : null;
  }

  // Vérifie qu'un ensemble de mods peut être activé ensemble.
  check(enabledIds) {
    const problems = [];
    for (const id of enabledIds) {
      const m = this.installed.get(id);
      if (!m) { problems.push({ id, level: 'error', text: `Mod « ${id} » non installé (ses données sont conservées dans la sauvegarde).` }); continue; }
      if (!m.valid) problems.push({ id, level: 'error', text: `« ${m.mod.name} » contient des erreurs : ${m.errors[0]}` });
      if (m.mod.gameVersion && !satisfies(GAME_VERSION, m.mod.gameVersion)) problems.push({ id, level: 'warning', text: `« ${m.mod.name} » est prévu pour la version ${m.mod.gameVersion} du jeu (version actuelle ${GAME_VERSION}).` });
      for (const d of m.mod.dependencies || []) {
        const dep = this.installed.get(d.id);
        if (!dep) problems.push({ id, level: 'error', text: `« ${m.mod.name} » nécessite le mod « ${d.name || d.id} », qui n’est pas installé.` });
        else if (!enabledIds.includes(d.id)) problems.push({ id, level: 'error', text: `« ${m.mod.name} » nécessite « ${dep.mod.name} » : activez-le aussi.` });
        else if (d.version && !satisfies(dep.mod.version, d.version)) problems.push({ id, level: 'error', text: `« ${m.mod.name} » nécessite « ${dep.mod.name} » ${d.version} (installé : ${dep.mod.version}).` });
      }
      for (const c of m.mod.conflicts || []) if (enabledIds.includes(c)) problems.push({ id, level: 'error', text: `« ${m.mod.name} » est incompatible avec « ${this.installed.get(c)?.mod.name || c} ».` });
    }
    return problems;
  }

  dependents(id, enabledIds) {
    return enabledIds.filter(e => this.installed.get(e)?.mod.dependencies?.some(d => d.id === id));
  }

  // Ordre de chargement : dépendances d'abord (tri topologique).
  loadOrder(ids) {
    const out = [], seen = new Set();
    const visit = (id, stack = new Set()) => {
      if (seen.has(id) || stack.has(id)) return;
      stack.add(id);
      for (const d of this.installed.get(id)?.mod.dependencies || []) if (ids.includes(d.id)) visit(d.id, stack);
      seen.add(id); out.push(id);
    };
    ids.forEach(id => visit(id));
    return out;
  }

  // Reconstruit le registre de contenu pour un monde. Les mods en erreur sont ignorés (et signalés).
  applyToRegistry(world) {
    registry.reset();
    const enabled = world?.d.mods.enabled || [];
    const problems = this.check(enabled);
    const blocked = new Set(problems.filter(p => p.level === 'error').map(p => p.id));
    const applied = [], conflicts = [];
    for (const id of this.loadOrder(enabled)) {
      if (blocked.has(id)) continue;
      const m = this.installed.get(id);
      if (!m) continue;
      conflicts.push(...registry.applyMod(m.mod).map(c => `${m.mod.name} → ${c}`));
      applied.push(id);
    }
    return { applied, problems, conflicts };
  }
}

async function defaultFetch(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export const mods = new ModManager();

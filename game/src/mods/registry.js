// Registre de contenu : fusionne les données de base et le contenu des mods activés.
// Chaque entrée garde sa source ('base' ou l'id du mod) pour savoir d'où elle vient.
import { NEEDS, TRAITS, EMOTIONS, SKILLS, CAREERS, ASPIRATIONS } from '../sim/data/core-data.js';
import { OBJECTS, AFFORDANCES, CATEGORIES } from '../sim/data/objects.js';
import { SOCIALS, MOODLETS } from '../sim/data/social.js';

export const CONTENT_TYPES = ['traits', 'objects', 'affordances', 'socials', 'moodlets', 'careers', 'events', 'powers', 'rules', 'skills', 'aspirations', 'categories'];

export class Registry {
  constructor() { this.reset(); }

  reset() {
    this.needs = NEEDS;
    this.emotions = EMOTIONS;
    this.traits = new Map();
    this.objects = new Map();
    this.affordances = new Map();
    this.socials = new Map();
    this.moodlets = new Map();
    this.careers = new Map();
    this.events = new Map();
    this.powers = new Map();
    this.rules = new Map();
    this.skills = new Map();
    this.aspirations = new Map();
    this.categories = new Map();
    this.activeMods = [];
    const add = (map, list) => list.forEach(e => map.set(e.id, { ...e, source: 'base' }));
    add(this.traits, TRAITS);
    add(this.objects, OBJECTS);
    add(this.affordances, Object.entries(AFFORDANCES).map(([id, a]) => ({ id, ...a })));
    add(this.socials, SOCIALS);
    add(this.moodlets, Object.entries(MOODLETS).map(([id, m]) => ({ id, ...m })));
    add(this.careers, CAREERS);
    add(this.skills, SKILLS);
    add(this.aspirations, ASPIRATIONS);
    add(this.categories, CATEGORIES);
    // Escalier : objet de construction spécial.
    this.objects.set('stairs', { id: 'stairs', name: 'Escalier', cat: 'equipement', price: 600, model: 'proc:stairs', size: [1, 3], aff: [], stairs: true, decor: 0, source: 'base' });
    this.objects.set('meal_plate', { id: 'meal_plate', name: 'Assiettes servies', cat: 'cuisine', price: 0, model: 'proc:mealplate', size: [1, 1], aff: ['eat_meal'], noCollide: true, hiddenInCatalog: true, temporary: true, source: 'base' });
  }

  // Applique le contenu d'un mod. Les ids d'un mod ne peuvent pas écraser silencieusement le jeu de base :
  // en cas de conflit, l'entrée du mod remplace l'ancienne et le conflit est consigné.
  applyMod(mod) {
    const conflicts = [];
    const c = mod.content || {};
    for (const type of CONTENT_TYPES) {
      const list = c[type];
      if (!Array.isArray(list)) continue;
      const map = this[type];
      for (const entry of list) {
        if (!entry || !entry.id) continue;
        if (map.has(entry.id)) conflicts.push(`${type}:${entry.id}`);
        map.set(entry.id, { ...entry, source: mod.id });
      }
    }
    this.activeMods.push(mod.id);
    return conflicts;
  }

  trait(id) { return this.traits.get(id); }
  object(id) { return this.objects.get(id); }
  aff(id) { return this.affordances.get(id); }
  social(id) { return this.socials.get(id); }
  moodlet(id) { return this.moodlets.get(id); }
  career(id) { return this.careers.get(id) || this.careers.get('unemployed'); }
  power(id) { return this.powers.get(id); }
  hasPowers() { return this.powers.size > 0; }
  rule(id) { return this.rules.get(id); }
}

export const registry = new Registry();

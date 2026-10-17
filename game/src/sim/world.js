// Modèle de données du monde : terrain, terrains (lots), murs, sols, objets, foyers, sims, relations, journal.
// Tout ce qui est ici est sérialisable (sauvegarde JSON). Aucune dépendance au rendu.
import { RNG, uid, clamp, Emitter } from '../core/util.js';
import { registry } from '../mods/registry.js';

export const SAVE_VERSION = 3;
export const LEVELS = 2;        // rez-de-chaussée + 1 étage
export const LEVEL_HEIGHT = 3;  // mètres

export const DEFAULT_SETTINGS = {
  style: 'stylise',            // stylise | cartoon | realiste
  realism: 'equilibre',        // detendu | equilibre | exigeant (vitesse des besoins)
  mapSize: 96,
  population: 12,
  creativeLevel: 'normal',     // normal | libre (mode créatif total disponible)
  timeScale: 1,                // multiplicateur global de la vitesse du temps
  romance: true,
  family: true,
  aging: false,
  eventFrequency: 1,           // 0 = rares, 1 = normales, 2 = fréquentes
  creatures: true,
  autonomy: 'full',            // off | low | full
  environment: 'modern',
  directControl: true,
};

export class World extends Emitter {
  constructor(data) {
    super();
    this.d = data;              // données sérialisables
    this.rng = new RNG(data.rngState || 12345);
    this.simsById = new Map();
    this.objectsById = new Map();
    this.rebuildIndexes();
  }

  static create({ name, settings, seed }) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    const size = s.mapSize;
    const data = {
      version: SAVE_VERSION,
      id: uid('world'),
      name: name || 'Mon univers',
      created: Date.now(),
      settings: s,
      time: 8 * 60,               // commence le lundi à 8h00
      rngState: seed || (Math.random() * 2 ** 31) >>> 0,
      map: { w: size, h: size, terrain: new Array(size * size).fill(0), roads: [] },
      lots: [],
      walls: {},
      floors: {},
      objects: [],
      roofs: [],
      households: [],
      sims: [],
      rel: {},
      journal: [],
      mods: { enabled: [], data: {} },
      weather: { type: 'sun', until: 0 },
      stats: { babies: 0, weddings: 0, events: 0 },
      scenario: null,
    };
    return new World(data);
  }

  get settings() { return this.d.settings; }
  get time() { return this.d.time; }
  get w() { return this.d.map.w; }
  get h() { return this.d.map.h; }
  get sims() { return this.d.sims; }
  get objects() { return this.d.objects; }

  rebuildIndexes() {
    this.simsById.clear();
    for (const s of this.d.sims) this.simsById.set(s.id, s);
    this.objectsById.clear();
    for (const o of this.d.objects) this.objectsById.set(o.id, o);
    this.rebuildOccupancy();
  }

  sim(id) { return this.simsById.get(id); }
  obj(id) { return this.objectsById.get(id); }
  household(id) { return this.d.households.find(h => h.id === id); }
  lot(id) { return this.d.lots.find(l => l.id === id); }
  lotAt(x, y) { return this.d.lots.find(l => x >= l.x && y >= l.y && x < l.x + l.w && y < l.y + l.h); }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  // ---------------------------------------------------------------- murs (sur les arêtes des cases)
  // 'h' x,y : arête horizontale entre (x,y-1) et (x,y). 'v' x,y : arête verticale entre (x-1,y) et (x,y).
  wallKey(level, dir, x, y) { return `${level}|${dir}|${x}|${y}`; }
  getWall(level, dir, x, y) { return this.d.walls[this.wallKey(level, dir, x, y)]; }
  setWall(level, dir, x, y, data) {
    const k = this.wallKey(level, dir, x, y);
    if (data) this.d.walls[k] = data; else delete this.d.walls[k];
    this._navDirty = true;
  }
  // Mur bloquant entre deux cases orthogonalement voisines ?
  blockedEdge(level, x1, y1, x2, y2) {
    let w;
    if (x1 === x2) w = this.getWall(level, 'h', x1, Math.max(y1, y2));
    else w = this.getWall(level, 'v', Math.max(x1, x2), y1);
    if (!w) return false;
    return !(w.opening && (w.opening.kind === 'door' || w.opening.kind === 'arch'));
  }
  hasWallEdge(level, x1, y1, x2, y2) {
    if (x1 === x2) return !!this.getWall(level, 'h', x1, Math.max(y1, y2));
    return !!this.getWall(level, 'v', Math.max(x1, x2), y1);
  }

  floorKey(level, x, y) { return `${level}|${x}|${y}`; }
  getFloor(level, x, y) { return this.d.floors[this.floorKey(level, x, y)]; }
  setFloor(level, x, y, style) {
    const k = this.floorKey(level, x, y);
    if (style) this.d.floors[k] = style; else delete this.d.floors[k];
    this._navDirty = true;
  }
  terrainAt(x, y) { return this.d.map.terrain[y * this.w + x] || 0; }
  setTerrain(x, y, v) { if (this.inBounds(x, y)) this.d.map.terrain[y * this.w + x] = v; }
  isRoad(x, y) { return this.terrainAt(x, y) === 3; }

  // ---------------------------------------------------------------- objets
  footprint(o) {
    const def = registry.object(o.def) || { size: [1, 1] };
    const [sw, sd] = def.size;
    const rot = o.rot & 3;
    const w = rot % 2 === 0 ? sw : sd;
    const d = rot % 2 === 0 ? sd : sw;
    return { x: o.x, y: o.y, w, d };
  }
  // Centre de l'objet en coordonnées monde (cases).
  objCenter(o) { const f = this.footprint(o); return { x: f.x + f.w / 2, y: f.y + f.d / 2 }; }
  // Transforme un point local (repère objet, +z = avant) en coordonnées monde.
  objLocalToWorld(o, lx, lz) {
    const c = this.objCenter(o);
    const a = (o.rot & 3) * Math.PI / 2;
    // rot 0 : avant vers +y (sud). Rotation horaire vue du dessus.
    const cos = Math.cos(a), sin = Math.sin(a);
    return { x: c.x + lx * cos - lz * sin, y: c.y + lx * sin + lz * cos };
  }
  objFacing(o) { return -(o.rot & 3) * Math.PI / 2; } // angle (convention atan2(dx, dy)) de la face avant

  addObject(defId, x, y, rot = 0, level = 0, extra = {}) {
    const o = { id: uid('o'), def: defId, x, y, rot: rot & 3, level, state: {}, ...extra };
    this.d.objects.push(o);
    this.objectsById.set(o.id, o);
    this.rebuildOccupancy();
    this.emit('objectAdded', o);
    return o;
  }
  removeObject(id) {
    const i = this.d.objects.findIndex(o => o.id === id);
    if (i < 0) return null;
    const [o] = this.d.objects.splice(i, 1);
    this.objectsById.delete(id);
    this.rebuildOccupancy();
    this.emit('objectRemoved', o);
    return o;
  }
  moveObject(id, x, y, rot, level) {
    const o = this.obj(id);
    if (!o) return;
    o.x = x; o.y = y; o.rot = rot & 3; if (level !== undefined) o.level = level;
    this.rebuildOccupancy();
    this.emit('objectMoved', o);
  }

  rebuildOccupancy() {
    const n = this.w * this.h;
    this.occ = [];
    for (let l = 0; l < LEVELS; l++) this.occ.push(new Int32Array(n).fill(-1));
    this.d.objects.forEach((o, idx) => {
      const def = registry.object(o.def);
      if (!def || def.noCollide || def.wall || def.ceiling) return;
      const f = this.footprint(o);
      const grid = this.occ[o.level || 0];
      for (let yy = f.y; yy < f.y + f.d; yy++)
        for (let xx = f.x; xx < f.x + f.w; xx++)
          if (this.inBounds(xx, yy)) grid[yy * this.w + xx] = idx;
    });
    this._navDirty = true;
    this.navVersion = (this.navVersion || 0) + 1;
  }
  objectAtTile(level, x, y) {
    if (!this.inBounds(x, y)) return null;
    const i = this.occ[level][y * this.w + x];
    return i >= 0 ? this.d.objects[i] : null;
  }
  canPlace(defId, x, y, rot, level = 0, ignoreId = null) {
    const def = registry.object(defId);
    if (!def) return { ok: false, why: 'Objet inconnu' };
    const f = this.footprint({ def: defId, x, y, rot });
    for (let yy = f.y; yy < f.y + f.d; yy++)
      for (let xx = f.x; xx < f.x + f.w; xx++) {
        if (!this.inBounds(xx, yy)) return { ok: false, why: 'Hors de la carte' };
        if (level > 0 && !this.getFloor(level, xx, yy)) return { ok: false, why: 'Il faut un sol à cet étage' };
        if (def.noCollide || def.wall || def.ceiling) continue;
        const o = this.objectAtTile(level, xx, yy);
        if (o && o.id !== ignoreId) return { ok: false, why: 'Emplacement occupé' };
        if (this.isRoad(xx, yy) && !def.building && level === 0) return { ok: false, why: 'Impossible sur la route' };
      }
    // Pas de mur qui traverse l'emprise.
    if (!def.building) {
      for (let yy = f.y; yy < f.y + f.d; yy++)
        for (let xx = f.x; xx < f.x + f.w; xx++) {
          if (xx + 1 < f.x + f.w && this.hasWallEdge(level, xx, yy, xx + 1, yy)) return { ok: false, why: 'Un mur traverse l’objet' };
          if (yy + 1 < f.y + f.d && this.hasWallEdge(level, xx, yy, xx, yy + 1)) return { ok: false, why: 'Un mur traverse l’objet' };
        }
    }
    if (def.wall) {
      // Objet mural : un mur doit se trouver derrière (côté opposé à la face avant).
      const back = this.backEdge({ def: defId, x, y, rot }, level);
      if (!back) return { ok: false, why: 'Doit être posé contre un mur' };
    }
    return { ok: true };
  }
  // Arête de mur derrière un objet 1x1 (pour les objets muraux).
  backEdge(o, level) {
    const r = o.rot & 3;
    const x = o.x, y = o.y;
    // avant : r0 +y, r1 -x, r2 -y, r3 +x  => arrière opposé
    const k = [['h', x, y], ['v', x + 1, y], ['h', x, y + 1], ['v', x, y]][r];
    return this.getWall(level, k[0], k[1], k[2]);
  }

  // ---------------------------------------------------------------- navigation
  walkable(level, x, y) {
    if (!this.inBounds(x, y)) return false;
    if (level > 0 && !this.getFloor(level, x, y)) return false;
    if (this.occ[level][y * this.w + x] >= 0) {
      const o = this.d.objects[this.occ[level][y * this.w + x]];
      const def = registry.object(o.def);
      if (def && def.building) return false;
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- relations (dirigées : opinion de a sur b)
  rel(a, b, create = true) {
    const k = `${a}|${b}`;
    let r = this.d.rel[k];
    if (!r && create) {
      r = this.d.rel[k] = { friend: 0, romance: 0, status: 'stranger', known: false, mem: [], flags: {} };
    }
    return r;
  }
  relPairs(id) {
    const out = [];
    for (const k in this.d.rel) {
      const [a, b] = k.split('|');
      if (a === id && this.sim(b)) out.push({ other: b, r: this.d.rel[k] });
    }
    return out;
  }
  setStatus(a, b, status) {
    this.rel(a, b).status = status;
    this.rel(b, a).status = status;
  }

  // ---------------------------------------------------------------- journal
  log(type, text, simIds = [], opts = {}) {
    const entry = { t: this.d.time, type, text, sims: simIds, icon: opts.icon || '•', important: !!opts.important };
    this.d.journal.push(entry);
    if (this.d.journal.length > 1500) this.d.journal.splice(0, this.d.journal.length - 1500);
    this.emit('journal', entry);
    return entry;
  }

  // ---------------------------------------------------------------- foyers
  householdOf(sim) { return this.household(sim.householdId); }
  homeLot(sim) { const h = this.householdOf(sim); return h ? this.lot(h.lotId) : null; }
  funds(sim) { return this.householdOf(sim)?.funds ?? 0; }
  spend(sim, amount) {
    const h = this.householdOf(sim);
    if (!h) return true;
    if (this.settings.creativeLevel === 'libre' && this.creativeFreeBuild) return true;
    if (h.funds < amount) return false;
    h.funds -= amount;
    return true;
  }
  earn(sim, amount) { const h = this.householdOf(sim); if (h) h.funds += amount; }

  objectsOnLot(lot) {
    if (!lot) return [];
    return this.d.objects.filter(o => o.x >= lot.x && o.y >= lot.y && o.x < lot.x + lot.w && o.y < lot.y + lot.h);
  }

  serialize() {
    this.d.rngState = this.rng.state;
    const sims = this.d.sims.map(s => {
      const { _rt, ...rest } = s;
      return rest;
    });
    return JSON.stringify({ ...this.d, sims });
  }

  static deserialize(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    migrate(data);
    return new World(data);
  }
}

// Migrations de sauvegarde : chaque version ajoute les champs manquants sans perdre de données.
export function migrate(data) {
  if (!data.version) data.version = 1;
  if (data.version < 2) {
    data.mods ||= { enabled: [], data: {} };
    data.stats ||= { babies: 0, weddings: 0, events: 0 };
    data.version = 2;
  }
  if (data.version < 3) {
    data.weather ||= { type: 'sun', until: 0 };
    data.roofs ||= [];
    for (const s of data.sims) { s.modData ||= {}; s.memories ||= []; }
    data.version = 3;
  }
  data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  for (const s of data.sims) {
    s.modData ||= {};
    s.queue ||= [];
    s.moodlets ||= [];
  }
  return data;
}

export function clampNeed(v) { return clamp(v, 0, 100); }

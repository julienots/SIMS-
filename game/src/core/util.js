// Utilitaires partagés par la simulation et l'interface (aucune dépendance au rendu).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

// Générateur pseudo-aléatoire déterministe (mulberry32) : un monde garde son état d'aléa dans la sauvegarde.
export class RNG {
  constructor(seed = Date.now() >>> 0) { this.state = seed >>> 0; }
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  weighted(items, weightFn) {
    let total = 0;
    const w = items.map(it => { const x = Math.max(0, weightFn(it)); total += x; return x; });
    if (total <= 0) return null;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
}

export class Emitter {
  constructor() { this.handlers = new Map(); }
  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.handlers.get(evt)?.delete(fn);
  }
  emit(evt, data) {
    const hs = this.handlers.get(evt);
    if (hs) for (const fn of [...hs]) { try { fn(data); } catch (e) { console.error('handler', evt, e); } }
    const any = this.handlers.get('*');
    if (any) for (const fn of [...any]) { try { fn(evt, data); } catch (e) { console.error(e); } }
  }
}

// Comparaison de versions sémantiques simples "1.2.3" et contraintes ">=1.0.0", "^1.2.0", "1.x".
export function parseVersion(v) {
  const m = String(v).trim().match(/^(\d+)(?:\.(\d+|x))?(?:\.(\d+|x))?/);
  if (!m) return null;
  return [m[1], m[2] ?? '0', m[3] ?? '0'].map(p => (p === 'x' ? -1 : parseInt(p, 10)));
}
export function compareVersions(a, b) {
  const va = parseVersion(a), vb = parseVersion(b);
  for (let i = 0; i < 3; i++) { if (va[i] !== vb[i]) return va[i] < vb[i] ? -1 : 1; }
  return 0;
}
export function satisfies(version, constraint) {
  if (!constraint || constraint === '*') return true;
  const c = String(constraint).trim();
  const v = parseVersion(version);
  if (!v) return false;
  if (c.startsWith('>=')) return compareVersions(version, c.slice(2)) >= 0;
  if (c.startsWith('<=')) return compareVersions(version, c.slice(2)) <= 0;
  if (c.startsWith('>')) return compareVersions(version, c.slice(1)) > 0;
  if (c.startsWith('<')) return compareVersions(version, c.slice(1)) < 0;
  if (c.startsWith('^')) {
    const base = parseVersion(c.slice(1));
    return v[0] === base[0] && compareVersions(version, c.slice(1)) >= 0;
  }
  const p = parseVersion(c);
  if (!p) return false;
  return p.every((x, i) => x === -1 || x === v[i]);
}

export function deepClone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

export function formatMoney(n) { return `✦ ${Math.round(n).toLocaleString('fr-FR')}`; }

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export function formatClock(minutes) {
  const m = Math.floor(minutes % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export function dayOf(minutes) { return Math.floor(minutes / 1440); }

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

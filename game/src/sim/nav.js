// Recherche de chemin A* sur la grille (niveaux, murs sur les arêtes, portes, escaliers, portails).
import { registry } from '../mods/registry.js';
import { LEVELS } from './world.js';

class Heap {
  constructor() { this.a = []; }
  push(n, f) {
    const a = this.a; a.push([f, n]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
  get size() { return this.a.length; }
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export class Navigator {
  constructor(world) {
    this.world = world;
    this.links = [];      // liens spéciaux : escaliers, portails
    this.version = -1;
  }

  refresh() {
    const w = this.world;
    if (this.version === w.navVersion && !w._navDirty) return;
    this.version = w.navVersion;
    w._navDirty = false;
    this.links = [];
    for (const o of w.objects) {
      const def = registry.object(o.def);
      if (!def) continue;
      if (def.stairs && (o.level || 0) < LEVELS - 1) {
        // Bas : case devant l'escalier ; haut : case derrière, à l'étage supérieur.
        const bottom = w.objLocalToWorld(o, 0, 2.0);
        const top = w.objLocalToWorld(o, 0, -2.0);
        const a = { l: o.level || 0, x: Math.floor(bottom.x), y: Math.floor(bottom.y) };
        const b = { l: (o.level || 0) + 1, x: Math.floor(top.x), y: Math.floor(top.y) };
        this.links.push({ a, b, cost: 5, kind: 'stairs', obj: o.id });
      }
      if (o.state?.portalTo) {
        const other = w.obj(o.state.portalTo);
        if (other) {
          const a = { l: o.level || 0, x: o.x, y: o.y + 1 };
          const b = { l: other.level || 0, x: other.x, y: other.y + 1 };
          this.links.push({ a, b, cost: 1, kind: 'portal', obj: o.id, oneWay: true });
        }
      }
    }
    this.linkMap = new Map();
    for (const lk of this.links) {
      const add = (from, to) => {
        const k = this.key(from.l, from.x, from.y);
        if (!this.linkMap.has(k)) this.linkMap.set(k, []);
        this.linkMap.get(k).push({ to, cost: lk.cost, kind: lk.kind, obj: lk.obj });
      };
      add(lk.a, lk.b);
      if (!lk.oneWay) add(lk.b, lk.a);
    }
  }

  key(l, x, y) { return (l * this.world.h + y) * this.world.w + x; }

  // Peut-on se tenir sur cette case ? (mode : 'walk' | 'climb' | 'fly')
  passable(l, x, y, mode, allowOcc) {
    const w = this.world;
    if (!w.inBounds(x, y)) return false;
    if (mode === 'fly') return true;
    if (l > 0 && !w.getFloor(l, x, y)) return false;
    if (l === 0 && w.d.map.terrain[y * w.w + x] === 4) return false;   // eau
    if (allowOcc && allowOcc.has(this.key(l, x, y))) return true;
    return w.occ[l][y * w.w + x] < 0;
  }

  // Calcule un chemin de (sl,sx,sy) vers l'une des cibles (tableau de {l,x,y}).
  findPath(start, goals, opts = {}) {
    this.refresh();
    const w = this.world;
    const mode = opts.mode || 'walk';
    const maxNodes = opts.maxNodes || 40000;
    const allowOcc = new Set();
    allowOcc.add(this.key(start.l, start.x, start.y));
    const goalSet = new Map();
    for (const g of goals) {
      if (!w.inBounds(g.x, g.y)) continue;
      const k = this.key(g.l, g.x, g.y);
      goalSet.set(k, g);
      if (opts.goalsMayBeOccupied) allowOcc.add(k);
    }
    if (!goalSet.size) return null;
    const sk = this.key(start.l, start.x, start.y);
    if (goalSet.has(sk)) return [{ l: start.l, x: start.x, y: start.y }];
    const h = (l, x, y) => {
      let best = Infinity;
      for (const g of goalSet.values()) {
        const dx = Math.abs(g.x - x), dy = Math.abs(g.y - y);
        const d = Math.max(dx, dy) + 0.414 * Math.min(dx, dy) + Math.abs(g.l - l) * 4;
        if (d < best) best = d;
      }
      return best;
    };
    const open = new Heap();
    const gScore = new Map([[sk, 0]]);
    const came = new Map();
    const nodeOf = new Map([[sk, { l: start.l, x: start.x, y: start.y }]]);
    open.push(sk, h(start.l, start.x, start.y));
    const closed = new Set();
    let explored = 0;
    while (open.size) {
      const k = open.pop();
      if (closed.has(k)) continue;
      closed.add(k);
      if (goalSet.has(k)) return this.rebuild(came, nodeOf, k);
      if (++explored > maxNodes) break;
      const n = nodeOf.get(k);
      const g0 = gScore.get(k);
      for (const [dx, dy, c] of DIRS) {
        const nx = n.x + dx, ny = n.y + dy;
        if (!this.passable(n.l, nx, ny, mode, allowOcc)) continue;
        if (mode === 'walk') {
          if (dx && dy) {
            // Diagonale : les deux côtés orthogonaux doivent être libres, sans mur au coin.
            if (!this.passable(n.l, n.x + dx, n.y, mode, allowOcc) || !this.passable(n.l, n.x, n.y + dy, mode, allowOcc)) continue;
            if (w.hasWallEdge(n.l, n.x, n.y, n.x + dx, n.y) || w.hasWallEdge(n.l, n.x, n.y, n.x, n.y + dy) ||
                w.hasWallEdge(n.l, n.x + dx, n.y, nx, ny) || w.hasWallEdge(n.l, n.x, n.y + dy, nx, ny)) continue;
          } else if (w.blockedEdge(n.l, n.x, n.y, nx, ny)) continue;
        }
        let cost = c;
        if (mode === 'walk' && w.isRoad(nx, ny) && n.l === 0) cost += 0.3;   // préfère les trottoirs
        if (mode === 'climb' && w.hasWallEdge(n.l, n.x, n.y, nx, ny)) cost += 3;
        this.relax(k, n.l, nx, ny, g0 + cost, open, gScore, came, nodeOf, closed, h);
      }
      const links = this.linkMap?.get(k);
      if (links && mode !== 'fly') for (const lk of links) {
        if (!this.passable(lk.to.l, lk.to.x, lk.to.y, mode, allowOcc) && !goalSet.has(this.key(lk.to.l, lk.to.x, lk.to.y))) continue;
        this.relax(k, lk.to.l, lk.to.x, lk.to.y, g0 + lk.cost, open, gScore, came, nodeOf, closed, h, lk);
      }
    }
    return null;
  }

  relax(fromK, l, x, y, g, open, gScore, came, nodeOf, closed, h, link) {
    const k = this.key(l, x, y);
    if (closed.has(k)) return;
    const old = gScore.get(k);
    if (old !== undefined && old <= g) return;
    gScore.set(k, g);
    came.set(k, fromK);
    nodeOf.set(k, { l, x, y, link: link ? link.kind : undefined, obj: link ? link.obj : undefined });
    open.push(k, g + h(l, x, y));
  }

  rebuild(came, nodeOf, k) {
    const path = [];
    while (k !== undefined) { path.push(nodeOf.get(k)); k = came.get(k); }
    return path.reverse();
  }

  // Case praticable la plus proche (pour débloquer un sim ou poser un nouveau venu).
  nearestFree(l, x, y, radius = 12) {
    const w = this.world;
    x = Math.floor(x); y = Math.floor(y);
    for (let r = 0; r <= radius; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.passable(l, x + dx, y + dy, 'walk')) return { l, x: x + dx, y: y + dy };
        }
    if (l > 0) return this.nearestFree(0, x, y, radius);
    return null;
  }
}

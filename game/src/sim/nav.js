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
    this.buildGrids();
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

  // Grilles typées des murs (0 aucun, 1 bloquant, 2 ouverture praticable) et des sols, pour un A* rapide.
  buildGrids() {
    const w = this.world, W = w.w, H = w.h, n = W * H;
    this.hW = []; this.vW = []; this.fl = [];
    for (let l = 0; l < LEVELS; l++) { this.hW.push(new Uint8Array((W + 1) * (H + 1))); this.vW.push(new Uint8Array((W + 1) * (H + 1))); this.fl.push(new Uint8Array(n)); }
    for (const k in w.d.walls) {
      const [lv, dir, xs, ys] = k.split('|');
      const x = +xs, y = +ys, l = +lv;
      if (x < 0 || y < 0 || x > W || y > H || l >= LEVELS) continue;
      const op = w.d.walls[k].opening;
      const v = op && (op.kind === 'door' || op.kind === 'arch') ? 2 : 1;
      (dir === 'h' ? this.hW : this.vW)[l][y * (W + 1) + x] = v;
    }
    for (const k in w.d.floors) {
      const [lv, xs, ys] = k.split('|');
      const x = +xs, y = +ys, l = +lv;
      if (w.inBounds(x, y) && l < LEVELS) this.fl[l][y * W + x] = 1;
    }
  }
  // Arête entre deux cases voisines orthogonales : 0 libre, 1 mur, 2 porte.
  edge(l, x1, y1, x2, y2) {
    const W1 = this.world.w + 1;
    if (x1 === x2) return this.hW[l][Math.max(y1, y2) * W1 + x1];
    return this.vW[l][y1 * W1 + Math.max(x1, x2)];
  }

  key(l, x, y) { return (l * this.world.h + y) * this.world.w + x; }

  // Peut-on se tenir sur cette case ? (mode : 'walk' | 'climb' | 'fly')
  passable(l, x, y, mode, allowOcc) {
    const w = this.world;
    if (!w.inBounds(x, y)) return false;
    if (mode === 'fly') return true;
    if (l > 0 && !(this.fl ? this.fl[l][y * w.w + x] : w.getFloor(l, x, y))) return false;
    if (l === 0 && w.d.map.terrain[y * w.w + x] === 4) return false;   // eau
    if (allowOcc && allowOcc.has(this.key(l, x, y))) return true;
    return w.occ[l][y * w.w + x] < 0;
  }

  ensureBuffers() {
    const n = this.world.w * this.world.h * LEVELS;
    if (!this.gBuf || this.gBuf.length !== n) {
      this.gBuf = new Float32Array(n);
      this.cameBuf = new Int32Array(n);
      this.stamp = new Uint32Array(n);      // génération où gBuf est valide
      this.closedStamp = new Uint32Array(n);
      this.linkKind = new Uint8Array(n);    // 0 = normal, 1 = escalier, 2 = portail
      this.gen = 0;
    }
    this.gen = (this.gen + 1) >>> 0;
    if (this.gen === 0) { this.stamp.fill(0); this.closedStamp.fill(0); this.gen = 1; }
  }

  // Calcule un chemin de start vers l'une des cibles (tableau de {l,x,y}). A* sur tableaux typés.
  findPath(start, goals, opts = {}) {
    this.refresh();
    const w = this.world;
    const W = w.w, H = w.h;
    const mode = opts.mode || 'walk';
    const maxNodes = opts.maxNodes || 20000;
    this.ensureBuffers();
    const gen = this.gen;
    const allowOcc = new Set();
    const sk = this.key(start.l, start.x, start.y);
    allowOcc.add(sk);
    const goalKeys = new Set();
    const gl = [];
    for (const g of goals) {
      if (!w.inBounds(g.x, g.y)) continue;
      const k = this.key(g.l, g.x, g.y);
      goalKeys.add(k); gl.push(g);
      if (opts.goalsMayBeOccupied) allowOcc.add(k);
    }
    if (!gl.length) return null;
    if (goalKeys.has(sk)) return [{ l: start.l, x: start.x, y: start.y }];
    const h = (l, x, y) => {
      let best = Infinity;
      for (let i = 0; i < gl.length; i++) {
        const g = gl[i];
        const dx = Math.abs(g.x - x), dy = Math.abs(g.y - y);
        const d = Math.max(dx, dy) + 0.414 * Math.min(dx, dy) + Math.abs(g.l - l) * 4;
        if (d < best) best = d;
      }
      return best;
    };
    const G = this.gBuf, came = this.cameBuf, stamp = this.stamp, closed = this.closedStamp, lk = this.linkKind;
    const open = new Heap();
    G[sk] = 0; stamp[sk] = gen; came[sk] = -1; lk[sk] = 0;
    open.push(sk, h(start.l, start.x, start.y));
    const plane = W * H;
    let explored = 0;
    const relax = (fromK, k, g, l, x, y, kind) => {
      if (closed[k] === gen) return;
      if (stamp[k] === gen && G[k] <= g) return;
      G[k] = g; stamp[k] = gen; came[k] = fromK; lk[k] = kind;
      open.push(k, g + h(l, x, y));
    };
    while (open.size) {
      const k = open.pop();
      if (closed[k] === gen) continue;
      closed[k] = gen;
      if (goalKeys.has(k)) return this.rebuildTyped(k, plane, W);
      if (++explored > maxNodes) break;
      const l = Math.floor(k / plane), rem = k - l * plane, y = Math.floor(rem / W), x = rem - y * W;
      const g0 = G[k];
      for (let d = 0; d < 8; d++) {
        const dx = DIRS[d][0], dy = DIRS[d][1];
        const nx = x + dx, ny = y + dy;
        if (!this.passable(l, nx, ny, mode, allowOcc)) continue;
        if (mode === 'walk') {
          if (dx && dy) {
            if (!this.passable(l, x + dx, y, mode, allowOcc) || !this.passable(l, x, y + dy, mode, allowOcc)) continue;
            if (this.edge(l, x, y, x + dx, y) || this.edge(l, x, y, x, y + dy) ||
                this.edge(l, x + dx, y, nx, ny) || this.edge(l, x, y + dy, nx, ny)) continue;
          } else if (this.edge(l, x, y, nx, ny) === 1) continue;
        }
        let cost = DIRS[d][2];
        if (mode === 'walk' && l === 0 && w.d.map.terrain[ny * W + nx] === 3) cost += 0.3;   // préfère les trottoirs
        if (mode === 'climb' && this.edge(l, x, y, nx, ny)) cost += 3;
        relax(k, l * plane + ny * W + nx, g0 + cost, l, nx, ny, 0);
      }
      const links = this.linkMap?.get(k);
      if (links && mode !== 'fly') for (const link of links) {
        const t = link.to;
        const tk = this.key(t.l, t.x, t.y);
        if (!this.passable(t.l, t.x, t.y, mode, allowOcc) && !goalKeys.has(tk)) continue;
        relax(k, tk, g0 + link.cost, t.l, t.x, t.y, link.kind === 'portal' ? 2 : 1);
      }
    }
    return null;
  }

  rebuildTyped(k, plane, W) {
    const path = [];
    while (k >= 0) {
      const l = Math.floor(k / plane), rem = k - l * plane, y = Math.floor(rem / W), x = rem - y * W;
      const kind = this.linkKind[k];
      path.push({ l, x, y, link: kind === 1 ? 'stairs' : kind === 2 ? 'portal' : undefined });
      k = this.cameBuf[k];
    }
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

// Circulation d'ambiance (affichage seulement, comme dans les Sims) : voitures sur les routes, conduite à droite,
// virages aux carrefours, distance de sécurité, arrêt devant un Sim qui traverse. Suit la vitesse du jeu.
import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const MODELS = ['city/car_sedan', 'city/car_hatchback', 'city/car_stationwagon', 'city/car_taxi', 'city/car_sedan', 'city/car_hatchback', 'city/car_police'];
const SPEED_MULT = [0, 1, 1.6, 2.4];
const ROAD = 4;

export class Traffic {
  constructor(root, world, sim, quality) {
    this.root = root; this.world = world; this.sim = sim;
    this.cars = [];
    const rx = world.d.map.roadsX || [], ry = world.d.map.roadsY || [];
    this.rx = rx; this.ry = ry;
    if (!rx.length && !ry.length) return;
    const n = Math.min(quality.particles ? 26 : 10, (rx.length + ry.length) * 3);
    for (let i = 0; i < n; i++) {
      const vertical = (i % 2 === 0 && rx.length) || !ry.length;
      const road = vertical ? rx[i % rx.length] : ry[i % ry.length];
      const car = { vertical, road, dir: Math.random() < 0.5 ? 1 : -1, s: Math.random() * (vertical ? world.h : world.w), v: 0, vmax: 6 + Math.random() * 3, group: new THREE.Group(), lastCross: null };
      this.root.add(car.group);
      this.cars.push(car);
      loadGLB(MODELS[i % MODELS.length]).then(g => {
        const m = skeletonClone(g.scene);
        m.scale.setScalar(4.4);
        m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        car.group.add(m);
      }).catch(() => {});
    }
  }

  // Position monde d'une voiture : voie de droite selon le sens.
  pos(c) {
    if (c.vertical) return { x: c.road + (c.dir > 0 ? 1.05 : 2.95), z: c.s };
    return { x: c.s, z: c.road + (c.dir > 0 ? 2.95 : 1.05) };
  }

  update(dt) {
    if (!this.cars.length) return;
    const mult = SPEED_MULT[this.sim.speedIdx] ?? 1;
    const W = this.world;
    for (const c of this.cars) {
      // Distance libre devant : autre voiture dans la même voie, ou Sim sur la chaussée.
      let gap = Infinity;
      for (const o of this.cars) if (o !== c && o.vertical === c.vertical && o.road === c.road && o.dir === c.dir) {
        const d = (o.s - c.s) * c.dir;
        if (d > 0 && d < gap) gap = d;
      }
      const p = this.pos(c);
      for (const s of W.sims) {
        if (s._rt?.hidden || s.pos.l !== 0) continue;
        const dx = s.pos.x - p.x, dz = s.pos.y - p.z;
        const ahead = c.vertical ? dz * c.dir : dx * c.dir, side = c.vertical ? Math.abs(dx) : Math.abs(dz);
        if (ahead > 0 && ahead < 6 && side < 1.6) gap = Math.min(gap, ahead);
      }
      const target = gap < 4.5 ? 0 : gap < 9 ? c.vmax * 0.4 : c.vmax;
      c.v += (target - c.v) * Math.min(1, dt * (target < c.v ? 5 : 1.5));
      c.s += c.v * c.dir * dt * mult;
      // Virage éventuel au centre d'un carrefour.
      const cross = c.vertical ? this.ry : this.rx;
      for (const q of cross) {
        const center = q + ROAD / 2;
        if (c.lastCross !== q && Math.abs(c.s - center) < 0.25 && Math.random() < 0.3) {
          const fromRoad = c.road, fromS = center;
          c.vertical = !c.vertical; c.road = q; c.s = fromRoad + ROAD / 2; c.dir = Math.random() < 0.5 ? 1 : -1;
          c.lastCross = fromRoad; void fromS;
          break;
        }
        if (Math.abs(c.s - center) > 3 && c.lastCross === q) c.lastCross = null;
      }
      // Sortie de carte : réapparaît de l'autre côté.
      const len = c.vertical ? W.h : W.w;
      if (c.s < -6) c.s = len + 5; else if (c.s > len + 6) c.s = -5;
      const np = this.pos(c);
      c.group.position.set(np.x, 0, np.z);
      const want = c.vertical ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      c.group.rotation.y = want;
    }
  }

  dispose() { for (const c of this.cars) this.root.remove(c.group); this.cars = []; }
}

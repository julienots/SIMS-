// Animaux de compagnie : chiens adoptés par un foyer. Ils vivent sur le terrain, suivent leurs maîtres, ont faim,
// envie de jouer et besoin d'affection ; les Sims les caressent, jouent avec eux et les nourrissent (seuls ou sur ordre).
import { clamp, uid } from '../core/util.js';
import { ANIMALS } from './data/animals.js';

export const PET_KINDS = [
  { kind: 'beagle', name: 'Beagle', price: 300 },
  { kind: 'shepherd', name: 'Berger allemand', price: 450 },
];
const NAMES = ['Rex', 'Biscotte', 'Filou', 'Nala', 'Oslo', 'Pépite', 'Tango', 'Moka', 'Gribouille', 'Lucky', 'Praline', 'Scout'];
export const PET_ACTIONS = {
  pet_pet: { name: 'Caresser', icon: '🤗', dur: 12, sim: { social: 10, fun: 6 }, pet: { affection: 35, fun: 5 }, moodlet: 'pet_cuddle', anim: 'pickup' },
  pet_play: { name: 'Jouer à la balle', icon: '🎾', dur: 20, sim: { fun: 22, energy: -6 }, pet: { fun: 45, affection: 10 }, moodlet: 'pet_play', anim: 'throw' },
  pet_feed: { name: 'Donner à manger', icon: '🦴', dur: 8, sim: {}, pet: { hunger: 70 }, anim: 'pickup', cost: 5 },
};

export class PetSystem {
  constructor(S) { this.S = S; }
  get w() { return this.S.world; }
  list() { return (this.w.d.critters || []).filter(c => c.pet); }
  ofHousehold(hhId) { return this.list().filter(c => c.hh === hhId); }
  get(id) { return (this.w.d.critters || []).find(c => c.id === id && c.pet); }

  adopt(hhId, kind, name) {
    const w = this.w;
    const h = w.household(hhId);
    if (!h) return { error: 'Aucun foyer' };
    const k = PET_KINDS.find(p => p.kind === kind) || PET_KINDS[0];
    if (h.funds < k.price) return { error: `Il faut ✦${k.price} pour adopter.` };
    if (this.ofHousehold(hhId).length >= 3) return { error: 'Trois animaux au maximum par foyer.' };
    const lot = w.lot(h.lotId);
    const member = w.sim(h.members.find(id => w.sim(id)?.stage !== 'baby'));
    const at = member ? { x: member.pos.x, y: member.pos.y } : lot ? { x: lot.x + lot.w / 2, y: lot.y + lot.h / 2 } : { x: 10, y: 10 };
    const f = this.S.nav.nearestFree(0, Math.floor(at.x), Math.floor(at.y) + 1, 6) || { x: Math.floor(at.x), y: Math.floor(at.y) };
    h.funds -= k.price;
    const pet = { id: uid('pet'), pet: true, kind: k.kind, hh: hhId, name: name || NAMES[Math.floor(Math.random() * NAMES.length)],
      x: f.x + 0.5, y: f.y + 0.5, tx: f.x, ty: f.y, rot: 0, state: 'idle', t: 0, needs: { hunger: 80, fun: 70, affection: 70 }, busyUntil: 0, adoptedAt: w.time };
    (w.d.critters ||= []).push(pet);
    w.log('family', `🐶 Le foyer ${h.name} a adopté ${pet.name}, un ${k.name.toLowerCase()} !`, h.members, { icon: '🐶', important: true });
    this.S.emit('notify', { text: `Bienvenue à ${pet.name} !`, icon: '🐶' });
    return { pet };
  }

  // Comportement : faim/jeu/affection baissent ; le chien reste sur son terrain et suit souvent un maître présent.
  step(dt, dtMin) {
    const w = this.w;
    for (const c of this.list()) {
      const n = c.needs;
      n.hunger = clamp(n.hunger - 0.035 * dtMin, 0, 100);
      n.fun = clamp(n.fun - 0.05 * dtMin, 0, 100);
      n.affection = clamp(n.affection - 0.04 * dtMin, 0, 100);
      c.bubble = n.hunger < 25 ? '🦴' : n.affection < 25 ? '💗' : n.fun < 25 ? '🎾' : null;
      if (c.busyUntil > w.time) { c.state = 'idle'; continue; }
      const h = w.household(c.hh);
      const lot = h && w.lot(h.lotId);
      const tx = c.tx + 0.5, ty = c.ty + 0.5;
      const d = Math.hypot(tx - c.x, ty - c.y);
      if (d < 0.1) {
        c.t -= dt;
        if (c.state !== 'idle') { c.state = 'idle'; c.t = 1.5 + Math.random() * 5; }
        if (c.t > 0) continue;
        c.t = 1;
        // Suit un maître présent sur le terrain (ou tout près), sinon se promène sur le terrain.
        const owners = (h?.members || []).map(id => w.sim(id)).filter(s => s && !s._rt.hidden && s.stage !== 'baby' && s.pos.l === 0);
        const near = owners.filter(s => Math.hypot(s.pos.x - c.x, s.pos.y - c.y) < 14);
        let goal = null;
        if (near.length && Math.random() < 0.55) {
          const s = near[Math.floor(Math.random() * near.length)];
          goal = this.S.nav.nearestFree(0, Math.floor(s.pos.x + (Math.random() - 0.5) * 3), Math.floor(s.pos.y + (Math.random() - 0.5) * 3), 3);
        } else if (lot) {
          for (let k = 0; k < 8 && !goal; k++) {
            const x = lot.x + Math.floor(Math.random() * lot.w), y = lot.y + Math.floor(Math.random() * lot.h);
            if (this.S.nav.passable(0, x, y, 'walk')) goal = { x, y };
          }
        }
        if (goal) { c.tx = goal.x; c.ty = goal.y; c.state = Math.random() < 0.15 ? 'flee' : 'walk'; }   // « flee » = course joyeuse
      } else {
        const sp = (c.state === 'flee' ? 3 : 1.4) * dt;
        const st = Math.min(d, sp);
        const nx = c.x + (tx - c.x) / d * st, ny = c.y + (ty - c.y) / d * st;
        if (this.S.nav.passable(0, Math.floor(nx), Math.floor(ny), 'walk') || (Math.floor(nx) === Math.floor(c.x) && Math.floor(ny) === Math.floor(c.y))) { c.x = nx; c.y = ny; }
        else { c.tx = Math.floor(c.x); c.ty = Math.floor(c.y); }
        c.rot = Math.atan2(tx - c.x, ty - c.y);
      }
    }
  }

  // Menu radial sur un animal.
  menu(s, c) {
    const items = [];
    const own = s.householdId === c.hh;
    for (const [id, a] of Object.entries(PET_ACTIONS)) {
      if (id === 'pet_feed' && !own) continue;
      items.push({ label: a.name, icon: a.icon, cat: 'friendly', disabled: s.stage === 'baby' ? 'Trop jeune' : null, action: { kind: 'pet', petId: c.id, act: id, name: `${a.name} : ${c.name}`, icon: a.icon } });
    }
    return items;
  }

  // Options autonomes pour les Sims du foyer : ils s'occupent du chien quand il en a besoin (ou par plaisir).
  autonomousOptions(s) {
    const out = [];
    if (s.stage === 'baby') return out;
    for (const c of this.ofHousehold(s.householdId)) {
      const dd = Math.hypot(c.x - s.pos.x, c.y - s.pos.y);
      if (dd > 30 || c.busyUntil > this.w.time) continue;
      const k = 1 / (1 + dd / 15);
      const n = c.needs;
      // Échelle comparable aux activités d'objets (2 à 5 quand le besoin est pressant).
      const kindTrait = s.traits.some(t => ['kind', 'protective', 'loner'].includes(t)) ? 1.3 : 1;
      out.push({ score: k * (((100 - n.hunger) / 100) ** 1.5 * 6), action: { kind: 'pet', petId: c.id, act: 'pet_feed', name: `Nourrir ${c.name}`, icon: '🦴' } });
      out.push({ score: k * kindTrait * (((100 - n.affection) / 100) ** 1.3 * 4 + (100 - s.needs.social) / 60), action: { kind: 'pet', petId: c.id, act: 'pet_pet', name: `Caresser ${c.name}`, icon: '🤗' } });
      out.push({ score: k * (((100 - n.fun) / 100) ** 1.3 * 3.5 + (100 - s.needs.fun) / 50) * (s.needs.energy > 25 ? 1 : 0.2), action: { kind: 'pet', petId: c.id, act: 'pet_play', name: `Jouer avec ${c.name}`, icon: '🎾' } });
    }
    return out;
  }

  // Action « pet » : rejoindre l'animal, l'immobiliser, interagir, appliquer les effets.
  run(s, a, dt, dtMin) {
    const S = this.S, w = this.w;
    const c = this.get(a.petId);
    const def = PET_ACTIONS[a.act];
    if (!c || !def) { S.finish(s, a, true); return; }
    if (a.phase === 'exit') { S.finish(s, a, !a.done); return; }
    if (a.phase === 'start') { a.phase = 'route'; s._rt.path = null; a.repath = 0; }
    if (a.phase === 'route') {
      const dd = Math.hypot(c.x - s.pos.x, c.y - s.pos.y);
      if (dd < 1.3) { a.phase = 'loop'; a.t = 0; c.busyUntil = w.time + def.dur + 2; return; }
      // Le chien bouge : on recalcule le trajet régulièrement.
      a.repath = (a.repath || 0) - dt;
      if (a.repath <= 0) { s._rt.path = null; a.repath = 2; a._goal = { l: 0, x: Math.floor(c.x), y: Math.floor(c.y) }; }
      c.busyUntil = w.time + 3;   // attend son maître
      const r = S.routeTo(s, a, [a._goal, ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => ({ l: 0, x: a._goal.x + x, y: a._goal.y + y, alt: true }))]);
      if (r === 'failed') { S.notifyFail(s, `${s.first} n’arrive pas à rejoindre ${c.name}.`); S.finish(s, a, true); }
      return;
    }
    if (a.phase === 'loop') {
      a.t += dtMin;
      S.face(s, c.x, c.y);
      c.rot = Math.atan2(s.pos.x - c.x, s.pos.y - c.y);
      c.busyUntil = w.time + 2;
      s._rt.anim = a.act === 'pet_play' ? (Math.floor(a.t / 3) % 2 ? 'throw' : 'cheer') : 'pickup';
      if (a.t >= def.dur) {
        if (def.cost && w.funds(s) >= def.cost) w.spend(s, def.cost);
        for (const [k, v] of Object.entries(def.sim)) s.needs[k] = clamp((s.needs[k] ?? 0) + v, 0, 100);
        for (const [k, v] of Object.entries(def.pet)) c.needs[k] = clamp(c.needs[k] + v, 0, 100);
        if (def.moodlet) S.addMoodlet(s, def.moodlet);
        S.bubble(s, def.icon, 5);
        S.wants?.event(s, 'pet', a.act);
        a.done = true;
        a.phase = 'exit';
      }
    }
  }
}
export { ANIMALS };

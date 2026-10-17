// Moteur de pouvoirs : primitives d'effets génériques qu'un mod (ex. SUPERPOWERS) assemble en pouvoirs.
// Sans mod déclarant des pouvoirs, ce système est totalement inactif et invisible.
// Les données de pouvoirs d'un sim sont conservées même si le mod est désactivé (s.modData.powers).
import { clamp, dist, uid } from '../core/util.js';
import { registry } from '../mods/registry.js';
import { simName } from './simulation.js';
import { LEVEL_HEIGHT } from './world.js';

export const EFFECT_TYPES = ['projectile', 'beam', 'shield', 'pulse', 'absorb', 'flight', 'speed', 'superjump', 'teleport', 'levitate', 'climb',
  'strength', 'regen', 'resist', 'telekinesis', 'perception', 'illusion', 'telepathy', 'mutation', 'timestop', 'portal', 'gravity', 'shapeshift', 'clone'];
// Effets qui se lancent sur soi (sans cible).
export const SELF_EFFECTS = ['shield', 'pulse', 'absorb', 'flight', 'speed', 'levitate', 'mutation', 'timestop', 'perception', 'regen', 'resist', 'strength', 'climb', 'telepathy', 'clone'];
export const POINT_EFFECTS = ['teleport', 'superjump', 'portal', 'illusion', 'gravity', 'projectile', 'beam'];
export const SIM_EFFECTS = ['projectile', 'beam', 'telekinesis', 'shapeshift', 'gravity'];
export const PASSIVE_EFFECTS = ['regen', 'resist', 'strength', 'climb', 'telepathy'];
export const ALIGNMENTS = {
  hero: { name: 'Héros', icon: '🦸' }, antihero: { name: 'Anti-héros', icon: '🦹‍♂️' }, villain: { name: 'Super-vilain', icon: '🦹' },
  unstable: { name: 'Pouvoirs instables', icon: '🌀' }, discovering: { name: 'En pleine découverte', icon: '✨' }, hidden: { name: 'Identité secrète', icon: '🎭' },
  civilian: { name: 'Civil', icon: '🙂' },
};
export const SP_MOD = 'superessence.superpowers';

export class PowerSystem {
  constructor(sim) { this.S = sim; this.vfx = []; this.incidents = []; }
  get w() { return this.S.world; }
  get enabled() { return registry.hasPowers(); }

  data(s, create = false) {
    if (!s.modData.powers && create) s.modData.powers = { alignment: 'civilian', list: {}, energy: 100, identity: 'public', reputation: 0, active: {}, mutations: [], firsts: {} };
    return s.modData.powers;
  }
  hasAnyPower(s) { const d = this.data(s); return !!d && Object.keys(d.list).some(id => registry.power(id)); }
  hasPower(s, id) { return !!this.data(s)?.list?.[id] && !!registry.power(id); }
  hasEffect(s, effect) {
    const d = this.data(s);
    if (!d || !this.enabled) return false;
    return Object.keys(d.list).some(id => registry.power(id)?.effect === effect);
  }
  powersOf(s) { const d = this.data(s); return d ? Object.keys(d.list).map(id => registry.power(id)).filter(Boolean) : []; }
  alignment(s) { return this.data(s)?.alignment || 'civilian'; }
  setAlignment(s, a) { if (ALIGNMENTS[a]) this.data(s, true).alignment = a; }
  settings() { return this.w.d.mods.data[SP_MOD] || {}; }

  grant(s, powerId, announce) {
    const p = registry.power(powerId);
    if (!p) return false;
    const d = this.data(s, true);
    if (d.list[powerId]) return false;
    d.list[powerId] = { mastery: 0, cd: 0, uses: 0 };
    if (d.alignment === 'civilian') d.alignment = 'discovering';
    if (p.effect === 'mutation' && p.mutation) { /* activé à l'usage */ }
    if (announce) {
      this.w.log('power', `✨ ${simName(s)} découvre un pouvoir : ${p.name} !`, [s.id], { icon: p.icon || '✨', important: true });
      this.S.emit('notify', { text: `${s.first} découvre : ${p.name} !`, icon: p.icon || '✨', sim: s.id });
      this.S.bubble(s, p.icon || '✨', 15);
      this.S.playOnce(s, 'cast_raise', 2);
    }
    return true;
  }
  revoke(s, powerId) { const d = this.data(s); if (d) delete d.list[powerId]; }

  isFlying(s) { return !!this.data(s)?.active?.flying && this.enabled; }

  // ------------------------------------------------------------------ crochets appelés par la simulation
  needModifiers(s) {
    const out = {};
    if (!this.enabled || !this.data(s)) return out;
    if (this.hasEffect(s, 'regen')) { out.energy = 0.5; out.sleep = 0.8; }
    if (this.hasEffect(s, 'resist')) { out.hygiene = 0.8; out.safety = 0.3; }
    if (this.data(s).active.flying) out.energy = (out.energy || 1) * 1.6;
    return out;
  }
  moveMode(s, goals, start) {
    if (!this.enabled) return null;
    const d = this.data(s);
    if (!d) return null;
    if (d.active.flying) return 'fly';
    const far = goals[0] && dist(start.x, start.y, goals[0].x, goals[0].y) > 35;
    // Un sim volant part en vol pour les longs trajets (choix autonome).
    if (far && this.hasEffect(s, 'flight') && d.energy > 40 && s.autonomy) { this.toggleFlight(s, true); return 'fly'; }
    if (this.hasEffect(s, 'climb')) return 'climb';
    return null;
  }
  speedFactor(s) {
    if (!this.enabled) return 1;
    const d = this.data(s);
    if (!d) return 1;
    if (d.active.speedUntil > this.w.time) return 3.5;
    if (d.active.monster) return 1.2;
    return 1;
  }
  canTalkRemotely(s) { return this.enabled && this.hasEffect(s, 'telepathy') && (this.data(s).energy > 10); }
  socialModifier(a, t, so) {
    if (!this.enabled) return 0;
    let m = 0;
    const da = this.data(a);
    if (da?.active.monster) m -= 25;
    if (da && da.reputation > 30 && this.alignment(a) === 'hero') m += 8;
    if (da && this.alignment(a) === 'villain' && da.identity === 'public') m -= 10;
    return m;
  }
  onSocial() {}

  // ------------------------------------------------------------------ boucle
  step(dt, dtMin) {
    if (!this.enabled) { this.vfx.length = 0; return; }
    const w = this.w;
    const now = w.time;
    this.vfx = this.vfx.filter(v => v.until > now || v.realUntil > performanceNow());
    for (const s of w.sims) {
      const d = this.data(s);
      if (!d) continue;
      d.energy = clamp(d.energy + (s._rt.sleeping ? 0.6 : 0.18) * dtMin, 0, 100);
      if (d.active.flying) {
        d.energy -= 0.25 * dtMin;
        if (d.energy <= 0) { this.toggleFlight(s, false); this.S.bubble(s, '😵', 6); }
        // Au sol en fin de trajet autonome.
        if (!s.queue.length && this.S.controlled !== s.id && s.autonomy && !d.active.keepFlying) this.toggleFlight(s, false);
      }
      if (d.active.levitate) s._rt.vfx.levitate = d.active.levitateUntil > now; else s._rt.vfx.levitate = false;
      if (d.active.levitateUntil && d.active.levitateUntil < now) d.active.levitate = false;
      s._rt.vfx.shield = d.active.shieldUntil > now;
      s._rt.vfx.speed = d.active.speedUntil > now;
      s._rt.vfx.flying = !!d.active.flying;
      s._rt.vfx.monster = !!d.active.monster;
      s._rt.vfx.mutations = d.mutations;
      s._rt.vfx.disguise = d.active.disguiseUntil > now ? d.active.disguise : null;
      s._rt.vfx.floatUntil = s.flags.floatUntil > now;
      if (s.flags.floatUntil > now) s.pos.hz = s.pos.l * LEVEL_HEIGHT + 1.8 + Math.sin(now) * 0.2;
      else if (s.flags.floatUntil) { s.flags.floatUntil = 0; s.pos.hz = s.pos.l * LEVEL_HEIGHT; }
      if (s.flags.clone && s.flags.cloneUntil < now) this.S.removeSim(s.id);
    }
    // Objets temporaires (portails, illusions).
    for (const o of [...w.objects]) if (o.state?.temporary && o.state.temporary < now) w.removeObject(o.id);
    // Incidents à résoudre par les héros.
    this.incidents = this.incidents.filter(i => i.until > now);
  }

  // ------------------------------------------------------------------ menus
  selfMenu(s) {
    if (!this.enabled) return [];
    const items = [];
    for (const p of this.powersOf(s)) {
      if (PASSIVE_EFFECTS.includes(p.effect)) continue;
      if (!SELF_EFFECTS.includes(p.effect)) continue;
      const st = this.status(s, p);
      let label = p.name;
      if (p.effect === 'flight') label = this.isFlying(s) ? 'Atterrir' : 'S’envoler';
      if (p.effect === 'mutation') label = (this.data(s).mutations.includes(p.mutation) || (p.mutation === 'monster' && this.data(s).active.monster)) ? `Annuler : ${p.name}` : p.name;
      items.push({ label, icon: p.icon || '✨', cat: 'power', disabled: st, action: { kind: 'power', power: p.id, name: p.name, icon: p.icon } });
    }
    if (this.hasAnyPower(s)) {
      items.push({ label: 'Méditer (énergie)', icon: '🧘', cat: 'power', action: { kind: 'power', power: '__meditate', name: 'Méditer', icon: '🧘' } });
      items.push({ label: 'S’entraîner aux pouvoirs', icon: '🎯', cat: 'power', action: { kind: 'power', power: '__train', name: 'Entraînement', icon: '🎯' } });
    }
    return items;
  }
  targetMenu(actor, target) {
    if (!this.enabled) return [];
    const items = [];
    for (const p of this.powersOf(actor)) {
      if (!SIM_EFFECTS.includes(p.effect)) continue;
      items.push({ label: `${p.name} sur ${target.first}`, icon: p.icon || '✨', cat: 'power', disabled: this.status(actor, p), action: { kind: 'power', power: p.id, target: target.id, name: p.name, icon: p.icon } });
    }
    if (this.hasAnyPower(actor) && this.hasAnyPower(target))
      items.push({ label: 'Défier en duel de pouvoirs', icon: '⚡', cat: 'power', action: { kind: 'power', power: '__duel', target: target.id, name: 'Duel', icon: '⚡' } });
    if (this.hasAnyPower(actor) && this.alignment(actor) === 'hero' && this.alignment(target) !== 'hero' && this.hasAnyPower(target))
      items.push({ label: 'Proposer de rejoindre l’équipe', icon: '🦸', cat: 'power', action: { kind: 'power', power: '__team', target: target.id, name: 'Recruter', icon: '🦸' } });
    return items;
  }
  pointMenu(s, x, y, l) {
    if (!this.enabled) return [];
    const items = [];
    for (const p of this.powersOf(s)) {
      if (!POINT_EFFECTS.includes(p.effect)) continue;
      items.push({ label: `${p.name} ici`, icon: p.icon || '✨', cat: 'power', disabled: this.status(s, p), action: { kind: 'power', power: p.id, point: { x, y, l }, name: p.name, icon: p.icon } });
    }
    return items;
  }
  objectMenu(s, o) {
    if (!this.enabled) return [];
    const items = [];
    const def = registry.object(o.def);
    if (!def || def.building) return items;
    if (this.hasEffect(s, 'telekinesis')) items.push({ label: 'Déplacer par télékinésie…', icon: '🌀', cat: 'power', action: { kind: 'power', power: this.powerWith(s, 'telekinesis').id, objId: o.id, pickDestination: true, name: 'Télékinésie', icon: '🌀' } });
    if (this.hasEffect(s, 'strength')) items.push({ label: 'Soulever et déplacer…', icon: '💪', cat: 'power', action: { kind: 'power', power: this.powerWith(s, 'strength').id, objId: o.id, pickDestination: true, name: 'Superforce', icon: '💪' } });
    for (const p of this.powersOf(s)) if (['projectile', 'beam'].includes(p.effect)) items.push({ label: `${p.name} sur l’objet`, icon: p.icon, cat: 'power', disabled: this.status(s, p), action: { kind: 'power', power: p.id, objId: o.id, name: p.name, icon: p.icon } });
    if (def.trainingDummy) for (const p of this.powersOf(s)) if (!PASSIVE_EFFECTS.includes(p.effect)) items.push({ label: `S’entraîner : ${p.name}`, icon: '🎯', cat: 'power', action: { kind: 'power', power: '__train', objId: o.id, trainPower: p.id, name: 'Entraînement', icon: '🎯' } });
    return items;
  }
  powerWith(s, effect) { return this.powersOf(s).find(p => p.effect === effect); }

  status(s, p) {
    const d = this.data(s);
    const st = d.list[p.id];
    if (!st) return 'Pouvoir inconnu';
    if (st.cd > this.w.time) return `Recharge (${Math.ceil(st.cd - this.w.time)} min)`;
    if (d.energy < (p.cost || 10) && !(p.effect === 'flight' && this.isFlying(s))) return 'Énergie insuffisante';
    return null;
  }
  scale(s, p) { const m = this.data(s)?.list[p.id]?.mastery || 0; return (p.intensity || 1) * (0.6 + m * 0.08); }

  // ------------------------------------------------------------------ autonomie
  autonomousOptions(s) {
    if (!this.enabled || !this.hasAnyPower(s) || s.stage === 'baby') return [];
    const out = [];
    const d = this.data(s);
    const w = this.w;
    const al = d.alignment;
    if (d.energy < 30) out.push({ score: 0.9, action: { kind: 'power', power: '__meditate', name: 'Méditer', icon: '🧘' } });
    const dummy = w.objects.find(o => registry.object(o.def)?.trainingDummy && dist(o.x, o.y, s.pos.x, s.pos.y) < 40);
    const trainable = this.powersOf(s).filter(p => !PASSIVE_EFFECTS.includes(p.effect));
    if (trainable.length && d.energy > 50) {
      const tp = w.rng.pick(trainable);
      out.push({ score: 0.6 + (s.traits.includes('ambitious') ? 0.4 : 0), action: dummy ? { kind: 'power', power: '__train', objId: dummy.id, trainPower: tp.id, name: 'Entraînement', icon: '🎯' } : { kind: 'power', power: '__train', trainPower: tp.id, name: 'Entraînement', icon: '🎯' } });
    }
    // Héros : répond aux incidents.
    if ((al === 'hero' || al === 'antihero') && this.incidents.length && d.energy > 25) {
      const inc = this.incidents.find(i => !i.responder);
      if (inc) out.push({ score: al === 'hero' ? 6 : 2, action: { kind: 'power', power: '__rescue', incident: inc.id, name: 'Intervenir', icon: '🚨' } });
    }
    // Vilains : méfaits.
    if (al === 'villain' && d.energy > 40 && w.rng.chance(0.25)) out.push({ score: 1.6, action: { kind: 'power', power: '__mischief', name: 'Commettre un méfait', icon: '😈' } });
    // Démonstration publique (si le monde n'est pas en mode secret).
    if (al !== 'hidden' && d.identity !== 'secret' && trainable.length && d.energy > 60 && s.traits.some(t => ['outgoing', 'funny', 'rebel'].includes(t)))
      out.push({ score: 0.5, action: { kind: 'power', power: '__show', name: 'Démonstration publique', icon: '🎆' } });
    return out;
  }

  // ------------------------------------------------------------------ exécution
  runPower(s, a, dt, dtMin) {
    const S = this.S, w = this.w;
    if (!this.enabled) { S.finish(s, a, true); return; }
    const rt = s._rt;
    if (a.power.startsWith('__')) { this.runSpecial(s, a, dt, dtMin); return; }
    const p = registry.power(a.power);
    const d = this.data(s);
    if (!p || !d?.list[p.id]) { S.finish(s, a, true); return; }
    switch (a.phase) {
      case 'start': {
        // Les bascules (vol, mutation) n'exigent pas d'énergie pour être désactivées.
        const turningOff = (p.effect === 'flight' && d.active.flying) || (p.effect === 'mutation' && (d.mutations.includes(p.mutation) || d.active.monster && p.mutation === 'monster'));
        const why = turningOff ? null : this.status(s, p);
        if (why) { if (a.player) S.notifyFail(s, `${p.name} : ${why}.`); S.finish(s, a, true); return; }
        if (a.pickDestination && !a.dest) { S.emit('pickDestination', { sim: s.id, action: a }); S.finish(s, a, true); return; }
        a.tpos = this.targetPos(a);
        a.phase = a.tpos && p.range && dist(s.pos.x, s.pos.y, a.tpos.x, a.tpos.y) > p.range ? 'approach' : 'windup';
        a.t = 0; a._sig = 'pw'; rt.path = null;
        return;
      }
      case 'approach': {
        a.tpos = this.targetPos(a);
        if (!a.tpos) { S.finish(s, a, true); return; }
        if (dist(s.pos.x, s.pos.y, a.tpos.x, a.tpos.y) <= (p.range || 6) - 0.5) { a.phase = 'windup'; a.t = 0; rt.path = null; return; }
        const gx = Math.floor(a.tpos.x), gy = Math.floor(a.tpos.y);
        const goals = [];
        for (let r = 1; r <= 3; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (S.nav.passable(a.tpos.l || 0, gx + dx, gy + dy, 'walk')) goals.push({ l: a.tpos.l || 0, x: gx + dx, y: gy + dy });
        const res = S.routeTo(s, a, goals.length ? goals : [{ l: 0, x: gx, y: gy }], { occupiedGoals: true });
        if (res === 'failed') { a.phase = 'windup'; a.t = 0; }
        if (res === 'arrived') { a.phase = 'windup'; a.t = 0; }
        return;
      }
      case 'windup': {
        a.t += dt;
        if (a.tpos) S.face(s, a.tpos.x, a.tpos.y);
        rt.anim = this.castAnim(p);
        if (a.t > 0.7) { this.applyPower(s, p, a); a.phase = 'recover'; a.t = 0; }
        return;
      }
      case 'recover':
        a.t += dt;
        if (a.t > (p.channel || 0.7)) S.finish(s, a, false);
        return;
      case 'exit':
        S.finish(s, a, true);
    }
  }

  castAnim(p) {
    return { projectile: 'cast', beam: 'cast_long', shield: 'block', pulse: 'cast_raise', absorb: 'cast_raise', teleport: 'cast_raise', superjump: 'jump',
      telekinesis: 'cast_long', illusion: 'cast', mutation: 'cast_raise', timestop: 'cast_raise', portal: 'cast_long', gravity: 'cast_raise', shapeshift: 'cast_raise',
      clone: 'cast_raise', flight: 'jump', speed: 'run', perception: 'idle', levitate: 'cast_raise' }[p.effect] || 'cast';
  }

  targetPos(a) {
    const w = this.w;
    if (a.target) { const t = w.sim(a.target); return t ? { x: t.pos.x, y: t.pos.y, l: t.pos.l, hz: t.pos.hz } : null; }
    if (a.objId) { const o = w.obj(a.objId); if (!o) return null; const c = w.objCenter(o); return { x: c.x, y: c.y, l: o.level || 0, hz: (o.level || 0) * LEVEL_HEIGHT }; }
    if (a.point) return { x: a.point.x + 0.5, y: a.point.y + 0.5, l: a.point.l || 0, hz: (a.point.l || 0) * LEVEL_HEIGHT };
    return null;
  }

  spend(s, p) {
    const d = this.data(s);
    const st = d.list[p.id];
    d.energy = clamp(d.energy - (p.cost || 10), 0, 100);
    st.cd = this.w.time + (p.cooldown || 10) * (1 - st.mastery * 0.05);
    st.uses++;
    st.mastery = clamp(st.mastery + 0.12 / (1 + st.mastery * 0.2), 0, 10);
    this.S.gainSkill(s, 'powers', 0.05);
  }

  applyPower(s, p, a) {
    const S = this.S, w = this.w;
    const d = this.data(s);
    const now = w.time;
    const color = p.color || '#7fd4ff';
    const from = { x: s.pos.x, y: s.pos.y, hz: s.pos.hz + 1.2 };
    // Perte de contrôle : le pouvoir part dans une direction imprévue.
    if (this.lossOfControl(s, p)) return;
    this.spend(s, p);
    const tp = this.targetPos(a);
    const k = this.scale(s, p);
    switch (p.effect) {
      case 'projectile':
      case 'beam': {
        if (!tp) break;
        this.vfx.push({ id: uid('fx'), type: p.effect, from, to: { x: tp.x, y: tp.y, hz: (tp.hz || 0) + 1 }, color, element: p.element, t0: now, until: now + 1.2, dur: p.effect === 'beam' ? 1.2 : 0.6 });
        const target = a.target ? w.sim(a.target) : null;
        if (target) this.hitSim(s, target, p, k);
        if (a.objId) this.hitObject(s, w.obj(a.objId), p);
        if (!a.target) for (const o of w.sims) if (o.id !== s.id && dist(o.pos.x, o.pos.y, tp.x, tp.y) < 1.5) this.hitSim(s, o, p, k * 0.6);
        break;
      }
      case 'shield': d.active.shieldUntil = now + (p.duration || 30) * (0.7 + k * 0.3); break;
      case 'pulse': {
        this.vfx.push({ id: uid('fx'), type: 'pulse', at: { x: s.pos.x, y: s.pos.y, hz: s.pos.hz }, radius: (p.range || 4) * (0.8 + k * 0.2), color, t0: now, until: now + 1 });
        for (const o of w.sims) {
          if (o.id === s.id || o._rt.hidden) continue;
          const dd = dist(o.pos.x, o.pos.y, s.pos.x, s.pos.y);
          if (dd < (p.range || 4)) { this.knockback(s, o, 1.5 * k); this.hitSim(s, o, p, k * 0.5, true); }
        }
        break;
      }
      case 'absorb': d.energy = clamp(d.energy + 45 * k, 0, 100); this.vfx.push({ id: uid('fx'), type: 'absorb', at: { x: s.pos.x, y: s.pos.y, hz: s.pos.hz }, color, t0: now, until: now + 1.5 }); break;
      case 'flight': this.toggleFlight(s, !d.active.flying, a.player); break;
      case 'speed': d.active.speedUntil = now + (p.duration || 60) * (0.6 + k * 0.4); break;
      case 'levitate': d.active.levitate = true; d.active.levitateUntil = now + (p.duration || 60); s.needs.comfort = clamp(s.needs.comfort + 20, 0, 100); break;
      case 'teleport': {
        if (!tp) break;
        const f = S.nav.nearestFree(tp.l || 0, tp.x, tp.y, 4);
        if (!f) break;
        this.vfx.push({ id: uid('fx'), type: 'teleport', at: { ...from }, color, t0: now, until: now + 1 });
        s.pos.x = f.x + 0.5; s.pos.y = f.y + 0.5; s.pos.l = f.l; s.pos.hz = f.l * LEVEL_HEIGHT;
        this.vfx.push({ id: uid('fx'), type: 'teleport', at: { x: s.pos.x, y: s.pos.y, hz: s.pos.hz + 1 }, color, t0: now, until: now + 1 });
        s._rt.path = null;
        break;
      }
      case 'superjump': {
        if (!tp) break;
        const f = S.nav.nearestFree(tp.l || 0, tp.x, tp.y, 4);
        if (!f) break;
        s._rt.leap = { fx: s.pos.x, fy: s.pos.y, tx: f.x + 0.5, ty: f.y + 0.5, l: f.l, t: 0, dur: 1.3, h: 6 * k };
        this.startLeap(s);
        break;
      }
      case 'telekinesis': {
        if (a.target) { const t = w.sim(a.target); if (t) { t.flags.floatUntil = now + 6; this.react(t, s, 'float'); } }
        else if (a.objId && a.dest) this.moveObjectTo(s, a.objId, a.dest, 'telekinesis', color);
        break;
      }
      case 'strength': if (a.objId && a.dest) this.moveObjectTo(s, a.objId, a.dest, 'strength', color); break;
      case 'perception': {
        let found = 0;
        for (const o of w.sims) {
          if (o.id === s.id || dist(o.pos.x, o.pos.y, s.pos.x, s.pos.y) > (p.range || 12) * k) continue;
          for (const sc of o.secrets || []) if (!sc.knownBy.includes(s.id)) { sc.knownBy.push(s.id); found++; }
          w.rel(s.id, o.id).flags.scanned = true;
        }
        this.vfx.push({ id: uid('fx'), type: 'pulse', at: { x: s.pos.x, y: s.pos.y, hz: s.pos.hz + 1 }, radius: (p.range || 12), color, t0: now, until: now + 1.2 });
        w.log('power', `👁️ ${simName(s)} perçoit les pensées autour de lui/elle (${found} secret(s) découvert(s)).`, [s.id], { icon: '👁️' });
        break;
      }
      case 'illusion': {
        if (!tp) break;
        this.vfx.push({ id: uid('fx'), type: 'illusion', at: { x: tp.x, y: tp.y, hz: tp.hz || 0 }, kind: p.illusion || w.rng.pick(['monster', 'cake', 'dragon']), color, t0: now, until: now + (p.duration || 20) });
        for (const o of w.sims) if (o.id !== s.id && dist(o.pos.x, o.pos.y, tp.x, tp.y) < 10 && !o._rt.hidden) this.react(o, { pos: tp }, 'illusion');
        break;
      }
      case 'mutation': {
        if (p.mutation === 'monster') { d.active.monster = !d.active.monster; S.emit('appearance', s); }
        else if (d.mutations.includes(p.mutation)) d.mutations = d.mutations.filter(m => m !== p.mutation);
        else d.mutations.push(p.mutation);
        S.emit('appearance', s);
        if (p.mutation === 'wings' && d.mutations.includes('wings') && !d.list.__wingsflight) { /* les ailes permettent le vol via le pouvoir Vol */ }
        break;
      }
      case 'timestop': {
        S.frozenUntil = w.time + 1;
        S.frozenTimer = (p.duration || 8) * (0.7 + k * 0.3);
        S.frozenExcept = s.id;
        this.vfx.push({ id: uid('fx'), type: 'timestop', at: { x: s.pos.x, y: s.pos.y, hz: s.pos.hz }, color, t0: now, realUntil: performanceNow() + S.frozenTimer * 1000, until: 0 });
        w.log('power', `⏳ ${simName(s)} a arrêté le temps !`, [s.id], { icon: '⏳', important: true });
        S.emit('timeStopped', s);
        break;
      }
      case 'portal': {
        if (!tp) break;
        const f1 = S.nav.nearestFree(s.pos.l, s.pos.x + 1, s.pos.y, 3);
        const f2 = S.nav.nearestFree(tp.l || 0, tp.x, tp.y, 4);
        const def = registry.object(p.portalObject || 'sp_portal') ? (p.portalObject || 'sp_portal') : null;
        if (!f1 || !f2 || !def) break;
        const until = now + (p.duration || 120);
        const o1 = w.addObject(def, f1.x, f1.y - 1 >= 0 ? f1.y - 1 : f1.y, 0, f1.l, { state: { temporary: until } });
        const o2 = w.addObject(def, f2.x, f2.y - 1 >= 0 ? f2.y - 1 : f2.y, 0, f2.l, { state: { temporary: until } });
        o1.state.portalTo = o2.id; o2.state.portalTo = o1.id;
        w.rebuildOccupancy();
        w.log('power', `🌀 ${simName(s)} ouvre un portail.`, [s.id], { icon: '🌀' });
        break;
      }
      case 'gravity': {
        const at = tp || { x: s.pos.x, y: s.pos.y };
        this.vfx.push({ id: uid('fx'), type: 'gravity', at: { x: at.x, y: at.y, hz: 0 }, radius: p.range || 5, color, t0: now, until: now + (p.duration || 10) });
        for (const o of w.sims) if (o.id !== s.id && dist(o.pos.x, o.pos.y, at.x, at.y) < (p.range || 5)) { o.flags.floatUntil = now + (p.duration || 10); this.react(o, s, 'float'); }
        break;
      }
      case 'shapeshift': {
        const t = a.target ? w.sim(a.target) : null;
        if (t) { d.active.disguise = JSON.parse(JSON.stringify(t.appearance)); d.active.disguiseUntil = now + (p.duration || 120); S.emit('appearance', s); w.log('power', `🎭 ${simName(s)} prend l’apparence de ${t.first} !`, [s.id, t.id], { icon: '🎭', important: true }); }
        break;
      }
      case 'clone': {
        const n = Math.max(1, Math.round(1 + k));
        for (let i = 0; i < n; i++) {
          const c = JSON.parse(JSON.stringify({ ...s, _rt: undefined }));
          c.id = uid('clone'); c.first = `${s.first} (clone)`; c.queue = []; c.flags = { clone: true, cloneUntil: now + (p.duration || 90) };
          c.modData = {}; c.householdId = s.householdId; c.autonomy = true; c.secrets = []; c.memories = [];
          S.addSim(c, s.pos.x + (i + 1), s.pos.y, s.pos.l);
          this.vfx.push({ id: uid('fx'), type: 'teleport', at: { x: c.pos.x, y: c.pos.y, hz: c.pos.hz + 1 }, color, t0: now, until: now + 1 });
        }
        w.log('power', `👥 ${simName(s)} se dédouble !`, [s.id], { icon: '👥' });
        break;
      }
      case 'regen': case 'resist': case 'climb': case 'telepathy':
        break;
    }
    this.witness(s, p);
    this.firstTime(s, p);
    S.emit('powerUsed', { sim: s.id, power: p.id });
    S.events.runModEvents('power_used', { actor: s, target: a.target ? w.sim(a.target) : null });
  }

  startLeap(s) { s._rt.leaping = true; }
  // Animation de saut gérée ici pour rester indépendante du rendu.
  updateLeap(s, dt) {
    const L = s._rt.leap;
    if (!L) return;
    L.t += dt;
    const u = Math.min(1, L.t / L.dur);
    s.pos.x = L.fx + (L.tx - L.fx) * u;
    s.pos.y = L.fy + (L.ty - L.fy) * u;
    s.pos.hz = L.l * LEVEL_HEIGHT + Math.sin(u * Math.PI) * L.h;
    s._rt.anim = 'jump';
    if (u >= 1) { s.pos.l = L.l; s.pos.hz = L.l * LEVEL_HEIGHT; s._rt.leap = null; s._rt.leaping = false; this.vfx.push({ id: uid('fx'), type: 'pulse', at: { x: s.pos.x, y: s.pos.y, hz: s.pos.hz }, radius: 2, color: '#d9c7a3', t0: this.w.time, until: this.w.time + 0.8 }); }
  }

  toggleFlight(s, on, keep) {
    const d = this.data(s, true);
    d.active.flying = on;
    d.active.keepFlying = !!keep && on;
    if (!on) { s.pos.hz = s.pos.l * LEVEL_HEIGHT; const f = this.S.nav.nearestFree(s.pos.l, s.pos.x, s.pos.y, 6); if (f && !this.S.nav.passable(s.pos.l, Math.floor(s.pos.x), Math.floor(s.pos.y), 'walk')) { s.pos.x = f.x + 0.5; s.pos.y = f.y + 0.5; } }
    if (on && !d.firsts.flight) { d.firsts.flight = true; this.w.log('power', `🕊️ Premier envol de ${simName(s)} ! Le quartier n’en revient pas.`, [s.id], { icon: '🕊️', important: true }); }
  }

  moveObjectTo(s, objId, dest, how, color) {
    const w = this.w;
    const o = w.obj(objId);
    if (!o) return;
    const from = w.objCenter(o);
    if (!w.canPlace(o.def, dest.x, dest.y, o.rot, dest.l || 0, o.id).ok) { this.S.notifyFail(s, 'Impossible de poser l’objet ici.'); return; }
    w.moveObject(o.id, dest.x, dest.y, o.rot, dest.l || 0);
    this.vfx.push({ id: uid('fx'), type: 'carry', obj: o.id, from: { x: from.x, y: from.y }, to: w.objCenter(o), color, t0: w.time, until: w.time + 1.5 });
    w.log('power', how === 'strength' ? `💪 ${simName(s)} soulève ${registry.object(o.def).name.toLowerCase()} à mains nues !` : `🌀 ${simName(s)} déplace ${registry.object(o.def).name.toLowerCase()} par la pensée.`, [s.id], { icon: how === 'strength' ? '💪' : '🌀' });
  }

  hitSim(caster, target, p, k, light) {
    const S = this.S, w = this.w;
    if (target.id === caster.id) return;
    const td = this.data(target);
    if (td?.active.shieldUntil > w.time) {
      this.vfx.push({ id: uid('fx'), type: 'pulse', at: { x: target.pos.x, y: target.pos.y, hz: target.pos.hz + 1 }, radius: 1.2, color: '#9be7ff', t0: w.time, until: w.time + 0.6 });
      S.bubble(target, '🛡️', 4);
      return;
    }
    const resist = this.hasEffect(target, 'resist') ? 0.4 : 1;
    target.needs.safety = clamp(target.needs.safety - 25 * k * resist, 0, 100);
    target.needs.energy = clamp(target.needs.energy - 8 * k * resist, 0, 100);
    if (!target.queue[0]?.locked) S.playOnce(target, light ? 'hit' : 'hit_hard', 1.2);
    S.bubble(target, p.element === 'fire' ? '🔥' : p.element === 'ice' ? '🥶' : p.element === 'electric' ? '⚡' : '💥', 6);
    S.addMoodlet(target, 'scared_event');
    if (!caster.flags.dueling || caster.flags.dueling !== target.id) {
      const r = w.rel(target.id, caster.id); r.known = true; r.friend = clamp(r.friend - 12 * k, -100, 100);
      S.social.updateStatus(target, caster);
    }
    if (p.element === 'ice') target.flags.frozenUntil = w.time + 5;
  }

  hitObject(caster, o, p) {
    if (!o) return;
    o.state ||= {};
    if (p.element === 'fire') o.state.burnt = this.w.time + 240;
    if (p.element === 'ice') o.state.frozen = this.w.time + 180;
    if (p.element === 'electric') o.state.broken = true;
    if (registry.object(o.def)?.trainingDummy) this.trainTick(caster, p.id, 0.5);
    this.S.emit('objectState', o);
  }

  knockback(src, s, force) {
    const dx = s.pos.x - src.pos.x, dy = s.pos.y - src.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    const tx = s.pos.x + dx / d * force, ty = s.pos.y + dy / d * force;
    if (this.S.nav.passable(s.pos.l, Math.floor(tx), Math.floor(ty), 'walk')) { s.pos.x = tx; s.pos.y = ty; }
  }

  lossOfControl(s, p) {
    const w = this.w, S = this.S;
    const d = this.data(s);
    const st = d.list[p.id];
    let risk = (p.instability || 0) * (1 - st.mastery / 12);
    if (d.alignment === 'unstable') risk *= 2;
    if (['angry', 'tense', 'scared'].includes(s.emotion)) risk *= 1.8;
    if (this.settings().distribution === 'rare_dangerous') risk *= 1.5;
    if (!w.rng.chance(risk)) return false;
    // Accident surnaturel : décharge aléatoire.
    d.energy = clamp(d.energy - (p.cost || 10) * 1.5, 0, 100);
    const victims = w.sims.filter(o => o.id !== s.id && dist(o.pos.x, o.pos.y, s.pos.x, s.pos.y) < 8 && !o._rt.hidden);
    this.vfx.push({ id: uid('fx'), type: 'pulse', at: { x: s.pos.x, y: s.pos.y, hz: s.pos.hz }, radius: 5, color: '#ff5a3c', t0: w.time, until: w.time + 1.2 });
    for (const v of victims) { this.knockback(s, v, 1.2); this.hitSim(s, v, p, 0.5, true); }
    S.playOnce(s, 'hit_hard', 1.5);
    S.addMoodlet(s, 'embarrassed_social');
    w.log('power', `💢 Perte de contrôle ! ${simName(s)} déclenche un accident surnaturel avec ${p.name}.`, [s.id, ...victims.map(v => v.id)], { icon: '💢', important: true });
    this.incidents.push({ id: uid('inc'), x: s.pos.x, y: s.pos.y, l: s.pos.l, kind: 'accident', cause: s.id, until: w.time + 120 });
    return true;
  }

  // Témoins : réactions, rumeurs, identité secrète.
  witness(s, p) {
    const w = this.w, S = this.S;
    const d = this.data(s);
    const sees = w.sims.filter(o => o.id !== s.id && !o._rt.hidden && o.stage !== 'baby' && dist(o.pos.x, o.pos.y, s.pos.x, s.pos.y) < 14);
    if (!sees.length) return;
    for (const o of sees) {
      const r = w.rel(o.id, s.id);
      r.flags.sawPowers = true;
      if (!o._rt.engagedBy && !o.queue[0]?.player && w.rng.chance(0.6)) this.react(o, s, 'power');
    }
    d.reputation = clamp(d.reputation + (d.alignment === 'villain' ? -2 : 2), -100, 100);
    if (d.identity === 'secret' && w.rng.chance(0.25)) {
      d.identity = 'public';
      w.log('power', `🎭 L’identité secrète de ${simName(s)} a été découverte par ${sees[0].first} !`, [s.id, sees[0].id], { icon: '🎭', important: true });
      S.emit('notify', { text: `Identité de ${s.first} révélée !`, icon: '🎭', sim: s.id });
    } else if (sees.length >= 3 && !d.firsts.publicDemo && d.identity !== 'secret') {
      d.firsts.publicDemo = true;
      w.log('power', `🎆 ${simName(s)} a utilisé ${p.name} en public devant ${sees.length} témoins. Les rumeurs vont bon train !`, [s.id], { icon: '🎆', important: true });
    }
  }

  react(o, src, kind) {
    const S = this.S;
    const coward = o.traits.includes('coward');
    const curious = o.traits.includes('curious') || o.traits.includes('brave');
    const scared = coward || (kind === 'illusion' && !curious && Math.random() < 0.5);
    if (o.queue[0] && !o.queue[0].player && o.queue[0].phase !== 'loop') S.cancel(o, o.queue[0].id, true);
    S.enqueue(o, { kind: 'react', at: { x: src.pos.x, y: src.pos.y }, anim: scared ? 'scared' : 'cheer', dur: 4, name: scared ? 'Avoir peur' : 'Être fasciné', icon: scared ? '😱' : '🤩' }, false);
    S.bubble(o, scared ? '😱' : kind === 'float' ? '😵' : '🤩', 6);
    S.addMoodlet(o, scared ? 'scared_event' : 'amazed');
  }

  firstTime(s, p) {
    const d = this.data(s);
    if (d.alignment === 'discovering' && Object.values(d.list).reduce((a, x) => a + x.uses, 0) >= 8) {
      d.alignment = s.traits.includes('selfish') || s.traits.includes('rebel') ? (this.w.rng.chance(0.5) ? 'villain' : 'antihero') : 'hero';
      this.w.log('power', `${ALIGNMENTS[d.alignment].icon} ${simName(s)} assume sa nature : ${ALIGNMENTS[d.alignment].name} !`, [s.id], { icon: ALIGNMENTS[d.alignment].icon, important: true });
    }
  }

  trainTick(s, powerId, amount) {
    const st = this.data(s)?.list[powerId];
    if (!st) return;
    const before = Math.floor(st.mastery);
    st.mastery = clamp(st.mastery + amount * 0.06, 0, 10);
    if (Math.floor(st.mastery) > before) {
      const p = registry.power(powerId);
      this.w.log('power', `🎯 ${simName(s)} maîtrise mieux ${p?.name} (niveau ${Math.floor(st.mastery)}).`, [s.id], { icon: '🎯' });
      this.S.bubble(s, '🎯', 8);
    }
  }

  // ------------------------------------------------------------------ actions spéciales
  runSpecial(s, a, dt, dtMin) {
    const S = this.S, w = this.w;
    const d = this.data(s, true);
    const rt = s._rt;
    const kind = a.power;
    if (a.phase === 'exit') { S.finish(s, a, true); return; }
    if (kind === '__meditate') {
      a.t += dtMin;
      rt.anim = 'sit_floor';
      d.energy = clamp(d.energy + 1.2 * dtMin, 0, 100);
      s.needs.comfort = clamp(s.needs.comfort + 0.2 * dtMin, 0, 100);
      if (a.t > 40 || d.energy >= 100) S.finish(s, a, false);
      return;
    }
    if (kind === '__train') {
      if (a.objId && a.phase !== 'train') {
        const o = w.obj(a.objId);
        if (!o) { S.finish(s, a, true); return; }
        if (a.phase === 'start') { a._sig = 'tr'; a.phase = 'route'; rt.path = null; }
        const c = w.objCenter(o);
        const goals = [];
        for (const [dx, dy] of [[0, 3], [3, 0], [-3, 0], [0, -3], [0, 2], [2, 0]]) if (S.nav.passable(o.level || 0, Math.floor(c.x) + dx, Math.floor(c.y) + dy, 'walk')) goals.push({ l: o.level || 0, x: Math.floor(c.x) + dx, y: Math.floor(c.y) + dy });
        const r = S.routeTo(s, a, goals);
        if (r === 'failed') { S.finish(s, a, true); return; }
        if (r !== 'arrived') return;
        a.phase = 'train'; a.t = 0;
      }
      if (a.phase === 'start') { a.phase = 'train'; a.t = 0; }
      a.t += dtMin;
      const p = registry.power(a.trainPower) || this.powersOf(s).find(x => !PASSIVE_EFFECTS.includes(x.effect));
      if (!p) { S.finish(s, a, true); return; }
      if (a.objId) { const o = w.obj(a.objId); if (o) S.face(s, w.objCenter(o).x, w.objCenter(o).y); }
      rt.anim = Math.floor(a.t / 3) % 2 ? this.castAnim(p) : 'idle';
      if (Math.floor(a.t / 3) !== a._lastShot && a.objId && ['projectile', 'beam'].includes(p.effect)) {
        a._lastShot = Math.floor(a.t / 3);
        const o = w.obj(a.objId);
        if (o) { const c = w.objCenter(o); this.vfx.push({ id: uid('fx'), type: 'projectile', from: { x: s.pos.x, y: s.pos.y, hz: s.pos.hz + 1.2 }, to: { x: c.x, y: c.y, hz: 1 }, color: p.color, t0: w.time, until: w.time + 0.8, dur: 0.5 }); }
      }
      this.trainTick(s, p.id, dtMin * (a.objId ? 1.6 : 1));
      d.energy = clamp(d.energy - 0.3 * dtMin, 0, 100);
      s.needs.fun = clamp(s.needs.fun + 0.1 * dtMin, 0, 100);
      s.needs.energy = clamp(s.needs.energy - 0.15 * dtMin, 0, 100);
      if (a.t > 45 || d.energy < 5) {
        if (!d.firsts.training) { d.firsts.training = true; w.log('power', `🎯 ${simName(s)} commence un entraînement intensif de ses pouvoirs.`, [s.id], { icon: '🎯' }); }
        S.finish(s, a, false);
      }
      return;
    }
    if (kind === '__show') {
      const p = this.powersOf(s).find(x => ['projectile', 'pulse', 'illusion', 'levitate', 'flight', 'shield', 'teleport'].includes(x.effect));
      S.finish(s, a, true);
      if (!p || this.status(s, p)) return;
      const pt = { x: Math.floor(s.pos.x) + 3, y: Math.floor(s.pos.y), l: s.pos.l };
      S.enqueue(s, { kind: 'power', power: p.id, point: POINT_EFFECTS.includes(p.effect) ? pt : undefined, name: p.name, icon: p.icon }, false);
      return;
    }
    if (kind === '__duel') this.runDuel(s, a, dt, dtMin);
    else if (kind === '__team') this.recruit(s, a);
    else if (kind === '__rescue') this.runRescue(s, a, dt, dtMin);
    else if (kind === '__mischief') this.runMischief(s, a, dt, dtMin);
    else S.finish(s, a, true);
  }

  recruit(s, a) {
    const S = this.S, w = this.w;
    const t = w.sim(a.target);
    S.finish(s, a, false);
    if (!t) return;
    const r = w.rel(t.id, s.id);
    if (r.friend > 20 || w.rng.chance(0.3)) {
      this.data(t, true).alignment = 'hero';
      w.d.groups ||= [];
      let team = w.d.groups.find(g => g.kind === 'heroes' && g.members.includes(s.id));
      if (!team) { team = { id: uid('team'), kind: 'heroes', name: `L’équipe de ${s.first}`, members: [s.id] }; w.d.groups.push(team); }
      if (!team.members.includes(t.id)) team.members.push(t.id);
      for (const m of team.members) for (const n of team.members) if (m !== n) { const rr = w.rel(m, n); rr.known = true; rr.flags.teammate = true; rr.friend = clamp(rr.friend + 10, -100, 100); }
      w.log('power', `🦸 ${simName(t)} rejoint « ${team.name} » !`, team.members, { icon: '🦸', important: true });
    } else {
      w.log('power', `🙅 ${simName(t)} refuse de rejoindre l’équipe de ${s.first}.`, [s.id, t.id], { icon: '🙅' });
    }
  }

  runDuel(s, a, dt, dtMin) {
    const S = this.S, w = this.w;
    const t = w.sim(a.target);
    if (!t || t._rt.hidden) { S.finish(s, a, true); return; }
    if (a.phase === 'start') {
      a.phase = 'approach'; a._sig = 'duel'; s._rt.path = null;
    }
    if (a.phase === 'approach') {
      if (dist(s.pos.x, s.pos.y, t.pos.x, t.pos.y) < 6) {
        a.phase = 'fight'; a.t = 0; a.round = 0; a.scoreA = 0; a.scoreB = 0;
        s.flags.dueling = t.id; t.flags.dueling = s.id;
        S.dropAll(t);
        t._rt.engagedBy = s.id; s._rt.socialWith = t.id;
        w.log('power', `⚡ Duel de pouvoirs entre ${simName(s)} et ${simName(t)} !`, [s.id, t.id], { icon: '⚡', important: true });
        return;
      }
      const goals = [{ l: t.pos.l, x: Math.floor(t.pos.x) + 4, y: Math.floor(t.pos.y) }, { l: t.pos.l, x: Math.floor(t.pos.x) - 4, y: Math.floor(t.pos.y) }, { l: t.pos.l, x: Math.floor(t.pos.x), y: Math.floor(t.pos.y) + 4 }].filter(g => S.nav.passable(g.l, g.x, g.y, 'walk'));
      const r = S.routeTo(s, a, goals.length ? goals : [{ l: t.pos.l, x: Math.floor(t.pos.x) + 1, y: Math.floor(t.pos.y) }], { occupiedGoals: true });
      if (r === 'failed') S.finish(s, a, true);
      return;
    }
    if (a.phase === 'fight') {
      a.t += dt;
      S.face(s, t.pos.x, t.pos.y); S.face(t, s.pos.x, s.pos.y);
      const turn = Math.floor(a.t / 1.4);
      if (turn !== a.round) {
        a.round = turn;
        const [att, def] = turn % 2 ? [t, s] : [s, t];
        const p = this.powersOf(att).find(x => ['projectile', 'beam', 'pulse'].includes(x.effect)) || this.powersOf(att)[0];
        if (p) {
          const from = { x: att.pos.x, y: att.pos.y, hz: att.pos.hz + 1.2 };
          this.vfx.push({ id: uid('fx'), type: p.effect === 'beam' ? 'beam' : 'projectile', from, to: { x: def.pos.x, y: def.pos.y, hz: def.pos.hz + 1 }, color: p.color, t0: w.time, until: w.time + 1, dur: 0.5 });
          att._rt.anim = this.castAnim(p);
          S.playOnce(att, this.castAnim(p), 0.9);
          const md = this.data(att).list[p.id]?.mastery || 0;
          const blocked = this.data(def)?.active.shieldUntil > w.time || w.rng.chance(0.3);
          if (!blocked) { S.playOnce(def, 'hit', 0.9); if (att === s) a.scoreA += 1 + md * 0.2; else a.scoreB += 1 + md * 0.2; }
          else S.playOnce(def, 'block', 0.9);
        }
      }
      if (a.t > 12) {
        const winner = a.scoreA >= a.scoreB ? s : t, loser = winner === s ? t : s;
        s.flags.dueling = null; t.flags.dueling = null;
        t._rt.engagedBy = null; s._rt.socialWith = null;
        S.addMoodlet(winner, 'promoted'); S.addMoodlet(loser, 'sad_rejected');
        S.playOnce(winner, 'cheer', 2);
        for (const x of [s, t]) { const r = w.rel(x.id, x === s ? t.id : s.id); r.known = true; r.flags.rivals = true; }
        const d = this.data(winner); d.reputation = clamp(d.reputation + 5, -100, 100);
        w.log('power', `🏆 ${simName(winner)} remporte le duel contre ${simName(loser)} !`, [winner.id, loser.id], { icon: '🏆', important: true });
        S.finish(s, a, false);
      }
    }
  }

  runMischief(s, a, dt, dtMin) {
    const S = this.S, w = this.w;
    if (a.phase === 'start') {
      const victims = w.sims.filter(o => o.id !== s.id && !o._rt.hidden && o.stage !== 'baby' && dist(o.pos.x, o.pos.y, s.pos.x, s.pos.y) < 40 && this.alignment(o) !== 'villain');
      const v = w.rng.pick(victims);
      if (!v) { S.finish(s, a, true); return; }
      a.victim = v.id; a.phase = 'approach'; a._sig = 'mis'; s._rt.path = null;
    }
    const v = w.sim(a.victim);
    if (!v || v._rt.hidden) { S.finish(s, a, true); return; }
    if (a.phase === 'approach') {
      if (dist(s.pos.x, s.pos.y, v.pos.x, v.pos.y) < 4) { a.phase = 'act'; a.t = 0; return; }
      const r = S.routeTo(s, a, [{ l: v.pos.l, x: Math.floor(v.pos.x) + 2, y: Math.floor(v.pos.y) }, { l: v.pos.l, x: Math.floor(v.pos.x) - 2, y: Math.floor(v.pos.y) }].filter(g => S.nav.passable(g.l, g.x, g.y, 'walk')), { occupiedGoals: true });
      if (r === 'failed') S.finish(s, a, true);
      return;
    }
    if (a.phase === 'act') {
      a.t += dt;
      S.face(s, v.pos.x, v.pos.y);
      s._rt.anim = 'cast';
      if (a.t > 1 && !a.done) {
        a.done = true;
        const stolen = Math.min(w.funds(v), 50 + w.rng.int(0, 150));
        const hv = w.householdOf(v); if (hv) hv.funds -= stolen;
        w.earn(s, stolen);
        const p = this.powersOf(s).find(x => ['projectile', 'illusion', 'pulse'].includes(x.effect));
        if (p) this.vfx.push({ id: uid('fx'), type: 'pulse', at: { x: v.pos.x, y: v.pos.y, hz: v.pos.hz }, radius: 2.5, color: p.color || '#b04cff', t0: w.time, until: w.time + 1 });
        this.react(v, s, 'illusion');
        const r = w.rel(v.id, s.id); r.known = true; r.friend = clamp(r.friend - 20, -100, 100);
        const d = this.data(s); d.reputation = clamp(d.reputation - 8, -100, 100);
        this.incidents.push({ id: uid('inc'), x: v.pos.x, y: v.pos.y, l: v.pos.l, kind: 'villain', cause: s.id, victim: v.id, until: w.time + 180 });
        w.log('power', `😈 ${simName(s)} a semé le chaos et dérobé ✦${stolen} à ${v.first} !`, [s.id, v.id], { icon: '😈', important: true });
        S.emit('notify', { text: `Alerte : ${s.first} attaque ${v.first} !`, icon: '🚨', sim: v.id });
      }
      if (a.t > 2.5) S.finish(s, a, false);
    }
  }

  runRescue(s, a, dt) {
    const S = this.S, w = this.w;
    const inc = this.incidents.find(i => i.id === a.incident);
    if (!inc) { S.finish(s, a, true); return; }
    inc.responder = s.id;
    if (a.phase === 'start') { a.phase = 'approach'; a._sig = 'res'; s._rt.path = null; }
    if (a.phase === 'approach') {
      if (dist(s.pos.x, s.pos.y, inc.x, inc.y) < 3) { a.phase = 'save'; a.t = 0; return; }
      const r = S.routeTo(s, a, [{ l: inc.l || 0, x: Math.floor(inc.x), y: Math.floor(inc.y) + 1 }, { l: inc.l || 0, x: Math.floor(inc.x) + 1, y: Math.floor(inc.y) }].filter(g => S.nav.passable(g.l, g.x, g.y, 'walk')), { occupiedGoals: true });
      if (r === 'failed') { S.finish(s, a, true); }
      return;
    }
    if (a.phase === 'save') {
      a.t += dt;
      s._rt.anim = 'cast_raise';
      if (a.t > 1.5) {
        const victim = inc.victim ? w.sim(inc.victim) : null;
        this.incidents = this.incidents.filter(i => i !== inc);
        const d = this.data(s); d.reputation = clamp(d.reputation + 10, -100, 100);
        if (victim) {
          const r = w.rel(victim.id, s.id); r.known = true; r.friend = clamp(r.friend + 30, -100, 100);
          victim.needs.safety = 100;
          S.addMoodlet(victim, 'surprise');
          S.social.remember(s, victim, 'saved');
          S.social.updateStatus(victim, s);
        }
        const villain = inc.cause ? w.sim(inc.cause) : null;
        if (villain && inc.kind === 'villain') { const rr = w.rel(villain.id, s.id); rr.known = true; rr.friend = clamp(rr.friend - 15, -100, 100); rr.flags.rivals = true; }
        S.playOnce(s, 'cheer', 2);
        w.log('power', victim ? `🦸 ${simName(s)} a sauvé ${simName(victim)} !` : `🦸 ${simName(s)} a maîtrisé un incident surnaturel.`, [s.id, victim?.id].filter(Boolean), { icon: '🦸', important: true });
        S.finish(s, a, false);
      }
    }
  }

  autoUse(s, powerId, target) {
    const p = registry.power(powerId);
    if (!p || !this.hasPower(s, powerId)) return;
    const a = { kind: 'power', power: powerId, name: p.name, icon: p.icon };
    if (target && SIM_EFFECTS.includes(p.effect)) a.target = target.id;
    else if (POINT_EFFECTS.includes(p.effect)) a.point = { x: Math.floor(s.pos.x) + 3, y: Math.floor(s.pos.y), l: s.pos.l };
    this.S.enqueue(s, a, false);
  }

  // ------------------------------------------------------------------ distribution selon les règles du monde
  distribute(mode) {
    const w = this.w;
    const all = [...registry.powers.values()].filter(p => !p.rareOnly || mode === 'everyone');
    if (!all.length) return;
    const sims = w.sims.filter(s => s.stage !== 'baby' && !s.flags.clone);
    const share = { everyone: 1, few: 0.25, secret: 0.3, public_heroes: 0.4, villains: 0.4, rare_dangerous: 0.12 }[mode] ?? 0.3;
    for (const s of sims) {
      if (this.hasAnyPower(s)) continue;
      if (!w.rng.chance(share)) continue;
      const n = mode === 'everyone' ? w.rng.int(1, 2) : w.rng.int(1, 3);
      const pool = mode === 'rare_dangerous' ? all.filter(p => (p.instability || 0) > 0.05) : all;
      for (let i = 0; i < n; i++) this.grant(s, w.rng.pick(pool.length ? pool : all).id, false);
      const d = this.data(s, true);
      if (mode === 'secret') { d.identity = 'secret'; d.alignment = 'hidden'; }
      else if (mode === 'villains') d.alignment = w.rng.chance(0.65) ? 'villain' : 'hero';
      else if (mode === 'public_heroes') d.alignment = w.rng.chance(0.8) ? 'hero' : 'villain';
      else if (mode === 'rare_dangerous') d.alignment = 'unstable';
      else d.alignment = w.rng.pick(['hero', 'hero', 'antihero', 'villain', 'discovering']);
    }
    w.d.mods.data[SP_MOD] = { ...(w.d.mods.data[SP_MOD] || {}), distribution: mode, distributed: true };
    w.log('power', `⚡ Les super-pouvoirs se manifestent dans ce monde (${mode}).`, [], { icon: '⚡', important: true });
  }
}

function performanceNow() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

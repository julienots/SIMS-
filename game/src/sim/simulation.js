// Moteur de simulation : temps, besoins, émotions, file d'actions, déplacements, autonomie.
// Fonctionne sans rendu (tests sous Node) ; le rendu lit sim.pos / sim._rt.
import { clamp, dist, uid, Emitter, dayOf } from '../core/util.js';
import { NEED_IDS, ADULT_STAGES, LIFE_STAGES, SKILL_MAX } from './data/core-data.js';
import { registry } from '../mods/registry.js';
import { Navigator } from './nav.js';
import { LEVEL_HEIGHT } from './world.js';
import { SocialSystem } from './social.js';
import { LifeSystem } from './lifecycle.js';
import { EventSystem } from './events.js';
import { PowerSystem } from './powers.js';
import { ANIMALS } from './data/animals.js';

export const SPEEDS = [0, 1, 3, 8];
const WALK = 1.7, RUN = 3.6;      // cases / seconde de simulation
const STAGE_ORDER = LIFE_STAGES.map(s => s.id);

export const ACTIVITY_LIKES = {
  Cuisine: ['cook', 'grill'], Sport: ['workout', 'run_treadmill'], Lecture: ['read_book', 'study'], 'Jeux vidéo': ['play_games', 'play_arcade'],
  Peinture: ['paint'], Jardinage: ['garden'], Danse: ['dance'], Cinéma: ['watch_tv', 'enter_cinema'],
};

export function simName(s) { return s ? `${s.first} ${s.last}` : '?'; }
export function isAdult(s) { return ADULT_STAGES.includes(s.stage); }
export function stageAtLeast(s, stage) { return STAGE_ORDER.indexOf(s.stage) >= STAGE_ORDER.indexOf(stage); }

export class Simulation extends Emitter {
  constructor(world) {
    super();
    this.world = world;
    this.nav = new Navigator(world);
    this.speedIdx = 1;
    this.res = new Map();             // réservations d'emplacements : "objId:slot" -> simId
    this.social = new SocialSystem(this);
    this.life = new LifeSystem(this);
    this.events = new EventSystem(this);
    this.powers = new PowerSystem(this);
    this.lastHour = Math.floor(world.time / 60);
    this.lastDay = dayOf(world.time);
    this.pendingDialogs = [];
    this.controlled = null;           // sim en contrôle direct
    this.frozenUntil = 0;             // arrêt du temps (mod)
    this.frozenExcept = null;
    for (const s of world.sims) this.initRuntime(s);
  }

  get speed() { return SPEEDS[this.speedIdx]; }
  setSpeed(i) { this.speedIdx = clamp(i, 0, SPEEDS.length - 1); this.emit('speed', this.speedIdx); }

  initRuntime(s) {
    s._rt = {
      path: null, pi: 0, anim: 'idle', once: null, onceT: 0, bubble: null, hidden: false, unreachable: {},
      stuckT: 0, lastPos: { x: s.pos.x, y: s.pos.y }, repaths: 0, evalCd: Math.random() * 2, engagedBy: null,
      vfx: {}, carry: null, speedMult: 1, moveMode: 'walk', talkT: 0,
    };
    if (s.pos.hz === undefined) s.pos.hz = (s.pos.l || 0) * LEVEL_HEIGHT;
    // Les actions en cours dans une sauvegarde redémarrent proprement.
    for (const a of s.queue) { a.phase = 'start'; a.t = 0; }
    if (s.flags.atVenue) { s._rt.hidden = true; }
  }

  addSim(s, x, y, l = 0) {
    const p = this.nav.nearestFree(l, x, y) || { l, x, y };
    s.pos = { x: p.x + 0.5, y: p.y + 0.5, l: p.l, hz: p.l * LEVEL_HEIGHT };
    this.world.d.sims.push(s);
    this.world.simsById.set(s.id, s);
    this.initRuntime(s);
    this.emit('simAdded', s);
    return s;
  }
  removeSim(id) {
    const w = this.world;
    const i = w.d.sims.findIndex(s => s.id === id);
    if (i < 0) return;
    const [s] = w.d.sims.splice(i, 1);
    w.simsById.delete(id);
    for (const h of w.d.households) h.members = h.members.filter(m => m !== id);
    this.releaseAll(s);
    this.emit('simRemoved', s);
  }

  // ------------------------------------------------------------------ boucle principale
  update(dtReal) {
    const sp = this.speed * (this.world.settings.timeScale || 1);
    if (sp <= 0) { this.updateVisualOnly(dtReal); return; }
    let remaining = dtReal * sp;
    // Sous-pas pour garder des déplacements stables à vitesse élevée.
    while (remaining > 0) {
      const dt = Math.min(remaining, 0.2);
      remaining -= dt;
      this.step(dt);
    }
  }

  updateVisualOnly(dt) {
    for (const s of this.world.sims) if (s._rt.bubble && s._rt.bubble.until < this.world.time) s._rt.bubble = null;
  }

  step(dt) {
    const w = this.world;
    const frozen = this.frozenUntil > w.time;
    if (!frozen) w.d.time += dt;           // 1 seconde de simulation = 1 minute de jeu
    const dtMin = frozen ? 0 : dt;
    const hour = Math.floor(w.d.time / 60);
    if (hour !== this.lastHour) { this.lastHour = hour; this.onHour(hour); }
    const day = dayOf(w.d.time);
    if (day !== this.lastDay) { this.lastDay = day; this.life.onNewDay(day); }
    for (const s of w.sims) {
      if (frozen && s.id !== this.frozenExcept) continue;
      this.stepSim(s, dt, frozen ? dt : dtMin);
    }
    if (frozen) { this.frozenTimer = (this.frozenTimer || 0) - dt; if (this.frozenTimer <= 0) { this.frozenUntil = 0; this.emit('timeResumed'); } }
    this.powers.step(dt, dtMin);
    this.stepCritters(dt);
  }

  // Animaux et créatures d'ambiance : errance simple, fuite devant les humains.
  stepCritters(dt) {
    const w = this.world;
    for (const c of w.d.critters || []) {
      const tx = c.tx + 0.5, ty = c.ty + 0.5;
      const d = Math.hypot(tx - c.x, ty - c.y);
      let near = null;
      for (const s of w.sims) if (!s._rt.hidden && Math.abs(s.pos.x - c.x) < 2.2 && Math.abs(s.pos.y - c.y) < 2.2) { near = s; break; }
      if (near && ANIMALS[c.kind]?.wild && c.state !== 'flee') {
        const ax = c.x - near.pos.x, ay = c.y - near.pos.y, n = Math.hypot(ax, ay) || 1;
        const fx = Math.floor(c.x + ax / n * 6), fy = Math.floor(c.y + ay / n * 6);
        if (this.nav.passable(0, fx, fy, 'walk')) { c.tx = fx; c.ty = fy; c.state = 'flee'; }
      }
      if (d < 0.1) {
        c.t -= dt;
        if (c.state !== 'idle') { c.state = 'idle'; c.t = 2 + Math.random() * 6; }
        if (c.t <= 0) {
          for (let k = 0; k < 6; k++) {
            const nx = Math.floor(c.x + (Math.random() - 0.5) * 16), ny = Math.floor(c.y + (Math.random() - 0.5) * 16);
            if (this.nav.passable(0, nx, ny, 'walk') && !w.isRoad(nx, ny) && (k > 3 || !ANIMALS[c.kind]?.outdoor || !w.lotAt(nx, ny))) { c.tx = nx; c.ty = ny; c.state = 'walk'; break; }
          }
          c.t = 1;
        }
      } else {
        if (c.state === 'idle') c.state = 'walk';
        const sp = (c.state === 'flee' ? 3.2 : ANIMALS[c.kind]?.speed || 1.1) * dt;
        const st = Math.min(d, sp);
        const nx = c.x + (tx - c.x) / d * st, ny = c.y + (ty - c.y) / d * st;
        if (this.nav.passable(0, Math.floor(nx), Math.floor(ny), 'walk') || Math.floor(nx) === Math.floor(c.x) && Math.floor(ny) === Math.floor(c.y)) { c.x = nx; c.y = ny; }
        else { c.tx = Math.floor(c.x); c.ty = Math.floor(c.y); }
        c.rot = Math.atan2(tx - c.x, ty - c.y);
      }
    }
  }

  onHour(hour) {
    this.life.onHour(hour);
    this.events.onHour(hour);
    this.emit('hour', hour);
  }

  // ------------------------------------------------------------------ par sim
  stepSim(s, dt, dtMin) {
    const rt = s._rt;
    if (s.stage === 'baby') { this.stepBaby(s, dtMin); return; }
    this.decayNeeds(s, dtMin);
    this.updateMoodlets(s);
    if (rt.once) { rt.onceT -= dt; if (rt.onceT <= 0) rt.once = null; }
    if (rt.bubble && rt.bubble.until < this.world.time) rt.bubble = null;
    if (rt.engagedBy && this.controlled === s.id) rt.engagedBy = null;   // le joueur garde la main
    if (rt.engagedBy) {
      // Le sim est pris dans une conversation initiée par un autre.
      const other = this.world.sim(rt.engagedBy);
      if (!other || other._rt.socialWith !== s.id) rt.engagedBy = null;
      else { this.face(s, other.pos.x, other.pos.y); rt.anim = rt.talkAnim || 'idle'; return; }
    }
    if (rt.leap) { this.powers.updateLeap(s, dt); return; }
    if (s.flags.frozenUntil > this.world.time) { rt.anim = 'idle'; return; }
    if (this.controlled === s.id) { this.stepControlled(s, dt, dtMin); return; }
    let a = s.queue[0];
    if (!a) {
      rt.anim = rt.hidden ? 'idle' : 'idle';
      rt.evalCd -= dt;
      if (rt.evalCd <= 0 && this.autonomyAllowed(s)) {
        rt.evalCd = 1.8 + Math.random() * 1.4;
        const choice = this.chooseAutonomous(s);
        if (choice) this.enqueue(s, choice, false);
      }
      return;
    }
    this.checkInterrupts(s, a);
    a = s.queue[0];
    if (!a) return;
    this.runAction(s, a, dt, dtMin);
  }

  autonomyAllowed(s) {
    const mode = this.world.settings.autonomy;
    if (!s.autonomy || mode === 'off') {
      // Même sans autonomie, un sim satisfait ses besoins vitaux critiques.
      return NEED_IDS.some(n => s.needs[n] < 6) && mode !== 'off';
    }
    if (mode === 'low') return NEED_IDS.some(n => s.needs[n] < 45);
    return true;
  }

  decayNeeds(s, dtMin) {
    if (!dtMin) return;
    const realism = { detendu: 0.6, equilibre: 1, exigeant: 1.5 }[this.world.settings.realism] || 1;
    const mult = {};
    for (const t of s.traits) {
      const tr = registry.trait(t);
      if (tr?.needDecay) for (const k in tr.needDecay) mult[k] = (mult[k] || 1) * tr.needDecay[k];
    }
    const powerMods = this.powers.needModifiers(s);
    for (const n of registry.needs) {
      if (s._rt.hidden && s.flags.atVenue && (n.id === 'fun' || n.id === 'social')) continue;
      let d = n.decay * (mult[n.id] || 1) * realism * (powerMods[n.id] || 1);
      if (s._rt.sleeping && n.id === 'sleep') continue;
      if (s.stage === 'child') d *= 0.9;
      s.needs[n.id] = clamp(s.needs[n.id] - d * dtMin, 0, 100);
    }
    // La sécurité remonte doucement quand rien ne menace le sim.
    if (!s.flags.threatened) s.needs.safety = clamp(s.needs.safety + 0.05 * dtMin, 0, 100);
  }

  stepBaby(s, dtMin) {
    s.needs.hunger = clamp(s.needs.hunger - 0.05 * dtMin, 0, 100);
    s.needs.social = clamp(s.needs.social - 0.04 * dtMin, 0, 100);
    s.needs.hygiene = clamp(s.needs.hygiene - 0.03 * dtMin, 0, 100);
    s._rt.anim = 'lie';
    if (s.needs.hunger < 20 && !s._rt.bubble) this.bubble(s, '🍼', 30);
  }

  // ------------------------------------------------------------------ émotions
  addMoodlet(s, id, src) {
    const m = registry.moodlet(id);
    if (!m) return;
    const until = this.world.time + (m.dur || 120);
    const ex = s.moodlets.find(x => x.id === id);
    if (ex) { ex.until = until; return; }
    s.moodlets.push({ id, until, src: src || null });
    this.recomputeEmotion(s);
  }
  updateMoodlets(s) {
    const t = this.world.time;
    const before = s.moodlets.length;
    s.moodlets = s.moodlets.filter(m => m.until > t);
    // Moodlets liés aux besoins.
    const needM = { hygiene: 'dirty', hunger: 'starving', sleep: 'exhausted', social: 'lonely', fun: 'bored_need' };
    for (const n in needM) {
      const has = s.moodlets.find(m => m.id === needM[n]);
      if (s.needs[n] < 15 && !has) s.moodlets.push({ id: needM[n], until: t + 30 });
      else if (s.needs[n] >= 15 && has) s.moodlets = s.moodlets.filter(m => m !== has);
    }
    if (before !== s.moodlets.length || !s._emoT || t - s._emoT > 5) { s._emoT = t; this.recomputeEmotion(s); }
  }
  recomputeEmotion(s) {
    const score = {};
    for (const m of s.moodlets) {
      const def = registry.moodlet(m.id);
      if (!def) continue;
      score[def.emotion] = (score[def.emotion] || 0) + (def.weight || 1);
    }
    const avg = NEED_IDS.reduce((a, n) => a + s.needs[n], 0) / NEED_IDS.length;
    if (avg > 75) score.happy = (score.happy || 0) + 1;
    if (s.needs.comfort < 25) score.uncomfortable = (score.uncomfortable || 0) + 1;
    if (s.needs.safety < 30) score.scared = (score.scared || 0) + 2;
    for (const t of s.traits) {
      const b = registry.trait(t)?.emotionBias;
      if (b) for (const e in b) if (score[e]) score[e] *= b[e];
    }
    let best = 'fine', bv = 0.9;
    for (const e in score) if (score[e] > bv) { bv = score[e]; best = e; }
    if (best !== s.emotion) { s.emotion = best; this.emit('emotion', s); }
  }
  mood(s) {
    let v = NEED_IDS.reduce((a, n) => a + s.needs[n], 0) / NEED_IDS.length;
    for (const m of s.moodlets) {
      const def = registry.moodlet(m.id);
      if (!def) continue;
      const pos = ['happy', 'confident', 'energized', 'inspired', 'playful', 'flirty', 'focused'].includes(def.emotion);
      v += (pos ? 4 : -4) * (def.weight || 1);
    }
    return clamp(v, 0, 100);
  }

  bubble(s, icon, dur = 8, text) { s._rt.bubble = { icon, text, until: this.world.time + dur }; }
  playOnce(s, anim, secs = 1.5) { s._rt.once = anim; s._rt.onceT = secs; }

  // ------------------------------------------------------------------ file d'actions
  enqueue(s, action, player = true) {
    action.id ||= uid('a');
    action.player = player;
    action.phase = 'start';
    action.t = 0;
    if (player) {
      // Une commande du joueur remplace les activités autonomes.
      const cur = s.queue[0];
      if (cur && !cur.player && !cur.locked) this.cancel(s, cur.id, true);
      if (s.queue.filter(q => q.player).length >= 8) return null;
      s.queue.push(action);
    } else {
      if (s.queue.length) return null;
      s.queue.push(action);
    }
    this.emit('queue', s);
    return action;
  }
  cancel(s, actionId, silent) {
    const i = s.queue.findIndex(a => a.id === actionId);
    if (i < 0) return;
    const a = s.queue[i];
    if (i === 0 && (a.phase === 'loop' || a.phase === 'enter')) { a.phase = 'exit'; a.exitT = 0; a.cancelled = true; }
    else { this.finish(s, a, true); }
    if (!silent) this.emit('queue', s);
  }
  // Vide la file sans transition (libère les réservations et l'état caché).
  dropAll(s) {
    for (const a of [...s.queue]) this.finish(s, a, true);
    s._rt.hidden = false;
    if (s.flags.atVenue) s.flags.atVenue = null;
  }
  clearQueue(s) { for (const a of [...s.queue]) this.cancel(s, a.id, true); this.emit('queue', s); }

  finish(s, a, cancelled) {
    if (!a.player) s._rt.failStreak = cancelled && ['start', 'route', 'approach'].includes(a.phase) ? (s._rt.failStreak || 0) + 1 : 0;
    const i = s.queue.indexOf(a);
    if (i >= 0) s.queue.splice(i, 1);
    this.release(s, a);
    if (a.kind === 'social') {
      const t = this.world.sim(a.target);
      if (t && t._rt.engagedBy === s.id) t._rt.engagedBy = null;
      s._rt.socialWith = null;
    }
    s._rt.path = null;
    s._rt.sleeping = false;
    s._rt.poseY = 0;
    s._rt.vfx.activity = null;
    s._rt.carry = cancelled ? null : s._rt.carry;
    s._rt.speedMult = 1;
    if (a.kind === 'eat' || cancelled) s._rt.carry = null;
    if (!cancelled && a.onDone) this.handleOnDone(s, a);
    this.emit('queue', s);
  }

  handleOnDone(s, a) {
    if (a.onDone === 'eat_after_cook') {
      // Le cuisinier mange directement une part.
      const plate = this.world.obj(a.plateId);
      if (plate) this.enqueue(s, { kind: 'eat', objId: plate.id, name: 'Manger', icon: '🍽️' }, a.player);
    }
  }

  release(s, a) {
    if (a.slotKey && this.res.get(a.slotKey) === s.id) this.res.delete(a.slotKey);
  }
  releaseAll(s) { for (const [k, v] of this.res) if (v === s.id) this.res.delete(k); }

  checkInterrupts(s, a) {
    if (a.locked) return;
    // Besoin critique non traité par l'activité en cours.
    if (!a.player && a.phase === 'loop' && a.t > 5 && a.kind !== 'work') {
      const crit = NEED_IDS.find(n => s.needs[n] < 7 && !['safety', 'fulfillment'].includes(n));
      if (crit) {
        const aff = a.aff ? registry.aff(a.aff) : null;
        const helps = aff && (aff.needs?.[crit] || 0) > 0;
        if (!helps && !(a.kind === 'eat' && crit === 'hunger')) this.cancel(s, a.id, true);
      }
    }
  }

  // ------------------------------------------------------------------ exécution
  runAction(s, a, dt, dtMin) {
    const handler = this.actionHandlers[a.kind];
    if (!handler) { this.finish(s, a, true); return; }
    this._dt = dt;
    try { handler.call(this, s, a, dt, dtMin); }
    catch (e) { console.error('Action', a.kind, e); this.finish(s, a, true); }
  }

  get actionHandlers() {
    return this._handlers ||= {
      object: this.runObject,
      eat: this.runEat,
      social: this.social.runSocial.bind(this.social),
      goto: this.runGoto,
      venue: this.runVenue,
      work: this.life.runWork.bind(this.life),
      idle: this.runIdle,
      wander: this.runWander,
      react: this.runReact,
      power: this.powers.runPower.bind(this.powers),
      party: this.social.runParty.bind(this.social),
    };
  }

  // Déplacement : renvoie 'moving' | 'arrived' | 'failed'.
  routeTo(s, a, goals, opts = {}) {
    const rt = s._rt;
    if (!rt.path || a._goalSig !== a._sig) {
      const start = { l: s.pos.l, x: Math.floor(s.pos.x), y: Math.floor(s.pos.y) };
      const mode = opts.mode || this.powers.moveMode(s, goals, start) || 'walk';
      rt.moveMode = mode;
      if (!this.nav.passable(start.l, start.x, start.y, mode)) {
        const f = this.nav.nearestFree(start.l, start.x, start.y, 3);
        if (f) { start.x = f.x; start.y = f.y; start.l = f.l; }
      }
      const path = this.nav.findPath(start, goals, { mode, goalsMayBeOccupied: opts.occupiedGoals });
      if (!path) return 'failed';
      rt.path = path; rt.pi = 0; a._goalSig = a._sig; rt.stuckT = 0;
      const far = path.length > 22;
      rt.speedMult = (far ? RUN / WALK : 1) * this.powers.speedFactor(s);
      if (mode === 'fly') rt.speedMult = Math.max(rt.speedMult, 2.4);
    }
    return this.followPath(s);
  }

  followPath(s) {
    const rt = s._rt;
    const path = rt.path;
    if (!path) return 'arrived';
    const dt = this._dt;
    let node = path[rt.pi];
    if (!node) { rt.path = null; return 'arrived'; }
    const tx = node.x + 0.5, ty = node.y + 0.5;
    const speed = WALK * rt.speedMult;
    const dx = tx - s.pos.x, dy = ty - s.pos.y;
    const d = Math.hypot(dx, dy);
    const fly = rt.moveMode === 'fly';
    if (node.l !== s.pos.l && !fly) {
      // Escalier ou portail : transition.
      if (node.link === 'portal') { s.pos.x = tx; s.pos.y = ty; s.pos.l = node.l; s.pos.hz = node.l * LEVEL_HEIGHT; rt.vfx.portalFlash = this.world.time; rt.pi++; return 'moving'; }
      const prog = (rt.stairProg || 0) + dt * 0.45;
      rt.stairProg = prog;
      const from = rt.stairFrom || (rt.stairFrom = { x: s.pos.x, y: s.pos.y, hz: s.pos.hz });
      s.pos.x = from.x + (tx - from.x) * Math.min(prog, 1);
      s.pos.y = from.y + (ty - from.y) * Math.min(prog, 1);
      s.pos.hz = from.hz + (node.l * LEVEL_HEIGHT - from.hz) * Math.min(prog, 1);
      this.face(s, tx, ty);
      rt.anim = 'walk';
      if (prog >= 1) { s.pos.l = node.l; rt.stairProg = 0; rt.stairFrom = null; rt.pi++; }
      return 'moving';
    }
    const step = speed * dt;
    if (d <= step || d < 0.02) {
      s.pos.x = tx; s.pos.y = ty;
      rt.pi++;
      if (rt.pi >= path.length) { rt.path = null; this.landIfFlying(s); return 'arrived'; }
    } else {
      s.pos.x += (dx / d) * step;
      s.pos.y += (dy / d) * step;
      this.faceSmooth(s, Math.atan2(dx, dy), dt);
    }
    // Altitude de vol.
    const baseH = s.pos.l * LEVEL_HEIGHT;
    if (fly) {
      const remainingNodes = path.length - rt.pi;
      const targetH = baseH + (remainingNodes > 2 ? 4.5 : 0.5);
      s.pos.hz += (targetH - s.pos.hz) * Math.min(1, dt * 2.5);
      rt.anim = 'fly';
    } else {
      s.pos.hz = baseH;
      rt.anim = rt.speedMult > 1.5 ? 'run' : 'walk';
    }
    // Détection de blocage.
    rt.stuckT += dt;
    if (rt.stuckT > 2.5) {
      const moved = dist(s.pos.x, s.pos.y, rt.lastPos.x, rt.lastPos.y);
      rt.lastPos = { x: s.pos.x, y: s.pos.y };
      rt.stuckT = 0;
      if (moved < 0.2) {
        rt.repaths++;
        rt.path = null;
        if (rt.repaths > 3) { this.unstick(s); rt.repaths = 0; return 'failed'; }
      }
    }
    return 'moving';
  }

  landIfFlying(s) { s.pos.hz = s.pos.l * LEVEL_HEIGHT; }

  unstick(s) {
    const f = this.nav.nearestFree(s.pos.l, s.pos.x, s.pos.y, 20);
    if (f) { s.pos.x = f.x + 0.5; s.pos.y = f.y + 0.5; s.pos.l = f.l; s.pos.hz = f.l * LEVEL_HEIGHT; }
  }

  rescue(s) {
    const w = this.world;
    const sx = Math.floor(s.pos.x), sy = Math.floor(s.pos.y);
    // Taille de la zone accessible autour du sim.
    const seen = new Set([`${sx},${sy}`]);
    const q = [[sx, sy]];
    while (q.length && seen.size < 200) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (seen.has(k) || !this.nav.passable(s.pos.l, nx, ny, 'walk') || w.blockedEdge(s.pos.l, x, y, nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    if (seen.size >= 200) return;
    let best = null, bd = Infinity;
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      if (w.terrainAt(x, y) !== 1 || !this.nav.passable(0, x, y, 'walk')) continue;
      const d = Math.abs(x - sx) + Math.abs(y - sy);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) { s.pos.x = best.x + 0.5; s.pos.y = best.y + 0.5; s.pos.l = 0; s.pos.hz = 0; this.bubble(s, '😅', 6); }
  }

  face(s, x, y) { if (Math.abs(x - s.pos.x) + Math.abs(y - s.pos.y) > 0.01) s.rot = Math.atan2(x - s.pos.x, y - s.pos.y); }
  faceSmooth(s, target, dt) {
    let d = target - s.rot;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    s.rot += d * Math.min(1, dt * 12);
  }

  // Glissement vers une position précise (s'asseoir, se coucher).
  slideTo(s, x, y, rot, dt, speed = 2.5) {
    const dx = x - s.pos.x, dy = y - s.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) {
      const st = Math.min(d, speed * dt);
      s.pos.x += dx / d * st; s.pos.y += dy / d * st;
    }
    if (rot !== undefined) this.faceSmooth(s, rot, dt * 1.5);
    return d < 0.03;
  }

  // ------------------------------------------------------------------ emplacements d'utilisation
  usePoints(o, aff) {
    const def = registry.object(o.def);
    const w = this.world;
    const f = w.footprint(o);
    const halfD = def.size[1] / 2;
    const face = w.objFacing(o);
    const pts = [];
    const mk = (lx, lz, pose, approachLz, rotOff = 0, approachLx = lx) => {
      const p = w.objLocalToWorld(o, lx, lz);
      const ap = w.objLocalToWorld(o, approachLx, approachLz);
      pts.push({ x: p.x, y: p.y, rot: face + rotOff, pose, ax: Math.floor(ap.x), ay: Math.floor(ap.y), key: `${o.id}:${lx}:${lz}` });
    };
    if (aff.pose === 'sit' && def.seats) def.seats.forEach(st => {
      if (Array.isArray(st)) mk(st[0], st[1], 'sit', def.seatInFront ? st[1] + 0.8 : halfD + 0.5);
      else mk(st.x, st.z, 'sit', st.az ?? st.z, st.r || 0, st.ax ?? st.x);
    });
    else if (aff.pose === 'lie' && def.beds) def.beds.forEach(([lx, lz]) => mk(lx, lz, 'lie', halfD + 0.5, def.size[0] > def.size[1] ? Math.PI / 2 : 0));
    else if (aff.pose === 'hidden' || def.building) {
      mk(0, halfD + 0.5, 'hidden', halfD + 0.5);
    } else if (def.stand) mk(def.stand[0], def.stand[1], 'stand', def.inside ? halfD + 0.5 : def.stand[1]);
    else if (aff.group) {
      for (const [lx, lz] of [[0, halfD + 0.6], [-1, halfD + 0.8], [1, halfD + 0.8], [0, halfD + 1.7], [-1.2, halfD + 1.8], [1.2, halfD + 1.8]]) mk(lx, lz, 'stand', lz);
    } else mk(0, halfD + 0.5, 'stand', halfD + 0.5);
    // Sièges : l'approche se fait par la case devant ; si elle est bloquée on essaie les côtés.
    void f;
    return pts;
  }

  freePoint(o, aff, s) {
    const pts = this.usePoints(o, aff);
    for (const p of pts) {
      const holder = this.res.get(p.key);
      if (!holder || holder === s.id || !this.world.sim(holder)) return p;
    }
    return null;
  }

  // ------------------------------------------------------------------ action : objet
  runObject(s, a, dt, dtMin) {
    const w = this.world;
    this._dt = dt;
    const o = w.obj(a.objId);
    const def = o && registry.object(o.def);
    const aff = registry.aff(a.aff);
    if (!o || !def || !aff) { this.finish(s, a, true); return; }
    const rt = s._rt;
    switch (a.phase) {
      case 'start': {
        if (aff.cost && !w.spend(s, aff.cost)) { this.bubble(s, '💸', 10); this.notifyFail(s, `${s.first} n’a pas assez d’argent.`); this.finish(s, a, true); return; }
        let p;
        if (aff.useNearestSeat) p = this.findSeatFor(s, o, aff);
        if (!p) p = this.freePoint(o, aff, s);
        if (!p) { this.bubble(s, '⛔', 6); this.markUnreachable(s, a); this.finish(s, a, true); return; }
        a.pt = p; a.slotKey = p.key; this.res.set(p.key, s.id);
        a.dur = aff.minMin + Math.random() * ((aff.maxMin || aff.minMin) - aff.minMin);
        a._sig = `${p.ax},${p.ay}`;
        a.phase = 'route';
        rt.path = null;
        // fallthrough
      }
      // eslint-disable-next-line no-fallthrough
      case 'route': {
        const p = a.pt;
        const goals = this.approachGoals(o.level || 0, p.ax, p.ay, a.pt.pose);
        const r = this.routeTo(s, a, goals);
        if (r === 'failed') { this.markUnreachable(s, a); this.bubble(s, '❓', 6); this.finish(s, a, true); return; }
        if (r === 'arrived') { a.phase = 'enter'; a.enterT = 0; }
        return;
      }
      case 'enter': {
        const p = a.pt;
        a.enterT += dt;
        if (p.pose === 'hidden') { rt.hidden = true; s.flags.atVenue = o.id; a.phase = 'loop'; return; }
        rt.poseY = def.poseY ?? (p.pose === 'lie' ? 0.34 : 0);
        const rot = p.pose === 'stand' && !def.inside ? this.angleTo(s, w.objCenter(o)) : p.rot;
        const done = this.slideTo(s, p.x, p.y, rot, dt);
        rt.anim = p.pose === 'sit' ? 'sit_down' : p.pose === 'lie' ? 'lie_down' : 'idle';
        if (p.pose === 'stand' && !def.inside) this.face(s, w.objCenter(o).x, w.objCenter(o).y);
        if (done && a.enterT > (p.pose === 'stand' ? 0.2 : 0.9)) { a.phase = 'loop'; if (p.pose !== 'stand') s.rot = p.rot; }
        return;
      }
      case 'loop': {
        a.t += dtMin;
        rt.anim = this.loopAnim(aff, a.pt.pose);
        if (aff.vfx) rt.vfx.activity = aff.vfx; else rt.vfx.activity = null;
        if (aff.id === 'sleep' || aff.id === 'nap') rt.sleeping = true;
        this.applyNeeds(s, aff, dtMin);
        if (aff.skill) this.gainSkill(s, aff.skill, dtMin * 0.012 * (aff.tags?.includes('skill') ? 1 : 0.5));
        if (aff.pays) w.earn(s, aff.pays * dtMin / 60);
        if (o.state?.broken && aff.id === 'repair') o.state.broken = false;
        if (aff.id === 'tend_baby') this.life.tendBaby(s, o, dtMin);
        if (rt.sleeping && Math.random() < 0.002) this.bubble(s, '💤', 20);
        if (a.t >= a.dur || (aff.until && s.needs[aff.until] >= 99 && a.t >= (aff.minMin || 0))) {
          a.done = true; a.phase = 'exit'; a.exitT = 0;
        }
        return;
      }
      case 'exit': {
        a.exitT = (a.exitT || 0) + dt;
        rt.vfx.activity = null;
        rt.sleeping = false;
        if (a.pt.pose === 'hidden') { rt.hidden = false; s.flags.atVenue = null; }
        rt.anim = a.pt.pose === 'sit' ? 'stand_up' : a.pt.pose === 'lie' ? 'lie_up' : 'idle';
        if (a.exitT > 0.7) rt.poseY = 0;
        const back = { x: a.pt.ax + 0.5, y: a.pt.ay + 0.5 };
        if (a.exitT > (a.pt.pose === 'stand' ? 0.1 : 0.8)) {
          if (this.slideTo(s, back.x, back.y, undefined, dt) || a.exitT > 2.5) {
            if (a.done && !a.cancelled) this.completeObject(s, a, o, aff);
            this.finish(s, a, !a.done || a.cancelled);
          }
        }
        return;
      }
    }
  }

  approachGoals(l, x, y, pose) {
    const goals = [{ l, x, y }];
    if (pose !== 'hidden') for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) goals.push({ l, x: x + dx, y: y + dy, alt: true });
    // On préfère la case exacte : les cases voisines ne servent que si elle est bloquée.
    if (this.nav.passable(l, x, y, 'walk')) return [goals[0]];
    return goals.slice(1);
  }

  angleTo(s, p) { return Math.atan2(p.x - s.pos.x, p.y - s.pos.y); }

  loopAnim(aff, pose) {
    if (pose === 'sit') return aff.anim === 'interact' || aff.anim === 'use' ? 'sit_use' : 'sit';
    if (pose === 'lie') return 'lie';
    if (pose === 'hidden') return 'idle';
    return aff.anim || 'idle';
  }

  applyNeeds(s, aff, dtMin) {
    const emo = registry.emotions[s.emotion] || {};
    for (const n in aff.needs || {}) {
      let v = aff.needs[n] * dtMin;
      if (v > 0 && n === 'fun' && emo.funBoost) v *= emo.funBoost;
      s.needs[n] = clamp(s.needs[n] + v, 0, 100);
    }
    if (aff.powerEnergy && s.modData.powers) s.modData.powers.energy = clamp(s.modData.powers.energy + aff.powerEnergy * dtMin, 0, 100);
    // L'épanouissement monte quand l'activité correspond aux goûts.
    if (ACTIVITY_LIKES[s.likes?.activity]?.includes(aff.id)) s.needs.fulfillment = clamp(s.needs.fulfillment + 0.1 * dtMin, 0, 100);
  }

  gainSkill(s, skill, amount) {
    let mult = 1;
    for (const t of s.traits) mult *= registry.trait(t)?.skillGain || 1;
    const emo = registry.emotions[s.emotion];
    if (emo?.skillBoost) mult *= emo.skillBoost;
    if (emo?.creativeBoost && ['creativity', 'music'].includes(skill)) mult *= emo.creativeBoost;
    const before = Math.floor(s.skills[skill] || 0);
    s.skills[skill] = clamp((s.skills[skill] || 0) + amount * mult / (1 + (s.skills[skill] || 0) * 0.25), 0, SKILL_MAX);
    const after = Math.floor(s.skills[skill]);
    if (after > before) {
      const sk = registry.skills.get(skill);
      this.bubble(s, sk?.icon || '⭐', 12);
      this.world.log('skill', `${simName(s)} atteint le niveau ${after} en ${sk?.name || skill}.`, [s.id], { icon: sk?.icon || '⭐', important: after >= 5 });
      this.emit('notify', { text: `${s.first} : ${sk?.name} niveau ${after} !`, icon: sk?.icon, sim: s.id });
      if (after === SKILL_MAX) this.life.checkAspiration(s);
    }
  }

  completeObject(s, a, o, aff) {
    const w = this.world;
    if (aff.moodlet) this.addMoodlet(s, aff.moodlet);
    if (aff.produces === 'meal') {
      const skill = s.skills.cooking || 0;
      const burnt = Math.random() < Math.max(0.02, 0.25 - skill * 0.03);
      if (burnt) {
        this.addMoodlet(s, 'burnt_meal');
        this.bubble(s, '🔥', 10);
        w.log('cook', `${simName(s)} a fait brûler son repas.`, [s.id], { icon: '🔥' });
        return;
      }
      const plate = this.spawnMeal(s, o, skill);
      if (plate) { a.onDone = 'eat_after_cook'; a.plateId = plate.id; }
      if (skill >= 6) this.addMoodlet(s, 'great_meal');
    }
    if (aff.produces === 'painting') {
      s.creations = (s.creations || 0) + 1;
      const q = (s.skills.creativity || 0) + (s.emotion === 'inspired' ? 3 : 0) + Math.random() * 3;
      const val = Math.round(20 + q * q * 8);
      w.earn(s, val);
      w.log('art', `${simName(s)} a terminé une peinture (vendue ✦${val}).`, [s.id], { icon: '🖼️' });
      this.events.maybeWeirdArt(s);
      this.life.checkAspiration(s);
    }
    if (aff.special === 'outfit') {
      const ap = s.appearance;
      const pick = arr => arr[Math.floor(Math.random() * arr.length)];
      ap.primary = pick(['#d8344a', '#2f6fd6', '#2fae66', '#f2b632', '#8a4fd6', '#222831', '#ff7aa8', '#21b5b5']);
      ap.secondary = pick(['#f2f2f2', '#222831', '#7a5230', '#9aa5b1', '#f2b632']);
      this.emit('appearance', s);
    }
    if (aff.id === 'fountain_wish') { this.addMoodlet(s, 'wish_made'); this.events.wish(s); }
    if (aff.id === 'admire' && registry.object(o.def)?.decor >= 3) this.addMoodlet(s, 'amazed');
    if (aff.tags?.includes('fun') && Math.random() < 0.02) this.events.newPassion(s, aff);
  }

  spawnMeal(s, nearObj, skill) {
    const w = this.world;
    // Cherche une surface libre près de la cuisine, sinon pose le plat sur une case libre voisine.
    const c = w.objCenter(nearObj);
    let best = null, bd = Infinity;
    for (const o of w.objects) {
      const def = registry.object(o.def);
      if (!def?.surface || (o.level || 0) !== (nearObj.level || 0)) continue;
      const oc = w.objCenter(o);
      const d = dist(c.x, c.y, oc.x, oc.y);
      if (d < bd && d < 8 && !w.objects.some(m => m.def === 'meal_plate' && m.state.on === o.id)) { bd = d; best = o; }
    }
    if (best) {
      const p = w.addObject('meal_plate', best.x, best.y, 0, best.level || 0, { state: { servings: 4, quality: skill, on: best.id } });
      return p;
    }
    const f = this.nav.nearestFree(nearObj.level || 0, Math.floor(c.x), Math.floor(c.y) + 1, 3);
    if (!f) return null;
    return w.addObject('meal_plate', f.x, f.y, 0, f.l, { state: { servings: 4, quality: skill } });
  }

  findSeatFor(s, near, aff) {
    const w = this.world;
    const nc = w.objCenter(near);
    let best = null, bs = -Infinity;
    for (const o of w.objects) {
      const def = registry.object(o.def);
      if (!def?.seats || (o.level || 0) !== (near.level || 0) || def.seatInFront) continue;
      if (!(def.aff || []).includes('sit')) continue;
      const oc = w.objCenter(o);
      const d = dist(nc.x, nc.y, oc.x, oc.y);
      if (d > 9) continue;
      let score = -d;
      if (aff.id === 'watch_tv') {
        // Le siège doit faire face à la télé.
        const facing = w.objFacing(o);
        const ang = Math.atan2(nc.x - oc.x, nc.y - oc.y);
        let diff = Math.abs(((ang - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff > 0.9) continue;
        score += 3;
      }
      const p = this.freePoint(o, registry.aff('sit'), s);
      if (!p) continue;
      if (score > bs) { bs = score; best = { ...p, rot: aff.id === 'watch_tv' ? p.rot : p.rot }; }
    }
    if (best && aff.id === 'watch_tv') {
      // On regarde la télé : orientation vers l'écran.
      best.rot = Math.atan2(nc.x - best.x, nc.y - best.y);
    }
    return best;
  }

  markUnreachable(s, a) {
    if (a.objId) s._rt.unreachable[`${a.objId}:${a.aff}`] = this.world.time + 90;
    if (a.player) this.notifyFail(s, `${s.first} ne peut pas atteindre cet endroit.`);
  }
  notifyFail(s, text) { this.emit('notify', { text, icon: '⚠️', sim: s.id }); }

  // ------------------------------------------------------------------ action : manger
  runEat(s, a, dt, dtMin) {
    const w = this.world;
    this._dt = dt;
    const rt = s._rt;
    const plate = w.obj(a.objId);
    switch (a.phase) {
      case 'start':
        if (!plate || (plate.state.servings || 0) <= 0) { this.finish(s, a, true); return; }
        a._sig = 'plate'; a.phase = 'toPlate'; rt.path = null;
      // eslint-disable-next-line no-fallthrough
      case 'toPlate': {
        if (!plate) { this.finish(s, a, true); return; }
        const goals = [];
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 0]]) goals.push({ l: plate.level || 0, x: plate.x + dx, y: plate.y + dy });
        const r = this.routeTo(s, a, goals.filter(g => this.nav.passable(g.l, g.x, g.y, 'walk')).length ? goals.filter(g => this.nav.passable(g.l, g.x, g.y, 'walk')) : goals, { occupiedGoals: true });
        if (r === 'failed') { this.finish(s, a, true); return; }
        if (r === 'arrived') {
          this.face(s, plate.x + 0.5, plate.y + 0.5);
          this.playOnce(s, 'pickup', 0.9);
          plate.state.servings--;
          a.quality = plate.state.quality || 0;
          if (plate.state.servings <= 0) w.removeObject(plate.id);
          rt.carry = 'plate';
          // Choisit une chaise près d'une table, sinon n'importe quel siège.
          const seat = this.findDiningSeat(s);
          if (seat) { a.pt = seat; a.slotKey = seat.key; this.res.set(seat.key, s.id); a._sig = 'seat'; rt.path = null; a.phase = 'toSeat'; }
          else { a.pt = null; a.phase = 'eatStanding'; }
        }
        return;
      }
      case 'toSeat': {
        const r = this.routeTo(s, a, this.approachGoals(s.pos.l, a.pt.ax, a.pt.ay, 'sit'));
        if (r === 'failed') { a.phase = 'eatStanding'; return; }
        if (r === 'arrived') { a.phase = 'sitDown'; a.enterT = 0; }
        return;
      }
      case 'sitDown':
        a.enterT += dt;
        rt.anim = 'sit_down';
        if (this.slideTo(s, a.pt.x, a.pt.y, a.pt.rot, dt) && a.enterT > 0.9) { s.rot = a.pt.rot; a.phase = 'eat'; a.t = 0; }
        return;
      case 'eatStanding':
      case 'eat': {
        a.t += dtMin;
        rt.anim = a.phase === 'eat' ? 'sit_use' : 'use';
        s.needs.hunger = clamp(s.needs.hunger + 2.6 * dtMin, 0, 100);
        s.needs.thirst = clamp(s.needs.thirst + 1.0 * dtMin, 0, 100);
        s.needs.comfort = clamp(s.needs.comfort + (a.phase === 'eat' ? 0.2 : -0.1) * dtMin, 0, 100);
        if (a.t > 25) {
          rt.carry = null;
          if (a.quality >= 6) this.addMoodlet(s, 'great_meal');
          if (a.phase === 'eat') { a.phase = 'standUp'; a.exitT = 0; } else this.finish(s, a, false);
        }
        return;
      }
      case 'standUp':
        a.exitT += dt;
        rt.anim = 'stand_up';
        if (a.exitT > 0.8 && (this.slideTo(s, a.pt.ax + 0.5, a.pt.ay + 0.5, undefined, dt) || a.exitT > 2)) this.finish(s, a, false);
        return;
      case 'exit':
        this.finish(s, a, true);
        return;
    }
  }

  findDiningSeat(s) {
    const w = this.world;
    let best = null, bd = Infinity;
    const sit = registry.aff('sit');
    for (const o of w.objects) {
      const def = registry.object(o.def);
      if (!def?.seats || (o.level || 0) !== s.pos.l || def.seatInFront) continue;
      const oc = w.objCenter(o);
      const d = dist(s.pos.x, s.pos.y, oc.x, oc.y);
      if (d > 14) continue;
      // Bonus si une table de repas est juste devant la chaise.
      let score = d;
      if (def.chair) {
        const front = w.objLocalToWorld(o, 0, 1);
        const t = w.objectAtTile(o.level || 0, Math.floor(front.x), Math.floor(front.y));
        if (t && registry.object(t.def)?.dining) score -= 8;
      }
      const p = this.freePoint(o, sit, s);
      if (p && score < bd) { bd = score; best = p; }
    }
    return best;
  }

  // ------------------------------------------------------------------ actions simples
  runGoto(s, a, dt) {
    this._dt = dt;
    if (a.phase === 'start') { a._sig = `${a.x},${a.y},${a.l}`; a.phase = 'route'; s._rt.path = null; }
    if (a.phase === 'exit') { this.finish(s, a, true); return; }
    const r = this.routeTo(s, a, [{ l: a.l || 0, x: a.x, y: a.y }], { mode: a.mode });
    if (r === 'failed') { this.notifyFail(s, `${s.first} ne trouve pas de chemin.`); this.finish(s, a, true); }
    else if (r === 'arrived') this.finish(s, a, false);
  }

  runVenue(s, a, dt, dtMin) {
    // Utilisé pour les lieux sans objet (ex. promenade vers un terrain).
    this.runGoto(s, a, dt, dtMin);
  }

  runIdle(s, a, dt, dtMin) {
    a.t += dtMin;
    s._rt.anim = a.anim || 'idle';
    if (a.phase === 'exit' || a.t > (a.dur || 10)) this.finish(s, a, false);
  }

  runReact(s, a, dt, dtMin) {
    a.t += dtMin;
    if (a.at) this.face(s, a.at.x, a.at.y);
    s._rt.anim = a.anim || 'cheer';
    if (a.phase === 'exit' || a.t > (a.dur || 4)) this.finish(s, a, false);
  }

  runWander(s, a, dt) {
    this._dt = dt;
    if (a.phase === 'start') {
      const lot = this.world.lotAt(Math.floor(s.pos.x), Math.floor(s.pos.y));
      let tx, ty, tries = 0;
      do {
        tx = Math.floor(s.pos.x + (Math.random() - 0.5) * 12);
        ty = Math.floor(s.pos.y + (Math.random() - 0.5) * 12);
        if (lot && Math.random() < 0.7) { tx = Math.max(lot.x, Math.min(lot.x + lot.w - 1, tx)); ty = Math.max(lot.y, Math.min(lot.y + lot.h - 1, ty)); }
      } while (!this.nav.passable(s.pos.l, tx, ty, 'walk') && ++tries < 10);
      a.x = tx; a.y = ty; a.l = s.pos.l; a._sig = `${tx},${ty}`; a.phase = 'route'; s._rt.path = null;
    }
    if (a.phase === 'exit') { this.finish(s, a, true); return; }
    const r = this.routeTo(s, a, [{ l: a.l, x: a.x, y: a.y }]);
    if (r !== 'moving') this.finish(s, a, false);
  }

  // ------------------------------------------------------------------ contrôle direct
  stepControlled(s, dt, dtMin) {
    const rt = s._rt;
    const input = this.controlInput || { x: 0, y: 0, run: false };
    // Une action lancée en contrôle direct (interaction avec un objet) s'exécute normalement.
    if (s.queue[0] && !(Math.abs(input.x) + Math.abs(input.y) > 0.2 && s.queue[0].phase === 'route')) {
      this.runAction(s, s.queue[0], dt, dtMin);
      return;
    }
    if (s.queue[0]) this.cancel(s, s.queue[0].id, true);
    const mag = Math.min(1, Math.hypot(input.x, input.y));
    if (mag < 0.15) { rt.anim = this.powers.isFlying(s) ? 'fly' : 'idle'; return; }
    const speed = (input.run ? RUN : WALK) * mag * this.powers.speedFactor(s);
    const nx = s.pos.x + input.x / mag * speed * dt * mag;
    const ny = s.pos.y + input.y / mag * speed * dt * mag;
    const flying = this.powers.isFlying(s);
    const l = s.pos.l;
    const cx = Math.floor(s.pos.x), cy = Math.floor(s.pos.y);
    const tx = Math.floor(nx), ty = Math.floor(ny);
    const canX = flying || (this.nav.passable(l, tx, cy, 'walk') && !(tx !== cx && this.world.blockedEdge(l, cx, cy, tx, cy)));
    const canY = flying || (this.nav.passable(l, cx, ty, 'walk') && !(ty !== cy && this.world.blockedEdge(l, cx, cy, cx, ty)));
    if (canX) s.pos.x = Math.max(0.3, Math.min(this.world.w - 0.3, nx));
    if (canY) s.pos.y = Math.max(0.3, Math.min(this.world.h - 0.3, ny));
    this.faceSmooth(s, Math.atan2(input.x, input.y), dt);
    rt.anim = flying ? 'fly' : input.run ? 'run' : 'walk';
    if (flying) s.pos.hz += ((s.pos.l * LEVEL_HEIGHT + (input.alt ?? 3)) - s.pos.hz) * Math.min(1, dt * 3);
    else s.pos.hz = s.pos.l * LEVEL_HEIGHT;
    // Escaliers en contrôle direct : passer sur la case du bas monte à l'étage.
    this.nav.refresh();
    const lk = this.nav.linkMap?.get(this.nav.key(l, Math.floor(s.pos.x), Math.floor(s.pos.y)));
    if (lk && lk[0].kind === 'stairs' && !this._stairCd) {
      const to = lk[0].to; s.pos.x = to.x + 0.5; s.pos.y = to.y + 0.5; s.pos.l = to.l; s.pos.hz = to.l * LEVEL_HEIGHT;
      this._stairCd = 1.5;
    }
    if (this._stairCd) { this._stairCd -= dt; if (this._stairCd <= 0) this._stairCd = 0; }
  }

  // ------------------------------------------------------------------ autonomie
  chooseAutonomous(s) {
    const w = this.world;
    if ((s._rt.failStreak || 0) >= 3) {
      s._rt.rescues = (s._rt.rescues || 0) + 1;
      s._rt.failStreak = 0;
      // Plusieurs échecs d'affilée : le sim est peut-être enfermé ; on le replace sur un trottoir accessible.
      if (s._rt.rescues >= 2) { this.rescue(s); s._rt.rescues = 0; }
      return { kind: 'wander', name: 'Se promener', icon: '🚶' };
    }
    const opts = [];
    const now = w.time;
    const hour = (now / 60) % 24;
    const night = hour >= 22 || hour < 7;
    const traits = s.traits.map(t => registry.trait(t)).filter(Boolean);
    const emo = registry.emotions[s.emotion] || {};
    let randomness = 0.25;
    for (const t of traits) if (t.randomness) randomness *= t.randomness;
    const lotHere = w.lotAt(Math.floor(s.pos.x), Math.floor(s.pos.y));
    const home = w.homeLot(s);
    const funds = w.funds(s);
    // Liste des objets interactifs mise en cache (reconstruite quand les objets changent).
    if (this._affCacheV !== w.navVersion) { this._affCacheV = w.navVersion; this._affObjs = w.objects.filter(o => registry.object(o.def)?.aff?.length); }
    for (const o of this._affObjs) {
      const def = registry.object(o.def);
      if (!def || !w.objectsById.has(o.id)) continue;
      const oc = w.objCenter(o);
      const d = dist(s.pos.x, s.pos.y, oc.x, oc.y) + Math.abs((o.level || 0) - s.pos.l) * 6;
      const oLot = w.lotAt(o.x, o.y);
      // Les sims restent surtout sur leur terrain ou les lieux publics.
      if (oLot && oLot.type === 'residential' && oLot !== home && oLot !== lotHere) continue;
      if (d > 70) continue;
      for (const affId of def.aff) {
        const aff = registry.aff(affId);
        if (!aff || aff.hidden && affId !== 'eat_meal') continue;
        if (s._rt.unreachable[`${o.id}:${affId}`] > now) continue;
        if (aff.minStage && !stageAtLeast(s, aff.minStage)) continue;
        if (aff.cost && funds < aff.cost) continue;
        if (aff.special === 'baby' && !this.life.babyNeedsCare(o)) continue;
        let score = this.scoreAff(s, aff, traits, emo, night);
        if (score <= 0.05) continue;
        score /= 1 + d / 18;
        if (oLot && oLot.type === 'community' && lotHere !== oLot) score *= 0.85;
        if (affId === 'eat_meal') { opts.push({ score: score * 1.6 + 2, action: { kind: 'eat', objId: o.id, name: 'Manger', icon: '🍽️' } }); continue; }
        opts.push({ score, action: { kind: 'object', objId: o.id, aff: affId, name: aff.name } });
      }
    }
    // Interactions sociales.
    const soc = this.social.autonomousOptions(s, traits, emo);
    opts.push(...soc);
    // Flâner / réfléchir : options de secours qui évitent l'immobilité.
    opts.push({ score: 0.35, action: { kind: 'wander', name: 'Se promener', icon: '🚶' } });
    opts.push({ score: 0.15, action: { kind: 'idle', dur: 8, anim: 'idle', name: 'Réfléchir', icon: '💭' } });
    // Options des mods (pouvoirs, entraînement…).
    opts.push(...this.powers.autonomousOptions(s));
    // Besoin critique : les options qui y répondent passent devant tout le reste.
    const crit = ['thirst', 'hunger', 'sleep', 'hygiene', 'energy'].filter(n => s.needs[n] < 12);
    if (crit.length) for (const o of opts) {
      const a = o.action;
      const aff = a.aff ? registry.aff(a.aff) : null;
      const helps = (aff && crit.some(n => (aff.needs?.[n] || 0) > 0)) || (a.kind === 'eat' && crit.includes('hunger'));
      o.score *= helps ? 6 : 0.3;
    }
    for (const o of opts) o.score *= Math.max(0.05, 1 + (Math.random() - 0.5) * 2 * randomness);
    opts.sort((a, b) => b.score - a.score);
    const top = opts.slice(0, 3).filter(o => o.score > opts[0].score * 0.6);
    const pick = top[Math.floor(Math.random() * top.length)] || opts[0];
    if (!pick) return null;
    return pick.action;
  }

  scoreAff(s, aff, traits, emo, night) {
    let score = 0;
    const dur = ((aff.minMin || 10) + (aff.maxMin || aff.minMin || 10)) / 2;
    for (const n in aff.needs || {}) {
      const per = aff.needs[n];
      const v = s.needs[n];
      const gain = per * dur;
      if (gain > 0) {
        const eff = Math.min(gain, 100 - v);
        const urg = ((100 - v) / 100) ** 2 * 3 + 0.04;
        score += eff * urg * 0.12;
      } else score += gain * 0.01;
    }
    if (aff.id === 'sleep') score *= night ? 2.6 : (s.needs.sleep < 25 ? 1 : 0.15);
    if (aff.id === 'nap') score *= night ? 0.3 : 0.8;
    for (const tag of aff.tags || []) for (const t of traits) if (t.actionWeights?.[tag]) score *= t.actionWeights[tag];
    if (aff.skill) score += 0.4 + (s.aspiration === 'master' ? 0.6 : 0);
    if (aff.tags?.includes('creative') && emo.creativeBoost) score *= emo.creativeBoost;
    if (aff.tags?.includes('sport') && emo.sportBoost) score *= emo.sportBoost;
    if (aff.tags?.includes('fun') && emo.funBoost) score *= emo.funBoost;
    if (aff.tags?.includes('skill') && emo.skillBoost) score *= 1.3;
    if (ACTIVITY_LIKES[s.likes?.activity]?.includes(aff.id)) score *= 1.6;
    if (ACTIVITY_LIKES[s.dislikes?.activity]?.includes(aff.id)) score *= 0.35;
    if (aff.tags?.includes('work') && s.career.id !== 'creator') score *= 0.3;
    if (night && !['sleep', 'nap', 'toilet', 'snack', 'drink', 'shower'].includes(aff.id) && s.needs.sleep < 45) score *= 0.5;
    return score;
  }

  // ------------------------------------------------------------------ actions proposées au joueur (menu radial)
  objectMenu(s, o) {
    const def = registry.object(o.def);
    const items = [];
    if (!def) return items;
    for (const affId of def.aff || []) {
      const aff = registry.aff(affId);
      if (!aff) continue;
      let disabled = null;
      if (aff.minStage && !stageAtLeast(s, aff.minStage)) disabled = 'Trop jeune';
      if (aff.cost && this.world.funds(s) < aff.cost) disabled = 'Pas assez d’argent';
      if (aff.special === 'baby' && !this.life.babyNeedsCare(o)) disabled = 'Aucun bébé ici';
      if (affId === 'eat_meal') { items.push({ label: 'Prendre une assiette', icon: '🍽️', action: { kind: 'eat', objId: o.id, name: 'Manger', icon: '🍽️' } }); continue; }
      items.push({ label: aff.name + (aff.cost ? ` (✦${aff.cost})` : ''), icon: aff.icon, affId, disabled, action: { kind: 'object', objId: o.id, aff: affId, name: aff.name } });
    }
    items.push(...this.powers.objectMenu(s, o));
    return items;
  }
}


// Cycle de vie : travail, carrières, école, âges, bébés, factures, aspirations, météo.
import { clamp, dist, DAYS } from '../core/util.js';
import { registry } from '../mods/registry.js';
import { LIFE_STAGES, SKILL_MAX } from './data/core-data.js';
import { childOf } from './factory.js';
import { simName, isAdult } from './simulation.js';
import { LEVEL_HEIGHT } from './world.js';

const STAGES = LIFE_STAGES.map(s => s.id);

export class LifeSystem {
  constructor(sim) { this.S = sim; }
  get w() { return this.S.world; }

  // ------------------------------------------------------------------ chaque heure
  onHour(hour) {
    const w = this.w, S = this.S;
    const h = hour % 24;
    const day = Math.floor(hour / 24) % 7;
    for (const s of w.sims) {
      if (s.stage === 'baby') continue;
      const c = registry.career(s.career.id);
      // Départ au travail une heure avant le début.
      if (c && c.days?.includes(day) && h === (c.start - 1 + 24) % 24 && !s.queue.some(q => q.kind === 'work')) {
        if (S.controlled === s.id) { S.emit('notify', { text: `${s.first} devrait partir travailler !`, icon: '💼', sim: s.id }); continue; }
        const cur = s.queue[0];
        if (cur && !cur.player) S.cancel(s, cur.id, true);
        S.enqueue(s, { kind: 'work', name: `Travailler (${c.name})`, icon: c.icon, locked: false }, true);
      }
      // École pour les enfants et ados.
      if ((s.stage === 'child' || s.stage === 'teen') && day < 5 && h === 7 && !s.queue.some(q => q.kind === 'work')) {
        const school = this.venueObject('school');
        if (school) S.enqueue(s, { kind: 'work', school: true, name: 'Aller à l’école', icon: '🎒' }, true);
      }
    }
    S.social.checkParty();
    this.updateWeather();
    if (h === 9 && day === 0) this.payBills();
  }

  venueObject(venue) {
    return this.w.objects.find(o => registry.object(o.def)?.venue === venue);
  }

  // ------------------------------------------------------------------ action travail
  runWork(s, a, dt, dtMin) {
    const S = this.S, w = this.w;
    const c = a.school ? { id: 'school', name: 'École', start: 8, end: 14, venue: 'school', levels: [{ pay: 0 }] } : registry.career(s.career.id);
    if (!c || (!a.school && c.id === 'unemployed')) { S.finish(s, a, true); return; }
    const rt = s._rt;
    const endMin = () => { const d = Math.floor(w.time / 1440); return d * 1440 + c.end * 60; };
    switch (a.phase) {
      case 'start': {
        a.endAt = endMin();
        if (w.time > a.endAt) { S.finish(s, a, true); return; }
        if (c.remote) {
          // Télétravail : sur l'ordinateur du foyer s'il existe.
          const pc = w.objectsOnLot(w.homeLot(s)).find(o => registry.object(o.def)?.aff?.includes('work_from_home'));
          if (pc) { S.finish(s, a, true); S.enqueue(s, { kind: 'object', objId: pc.id, aff: 'work_from_home', name: 'Télétravail' }, true); return; }
        }
        const venue = this.venueObject(c.venue || 'office') || this.venueObject('office');
        a.venueId = venue?.id;
        if (venue) {
          const p = w.objLocalToWorld(venue, 0, registry.object(venue.def).size[1] / 2 + 0.5);
          a.door = { x: Math.floor(p.x), y: Math.floor(p.y) };
          a._sig = 'work';
        }
        a.phase = venue ? 'route' : 'inside';
        rt.path = null;
        return;
      }
      case 'route': {
        const r = S.routeTo(s, a, S.approachGoals(0, a.door.x, a.door.y, 'hidden'));
        if (r === 'failed') { a.phase = 'inside'; return; }
        if (r === 'arrived') { a.phase = 'inside'; a.lateBy = Math.max(0, w.time - (Math.floor(w.time / 1440) * 1440 + c.start * 60)); }
        if (w.time > a.endAt) S.finish(s, a, true);
        return;
      }
      case 'inside': {
        rt.hidden = true;
        s.flags.atVenue = a.venueId || 'work';
        rt.anim = 'idle';
        a.t += dtMin;
        // Les besoins baissent plus lentement au travail ; la performance dépend de l'humeur et des compétences.
        for (const n of ['hunger', 'thirst', 'comfort', 'hygiene']) s.needs[n] = clamp(s.needs[n] + 0.06 * dtMin, 0, 100);
        s.needs.social = clamp(s.needs.social + 0.05 * dtMin, 0, 100);
        if (!a.school) {
          const mood = S.mood(s);
          let perf = (mood - 45) / 60;
          for (const sk of c.skills || []) perf += (s.skills[sk] || 0) * 0.06;
          const emo = registry.emotions[s.emotion];
          if (emo?.workBoost) perf *= emo.workBoost;
          for (const t of s.traits) perf *= registry.trait(t)?.careerBonus || 1;
          s.career.perf = clamp(s.career.perf + perf * dtMin * 0.02, -100, 120);
          for (const sk of c.skills || []) S.gainSkill(s, sk, dtMin * 0.002);
        } else S.gainSkill(s, 'logic', dtMin * 0.003);
        if (w.time >= a.endAt) a.phase = 'leave';
        if (a.phase === 'exit') a.phase = 'leave';
        return;
      }
      case 'exit':
      case 'leave': {
        rt.hidden = false;
        s.flags.atVenue = null;
        if (!a.school && a.t > 0) this.endShift(s, c, a);
        if (a.door) { s.pos.x = a.door.x + 0.5; s.pos.y = a.door.y + 0.5; s.pos.l = 0; s.pos.hz = 0; }
        S.finish(s, a, false);
        return;
      }
    }
  }

  endShift(s, c, a) {
    const S = this.S, w = this.w;
    const hours = a.t / 60;
    const lvl = c.levels[Math.min(s.career.level, c.levels.length - 1)];
    const pay = Math.round(lvl.pay * hours);
    w.earn(s, pay);
    s.career.days++;
    s.works = (s.works || 0) + 1;
    S.bubble(s, '💰', 10);
    if (s.career.perf >= 100 && s.career.level < c.levels.length - 1) {
      s.career.level++;
      s.career.perf = 10;
      S.addMoodlet(s, 'promoted');
      w.log('career', `📈 ${simName(s)} est promu(e) : ${c.levels[s.career.level].title} !`, [s.id], { icon: '📈', important: true });
      S.emit('notify', { text: `${s.first} est promu(e) ${c.levels[s.career.level].title} !`, icon: '📈', sim: s.id });
      this.checkAspiration(s);
    } else if (s.career.perf <= -80) {
      w.log('career', `📉 ${simName(s)} a été licencié(e) de son poste de ${lvl.title}.`, [s.id], { icon: '📉', important: true });
      s.career = { id: 'unemployed', level: 0, perf: 0, days: 0 };
      S.addMoodlet(s, 'fired');
    }
    // Les collègues se croisent au travail.
    for (const o of w.sims) {
      if (o.id !== s.id && o.career.id === s.career.id && w.rng.chance(0.2)) {
        const r = w.rel(s.id, o.id); r.known = true; r.flags.colleague = true;
        const r2 = w.rel(o.id, s.id); r2.known = true; r2.flags.colleague = true;
        r.friend = clamp(r.friend + 2, -100, 100); r2.friend = clamp(r2.friend + 2, -100, 100);
        S.social.updateStatus(s, o); S.social.updateStatus(o, s);
      }
    }
  }

  setCareer(s, careerId) {
    const c = registry.career(careerId);
    if (!c) return;
    s.career = { id: c.id, level: 0, perf: 0, days: 0 };
    this.w.log('career', `💼 ${simName(s)} commence une carrière : ${c.name} (${c.levels[0].title}).`, [s.id], { icon: c.icon, important: true });
  }

  // ------------------------------------------------------------------ chaque jour
  onNewDay(day) {
    const w = this.w, S = this.S;
    w.log('day', `☀️ Nouveau jour : ${DAYS[day % 7]} (jour ${day + 1}).`, [], { icon: '📅' });
    for (const s of [...w.sims]) {
      s.ageDays = (s.ageDays || 0) + 1;
      const stage = LIFE_STAGES.find(x => x.id === s.stage);
      const grows = s.stage === 'baby' || w.settings.aging;
      if (grows && stage && s.ageDays >= stage.days) this.ageUp(s);
      // Les babies attendus naissent.
      if (s.flags.babyDue && s.flags.babyDue <= day) this.birth(s);
      if (s.stage !== 'baby') this.checkAspiration(s);
    }
    S.events.onNewDay(day);
  }

  ageUp(s) {
    const i = STAGES.indexOf(s.stage);
    if (i < 0 || i >= STAGES.length - 1) return;
    const next = STAGES[i + 1];
    s.stage = next;
    s.ageDays = 0;
    if (next === 'child') {
      s.queue = [];
      const f = this.S.nav.nearestFree(s.pos.l, s.pos.x, s.pos.y + 1, 5);
      if (f) { s.pos.x = f.x + 0.5; s.pos.y = f.y + 0.5; s.pos.hz = f.l * LEVEL_HEIGHT; }
    }
    if (next === 'young' && s.career.id === 'unemployed') {
      const cs = [...registry.careers.values()].filter(c => c.id !== 'unemployed');
      s.career = { id: this.w.rng.pick(cs).id, level: 0, perf: 0, days: 0 };
    }
    if (next === 'elder') s.appearance.hair = '#d9d9d9';
    const st = LIFE_STAGES.find(x => x.id === next);
    this.w.log('life', `🎂 ${simName(s)} grandit et devient ${st.name.toLowerCase()}.`, [s.id], { icon: '🎂', important: true });
    this.S.emit('appearance', s);
  }

  scheduleBaby(a, b) {
    const w = this.w;
    if (a.flags.babyDue || b.flags.babyDue) return;
    const h = w.household(a.householdId);
    if (h && h.members.length >= 8) { this.S.notifyFail(a, 'Le foyer est complet (8 membres).'); return; }
    a.flags.babyDue = Math.floor(w.time / 1440) + 1;
    a.flags.babyWith = b.id;
    w.log('family', `👶 ${simName(a)} et ${simName(b)} attendent un heureux événement pour demain !`, [a.id, b.id], { icon: '👶', important: true });
  }

  birth(a) {
    const w = this.w, S = this.S;
    const b = w.sim(a.flags.babyWith) || a;
    a.flags.babyDue = null; a.flags.babyWith = null;
    const baby = childOf(w.rng, a, b);
    baby.householdId = a.householdId;
    const h = w.household(a.householdId);
    // Le bébé est placé dans un berceau du foyer (posé automatiquement si besoin).
    const lot = w.homeLot(a);
    let crib = w.objectsOnLot(lot).find(o => o.def === 'crib' && !w.sims.some(s => s.stage === 'baby' && s.flags.crib === o.id));
    if (!crib && lot) {
      for (let tries = 0; tries < 60 && !crib; tries++) {
        const x = lot.x + 1 + w.rng.int(0, lot.w - 3), y = lot.y + 1 + w.rng.int(0, lot.h - 3);
        if (w.canPlace('crib', x, y, 0, 0).ok && S.nav.passable(0, x, y + 1, 'walk')) crib = w.addObject('crib', x, y, 0, 0);
      }
    }
    const pos = crib ? { x: crib.x, y: crib.y } : { x: Math.floor(a.pos.x), y: Math.floor(a.pos.y) };
    w.d.sims.push(baby);
    w.simsById.set(baby.id, baby);
    baby.pos = { x: pos.x + 0.5, y: pos.y + 0.5, l: crib?.level || 0, hz: (crib?.level || 0) * LEVEL_HEIGHT + 0.55 };
    if (crib) baby.flags.crib = crib.id;
    S.initRuntime(baby);
    if (h) h.members.push(baby.id);
    for (const p of [a, b]) {
      const r1 = w.rel(p.id, baby.id), r2 = w.rel(baby.id, p.id);
      r1.known = r2.known = true; r1.flags.family = r2.flags.family = true; r1.friend = r2.friend = 50; r1.status = r2.status = 'family';
      S.addMoodlet(p, 'new_baby');
    }
    w.d.stats.babies++;
    w.log('family', `🍼 Bienvenue à ${baby.first} ${baby.last}, enfant de ${a.first} et ${b.first} !`, [baby.id, a.id, b.id], { icon: '🍼', important: true });
    S.emit('simAdded', baby);
    S.emit('notify', { text: `Naissance de ${baby.first} !`, icon: '🍼', sim: baby.id });
  }

  babyNeedsCare(crib) {
    return this.w.sims.some(s => s.stage === 'baby' && s.flags.crib === crib.id && (s.needs.hunger < 80 || s.needs.social < 80 || s.needs.hygiene < 80));
  }
  tendBaby(s, crib, dtMin) {
    const baby = this.w.sims.find(b => b.stage === 'baby' && b.flags.crib === crib.id);
    if (!baby) return;
    for (const n of ['hunger', 'social', 'hygiene']) baby.needs[n] = clamp(baby.needs[n] + 3 * dtMin, 0, 100);
    const r = this.w.rel(s.id, baby.id); r.friend = clamp(r.friend + 0.1 * dtMin, -100, 100);
  }

  // ------------------------------------------------------------------ argent, météo, aspirations
  payBills() {
    const w = this.w;
    for (const h of w.d.households) {
      const lot = w.lot(h.lotId);
      const value = w.objectsOnLot(lot).reduce((acc, o) => acc + (registry.object(o.def)?.price || 0), 0);
      const bill = Math.round(50 + value * 0.012);
      h.funds = Math.max(0, h.funds - bill);
      w.log('money', `🧾 Le foyer ${h.name} a payé ses factures (✦${bill}).`, h.members, { icon: '🧾' });
    }
  }

  updateWeather() {
    const w = this.w;
    if (w.time < (w.d.weather.until || 0)) return;
    const env = w.settings.environment;
    const types = env === 'tropical' ? ['sun', 'sun', 'sun', 'rain'] : env === 'space' ? ['clear'] : ['sun', 'sun', 'cloudy', 'rain', 'rain', 'snow'];
    w.d.weather = { type: w.rng.pick(types), until: w.time + w.rng.int(240, 900) };
    this.S.emit('weather', w.d.weather);
  }

  checkAspiration(s) {
    const w = this.w;
    if (s.flags.aspirationDone) return;
    let done = false;
    switch (s.aspiration) {
      case 'popular': done = w.relPairs(s.id).filter(p => ['friend', 'best_friend'].includes(p.r.status)).length >= 6; break;
      case 'career': { const c = registry.career(s.career.id); done = c && c.levels.length > 1 && s.career.level >= c.levels.length - 1; break; }
      case 'love': done = w.relPairs(s.id).some(p => p.r.status === 'married'); break;
      case 'master': done = Object.values(s.skills).some(v => v >= SKILL_MAX); break;
      case 'wealth': done = w.funds(s) >= 50000; break;
      case 'creator': done = (s.creations || 0) >= 10; break;
      case 'family': done = w.sims.filter(x => x.parents?.includes(s.id)).length >= 1; break;
      default: { const asp = registry.aspirations.get(s.aspiration); done = !!asp?.check && false; }
    }
    if (done) {
      s.flags.aspirationDone = true;
      s.needs.fulfillment = 100;
      const asp = registry.aspirations.get(s.aspiration);
      w.log('aspiration', `🏆 ${simName(s)} a accompli son aspiration « ${asp?.name} » !`, [s.id], { icon: '🏆', important: true });
      this.S.emit('notify', { text: `${s.first} a réalisé son rêve : ${asp?.name} !`, icon: '🏆', sim: s.id });
    }
  }
}

export { isAdult, dist };

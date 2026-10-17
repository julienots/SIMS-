// Système social : conversations, acceptation, relations, souvenirs, jalousie, rumeurs, fêtes.
import { clamp, dist } from '../core/util.js';
import { registry } from '../mods/registry.js';
import { REL_STATUS, MEMORY_TEXT } from './data/social.js';
import { simName, isAdult } from './simulation.js';

const ROMANTIC_STATUS = ['partner', 'engaged', 'married'];

export class SocialSystem {
  constructor(sim) { this.S = sim; }
  get w() { return this.S.world; }

  // ------------------------------------------------------------------ disponibilité
  available(actor, target, social) {
    const w = this.w;
    const S = this.S;
    if (!target || target.id === actor.id) return 'Personne';
    if (target._rt.hidden) return `${target.first} n’est pas là`;
    if (target.stage === 'baby') return 'C’est un bébé';
    const r = w.rel(actor.id, target.id);
    const rt = w.rel(target.id, actor.id);
    const q = social.req || {};
    if (q.maxKnown === 0 && r.known) return 'Déjà présentés';
    if (q.known && !r.known) return 'Ne se connaissent pas';
    if (q.minFriend !== undefined && r.friend < q.minFriend) return 'Relation trop faible';
    if (q.maxFriend !== undefined && r.friend > q.maxFriend) return 'Relation trop bonne';
    if (q.minRomance !== undefined && r.romance < q.minRomance) return 'Pas assez de romance';
    if (q.adultsOnly && (!isAdult(actor) || !isAdult(target))) return 'Réservé aux adultes';
    if (q.romanceAllowed && !w.settings.romance) return 'Romance désactivée dans ce monde';
    if (q.familyAllowed && !w.settings.family) return 'Familles désactivées dans ce monde';
    if (q.status && !q.status.includes(r.status)) return 'Statut incompatible';
    if (q.notStatus && q.notStatus.includes(r.status)) return 'Déjà fait';
    if (q.sameHousehold && actor.householdId !== target.householdId) return 'Doivent vivre ensemble';
    if (q.notSameHousehold && actor.householdId === target.householdId) return 'Vivent déjà ensemble';
    if (q.knowsSecret && !this.knownSecretOf(actor, target)) return 'Ne connaît aucun secret';
    if (social.cat === 'romantic' && (r.flags.family || rt.flags.family)) return 'Membre de la famille';
    if (social.requiresPower && !S.powers.hasPower(actor, social.requiresPower)) return 'Pouvoir requis';
    return null;
  }

  knownSecretOf(actor, target) {
    return (target.secrets || []).find(sc => sc.knownBy?.includes(actor.id));
  }

  menu(actor, target) {
    const items = [];
    for (const so of registry.socials.values()) {
      if (so.hiddenFromMenu) continue;
      const why = this.available(actor, target, so);
      if (why && ['Déjà présentés', 'Réservé aux adultes', 'Romance désactivée dans ce monde', 'Statut incompatible', 'Déjà fait', 'Membre de la famille', 'Familles désactivées dans ce monde', 'Ne connaît aucun secret', 'Pouvoir requis', 'Vivent déjà ensemble'].includes(why)) continue;
      items.push({ label: so.name, icon: so.icon, cat: so.cat, disabled: why, action: { kind: 'social', target: target.id, social: so.id, name: so.name, icon: so.icon } });
    }
    return items;
  }

  // ------------------------------------------------------------------ autonomie sociale
  autonomousOptions(s, traits, emo) {
    const w = this.w;
    const out = [];
    if (s.stage === 'baby') return out;
    const need = s.needs.social;
    const urg = ((100 - need) / 100) ** 2 * 3 + 0.05;
    for (const t of w.sims) {
      if (t.id === s.id || t._rt.hidden || t.stage === 'baby') continue;
      const d = dist(s.pos.x, s.pos.y, t.pos.x, t.pos.y);
      if (d > 26 || t.pos.l !== s.pos.l && d > 6) continue;
      if (t._rt.engagedBy || t._rt.sleeping || t.queue[0]?.kind === 'work') continue;
      const so = this.pickSocial(s, t, traits, emo);
      if (!so) continue;
      let score = (2.2 * urg + 0.3) / (1 + d / 10);
      const r = w.rel(s.id, t.id);
      if (r.friend > 30) score *= 1.3;
      if (r.status === 'partner' || r.status === 'married') score *= 1.4;
      score *= so.weight;
      out.push({ score, action: { kind: 'social', target: t.id, social: so.id, name: so.name, icon: so.icon } });
    }
    return out;
  }

  pickSocial(s, t, traits, emo) {
    const w = this.w;
    const r = w.rel(s.id, t.id);
    const cands = [];
    for (const so of registry.socials.values()) {
      if (!so.autonomous) continue;
      if (this.available(s, t, so)) continue;
      let wgt = so.autonomous;
      for (const tr of traits) if (tr.socialWeights?.[so.cat]) wgt *= tr.socialWeights[so.cat];
      if (so.cat === 'mean') wgt *= r.friend < -10 ? 2.5 : 0.08;
      if (so.cat === 'mean' && emo.meanBoost) wgt *= emo.meanBoost;
      if (so.cat === 'romantic') {
        if (!this.attracted(s, t)) continue;
        wgt *= r.romance > 10 ? 1.5 : 0.5;
        if (emo.romanticBonus) wgt *= 1.6;
        if (this.partnerOf(s) && this.partnerOf(s) !== t.id) wgt *= 0.05;
      }
      if (so.cat === 'funny' && emo.funnyBonus) wgt *= 1.5;
      if (so.important) wgt *= 0.4;
      cands.push({ so, wgt });
    }
    const pick = this.w.rng.weighted(cands, c => c.wgt);
    return pick ? { ...pick.so, weight: Math.min(2, 0.6 + pick.wgt * 0.4) } : null;
  }

  attracted(a, b) {
    const pref = a.attraction || ['f', 'm', 'x'];
    return pref.includes(b.gender);
  }

  partnerOf(s) {
    for (const { other, r } of this.w.relPairs(s.id)) if (ROMANTIC_STATUS.includes(r.status)) return other;
    return null;
  }

  // ------------------------------------------------------------------ exécution d'une interaction
  runSocial(s, a, dt, dtMin) {
    const S = this.S, w = this.w;
    const t = w.sim(a.target);
    const so = registry.social(a.social);
    const rt = s._rt;
    if (!t || !so) { S.finish(s, a, true); return; }
    switch (a.phase) {
      case 'start': {
        const why = this.available(s, t, so);
        if (why) { if (a.player) S.notifyFail(s, `${so.name} : ${why}.`); S.finish(s, a, true); return; }
        a.phase = 'approach'; a._sig = null; rt.path = null;
      }
      // eslint-disable-next-line no-fallthrough
      case 'approach': {
        const d = dist(s.pos.x, s.pos.y, t.pos.x, t.pos.y);
        const remote = a.remote || S.powers.canTalkRemotely(s);
        if ((d < 1.7 && s.pos.l === t.pos.l) || remote) { a.phase = 'engage'; rt.path = null; return; }
        if (t._rt.hidden) { S.finish(s, a, true); return; }
        // Recalcule le chemin si la cible s'est déplacée.
        const sig = `${Math.floor(t.pos.x)},${Math.floor(t.pos.y)},${t.pos.l}`;
        if (sig !== a._sig) { a._sig = sig; a._goalSig = null; rt.path = null; }
        const goals = [];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const gx = Math.floor(t.pos.x) + dx, gy = Math.floor(t.pos.y) + dy;
          if (S.nav.passable(t.pos.l, gx, gy, 'walk') && !w.blockedEdge(t.pos.l, gx, gy, Math.floor(t.pos.x), Math.floor(t.pos.y))) goals.push({ l: t.pos.l, x: gx, y: gy });
        }
        if (!goals.length) goals.push({ l: t.pos.l, x: Math.floor(t.pos.x), y: Math.floor(t.pos.y) });
        const r = S.routeTo(s, a, goals, { occupiedGoals: true });
        if (r === 'failed') { S.markUnreachable(s, a); S.finish(s, a, true); return; }
        a.walkT = (a.walkT || 0) + dtMin;
        if (a.walkT > 120) { S.finish(s, a, true); }
        return;
      }
      case 'engage': {
        if (t._rt.engagedBy && t._rt.engagedBy !== s.id) { S.bubble(s, '⏳', 5); if (a.player) S.notifyFail(s, `${t.first} est déjà occupé.`); S.finish(s, a, true); return; }
        if (t._rt.sleeping) { S.bubble(s, '💤', 5); if (a.player) S.notifyFail(s, `${t.first} dort.`); S.finish(s, a, true); return; }
        if (t.queue[0]?.kind === 'social' && t.queue[0].target === s.id && t._rt.socialWith === s.id) {
          // Les deux veulent se parler : on laisse l'autre mener.
          S.finish(s, a, true); return;
        }
        t._rt.engagedBy = s.id;
        rt.socialWith = t.id;
        a.phase = 'talk'; a.t = 0;
        a.dur = 6 + Math.random() * 6;
        S.bubble(s, so.icon, a.dur + 2);
        w.rel(s.id, t.id); w.rel(t.id, s.id);
        return;
      }
      case 'talk': {
        a.t += dtMin;
        if (t._rt.engagedBy !== s.id) { S.finish(s, a, true); return; }
        S.face(s, t.pos.x, t.pos.y);
        const cycle = Math.floor(a.t / 2) % 3;
        rt.anim = ['talk', 'idle', 'talk'][cycle];
        t._rt.talkAnim = ['idle', 'talk', 'idle'][cycle];
        if (a.t >= a.dur) { this.resolve(s, t, so, a); a.phase = 'linger'; a.t = 0; }
        return;
      }
      case 'linger': {
        a.t += dtMin;
        S.face(s, t.pos.x, t.pos.y);
        rt.anim = a.accepted ? 'idle' : 'idle';
        if (a.t > 2.5) {
          t._rt.engagedBy = null; t._rt.talkAnim = null;
          S.finish(s, a, false);
          // Enchaînement naturel d'une conversation autonome.
          if (!a.player && a.accepted && s.needs.social < 85 && Math.random() < 0.55 && so.cat !== 'mean') {
            const next = this.pickSocial(s, t, s.traits.map(x => registry.trait(x)).filter(Boolean), registry.emotions[s.emotion] || {});
            if (next) S.enqueue(s, { kind: 'social', target: t.id, social: next.id, name: next.name, icon: next.icon }, false);
          }
        }
        return;
      }
      case 'exit':
        t._rt.engagedBy = null; t._rt.talkAnim = null;
        S.finish(s, a, true);
    }
  }

  // Probabilité d'acceptation (0-100).
  chance(a, t, so) {
    const w = this.w;
    const rTa = w.rel(t.id, a.id);
    let c = so.base;
    c += rTa.friend * 0.3;
    if (so.cat === 'romantic') {
      c += rTa.romance * 0.35;
      if (!this.attracted(t, a)) c -= 70;
      const p = this.partnerOf(t);
      if (p && p !== a.id) c -= 35;
    }
    const emo = registry.emotions[t.emotion] || {};
    c += emo.socialBonus || 0;
    if (so.cat === 'romantic') c += (registry.emotions[t.emotion]?.romanticBonus || 0);
    if (so.cat === 'funny') c += (registry.emotions[t.emotion]?.funnyBonus || 0);
    for (const tr of t.traits) c += registry.trait(tr)?.acceptBonus || 0;
    for (const tr of a.traits) c += registry.trait(tr)?.socialSuccess?.[so.cat] || 0;
    c += (a.skills.charisma || 0) * 1.5 + (a.skills.social || 0);
    c += this.compatibility(a, t) * 0.5;
    if (t.needs.social < 30) c += 10;
    if (t.needs.sleep < 15 || t.needs.hunger < 15) c -= 15;
    c += this.S.powers.socialModifier(a, t, so);
    return clamp(c, 3, 97);
  }

  // Compatibilité : goûts communs, traits complémentaires ou opposés (-30 à +30).
  compatibility(a, b) {
    let c = 0;
    if (a.likes?.music === b.likes?.music) c += 8;
    if (a.likes?.activity === b.likes?.activity) c += 10;
    if (a.likes?.color === b.likes?.color) c += 3;
    if (a.dislikes?.activity === b.likes?.activity) c -= 6;
    for (const t of a.traits) {
      const tr = registry.trait(t);
      if (b.traits.includes(t)) c += 5;
      if (tr?.conflicts?.some(x => b.traits.includes(x))) c -= 8;
    }
    return clamp(c, -30, 30);
  }

  resolve(a, t, so, action) {
    const S = this.S, w = this.w;
    const pct = this.chance(a, t, so);
    const ok = w.rng.next() * 100 < pct;
    action.accepted = ok;
    const fx = ok ? so.fx || {} : so.fail || {};
    const rAT = w.rel(a.id, t.id), rTA = w.rel(t.id, a.id);
    const firstMeet = !rAT.known;
    rAT.known = rTA.known = true;
    if (fx.friend) { rTA.friend = clamp(rTA.friend + fx.friend, -100, 100); rAT.friend = clamp(rAT.friend + fx.friend * 0.7, -100, 100); }
    if (fx.romance) { rTA.romance = clamp(rTA.romance + fx.romance, -100, 100); rAT.romance = clamp(rAT.romance + fx.romance * 0.8, -100, 100); }
    if (fx.social) { a.needs.social = clamp(a.needs.social + fx.social, 0, 100); t.needs.social = clamp(t.needs.social + fx.social * 0.8, 0, 100); }
    else if (ok) { a.needs.social = clamp(a.needs.social + 5, 0, 100); t.needs.social = clamp(t.needs.social + 4, 0, 100); }
    if (fx.fun) { a.needs.fun = clamp(a.needs.fun + fx.fun, 0, 100); t.needs.fun = clamp(t.needs.fun + fx.fun * 0.7, 0, 100); }
    if (fx.aMood) S.addMoodlet(a, fx.aMood);
    if (fx.tMood) S.addMoodlet(t, fx.tMood);
    if (so.skill) S.gainSkill(a, so.skill, 0.08);
    S.gainSkill(a, 'social', 0.03);
    // Réactions visibles.
    S.playOnce(t, ok ? (so.cat === 'mean' ? 'angry' : so.cat === 'funny' ? 'laugh' : 'cheer') : (so.cat === 'romantic' ? 'refuse' : 'refuse'), 1.6);
    S.bubble(t, ok ? (so.cat === 'mean' ? '😠' : so.cat === 'romantic' ? '💗' : '😊') : (so.cat === 'mean' ? '🙄' : '😒'), 6);
    if (ok && fx.memory) this.remember(a, t, fx.memory);
    if (ok && fx.special) this.special(a, t, fx.special, action);
    if (ok && fx.jealousy) this.jealousy(a, t, fx.jealousy);
    if (firstMeet) w.log('meet', `${simName(a)} a rencontré ${simName(t)}.`, [a.id, t.id], { icon: '👋' });
    if (so.important) w.log('social', `${simName(a)} → ${simName(t)} : « ${so.name} » ${ok ? 'accepté' : 'refusé'}.`, [a.id, t.id], { icon: so.icon, important: true });
    this.updateStatus(a, t);
    this.updateStatus(t, a);
    S.emit('social', { a: a.id, t: t.id, social: so.id, ok });
    S.events.onSocial(a, t, so, ok);
    S.powers.onSocial(a, t, so, ok);
  }

  remember(a, t, key) {
    const w = this.w;
    const txt = (MEMORY_TEXT[key] || ((x, y) => `${x} & ${y} : ${key}`))(a.first, t.first);
    const m = { key, t: w.time, text: txt };
    w.rel(a.id, t.id).mem.push(m);
    w.rel(t.id, a.id).mem.push(m);
    for (const r of [w.rel(a.id, t.id), w.rel(t.id, a.id)]) if (r.mem.length > 25) r.mem.shift();
    a.memories.push({ ...m, with: t.id });
    t.memories.push({ ...m, with: a.id });
    if (a.memories.length > 60) a.memories.shift();
    if (t.memories.length > 60) t.memories.shift();
  }

  updateStatus(a, b) {
    const w = this.w;
    const r = w.rel(a.id, b.id);
    const old = r.status;
    if (ROMANTIC_STATUS.includes(old) || old === 'ex' && r.friend < 30) return;
    let st = old;
    if (r.flags.family) st = 'family';
    else if (r.flags.rivals && r.friend < 0) st = r.friend < -60 ? 'enemy' : 'rival';
    else if (r.friend <= -60) st = 'enemy';
    else if (r.friend <= -35) st = 'rival';
    else if (r.friend >= 75 && w.rel(b.id, a.id).friend >= 75) st = 'best_friend';
    else if (r.friend >= 30) st = 'friend';
    else if (r.flags.teammate) st = 'teammate';
    else if (r.flags.colleague) st = 'colleague';
    else if (r.known) st = 'acquaintance';
    if (st !== old) {
      r.status = st;
      if (['friend', 'best_friend', 'enemy', 'rival'].includes(st) && w.rel(b.id, a.id).status === st && a.id < b.id) {
        const icon = { friend: '🤝', best_friend: '💛', enemy: '💢', rival: '⚔️' }[st];
        w.log('relation', `${simName(a)} et ${simName(b)} sont maintenant ${REL_STATUS[st].toLowerCase()}s.`, [a.id, b.id], { icon, important: st !== 'friend' });
        this.S.emit('notify', { text: `${a.first} & ${b.first} : ${REL_STATUS[st]}`, icon, sim: a.id });
      }
    }
  }

  special(a, t, kind, action) {
    const S = this.S, w = this.w;
    switch (kind) {
      case 'become_partners': {
        for (const s of [a, t]) {
          const p = this.partnerOf(s);
          if (p && p !== (s === a ? t.id : a.id)) this.breakUp(s, w.sim(p), true);
        }
        w.setStatus(a.id, t.id, 'partner');
        w.log('love', `💞 ${simName(a)} et ${simName(t)} sont officiellement en couple !`, [a.id, t.id], { icon: '💞', important: true });
        break;
      }
      case 'engage':
        w.setStatus(a.id, t.id, 'engaged');
        w.log('love', `💍 ${simName(t)} a dit oui à ${simName(a)} !`, [a.id, t.id], { icon: '💍', important: true });
        break;
      case 'marry':
        w.setStatus(a.id, t.id, 'married');
        w.d.stats.weddings++;
        if (t.householdId !== a.householdId) this.moveIn(t, a);
        w.log('love', `💒 Mariage de ${simName(a)} et ${simName(t)} ! Tout le quartier est en fête.`, [a.id, t.id], { icon: '💒', important: true });
        for (const s of w.sims) if (s.id !== a.id && s.id !== t.id && w.rel(s.id, a.id, false)?.friend > 30) S.addMoodlet(s, 'party_fun');
        break;
      case 'move_in':
        this.moveIn(t, a);
        break;
      case 'break_up':
        this.breakUp(a, t, false);
        break;
      case 'rivals':
        w.rel(a.id, t.id).flags.rivals = true; w.rel(t.id, a.id).flags.rivals = true;
        break;
      case 'baby':
        S.life.scheduleBaby(a, t);
        break;
      case 'date':
        w.rel(a.id, t.id).flags.dates = (w.rel(a.id, t.id).flags.dates || 0) + 1;
        w.log('love', `🌹 ${simName(a)} et ${simName(t)} ont un rendez-vous galant.`, [a.id, t.id], { icon: '🌹' });
        break;
      case 'share_secret': {
        const sc = (a.secrets || []).find(x => !x.knownBy.includes(t.id));
        if (sc) { sc.knownBy.push(t.id); S.bubble(t, '🤫', 8); }
        break;
      }
      case 'reveal_secret': {
        const sc = this.knownSecretOf(a, t);
        if (sc) {
          for (const o of w.sims) if (o.id !== t.id && dist(o.pos.x, o.pos.y, a.pos.x, a.pos.y) < 15 && !sc.knownBy.includes(o.id)) sc.knownBy.push(o.id);
          S.addMoodlet(t, 'secret_out');
          w.log('drama', `🗯️ ${simName(a)} a révélé le secret de ${simName(t)} : « ${sc.text} »`, [a.id, t.id], { icon: '🗯️', important: true });
        }
        break;
      }
      case 'rumor': {
        const third = w.sims.find(o => o.id !== a.id && o.id !== t.id && w.rel(a.id, o.id, false)?.known && w.rel(t.id, o.id, false)?.known);
        if (third) {
          const r = w.rel(t.id, third.id); r.friend = clamp(r.friend - 5, -100, 100);
          third.flags.rumors = (third.flags.rumors || 0) + 1;
          if (third.flags.rumors % 3 === 0) {
            S.addMoodlet(third, 'rumor_victim');
            w.log('drama', `🗞️ Une rumeur court sur ${simName(third)} dans le quartier…`, [third.id], { icon: '🗞️' });
          }
        }
        break;
      }
      case 'clear_grudge': {
        const r1 = w.rel(t.id, a.id), r2 = w.rel(a.id, t.id);
        r1.flags.rivals = r2.flags.rivals = false;
        r1.friend = Math.max(r1.friend, 0); r2.friend = Math.max(r2.friend, 0);
        w.log('social', `🕊️ ${simName(a)} et ${simName(t)} se sont réconciliés.`, [a.id, t.id], { icon: '🕊️', important: true });
        break;
      }
      case 'reconcile_third': {
        const third = action.third ? w.sim(action.third) : null;
        if (third) {
          const r1 = w.rel(t.id, third.id), r2 = w.rel(third.id, t.id);
          r1.friend = clamp(r1.friend + 25, -100, 100); r2.friend = clamp(r2.friend + 25, -100, 100);
          r1.flags.rivals = r2.flags.rivals = false;
          this.updateStatus(t, third); this.updateStatus(third, t);
          w.log('social', `🕊️ Grâce à ${simName(a)}, ${t.first} et ${third.first} font la paix.`, [a.id, t.id, third.id], { icon: '🕊️', important: true });
        }
        break;
      }
      case 'joint_activity': {
        const activity = this.findJointActivity(a);
        if (activity) {
          S.enqueue(a, { ...activity }, false);
          S.dropAll(t);
          S.enqueue(t, { ...activity }, false);
          w.log('social', `🎳 ${a.first} et ${t.first} décident de faire une activité ensemble.`, [a.id, t.id], { icon: '🎳' });
        }
        break;
      }
    }
  }

  findJointActivity(a) {
    const w = this.w;
    const opts = [];
    for (const o of w.objects) {
      const def = registry.object(o.def);
      if (!def) continue;
      for (const affId of def.aff || []) {
        const aff = registry.aff(affId);
        if (aff?.group && dist(a.pos.x, a.pos.y, o.x, o.y) < 40) opts.push({ kind: 'object', objId: o.id, aff: affId, name: aff.name });
      }
    }
    return opts.length ? w.rng.pick(opts) : null;
  }

  moveIn(mover, host) {
    const w = this.w;
    const oldH = w.household(mover.householdId);
    const newH = w.household(host.householdId);
    if (!newH || oldH === newH) return;
    if (oldH) oldH.members = oldH.members.filter(m => m !== mover.id);
    newH.members.push(mover.id);
    mover.householdId = newH.id;
    if (oldH && oldH.members.length === 0) { newH.funds += oldH.funds; oldH.funds = 0; const lot = w.lot(oldH.lotId); if (lot) { lot.householdId = null; lot.forSale = true; } w.d.households = w.d.households.filter(h => h !== oldH); }
    w.log('home', `🏡 ${simName(mover)} emménage chez ${simName(host)}.`, [mover.id, host.id], { icon: '🏡', important: true });
  }

  breakUp(a, t, silent) {
    const w = this.w;
    w.setStatus(a.id, t.id, 'ex');
    w.rel(a.id, t.id).romance = Math.min(0, w.rel(a.id, t.id).romance);
    w.rel(t.id, a.id).romance = Math.min(0, w.rel(t.id, a.id).romance);
    this.S.addMoodlet(t, 'heartbroken');
    if (!silent) w.log('love', `💔 ${simName(a)} et ${simName(t)} se sont séparés.`, [a.id, t.id], { icon: '💔', important: true });
  }

  // Jalousie : le ou la partenaire présent(e) réagit au flirt.
  jealousy(a, t, level) {
    const S = this.S, w = this.w;
    for (const flirter of [a, t]) {
      const other = flirter === a ? t : a;
      const pid = this.partnerOf(flirter);
      if (!pid || pid === other.id) continue;
      const p = w.sim(pid);
      if (!p) continue;
      const sees = dist(p.pos.x, p.pos.y, flirter.pos.x, flirter.pos.y) < 12 && !p._rt.hidden;
      const later = !sees && w.rng.chance(0.15 * level);
      if (!sees && !later) continue;
      let mult = 1;
      for (const tr of p.traits) mult *= registry.trait(tr)?.jealousy || 1;
      S.addMoodlet(p, 'jealous');
      const r = w.rel(p.id, flirter.id);
      r.friend = clamp(r.friend - 12 * mult, -100, 100);
      r.romance = clamp(r.romance - 15 * mult, -100, 100);
      const r2 = w.rel(p.id, other.id); r2.friend = clamp(r2.friend - 15 * mult, -100, 100);
      r.flags.complicated = true;
      w.log('drama', sees ? `😒 ${simName(p)} a surpris ${flirter.first} en train de flirter avec ${other.first} !` : `😒 ${simName(p)} a appris que ${flirter.first} a flirté avec ${other.first}…`, [p.id, flirter.id, other.id], { icon: '😒', important: true });
      if (sees) { S.bubble(p, '😡', 10); S.playOnce(p, 'angry', 2); }
      if (r.romance < -10) this.breakUp(p, flirter, false);
    }
  }

  // ------------------------------------------------------------------ fêtes
  throwParty(host) {
    const w = this.w, S = this.S;
    const lot = w.lotAt(Math.floor(host.pos.x), Math.floor(host.pos.y)) || w.homeLot(host);
    if (!lot) return false;
    const friends = w.relPairs(host.id).filter(p => p.r.known && p.r.friend > -10).map(p => w.sim(p.other)).filter(s => s && !s._rt.hidden && s.stage !== 'baby');
    w.rng.shuffle(friends);
    const guests = friends.slice(0, 6);
    if (!guests.length) { S.notifyFail(host, `${host.first} n’a personne à inviter.`); return false; }
    w.d.party = { host: host.id, lotId: lot.id, start: w.time, until: w.time + 180, guests: guests.map(g => g.id) };
    for (const g of guests) {
      S.dropAll(g);
      const tx = Math.floor(lot.x + lot.w / 2), ty = Math.floor(lot.y + lot.h / 2);
      const f = S.nav.nearestFree(0, tx, ty, 8) || { x: tx, y: ty };
      S.enqueue(g, { kind: 'goto', x: f.x, y: f.y, l: 0, name: 'Aller à la fête', icon: '🎉' }, false);
    }
    w.log('party', `🎉 ${simName(host)} organise une fête et invite ${guests.map(g => g.first).join(', ')}.`, [host.id, ...guests.map(g => g.id)], { icon: '🎉', important: true });
    return true;
  }

  runParty(s, a) { this.S.finish(s, a, false); }

  checkParty() {
    const w = this.w, S = this.S;
    const p = w.d.party;
    if (!p || w.time < p.until) return;
    const host = w.sim(p.host);
    const guests = p.guests.map(id => w.sim(id)).filter(Boolean);
    const lot = w.lot(p.lotId);
    const present = guests.filter(g => lot && g.pos.x >= lot.x && g.pos.x < lot.x + lot.w && g.pos.y >= lot.y && g.pos.y < lot.y + lot.h);
    const fun = present.reduce((acc, g) => acc + g.needs.fun + g.needs.social, 0) / Math.max(1, present.length * 2);
    const success = present.length >= Math.ceil(guests.length / 2) && fun > 55;
    if (host) {
      S.addMoodlet(host, success ? 'party_fun' : 'party_flop');
      w.log('party', success ? `🥳 La fête de ${simName(host)} a été un triomphe !` : `😬 La fête de ${simName(host)} a été un flop… (${present.length}/${guests.length} invités présents)`, [host.id], { icon: success ? '🥳' : '😬', important: true });
      for (const g of present) {
        S.addMoodlet(g, success ? 'party_fun' : 'party_flop');
        const r = w.rel(g.id, host.id); r.friend = clamp(r.friend + (success ? 10 : -3), -100, 100);
      }
    }
    w.d.party = null;
  }
}

// Événements émergents (style « vie de quartier imprévisible ») + événements déclaratifs des mods.
// Les événements partent toujours de l'état de la simulation (relations, traits, humeurs), jamais d'un script figé.
import { clamp, dist } from '../core/util.js';
import { registry } from '../mods/registry.js';
import { LIKES } from './data/core-data.js';
import { simName, isAdult } from './simulation.js';

const ABSURD_TOPICS = ['la meilleure façon de plier une serviette', 'si l’ananas a sa place sur une pizza', 'qui a mangé le dernier yaourt',
  'la couleur exacte du ciel ce matin', 'si les pigeons nous espionnent', 'le nombre idéal de coussins sur un canapé',
  'la bonne prononciation de « chocolatine »', 'qui ronfle le plus fort', 'si un hot-dog est un sandwich'];
const WEIRD_ART = ['un portrait de son grille-pain', 'une fresque de 200 pingouins', 'une sculpture en spaghettis', 'un autoportrait en triangle',
  'un tableau entièrement beige', 'une ode visuelle à la chaussette perdue'];

export class EventSystem {
  constructor(sim) { this.S = sim; this.cooldowns = {}; }
  get w() { return this.S.world; }

  freq() { return [0.4, 1, 2][this.w.settings.eventFrequency ?? 1] || 1; }

  activeSims() { return this.w.sims.filter(s => s.stage !== 'baby' && !s._rt.hidden); }

  onHour(hour) {
    const w = this.w;
    const h = hour % 24;
    if (h < 7 || h > 23) return;               // le quartier dort
    const f = this.freq();
    const table = [
      ['sudden_love', 0.05, () => this.suddenLove()],
      ['absurd_argument', 0.06, () => this.absurdArgument()],
      ['new_passion', 0.03, () => this.newPassion(w.rng.pick(this.activeSims()))],
      ['surprise', 0.04, () => this.surprise()],
      ['rivalry', 0.04, () => this.rivalry()],
      ['spontaneous_party', 0.02, () => this.spontaneousParty()],
      ['ask_advice', 0.05, () => this.askPlayerAdvice()],
      ['style_change', 0.025, () => this.styleChange()],
      ['improbable_friendship', 0.03, () => this.improbableFriendship()],
      ['secret_reveal', 0.025, () => this.secretReveal()],
      ['group_activity', 0.03, () => this.groupActivity()],
      ['club', 0.02, () => this.club()],
    ];
    for (const [id, p, fn] of table) {
      if ((this.cooldowns[id] || 0) > w.time) continue;
      if (w.rng.chance(p * f)) {
        const ok = fn();
        if (ok) { this.cooldowns[id] = w.time + 240 / f; w.d.stats.events++; }
      }
    }
    this.runModEvents('hourly');
  }

  onNewDay() { this.runModEvents('daily'); }
  onSocial(a, t, so, ok) { this.runModEvents('social', { actor: a, target: t, social: so.id, ok }); }

  // ------------------------------------------------------------------ événements de base
  pairs(filter) {
    const sims = this.activeSims();
    const out = [];
    for (const a of sims) for (const b of sims) if (a.id < b.id && filter(a, b)) out.push([a, b]);
    return out;
  }

  suddenLove() {
    const w = this.w, S = this.S;
    if (!w.settings.romance) return false;
    const c = this.pairs((a, b) => isAdult(a) && isAdult(b) && w.rel(a.id, b.id, false)?.friend > 25 && S.social.attracted(a, b)
      && !S.social.partnerOf(a) && !w.rel(a.id, b.id).flags.family);
    if (!c.length) return false;
    const [a, b] = w.rng.pick(c);
    const r = w.rel(a.id, b.id);
    r.romance = clamp(r.romance + 25, -100, 100);
    S.addMoodlet(a, 'flirty_social');
    S.bubble(a, '💘', 15);
    w.log('event', `💘 ${simName(a)} a eu le coup de foudre pour ${simName(b)} !`, [a.id, b.id], { icon: '💘', important: true });
    S.emit('notify', { text: `${a.first} est tombé(e) amoureux(se) de ${b.first} !`, icon: '💘', sim: a.id });
    S.enqueue(a, { kind: 'social', target: b.id, social: 'flirt', name: 'Flirter', icon: '😘' }, false);
    return true;
  }

  absurdArgument() {
    const w = this.w, S = this.S;
    const c = this.pairs((a, b) => w.rel(a.id, b.id, false)?.friend > 10 && dist(a.pos.x, a.pos.y, b.pos.x, b.pos.y) < 30);
    if (!c.length) return false;
    const [a, b] = w.rng.pick(c);
    const topic = w.rng.pick(ABSURD_TOPICS);
    S.dropAll(a);
    S.enqueue(a, { kind: 'social', target: b.id, social: 'argue', name: 'Se disputer', icon: '😤' }, false);
    w.log('event', `😤 ${simName(a)} et ${simName(b)} se disputent à propos de ${topic}.`, [a.id, b.id], { icon: '😤', important: true });
    return true;
  }

  newPassion(s, aff) {
    if (!s) return false;
    const w = this.w;
    const act = aff ? Object.entries({ Cuisine: 'cook', Sport: 'workout', Lecture: 'read_book', 'Jeux vidéo': 'play_games', Peinture: 'paint', Jardinage: 'garden', Danse: 'dance', Cinéma: 'watch_tv' }).find(([, v]) => v === aff.id)?.[0] : w.rng.pick(LIKES.activities);
    if (!act || s.likes.activity === act) return false;
    s.likes.activity = act;
    this.S.addMoodlet(s, 'new_passion');
    this.S.bubble(s, '✨', 12);
    w.log('event', `✨ ${simName(s)} se découvre une passion inattendue : ${act.toLowerCase()} !`, [s.id], { icon: '✨', important: true });
    return true;
  }

  surprise() {
    const w = this.w, S = this.S;
    const c = this.pairs((a, b) => w.rel(a.id, b.id, false)?.friend > 45 || ['partner', 'married'].includes(w.rel(a.id, b.id, false)?.status));
    if (!c.length) return false;
    const [a, b] = w.rng.chance(0.5) ? w.rng.pick(c) : w.rng.pick(c).reverse();
    S.addMoodlet(b, 'surprise');
    const r = w.rel(b.id, a.id); r.friend = clamp(r.friend + 10, -100, 100);
    S.enqueue(a, { kind: 'social', target: b.id, social: 'hug', name: 'Faire un câlin', icon: '🤗' }, false);
    w.log('event', `🎁 ${simName(a)} a préparé une surprise pour ${simName(b)}.`, [a.id, b.id], { icon: '🎁' });
    return true;
  }

  rivalry() {
    const w = this.w, S = this.S;
    const c = this.pairs((a, b) => w.rel(a.id, b.id, false)?.friend < -20 && !w.rel(a.id, b.id).flags.rivals);
    if (!c.length) return false;
    const [a, b] = w.rng.pick(c);
    S.enqueue(a, { kind: 'social', target: b.id, social: 'declare_rival', name: 'Déclarer sa rivalité', icon: '⚔️' }, false);
    return true;
  }

  spontaneousParty() {
    const S = this.S, w = this.w;
    if (w.d.party) return false;
    const hosts = this.activeSims().filter(s => s.traits.includes('outgoing') || s.needs.social < 40);
    if (!hosts.length) return false;
    return S.social.throwParty(w.rng.pick(hosts));
  }

  styleChange() {
    const w = this.w, S = this.S;
    const s = w.rng.pick(this.activeSims());
    if (!s) return false;
    const ap = s.appearance;
    const cols = ['#d8344a', '#2f6fd6', '#2fae66', '#f2b632', '#8a4fd6', '#222831', '#ff7aa8', '#21b5b5', '#ff8a2a'];
    ap.primary = w.rng.pick(cols); ap.secondary = w.rng.pick(cols); ap.hair = w.rng.pick(['#d65a8f', '#5a7ae0', '#3fae6b', '#f3e4b5', '#a83a2a']);
    ap.extras = w.rng.chance(0.5) ? [w.rng.pick(['sunglasses', 'headphones', 'crown', 'flower', 'tophat', 'cap'])] : [];
    S.addMoodlet(s, 'new_look');
    S.emit('appearance', s);
    w.log('event', `💇 ${simName(s)} a complètement changé de style !`, [s.id], { icon: '💇', important: true });
    return true;
  }

  improbableFriendship() {
    const w = this.w, S = this.S;
    const c = this.pairs((a, b) => S.social.compatibility(a, b) < -5 && Math.abs(w.rel(a.id, b.id, false)?.friend ?? 0) < 25 && w.rel(a.id, b.id, false)?.known);
    if (!c.length) return false;
    const [a, b] = w.rng.pick(c);
    for (const [x, y] of [[a, b], [b, a]]) { const r = w.rel(x.id, y.id); r.friend = clamp(r.friend + 25, -100, 100); S.social.updateStatus(x, y); }
    S.enqueue(a, { kind: 'social', target: b.id, social: 'joke', name: 'Faire une blague', icon: '😂' }, false);
    w.log('event', `🤝 Amitié improbable : ${simName(a)} et ${simName(b)}, que tout opposait, se découvrent des points communs.`, [a.id, b.id], { icon: '🤝', important: true });
    return true;
  }

  secretReveal() {
    const w = this.w, S = this.S;
    const holders = this.activeSims().filter(s => s.secrets?.length && !s.traits.includes('mysterious') || (s.traits.includes('mysterious') && w.rng.chance(0.3) && s.secrets?.length));
    if (!holders.length) return false;
    const s = w.rng.pick(holders);
    const sc = w.rng.pick(s.secrets);
    for (const o of w.sims) if (o.id !== s.id && !sc.knownBy.includes(o.id) && w.rng.chance(0.4)) sc.knownBy.push(o.id);
    S.addMoodlet(s, 'secret_out');
    w.log('event', `🤭 Le secret de ${simName(s)} a fuité : « ${sc.text} »`, [s.id], { icon: '🤭', important: true });
    return true;
  }

  groupActivity() {
    const w = this.w, S = this.S;
    const leader = w.rng.pick(this.activeSims().filter(s => s.needs.social < 70));
    if (!leader) return false;
    const spot = w.objects.find(o => ['fountain', 'stereo', 'chess', 'grill'].includes(o.def) && dist(o.x, o.y, leader.pos.x, leader.pos.y) < 50);
    if (!spot) return false;
    const def = registry.object(spot.def);
    const affId = def.aff.find(a => registry.aff(a)?.group) || def.aff[0];
    const friends = w.relPairs(leader.id).filter(p => p.r.friend > 15).map(p => w.sim(p.other)).filter(s => s && !s._rt.hidden && s.stage !== 'baby').slice(0, 4);
    if (friends.length < 2) return false;
    for (const s of [leader, ...friends]) { if (!s.queue[0]?.player) { S.dropAll(s); S.enqueue(s, { kind: 'object', objId: spot.id, aff: affId, name: registry.aff(affId).name }, false); } }
    w.log('event', `🎶 ${simName(leader)} propose une activité collective (${registry.aff(affId).name.toLowerCase()}) à ${friends.map(f => f.first).join(', ')}.`, [leader.id, ...friends.map(f => f.id)], { icon: '🎶', important: true });
    return true;
  }

  club() {
    const w = this.w;
    w.d.groups ||= [];
    const byInterest = {};
    for (const s of this.activeSims()) (byInterest[s.likes.activity] ||= []).push(s);
    const options = Object.entries(byInterest).filter(([k, v]) => v.length >= 3 && !w.d.groups.some(g => g.interest === k));
    if (!options.length) return false;
    const [interest, members] = w.rng.pick(options);
    const g = { id: `club_${interest}`, name: `Club ${interest}`, interest, members: members.slice(0, 6).map(m => m.id) };
    w.d.groups.push(g);
    for (const a of g.members) for (const b of g.members) if (a !== b) { const r = w.rel(a, b); r.known = true; r.friend = clamp(r.friend + 8, -100, 100); }
    w.log('event', `👥 Un nouveau groupe se forme : « ${g.name} » (${members.slice(0, 6).map(m => m.first).join(', ')}).`, g.members, { icon: '👥', important: true });
    return true;
  }

  maybeWeirdArt(s) {
    const w = this.w;
    let p = 0.12;
    for (const t of s.traits) p *= registry.trait(t)?.eventChance?.weird_art || 1;
    if (!w.rng.chance(p)) return;
    w.log('event', `🎨 ${simName(s)} a créé ${w.rng.pick(WEIRD_ART)}. Le quartier ne sait pas quoi en penser.`, [s.id], { icon: '🎨', important: true });
    this.S.addMoodlet(s, 'inspired_art');
  }

  wish(s) {
    const w = this.w;
    if (w.rng.chance(0.15)) { w.earn(s, 200); w.log('event', `🍀 Le vœu de ${simName(s)} s’est réalisé : ✦200 trouvés au fond de la fontaine !`, [s.id], { icon: '🍀' }); }
  }

  // ------------------------------------------------------------------ conseils demandés au joueur
  askPlayerAdvice() {
    const w = this.w, S = this.S;
    const sims = this.activeSims();
    if (!sims.length || S.pendingDialogs.length > 2) return false;
    const s = w.rng.pick(sims);
    const crush = w.relPairs(s.id).filter(p => p.r.romance > 20 && !['partner', 'married', 'engaged'].includes(p.r.status) && w.sim(p.other)).map(p => w.sim(p.other))[0];
    const enemy = w.relPairs(s.id).filter(p => p.r.friend < -15 && w.sim(p.other)).map(p => w.sim(p.other))[0];
    let d;
    if (crush && isAdult(s) && isAdult(crush) && w.settings.romance) {
      d = { sim: s.id, title: `${s.first} a besoin de toi`, text: `${s.first} a le béguin pour ${crush.first} mais n’ose pas se déclarer. Que lui conseilles-tu ?`,
        options: [
          { label: 'Fonce, déclare-toi !', effect: { kind: 'social', target: crush.id, social: 'ask_relationship' } },
          { label: 'Invite-le/la d’abord à un rendez-vous', effect: { kind: 'social', target: crush.id, social: 'date' } },
          { label: 'Attends encore un peu', effect: { moodlet: 'reassured' } },
          { label: 'Oublie cette personne', effect: { romance: -20, with: crush.id } },
        ] };
    } else if (enemy) {
      d = { sim: s.id, title: `${s.first} hésite`, text: `${s.first} est toujours fâché(e) contre ${enemy.first}. Que doit-il/elle faire ?`,
        options: [
          { label: 'Présenter des excuses', effect: { kind: 'social', target: enemy.id, social: 'apologize' } },
          { label: 'Lui dire ses quatre vérités', effect: { kind: 'social', target: enemy.id, social: 'argue' } },
          { label: 'L’ignorer et passer à autre chose', effect: { moodlet: 'reassured' } },
        ] };
    } else {
      const act = w.rng.pick(LIKES.activities.filter(x => x !== s.likes.activity));
      d = { sim: s.id, title: `Une idée de ${s.first}`, text: `${s.first} se demande s’il/elle devrait se mettre à : ${act.toLowerCase()}. Ton avis ?`,
        options: [
          { label: 'Excellente idée !', effect: { passion: act, moodlet: 'new_passion' } },
          { label: 'Change plutôt de look', effect: { style: true } },
          { label: 'Reste comme tu es', effect: { moodlet: 'reassured' } },
        ] };
    }
    d.id = `dlg_${w.time}_${s.id}`;
    S.pendingDialogs.push(d);
    S.emit('dialog', d);
    return true;
  }

  answerDialog(dialogId, optionIndex) {
    const S = this.S, w = this.w;
    const i = S.pendingDialogs.findIndex(d => d.id === dialogId);
    if (i < 0) return;
    const d = S.pendingDialogs.splice(i, 1)[0];
    const s = w.sim(d.sim);
    const opt = d.options[optionIndex];
    if (!s || !opt) return;
    const e = opt.effect;
    if (e.kind === 'social') S.enqueue(s, { kind: 'social', target: e.target, social: e.social, name: registry.social(e.social)?.name, icon: registry.social(e.social)?.icon }, true);
    if (e.moodlet) S.addMoodlet(s, e.moodlet);
    if (e.romance) { const r = w.rel(s.id, e.with); r.romance = clamp(r.romance + e.romance, -100, 100); }
    if (e.passion) { s.likes.activity = e.passion; }
    if (e.style) this.styleChange.call({ ...this, activeSims: () => [s], w, S });
    w.log('advice', `🗨️ Tu as conseillé à ${s.first} : « ${opt.label} »`, [s.id], { icon: '🗨️' });
  }

  // ------------------------------------------------------------------ événements déclaratifs des mods
  runModEvents(trigger, ctx = {}) {
    const w = this.w;
    for (const ev of registry.events.values()) {
      const tr = ev.trigger || {};
      if (tr.type !== trigger) continue;
      if (trigger === 'social' && tr.social && tr.social !== ctx.social) continue;
      if (trigger === 'social' && tr.onlyIfAccepted && !ctx.ok) continue;
      const key = `mod_${ev.id}`;
      if ((this.cooldowns[key] || 0) > w.time) continue;
      const chance = (tr.chance ?? 0.1) * (trigger === 'social' ? 1 : this.freq());
      if (!w.rng.chance(chance)) continue;
      const actor = ctx.actor || w.rng.pick(this.activeSims().filter(s => this.matches(s, ev.conditions)));
      if (!actor || !this.matches(actor, ev.conditions)) continue;
      const target = ctx.target || w.rng.pick(this.activeSims().filter(s => s.id !== actor.id && this.matches(s, ev.targetConditions)));
      this.applyEffects(ev, actor, target);
      this.cooldowns[key] = w.time + (ev.cooldown ?? 360);
    }
  }

  matches(s, cond) {
    if (!s) return false;
    if (!cond) return true;
    if (cond.trait && !s.traits.includes(cond.trait)) return false;
    if (cond.notTrait && s.traits.includes(cond.notTrait)) return false;
    if (cond.stage && !(Array.isArray(cond.stage) ? cond.stage : [cond.stage]).includes(s.stage)) return false;
    if (cond.adult && !isAdult(s)) return false;
    if (cond.emotion && s.emotion !== cond.emotion) return false;
    if (cond.needBelow) for (const n in cond.needBelow) if (s.needs[n] >= cond.needBelow[n]) return false;
    if (cond.needAbove) for (const n in cond.needAbove) if (s.needs[n] <= cond.needAbove[n]) return false;
    if (cond.hasPower !== undefined && this.S.powers.hasAnyPower(s) !== cond.hasPower) return false;
    if (cond.alignment && this.S.powers.alignment(s) !== cond.alignment) return false;
    if (cond.career && s.career.id !== cond.career) return false;
    if (cond.skillMin) for (const k in cond.skillMin) if ((s.skills[k] || 0) < cond.skillMin[k]) return false;
    return true;
  }

  // Les effets disponibles pour les mods : une liste fermée, sans exécution de code arbitraire.
  applyEffects(ev, actor, target) {
    const S = this.S, w = this.w;
    const fill = txt => String(txt || '').replaceAll('{actor}', actor ? actor.first : '?').replaceAll('{target}', target ? target.first : '?');
    for (const e of ev.effects || []) {
      const who = e.on === 'target' ? target : actor;
      switch (e.type) {
        case 'moodlet': if (who) S.addMoodlet(who, e.id); break;
        case 'need': if (who && e.need) who.needs[e.need] = clamp(who.needs[e.need] + (e.amount || 0), 0, 100); break;
        case 'relationship':
          if (actor && target) {
            for (const [x, y] of [[actor, target], [target, actor]]) {
              const r = w.rel(x.id, y.id); r.known = true;
              r.friend = clamp(r.friend + (e.friend || 0), -100, 100); r.romance = clamp(r.romance + (e.romance || 0), -100, 100);
              S.social.updateStatus(x, y);
            }
          }
          break;
        case 'skill': if (who && e.skill) S.gainSkill(who, e.skill, e.amount || 0.5); break;
        case 'money': if (who) w.earn(who, e.amount || 0); break;
        case 'journal': w.log('mod', fill(e.text), [actor?.id, target?.id].filter(Boolean), { icon: e.icon || ev.icon || '✨', important: !!e.important }); break;
        case 'notify': S.emit('notify', { text: fill(e.text), icon: e.icon || ev.icon || '✨', sim: actor?.id }); break;
        case 'bubble': if (who) S.bubble(who, e.icon || '❗', e.duration || 10); break;
        case 'trait_add': if (who && registry.trait(e.id) && !who.traits.includes(e.id)) who.traits.push(e.id); break;
        case 'trait_remove': if (who) who.traits = who.traits.filter(t => t !== e.id); break;
        case 'social': if (actor && target && registry.social(e.id)) S.enqueue(actor, { kind: 'social', target: target.id, social: e.id, name: registry.social(e.id).name, icon: registry.social(e.id).icon }, false); break;
        case 'animation': if (who) S.playOnce(who, e.anim || 'cheer', e.duration || 2); break;
        case 'grant_power': if (who) S.powers.grant(who, e.id, true); break;
        case 'use_power': if (who) S.powers.autoUse(who, e.id, target); break;
        case 'alignment': if (who) S.powers.setAlignment(who, e.value); break;
        case 'spawn_object': if (actor) { const f = S.nav.nearestFree(0, actor.pos.x + 2, actor.pos.y, 6); if (f && registry.object(e.id)) w.addObject(e.id, f.x, f.y, 0, 0, { state: { temporary: e.duration ? w.time + e.duration : 0 } }); } break;
        default: break;
      }
    }
  }
}

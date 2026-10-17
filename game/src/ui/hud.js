// Interface en jeu (mode Vie) : foyer, fiche du sim, besoins, file d'actions, temps, menus contextuels,
// dialogues des habitants, contrôle direct tactile.
import { h, btn, toast, setFocus, focusFirst, usingPadRef } from './dom.js';
import { registry } from '../mods/registry.js';
import { formatClock, formatMoney, DAYS, escapeHtml, clamp } from '../core/util.js';
import { REL_STATUS } from '../sim/data/social.js';
import { CAM_MODES } from '../render/camera.js';
import { ALIGNMENTS, PASSIVE_EFFECTS } from '../sim/powers.js';
import { simName, isAdult } from '../sim/simulation.js';
import { SKILL_MAX } from '../sim/data/core-data.js';
import { sfx } from '../engine/audio.js';

const WALL_MODES = [['up', '🧱', 'Murs hauts'], ['cutaway', '🪟', 'Murs découpés'], ['down', '⬛', 'Murs bas']];
const CAM_CYCLE = ['free', 'follow', 'close', 'neighborhood', 'aerial'];

export class Hud {
  constructor() { this.tab = null; this.root = null; }

  mount(game) {
    this.game = game;
    this.unmount();
    this.root = h('div', { id: 'hud' });
    document.getElementById('ui').appendChild(this.root);
    this.build();
  }
  unmount() { this.root?.remove(); this.root = null; this.closePie(); document.querySelector('.dialog-pop')?.remove(); }

  get S() { return this.game.sim; }
  get W() { return this.game.world; }

  build() {
    const g = this.game;
    this.topLeft = h('div', { class: 'hud-top-left' });
    this.topRight = h('div', { class: 'hud-top-right' },
      btn('🏠', () => g.setMode('live'), 'icon', { title: 'Mode Vie (F1)', id: 'm-live' }),
      btn('🛒', () => g.setMode('buy'), 'icon', { title: 'Mode Achat (F2)', id: 'm-buy' }),
      btn('🔨', () => g.setMode('build'), 'icon', { title: 'Mode Construction (F3)', id: 'm-build' }),
      btn('👤', () => g.ui.cas.open({ mode: 'new' }), 'icon', { title: 'Créer un habitant' }),
      btn('🗺️', () => g.ui.panels.worldPanel(), 'icon', { title: 'Monde et quartiers (F4)' }),
      btn('📜', () => g.ui.panels.journal(), 'icon', { title: 'Journal du monde (J)' }),
      btn('✨', () => g.ui.panels.creative(), 'icon', { title: 'Mode créatif total' }),
      btn('🧩', () => g.ui.mods.manager(), 'icon', { title: 'Gestionnaire de mods' }),
      btn('☰', () => g.ui.panels.pauseMenu(), 'icon', { title: 'Menu (Échap)' }),
    );
    this.bottomLeft = h('div', { class: 'hud-bottom-left' });
    this.bottomRight = h('div', { class: 'hud-bottom-right' });
    this.padHelp = h('div', { class: 'pad-help hidden' });
    this.hoverLabel = h('div', { class: 'panel hover-label hidden' });
    this.root.append(this.topLeft, this.topRight, this.bottomLeft, this.bottomRight, this.padHelp, this.hoverLabel);
    this.refresh();
  }

  // ------------------------------------------------------------------ rendu complet
  refresh() {
    if (!this.root || !this.W) return;
    const g = this.game;
    const s = g.selectedSim();
    for (const [id, m] of [['m-live', 'live'], ['m-buy', 'buy'], ['m-build', 'build']]) this.root.querySelector('#' + id)?.classList.toggle('active', g.mode === m);
    const live = g.mode === 'live';
    this.bottomLeft.classList.toggle('hidden', !live);
    this.topLeft.classList.toggle('hidden', !live);
    // Foyer.
    this.bottomLeft.innerHTML = '';
    if (g.controlledSim) { this.buildDirectControls(); }
    else this.root.querySelectorAll('.direct-pad,.direct-actions,.interact-hint').forEach(e => e.remove());
    const hh = this.W.household(g.household);
    const row = h('div', { class: 'household' });
    for (const m of g.householdSims()) {
      const emo = registry.emotions[m.emotion];
      row.appendChild(h('div', { class: `portrait ${m.id === g.selected ? 'selected' : ''}`, tabindex: '0', title: simName(m), style: { background: portraitBg(m) }, onclick: () => g.selectSim(m.id, true) },
        m.first[0], h('span', { class: 'emo' }, emo?.icon || '🙂')));
    }
    this.bottomLeft.appendChild(row);
    if (s) {
      const emo = registry.emotions[s.emotion] || registry.emotions.fine;
      const mood = this.S.mood(s);
      const card = h('div', { class: 'panel sim-card' },
        h('div', { class: 'portrait selected', style: { background: portraitBg(s), width: '56px', height: '56px' } }, s.first[0]),
        h('div', { class: 'col', style: { gap: '4px', minWidth: '150px' } },
          h('div', { class: 'name' }, simName(s)),
          h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'tag', style: { color: emo.color } }, `${emo.icon} ${emo.name}`), s.flags.atVenue ? h('span', { class: 'tag' }, '🏢 Absent') : null),
          h('div', { class: 'bar', style: { width: '150px' } }, h('i', { style: { width: `${mood}%`, background: moodColor(mood) } }))),
        h('div', { class: 'sim-tabs' },
          ...[['needs', '❤️', 'Besoins'], ['rel', '👥', 'Relations'], ['skills', '⭐', 'Compétences'], ['career', '💼', 'Carrière'], ['info', '🧠', 'Personnalité'], ...(registry.hasPowers() ? [['powers', '⚡', 'Pouvoirs']] : [])]
            .map(([id, ic, lbl]) => btn(ic, () => { this.tab = this.tab === id ? null : id; this.refresh(); }, `icon small ${this.tab === id ? 'active' : ''}`, { title: lbl }))),
      );
      if (this.tab) this.bottomLeft.appendChild(this.simPanel(s));
      this.bottomLeft.appendChild(card);
    }
    // Temps et caméra.
    this.bottomRight.innerHTML = '';
    const speed = this.S.speedIdx;
    const day = Math.floor(this.W.time / 1440);
    this.clockEl = h('div', { class: 'clock' }, formatClock(this.W.time));
    this.dayEl = h('div', { class: 'day' }, `${DAYS[day % 7]} · J${day + 1}`);
    this.fundsEl = h('div', { class: 'funds' }, formatMoney(hh?.funds ?? 0));
    const wm = WALL_MODES.find(m => m[0] === g.worldView?.wallMode) || WALL_MODES[1];
    this.bottomRight.append(
      h('div', { class: 'panel row', style: { padding: '6px', gap: '6px' } },
        btn(wm[1], () => this.cycleWallMode(), 'icon small', { title: `${wm[2]} (V)` }),
        btn(`${g.viewLevel === 0 ? 'RDC' : 'É' + g.viewLevel}`, () => g.setViewLevel(g.viewLevel === 0 ? 1 : 0), 'small', { title: 'Changer d’étage (PgUp/PgDn)' }),
        btn(CAM_MODES[g.rig.mode]?.icon || '🎥', () => this.cycleCamera(), 'icon small', { title: CAM_MODES[g.rig.mode]?.name }),
        btn('🕹️', () => g.toggleDirectControl(), `icon small ${g.controlledSim ? 'active' : ''}`, { title: 'Contrôle direct (C / Y)' }),
        h('span', { class: 'muted', style: { fontSize: '11px' } }, this.W.d.weather ? weatherIcon(this.W.d.weather.type) : '')),
      h('div', { class: 'panel timebox' },
        h('div', { class: 'col', style: { gap: '0' } }, this.clockEl, this.dayEl),
        ...[['⏸', 0], ['▶', 1], ['⏩', 2], ['⏭', 3]].map(([ic, i]) => btn(ic, () => { this.S.setSpeed(i); this.refresh(); }, `icon small ${speed === i ? 'active' : ''}`, { title: ['Pause', 'Vitesse normale', 'Rapide', 'Ultra rapide'][i] })),
        this.fundsEl),
    );
    this.renderQueue();
    this.updatePadHelp();
  }

  tick() {
    if (!this.root || !this.W) return;
    if (this.clockEl) this.clockEl.textContent = formatClock(this.W.time);
    const day = Math.floor(this.W.time / 1440);
    if (this.dayEl) this.dayEl.textContent = `${DAYS[day % 7]} · J${day + 1}`;
    const hh = this.W.household(this.game.household);
    if (this.fundsEl) this.fundsEl.textContent = formatMoney(hh?.funds ?? 0);
    this.renderQueue();
    if (this.tab === 'needs' || this.tab === 'powers') this.updateNeedBars();
    if (this.game.controlledSim) this.updateInteractHint();
    this.updatePadHelp();
  }

  renderQueue() {
    const s = this.game.selectedSim();
    const sig = s ? s.id + s.queue.map(a => a.id + a.phase).join() : '';
    if (sig === this.queueSig) return;
    this.queueSig = sig;
    this.topLeft.innerHTML = '';
    if (!s) return;
    const q = h('div', { class: 'queue' });
    s.queue.forEach((a, i) => {
      const icon = a.icon || (a.aff ? registry.aff(a.aff)?.icon : null) || (a.social ? registry.social(a.social)?.icon : null) || actionIcon(a);
      q.appendChild(h('div', { class: `queue-item ${i === 0 ? 'current' : ''}`, tabindex: '0', title: a.name || a.kind, onclick: () => { this.S.cancel(s, a.id); sfx('close'); } },
        icon, a.player ? h('span', { class: 'x' }, '✕') : null, i === 0 ? h('span', { class: 'lbl' }, (a.name || a.kind).slice(0, 18)) : null));
    });
    this.topLeft.appendChild(q);
  }

  // ------------------------------------------------------------------ fiche du sim
  simPanel(s) {
    const p = h('div', { class: 'panel sim-panel' });
    const S = this.S, W = this.W;
    switch (this.tab) {
      case 'needs': {
        p.appendChild(h('h3', { style: { marginTop: 0 } }, 'Besoins'));
        this.needEls = {};
        for (const n of registry.needs) {
          const v = s.needs[n.id];
          const bar = h('i', { style: { width: `${v}%`, background: needColor(v) } });
          const val = h('span', { class: 'muted' }, `${Math.round(v)}%`);
          this.needEls[n.id] = { bar, val };
          p.appendChild(h('div', { class: 'need-row' }, h('span', {}, n.icon), h('div', {}, h('div', { class: 'muted', style: { fontSize: '12px' } }, n.name), h('div', { class: 'bar' }, bar)), val));
        }
        p.appendChild(h('h3', {}, 'Humeurs'));
        const ms = h('div', { class: 'row' });
        for (const m of s.moodlets) { const d = registry.moodlet(m.id); if (d) ms.appendChild(h('span', { class: 'tag' }, `${registry.emotions[d.emotion]?.icon || ''} ${d.name}`)); }
        if (!s.moodlets.length) ms.appendChild(h('span', { class: 'muted' }, 'Aucune humeur particulière.'));
        p.appendChild(ms);
        break;
      }
      case 'rel': {
        p.appendChild(h('h3', { style: { marginTop: 0 } }, 'Relations'));
        const pairs = W.relPairs(s.id).filter(x => x.r.known).sort((a, b) => (b.r.friend + b.r.romance) - (a.r.friend + a.r.romance));
        if (!pairs.length) p.appendChild(h('p', { class: 'muted' }, `${s.first} ne connaît encore personne.`));
        for (const { other, r } of pairs) {
          const o = W.sim(other);
          if (!o) continue;
          const back = W.rel(other, s.id, false);
          p.appendChild(h('div', { class: 'list-item', tabindex: '0', onclick: () => this.game.ui.panels.relationDetail(s, o) },
            h('div', { class: 'portrait', style: { background: portraitBg(o), width: '38px', height: '38px' } }, o.first[0]),
            h('div', { style: { flex: 1 } },
              h('div', { style: { fontWeight: 800 } }, simName(o), ' ', h('span', { class: 'tag' }, REL_STATUS[r.status] || r.status)),
              h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'muted' }, '🤝'), relBar(r.friend), h('span', { class: 'muted' }, '💗'), relBar(r.romance)),
              back && Math.abs(back.friend - r.friend) > 30 ? h('div', { class: 'muted' }, `Avis de ${o.first} sur ${s.first} : ${Math.round(back.friend)}`) : null)));
        }
        break;
      }
      case 'skills': {
        p.appendChild(h('h3', { style: { marginTop: 0 } }, 'Compétences'));
        const skills = [...registry.skills.values()];
        for (const sk of skills) {
          const v = s.skills[sk.id] || 0;
          p.appendChild(h('div', { class: 'need-row' }, h('span', {}, sk.icon), h('div', {}, h('div', { class: 'muted', style: { fontSize: '12px' } }, `${sk.name} — niveau ${Math.floor(v)}`), h('div', { class: 'bar' }, h('i', { style: { width: `${v / SKILL_MAX * 100}%`, background: '#4f9bff' } }))), h('span', { class: 'muted' }, `${Math.floor(v)}/${SKILL_MAX}`)));
        }
        break;
      }
      case 'career': {
        const c = registry.career(s.career.id);
        p.appendChild(h('h3', { style: { marginTop: 0 } }, `${c.icon} ${c.name}`));
        if (c.id !== 'unemployed') {
          const lvl = c.levels[Math.min(s.career.level, c.levels.length - 1)];
          p.append(
            h('p', {}, `Poste : `, h('b', {}, lvl.title), ` (niveau ${s.career.level + 1}/${c.levels.length}) — ✦${lvl.pay}/h`),
            h('p', { class: 'muted' }, `Horaires : ${c.start}h–${c.end}h, ${c.days.map(d => DAYS[d].slice(0, 3)).join(', ')}${c.remote ? ' (télétravail)' : ''}`),
            h('div', { class: 'muted' }, 'Performance'), h('div', { class: 'bar' }, h('i', { style: { width: `${clamp((s.career.perf + 100) / 2.2, 0, 100)}%`, background: s.career.perf > 0 ? '#4cd964' : '#ff5a5f' } })),
            h('p', { class: 'muted' }, `Compétences utiles : ${(c.skills || []).map(k => registry.skills.get(k)?.name || k).join(', ')}`));
        } else p.appendChild(h('p', { class: 'muted' }, `${s.first} n’a pas d’emploi.`));
        if (isAdult(s) || s.stage === 'teen') p.appendChild(h('div', { class: 'row' }, btn('Chercher un emploi', () => this.game.ui.panels.careerPicker(s), 'small'), c.id !== 'unemployed' ? btn('Démissionner', () => { s.career = { id: 'unemployed', level: 0, perf: 0, days: 0 }; W.log('career', `${simName(s)} a démissionné.`, [s.id], { icon: '🚪' }); this.refresh(); }, 'small danger') : null));
        break;
      }
      case 'info': {
        const asp = registry.aspirations.get(s.aspiration);
        p.append(h('h3', { style: { marginTop: 0 } }, 'Personnalité'),
          h('div', { class: 'row' }, ...s.traits.map(t => { const tr = registry.trait(t); return h('span', { class: 'tag yellow', title: tr?.desc || 'Trait d’un mod désactivé' }, tr ? `${tr.icon} ${tr.name}` : `❔ ${t}`); })),
          h('p', {}, `🎯 Aspiration : `, h('b', {}, asp ? `${asp.icon} ${asp.name}` : s.aspiration), asp ? h('span', { class: 'muted' }, ` — ${asp.goal}`) : null, s.flags.aspirationDone ? ' 🏆' : ''),
          h('p', { class: 'muted' }, `Âge : ${stageName(s.stage)} · Aime : ${s.likes.activity}, ${s.likes.music}, le ${s.likes.color?.toLowerCase()} · N’aime pas : ${s.dislikes?.activity || '—'}`),
          h('p', { class: 'muted' }, `Peurs : ${(s.fears || []).join(', ') || '—'}`),
          s.backstory ? h('p', {}, `📖 ${s.backstory}`) : null,
          h('h3', {}, 'Secrets'),
          ...(s.secrets?.length ? s.secrets.map(sc => h('div', { class: 'muted' }, `🤫 ${sc.text} — connu de ${sc.knownBy.length} personne(s)`)) : [h('div', { class: 'muted' }, 'Aucun secret.')]),
          h('h3', {}, 'Souvenirs marquants'),
          ...(s.memories?.length ? s.memories.slice(-8).reverse().map(m => h('div', { class: 'muted' }, `• ${m.text}`)) : [h('div', { class: 'muted' }, 'Pas encore de souvenirs marquants.')]),
          h('div', { class: 'row', style: { marginTop: '10px' } }, btn('✏️ Modifier dans le créateur', () => this.game.ui.cas.open({ mode: 'edit', sim: s }), 'small'), btn(s.autonomy ? '🤖 Autonomie : oui' : '🤖 Autonomie : non', () => { s.autonomy = !s.autonomy; this.refresh(); }, 'small')));
        break;
      }
      case 'powers': {
        const d = S.powers.data(s);
        p.appendChild(h('h3', { style: { marginTop: 0 } }, '⚡ Pouvoirs'));
        if (!d || !S.powers.hasAnyPower(s)) {
          p.append(h('p', { class: 'muted' }, `${s.first} n’a aucun pouvoir… pour l’instant.`), btn('Donner des pouvoirs (créateur)', () => this.game.ui.cas.open({ mode: 'edit', sim: s, tab: 'powers' }), 'small'));
          break;
        }
        const al = ALIGNMENTS[d.alignment] || ALIGNMENTS.civilian;
        this.energyBar = h('i', { style: { width: `${d.energy}%`, background: '#ffcf2e' } });
        p.append(h('div', { class: 'row' }, h('span', { class: 'tag yellow' }, `${al.icon} ${al.name}`), h('span', { class: 'tag' }, d.identity === 'secret' ? '🎭 Identité secrète' : '📣 Identité publique'), h('span', { class: 'tag' }, `Réputation ${Math.round(d.reputation)}`)),
          h('div', { class: 'muted', style: { marginTop: '6px' } }, 'Énergie'), h('div', { class: 'bar' }, this.energyBar));
        for (const pw of S.powers.powersOf(s)) {
          const st = d.list[pw.id];
          const status = S.powers.status(s, pw);
          p.appendChild(h('div', { class: 'list-item' }, h('span', { style: { fontSize: '22px' } }, pw.icon),
            h('div', { style: { flex: 1 } }, h('div', { style: { fontWeight: 800 } }, pw.name, ' ', h('span', { class: 'muted' }, pw.family)),
              h('div', { class: 'muted' }, `Maîtrise ${st.mastery.toFixed(1)}/10 · coût ${pw.cost || 0} · recharge ${pw.cooldown || 0} min${pw.instability ? ` · instabilité ${Math.round(pw.instability * 100)}%` : ''}`),
              h('div', { class: 'bar' }, h('i', { style: { width: `${st.mastery * 10}%`, background: pw.color || '#9b6bff' } }))),
            PASSIVE_EFFECTS.includes(pw.effect) ? h('span', { class: 'tag' }, 'Passif') : btn(status ? '⏳' : 'Utiliser', () => this.usePower(s, pw), 'small', { disabled: !!status })));
        }
        p.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, btn('🧘 Méditer', () => S.enqueue(s, { kind: 'power', power: '__meditate', name: 'Méditer', icon: '🧘' }), 'small'), btn('🎯 S’entraîner', () => S.enqueue(s, { kind: 'power', power: '__train', name: 'Entraînement', icon: '🎯' }), 'small'),
          btn(d.identity === 'secret' ? 'Révéler son identité' : 'Adopter une identité secrète', () => { d.identity = d.identity === 'secret' ? 'public' : 'secret'; this.refresh(); }, 'small')));
        break;
      }
    }
    return p;
  }

  updateNeedBars() {
    const s = this.game.selectedSim();
    if (!s) return;
    if (this.needEls) for (const n in this.needEls) { const v = s.needs[n]; this.needEls[n].bar.style.width = `${v}%`; this.needEls[n].bar.style.background = needColor(v); this.needEls[n].val.textContent = `${Math.round(v)}%`; }
    if (this.energyBar && s.modData.powers) this.energyBar.style.width = `${s.modData.powers.energy}%`;
  }

  usePower(s, pw) {
    const S = this.S;
    const eff = pw.effect;
    if (['projectile', 'beam', 'teleport', 'superjump', 'portal', 'illusion', 'gravity'].includes(eff)) {
      toast(`Choisissez la cible de « ${pw.name} » (cliquez au sol ou sur un habitant)`, pw.icon);
      this.destinationPick = { sim: s.id, action: { kind: 'power', power: pw.id, name: pw.name, icon: pw.icon }, mode: 'target' };
      return;
    }
    if (['telekinesis', 'strength', 'shapeshift'].includes(eff)) { toast(`Utilisez « ${pw.name} » en cliquant sur un objet ou un habitant.`, pw.icon); return; }
    S.enqueue(s, { kind: 'power', power: pw.id, name: pw.name, icon: pw.icon });
  }

  // ------------------------------------------------------------------ menus contextuels
  openPie(x, y, target) {
    this.closePie();
    const g = this.game, S = this.S;
    const me = g.controlledSim || g.selectedSim();
    let title = '', items = [];
    if (target.type === 'sim') {
      const t = target.sim;
      if (me && t.id === me.id) { title = `${me.first} (soi-même)`; items = this.selfItems(me); }
      else {
        title = simName(t);
        if (me) items = [...S.social.menu(me, t), ...S.powers.targetMenu(me, t)];
        items.push({ label: 'Voir le profil', icon: '🪪', cat: 'info', special: () => g.ui.panels.simProfile(t) });
        if (me && t.stage === 'baby') items = [{ label: 'Voir le profil', icon: '🪪', cat: 'info', special: () => g.ui.panels.simProfile(t) }];
      }
    } else if (target.type === 'object') {
      const def = registry.object(target.obj.def);
      title = def?.name || `Objet d’un mod désactivé (${target.obj.def})`;
      if (me && def) items = [...S.objectMenu(me, target.obj)];
      if (def?.venue) items.push({ label: 'Visiter ce lieu', icon: '🚶', cat: 'move', action: { kind: 'goto', ...this.frontOf(target.obj), name: `Aller à : ${def.name}` } });
      if (!items.length) items.push({ label: 'Aucune interaction', icon: '🤷', disabled: 'Cet objet est décoratif' });
    } else if (target.type === 'ground') {
      const t = target.tile;
      const lot = this.W.lotAt(t.x, t.y);
      title = lot ? lot.name : 'Ici';
      if (me) {
        items.push({ label: 'Aller ici', icon: '🚶', cat: 'move', action: { kind: 'goto', x: t.x, y: t.y, l: t.l || 0, name: 'Aller ici', icon: '🚶' } });
        items.push(...S.powers.pointMenu(me, t.x, t.y, t.l || 0));
      }
      if (lot && lot.forSale) items.push({ label: `Acheter ce terrain (✦${lot.price})`, icon: '🏷️', cat: 'world', special: () => g.ui.panels.buyLot(lot) });
    }
    if (!me && target.type !== 'sim') items = items.filter(i => i.special);
    const pie = h('div', { class: 'panel pie', dataset: { scope: '1' } }, h('div', { class: 'pie-title' }, title));
    let lastCat = null;
    const catNames = { friendly: 'Amical', funny: 'Drôle', romantic: 'Romantique', mean: 'Méchant', deep: 'Profond', power: 'Pouvoirs', info: 'Infos', move: 'Déplacement', self: 'Soi-même', world: 'Monde' };
    for (const it of items) {
      if (it.cat && it.cat !== lastCat && catNames[it.cat]) { pie.appendChild(h('div', { class: 'cat' }, catNames[it.cat])); lastCat = it.cat; }
      pie.appendChild(btn(`${it.icon || '•'} ${it.label}`, () => {
        this.closePie();
        if (it.special) { it.special(); return; }
        if (!me) return;
        const a = { ...it.action };
        if (a.pickDestination) { this.pickDestination(me.id, a); return; }
        if (a.social && registry.social(a.social)?.needsThird) { this.pickThird(me, a); return; }
        S.enqueue(me, a, true);
      }, it.disabled ? 'disabled' : '', { title: it.disabled || '' }));
    }
    pie.appendChild(btn('Fermer', () => this.closePie(), 'ghost small', { dataset: { back: '1' } }));
    document.getElementById('ui').appendChild(pie);
    const w = 320, hgt = Math.min(pie.offsetHeight, innerHeight * 0.7);
    pie.style.left = `${clamp(x + 12, 8, innerWidth - w - 8)}px`;
    pie.style.top = `${clamp(y - hgt / 2, 8, innerHeight - hgt - 8)}px`;
    this.pie = pie;
    if (usingPadRef.value) focusFirst(pie);
    sfx('open');
  }
  closePie() { if (this.pie) { this.pie.remove(); this.pie = null; return true; } return false; }

  frontOf(o) {
    const def = registry.object(o.def);
    const p = this.W.objLocalToWorld(o, 0, def.size[1] / 2 + 0.5);
    return { x: Math.floor(p.x), y: Math.floor(p.y), l: o.level || 0 };
  }

  selfItems(me) {
    const g = this.game, S = this.S, W = this.W;
    const items = [
      { label: 'Organiser une fête', icon: '🎉', cat: 'self', special: () => S.social.throwParty(me) },
      { label: 'Appeler un ami…', icon: '📞', cat: 'self', special: () => g.ui.panels.callFriend(me) },
      { label: 'Aller en ville…', icon: '🏙️', cat: 'self', special: () => g.ui.panels.goToVenue(me) },
      { label: 'Réfléchir à sa vie', icon: '💭', cat: 'self', action: { kind: 'idle', dur: 20, anim: 'idle', name: 'Réfléchir', icon: '💭' } },
      { label: 'Danser', icon: '💃', cat: 'self', action: { kind: 'react', anim: 'dance', dur: 25, name: 'Danser', icon: '💃' } },
      { label: 'Chercher un emploi', icon: '💼', cat: 'self', special: () => g.ui.panels.careerPicker(me) },
      { label: 'Voir le profil', icon: '🪪', cat: 'info', special: () => g.ui.panels.simProfile(me) },
      ...S.powers.selfMenu(me),
    ];
    if (g.controlledSim?.id !== me.id) items.push({ label: 'Contrôle direct', icon: '🕹️', cat: 'self', special: () => g.toggleDirectControl(true) });
    void W;
    return items;
  }
  openSelfMenu() {
    const s = this.game.controlledSim || this.game.selectedSim();
    if (s) this.openPie(innerWidth / 2, innerHeight / 2, { type: 'sim', sim: s });
  }

  pickThird(me, a) {
    const W = this.W;
    const others = W.relPairs(me.id).filter(p => p.r.known && p.other !== a.target).map(p => W.sim(p.other)).filter(Boolean);
    const pie = h('div', { class: 'panel pie' }, h('div', { class: 'pie-title' }, 'Avec qui ?'));
    for (const o of others) pie.appendChild(btn(simName(o), () => { this.closePie(); this.S.enqueue(me, { ...a, third: o.id }, true); }));
    pie.appendChild(btn('Annuler', () => this.closePie(), 'ghost small', { dataset: { back: '1' } }));
    document.getElementById('ui').appendChild(pie);
    pie.style.left = `${innerWidth / 2 - 160}px`; pie.style.top = '15%';
    this.pie = pie;
    if (usingPadRef.value) focusFirst(pie);
  }

  // Sélection d'une destination (télékinésie, superforce, cible d'un pouvoir).
  pickDestination(simId, action) {
    this.destinationPick = { sim: simId, action, mode: 'dest' };
    toast('Choisissez où poser l’objet (cliquez au sol)', '📍');
  }
  resolveDestination(x, y) {
    const dp = this.destinationPick;
    this.destinationPick = null;
    const s = this.W.sim(dp.sim);
    if (!s) return;
    if (dp.mode === 'target') {
      const hit = this.game.pick(x, y);
      const a = { ...dp.action };
      if (hit?.type === 'sim' && hit.sim.id !== s.id) a.target = hit.sim.id;
      else if (hit?.type === 'object') a.objId = hit.obj.id;
      else if (hit?.tile) a.point = { x: hit.tile.x, y: hit.tile.y, l: hit.tile.l || 0 };
      else return;
      this.S.enqueue(s, a, true);
      return;
    }
    const t = this.game.groundTile(x, y);
    if (!t) return;
    const o = this.W.obj(dp.action.objId);
    const def = o && registry.object(o.def);
    const fw = def ? (o.rot % 2 ? def.size[1] : def.size[0]) : 1, fd = def ? (o.rot % 2 ? def.size[0] : def.size[1]) : 1;
    this.S.enqueue(s, { ...dp.action, pickDestination: false, dest: { x: t.x - Math.floor(fw / 2), y: t.y - Math.floor(fd / 2), l: t.l } }, true);
  }

  // ------------------------------------------------------------------ survol (curseur manette)
  hoverAt(x, y) {
    const hit = this.game.pickNearCursor();
    let txt = '';
    if (hit?.type === 'sim') txt = `👤 ${simName(hit.sim)}`;
    else if (hit?.type === 'object') txt = `${registry.object(hit.obj.def)?.name || 'Objet'}`;
    if (!txt) { this.hoverLabel.classList.add('hidden'); return; }
    this.hoverLabel.textContent = txt;
    this.hoverLabel.style.left = `${x}px`; this.hoverLabel.style.top = `${y}px`;
    this.hoverLabel.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ dialogues « conseil »
  showDialog(d) {
    document.querySelector('.dialog-pop')?.remove();
    const s = this.W.sim(d.sim);
    const box = h('div', { class: 'panel dialog-pop', dataset: { scope: '1' } },
      h('h4', {}, `💬 ${d.title}`), h('p', {}, d.text),
      h('div', { class: 'col', style: { gap: '6px' } }, ...d.options.map((o, i) => btn(o.label, () => { this.S.events.answerDialog(d.id, i); box.remove(); }, i === 0 ? 'primary' : ''))),
      btn('Plus tard', () => box.remove(), 'ghost small', { dataset: { back: '1' }, style: { marginTop: '8px' } }));
    document.getElementById('ui').appendChild(box);
    if (s) this.game.rig.focus(s.pos.x, s.pos.y);
    sfx('notify');
    if (usingPadRef.value) setTimeout(() => setFocus(box.querySelector('.btn.primary')), 50);
  }

  onJournal(e) {
    const now = performance.now();
    if (now - (this.lastJ || 0) < 2500) return;
    this.lastJ = now;
    if (['relation', 'love', 'event', 'power', 'drama', 'family', 'party'].includes(e.type)) toast(e.text.replace(/^\S+\s/, ''), e.icon, () => e.sims[0] && this.game.selectSim(e.sims[0], true));
  }

  // ------------------------------------------------------------------ modes d'affichage
  cycleWallMode() {
    const wv = this.game.worldView;
    const i = WALL_MODES.findIndex(m => m[0] === wv.wallMode);
    const next = WALL_MODES[(i + 1) % WALL_MODES.length];
    wv.setWallMode(next[0]);
    toast(next[2], next[1]);
    this.refresh();
  }
  cycleCamera() {
    const rig = this.game.rig;
    const i = CAM_CYCLE.indexOf(rig.mode);
    const next = CAM_CYCLE[(i + 1) % CAM_CYCLE.length];
    rig.setMode(next);
    const s = this.game.selectedSim();
    if ((next === 'follow' || next === 'close') && !s) rig.setMode('free');
    toast(CAM_MODES[rig.mode].name, CAM_MODES[rig.mode].icon);
    this.refresh();
  }

  setHudNav(on) {
    if (!this.root) return;
    if (on) { this.root.dataset.hudnav = '1'; focusFirst(this.root); toast('Navigation dans l’interface (B pour revenir)', '🎮'); }
    else { delete this.root.dataset.hudnav; document.querySelectorAll('.gp-focus').forEach(e => e.classList.remove('gp-focus')); }
  }

  updatePadHelp() {
    const g = this.game;
    const pad = g.input.pad.connected;
    this.padHelp.classList.toggle('hidden', !pad);
    if (!pad) return;
    let txt;
    if (g.controlledSim) txt = 'Ⓛ déplacer · A interagir · RT courir · X actions · LB/RB altitude (vol) · B quitter';
    else if (g.mode === 'build' || g.mode === 'buy') txt = 'Ⓛ curseur · A poser/tracer · LB/RB pivoter · X supprimer · Y outils · B retour';
    else txt = 'Ⓛ curseur · Ⓡ caméra · LT/RT zoom · A interagir · X sim suivant · Y contrôle direct · LB/RB vitesse · View interface · Menu pause';
    this.padHelp.textContent = `🎮 ${txt}`;
  }

  // ------------------------------------------------------------------ contrôle direct (tactile)
  buildDirectControls() {
    if (this.root.querySelector('.direct-pad')) return;
    const knob = h('div', { class: 'knob' });
    const pad = h('div', { class: 'direct-pad' }, knob);
    this.touchStick = { x: 0, y: 0 };
    const move = e => {
      const r = pad.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const m = Math.min(1, Math.hypot(dx, dy)) / (Math.hypot(dx, dy) || 1);
      this.touchStick = { x: dx * m, y: dy * m };
      knob.style.transform = `translate(${dx * m * 45}px, ${dy * m * 45}px)`;
    };
    pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); move(e); });
    pad.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') move(e); });
    const end = () => { this.touchStick = { x: 0, y: 0 }; knob.style.transform = ''; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    const run = btn('🏃 Courir', () => { this.touchRun = !this.touchRun; run.classList.toggle('active', this.touchRun); }, '');
    const actions = h('div', { class: 'direct-actions' },
      btn('✋ Interagir', () => this.game.directInteract(), 'primary'),
      run,
      btn('⚡ Actions', () => this.openSelfMenu()),
      btn('⬆️ Monter', () => { this.game.flyAlt = clamp((this.game.flyAlt ?? 3) + 1.5, 0.5, 12); }, 'small'),
      btn('⬇️ Descendre', () => { this.game.flyAlt = clamp((this.game.flyAlt ?? 3) - 1.5, 0.5, 12); }, 'small'),
      btn('✕ Quitter', () => this.game.toggleDirectControl(false), 'ghost'));
    this.hint = h('div', { class: 'panel interact-hint hidden' });
    this.root.append(pad, actions, this.hint);
  }
  updateInteractHint() {
    const s = this.game.controlledSim;
    if (!s || !this.hint) return;
    const n = this.game.nearestInteractable(s);
    if (!n) { this.hint.classList.add('hidden'); return; }
    this.hint.classList.remove('hidden');
    this.hint.textContent = `✋ ${n.type === 'sim' ? simName(n.sim) : registry.object(n.obj.def)?.name} — E / A pour interagir`;
  }
}

// ------------------------------------------------------------------ helpers visuels
export function portraitBg(s) {
  const ap = s.appearance || {};
  return `radial-gradient(circle at 50% 38%, ${ap.skin || '#f6c9a3'} 0 30%, transparent 31%), radial-gradient(circle at 50% 22%, ${ap.hair || '#4a2e1c'} 0 34%, transparent 35%), linear-gradient(180deg, transparent 55%, ${ap.primary || '#2f6fd6'} 56%)`;
}
export function needColor(v) { return v > 60 ? '#4cd964' : v > 30 ? '#ffcf2e' : '#ff5a5f'; }
export function moodColor(v) { return `hsl(${Math.round(v * 1.2)}, 80%, 55%)`; }
function relBar(v) {
  const w = Math.abs(v) / 2;
  return h('div', { class: 'bar', style: { width: '90px', position: 'relative' } }, h('i', { style: { width: `${w}%`, marginLeft: v < 0 ? `${50 - w}%` : '50%', background: v >= 0 ? '#4cd964' : '#ff5a5f' } }));
}
function actionIcon(a) { return { goto: '🚶', wander: '🚶', idle: '💭', react: '❗', work: '💼', eat: '🍽️', power: '⚡', social: '💬', party: '🎉' }[a.kind] || '•'; }
export function stageName(id) { return { baby: 'Bébé', child: 'Enfant', teen: 'Adolescent', young: 'Jeune adulte', adult: 'Adulte', elder: 'Senior' }[id] || id; }
function weatherIcon(t) { return { sun: '☀️', cloudy: '☁️', rain: '🌧️', snow: '❄️', clear: '🌌' }[t] || ''; }
export { escapeHtml };

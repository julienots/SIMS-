// Fenêtres de jeu : menu pause, monde et terrains, journal, mode créatif, paramètres, profils, carrières.
import { h, btn, openModal, toast, confirmBox, promptBox, loading } from './dom.js';
import { registry } from '../mods/registry.js';
import { formatClock, formatMoney, DAYS, clamp, uid } from '../core/util.js';
import { REL_STATUS } from '../sim/data/social.js';
import { simName, isAdult, SPEEDS } from '../sim/simulation.js';
import { portraitBg, stageName } from './hud.js';
import { saveSettings, saveWorld, listSaves, loadWorldJSON, getGallery, setGallery } from '../save/storage.js';
import { World } from '../sim/world.js';
import { simFromTemplate } from '../sim/factory.js';
import { audioSettings, setMusicVolume } from '../engine/audio.js';
import { ALIGNMENTS } from '../sim/powers.js';

export class Panels {
  constructor(game, app) { this.game = game; this.app = app; }
  get W() { return this.game.world; }
  get S() { return this.game.sim; }

  // ------------------------------------------------------------------ pause
  pauseMenu() {
    const g = this.game;
    openModal({
      title: 'Pause', icon: '⏸', cls: 'narrow',
      body: (r, close) => h('div', { class: 'col' },
        btn('▶ Reprendre', close, 'primary'),
        btn('💾 Sauvegarder', async () => { await g.save(); }),
        btn('📝 Sauvegarder sous…', async () => { const n = await promptBox('Nom de la sauvegarde', g.world.d.name); if (n) { const json = g.world.serialize(); const w = World.deserialize(json); w.d.id = `world_${Date.now().toString(36)}`; w.d.name = n; await saveWorld(w); toast(`Copie « ${n} » enregistrée`, '💾'); } }),
        btn('📂 Charger une partie', () => { close(); this.app.loadMenu(); }),
        btn('🌍 Règles du monde', () => this.worldRules()),
        btn('⚙️ Paramètres', () => this.settings()),
        btn('🎮 Commandes', () => this.controlsHelp()),
        btn('🚪 Quitter vers le menu', async () => { if (await confirmBox('Quitter vers le menu principal ? Pensez à sauvegarder.', { yes: 'Sauvegarder et quitter' })) { await g.save(); close(); this.app.toMenu(); } })),
    });
  }

  controlsHelp() {
    const row = (a, b) => h('div', { class: 'list-item' }, h('div', { style: { minWidth: '200px', fontWeight: 800 } }, a), h('div', { class: 'muted' }, b));
    openModal({
      title: 'Commandes', icon: '🎮',
      body: [
        h('h3', {}, '🎮 Manette (Xbox ou compatible)'),
        row('Stick gauche', 'Déplacer le curseur / le sim en contrôle direct'), row('Stick droit', 'Tourner et incliner la caméra'), row('LT / RT', 'Zoom arrière / avant (RT = courir en contrôle direct)'),
        row('A', 'Interagir, valider'), row('B', 'Retour, annuler'), row('X', 'Sim suivant du foyer (actions en contrôle direct)'), row('Y', 'Contrôle direct du sim'),
        row('LB / RB', 'Vitesse du temps (pivoter en construction, onglets dans les menus)'), row('Croix ↑↓', 'Changer d’étage'), row('Croix ← →', 'Mode des murs / mode caméra'),
        row('View', 'Naviguer dans l’interface'), row('Menu', 'Pause'), row('Clic stick gauche / droit', 'Journal / suivre le sim'),
        h('h3', {}, '⌨️ Clavier et souris'),
        row('Clic gauche', 'Interagir / sélectionner'), row('Clic droit + glisser', 'Tourner la caméra'), row('Molette', 'Zoom'), row('ZQSD / WASD, flèches', 'Déplacer la caméra (ou le sim en contrôle direct)'),
        row('Q / E', 'Pivoter la caméra'), row('Espace / P', 'Pause'), row('1 2 3 / 0', 'Vitesses / pause'), row('Tab', 'Sim suivant'), row('C', 'Contrôle direct (E : interagir, Maj : courir, R/F : altitude)'),
        row('F1 / F2 / F3 / F4', 'Vie / Achat / Construction / Monde'), row('J', 'Journal'), row('V', 'Mode des murs'), row('PgUp / PgDn', 'Étage'), row('Ctrl+Z / Ctrl+Y', 'Annuler / rétablir'), row('Ctrl+S', 'Sauvegarder'),
        h('h3', {}, '📱 Tactile'),
        row('Toucher', 'Interagir'), row('Glisser un doigt', 'Déplacer la caméra'), row('Pincer / deux doigts', 'Zoom et rotation'), row('Appui long', 'Menu d’interaction'),
      ],
    });
  }

  // ------------------------------------------------------------------ paramètres
  settings() {
    const s = this.app.settings;
    openModal({
      title: 'Paramètres', icon: '⚙️', cls: 'narrow',
      body: (render) => [
        h('label', { class: 'field' }, 'Qualité graphique (redémarrage requis)', select(['auto', 'low', 'medium', 'high'], s.quality || 'auto', v => { s.quality = v; saveSettings(s); }, { auto: 'Automatique', low: 'Basse (mobile ancien)', medium: 'Moyenne', high: 'Haute' })),
        h('label', { class: 'field' }, 'Style visuel', select(['stylise', 'cartoon', 'realiste'], s.style || 'stylise', v => { s.style = v; saveSettings(s); this.game.renderer.toneMappingExposure = v === 'realiste' ? 0.95 : v === 'cartoon' ? 1.25 : 1.1; }, { stylise: 'Stylisé détaillé', cartoon: 'Cartoon lumineux', realiste: 'Rendu plus réaliste' })),
        h('label', { class: 'field' }, `Effets sonores : ${Math.round(audioSettings.sfx * 100)}%`, h('input', { type: 'range', min: 0, max: 1, step: 0.1, value: audioSettings.sfx, oninput: e => { audioSettings.sfx = +e.target.value; s.sfx = audioSettings.sfx; saveSettings(s); } })),
        h('label', { class: 'field' }, `Musique : ${Math.round(audioSettings.music * 100)}%`, h('input', { type: 'range', min: 0, max: 1, step: 0.1, value: audioSettings.music, oninput: e => { setMusicVolume(+e.target.value); s.music = +e.target.value; saveSettings(s); } })),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: s.autosave !== false, onchange: e => { s.autosave = e.target.checked; this.game.settings.autosave = e.target.checked; saveSettings(s); } }), ' Sauvegarde automatique (5 min)'),
        h('p', { class: 'muted' }, `Performances : ${Math.round(this.game.fps)} images/s · qualité ${this.game.quality.name}`),
      ],
    });
  }

  // ------------------------------------------------------------------ règles du monde (sauvegardées dans l'univers)
  worldRules() {
    const st = this.W.settings;
    const sp = this.W.d.mods.data['superessence.superpowers'];
    openModal({
      title: 'Règles du monde', icon: '🌍',
      body: (render) => [
        h('p', { class: 'muted' }, 'Ces règles sont enregistrées dans cet univers uniquement.'),
        h('div', { class: 'grid' },
          toggle('Romances', st.romance, v => { st.romance = v; }), toggle('Familles et bébés', st.family, v => { st.family = v; }),
          toggle('Vieillissement', st.aging, v => { st.aging = v; }), toggle('Créatures', st.creatures, v => { st.creatures = v; if (!v) this.W.d.critters = []; }),
          toggle('Contrôle direct', st.directControl, v => { st.directControl = v; })),
        h('label', { class: 'field' }, 'Autonomie des habitants', select(['off', 'low', 'full'], st.autonomy, v => { st.autonomy = v; }, { off: 'Aucune', low: 'Faible (besoins seulement)', full: 'Complète' })),
        h('label', { class: 'field' }, 'Fréquence des événements', select(['0', '1', '2'], String(st.eventFrequency), v => { st.eventFrequency = +v; }, { 0: 'Rares', 1: 'Normale', 2: 'Fréquente' })),
        h('label', { class: 'field' }, 'Exigence des besoins', select(['detendu', 'equilibre', 'exigeant'], st.realism, v => { st.realism = v; }, { detendu: 'Détendu', equilibre: 'Équilibré', exigeant: 'Exigeant' })),
        h('label', { class: 'field' }, `Vitesse du temps : ×${st.timeScale}`, h('input', { type: 'range', min: 0.25, max: 3, step: 0.25, value: st.timeScale, onchange: e => { st.timeScale = +e.target.value; render(); } })),
        registry.hasPowers() ? h('label', { class: 'field' }, '⚡ Répartition des super-pouvoirs',
          select(registry.rule('distribution').options.map(o => o.id), sp?.distribution || 'few', v => {
            this.W.d.mods.data['superessence.superpowers'] = { ...(sp || {}), distribution: v, distributed: true };
            this.S.powers.distribute(v);
            toast('Nouvelle répartition appliquée aux habitants sans pouvoir', '⚡');
          }, Object.fromEntries(registry.rule('distribution').options.map(o => [o.id, o.name])))) : null,
      ],
    });
  }

  // ------------------------------------------------------------------ journal
  journal() {
    let filter = 'important';
    openModal({
      title: 'Journal du monde', icon: '📜', cls: 'wide',
      body: (render) => {
        const types = { important: 'Important', all: 'Tout', relation: 'Relations', love: 'Amour', event: 'Événements', drama: 'Drames', career: 'Carrières', family: 'Famille', power: 'Pouvoirs', skill: 'Compétences', mod: 'Mods' };
        const entries = this.W.d.journal.filter(e => filter === 'all' ? true : filter === 'important' ? e.important : e.type === filter || (filter === 'relation' && e.type === 'meet')).slice(-250).reverse();
        return [
          h('div', { class: 'tabs' }, ...Object.entries(types).map(([k, v]) => h('button', { class: `tab ${filter === k ? 'active' : ''}`, onclick: () => { filter = k; render(); } }, v))),
          h('div', { class: 'muted' }, `${this.W.d.journal.length} entrées · ${this.W.d.stats.events} événements spontanés · ${this.W.d.stats.weddings} mariages · ${this.W.d.stats.babies} naissances`),
          ...entries.map(e => h('div', { class: `journal-entry ${e.important ? 'important' : ''}` }, h('span', {}, e.icon), h('span', { class: 'muted' }, `J${Math.floor(e.t / 1440) + 1} ${formatClock(e.t)}`), h('span', {}, e.text))),
          entries.length ? null : h('p', { class: 'muted' }, 'Rien pour l’instant. Laissez vivre vos habitants !'),
        ];
      },
    });
  }

  // ------------------------------------------------------------------ profils et relations
  simProfile(s) {
    const W = this.W;
    const d = this.S.powers.data(s);
    openModal({
      title: simName(s), icon: '🪪',
      body: [
        h('div', { class: 'row' }, h('div', { class: 'portrait', style: { background: portraitBg(s), width: '70px', height: '70px' } }, s.first[0]),
          h('div', {}, h('div', {}, `${stageName(s.stage)} · ${registry.career(s.career.id).name}`), h('div', { class: 'muted' }, `Foyer : ${W.household(s.householdId)?.name || 'aucun'}`),
            h('div', { class: 'row' }, ...s.traits.map(t => h('span', { class: 'tag yellow' }, registry.trait(t) ? `${registry.trait(t).icon} ${registry.trait(t).name}` : t))))),
        d && this.S.powers.hasAnyPower(s) ? h('p', {}, `${ALIGNMENTS[d.alignment]?.icon} ${ALIGNMENTS[d.alignment]?.name} — ${this.S.powers.powersOf(s).map(p => p.icon + ' ' + p.name).join(', ')}`) : null,
        h('h3', {}, 'Souvenirs'), ...(s.memories || []).slice(-10).reverse().map(m => h('div', { class: 'muted' }, `• ${m.text}`)),
        h('h3', {}, 'Relations'),
        ...W.relPairs(s.id).filter(p => p.r.known).slice(0, 30).map(({ other, r }) => { const o = W.sim(other); return o ? h('div', { class: 'list-item' }, simName(o), h('span', { class: 'tag' }, REL_STATUS[r.status]), h('span', { class: 'muted' }, `🤝 ${Math.round(r.friend)} · 💗 ${Math.round(r.romance)}`)) : null; }),
      ],
    });
  }

  relationDetail(a, b) {
    const r = this.W.rel(a.id, b.id), r2 = this.W.rel(b.id, a.id);
    openModal({
      title: `${a.first} & ${b.first}`, icon: '👥', cls: 'narrow',
      body: [
        h('p', {}, `Statut : `, h('b', {}, REL_STATUS[r.status])),
        h('p', {}, `${a.first} → ${b.first} : amitié ${Math.round(r.friend)}, romance ${Math.round(r.romance)}`),
        h('p', {}, `${b.first} → ${a.first} : amitié ${Math.round(r2.friend)}, romance ${Math.round(r2.romance)}`),
        h('p', { class: 'muted' }, `Compatibilité : ${this.S.social.compatibility(a, b) >= 0 ? '+' : ''}${this.S.social.compatibility(a, b)}`),
        h('h3', {}, 'Histoire commune'),
        ...(r.mem.length ? r.mem.slice().reverse().map(m => h('div', { class: 'muted' }, `• J${Math.floor(m.t / 1440) + 1} — ${m.text}`)) : [h('p', { class: 'muted' }, 'Aucun moment marquant.')]),
      ],
    });
  }

  careerPicker(s) {
    openModal({
      title: `Emploi pour ${s.first}`, icon: '💼',
      body: (r, close) => h('div', { class: 'grid' }, ...[...registry.careers.values()].filter(c => c.id !== 'unemployed').map(c => h('button', { class: `card ${s.career.id === c.id ? 'selected' : ''}`, onclick: () => { this.S.life.setCareer(s, c.id); close(); this.game.ui.hud.refresh(); } },
        h('div', { class: 'big' }, c.icon), h('div', { class: 'title' }, c.name), h('div', { class: 'muted' }, `${c.start}h–${c.end}h · ✦${c.levels[0].pay}/h`), c.source !== 'base' ? h('div', { class: 'tag yellow' }, '🧩 Mod') : null))),
    });
  }

  callFriend(s) {
    const W = this.W;
    const friends = W.relPairs(s.id).filter(p => p.r.known).map(p => W.sim(p.other)).filter(o => o && o.stage !== 'baby');
    openModal({
      title: 'Appeler qui ?', icon: '📞', cls: 'narrow',
      body: (r, close) => h('div', { class: 'col' }, ...(friends.length ? friends.map(f => btn(`${simName(f)} — ${REL_STATUS[W.rel(s.id, f.id).status]}`, () => {
        close();
        this.S.enqueue(s, { kind: 'social', target: f.id, social: 'chat', remote: true, name: `Téléphoner à ${f.first}`, icon: '📞' });
      })) : [h('p', { class: 'muted' }, 'Aucun contact.')])),
    });
  }

  goToVenue(s) {
    const W = this.W;
    const venues = W.d.lots.filter(l => l.type === 'community');
    openModal({
      title: 'Aller en ville', icon: '🏙️', cls: 'narrow',
      body: (r, close) => h('div', { class: 'col' }, ...venues.map(l => btn(l.name, () => {
        close();
        const f = this.S.nav.nearestFree(0, l.x + l.w / 2, l.y + l.h / 2, 8);
        if (f) this.S.enqueue(s, { kind: 'goto', x: f.x, y: f.y, l: 0, name: `Aller : ${l.name}`, icon: '🚶' });
      }))),
    });
  }

  buyLot(lot) {
    const g = this.game, W = this.W;
    const hh = W.household(g.household);
    openModal({
      title: lot.name, icon: '🏷️', cls: 'narrow',
      body: [h('p', {}, `Terrain de ${lot.w}×${lot.h} cases — prix ✦${lot.price}.`), h('p', { class: 'muted' }, 'Le foyer actuel déménagera sur ce terrain (son ancien terrain sera remis en vente avec la maison).')],
      foot: (r, close) => [btn('Annuler', close, 'ghost'), btn(`Acheter et emménager`, () => {
        if (!hh) return;
        if (hh.funds < lot.price && !W.creativeFreeBuild) { toast('Fonds insuffisants', '💸'); return; }
        if (!W.creativeFreeBuild) hh.funds -= lot.price;
        this.moveHousehold(hh, lot);
        close();
      }, 'primary')],
    });
  }

  moveHousehold(hh, lot) {
    const W = this.W, S = this.S;
    const old = W.lot(hh.lotId);
    if (old) { old.householdId = null; old.forSale = true; old.name = 'Maison à vendre'; }
    lot.householdId = hh.id; lot.forSale = false; lot.name = hh.name;
    hh.lotId = lot.id;
    for (const id of hh.members) {
      const s = W.sim(id);
      if (!s) continue;
      S.dropAll(s);
      const f = S.nav.nearestFree(0, lot.x + lot.w / 2, lot.y + lot.h / 2, 10);
      if (f) { s.pos.x = f.x + 0.5; s.pos.y = f.y + 0.5; s.pos.l = 0; s.pos.hz = 0; }
    }
    W.log('home', `🚚 ${hh.name} emménage : ${lot.name}.`, hh.members, { icon: '🚚', important: true });
    this.game.worldView.buildTerrain();
    this.game.rig.focus(lot.x + lot.w / 2, lot.y + lot.h / 2, 30);
  }

  // ------------------------------------------------------------------ monde, terrains et foyers
  worldPanel() {
    const g = this.game, W = this.W;
    let tab = 'households';
    openModal({
      title: `Monde : ${W.d.name}`, icon: '🗺️', cls: 'wide',
      body: (render, close) => {
        const tabs = h('div', { class: 'tabs' }, ...[['households', '👨‍👩‍👧 Foyers'], ['lots', '🏘️ Terrains'], ['sims', '👥 Habitants'], ['groups', '👥 Groupes'], ['stats', '📊 Statistiques']].map(([k, v]) => h('button', { class: `tab ${tab === k ? 'active' : ''}`, onclick: () => { tab = k; render(); } }, v)));
        const out = [tabs];
        if (tab === 'households') {
          for (const hh of W.d.households) {
            const lot = W.lot(hh.lotId);
            out.push(h('div', { class: 'list-item' },
              h('div', { style: { flex: 1 } }, h('b', {}, hh.name), hh.id === g.household ? h('span', { class: 'tag yellow' }, ' joué ') : null,
                h('div', { class: 'muted' }, `${hh.members.map(id => W.sim(id)?.first).filter(Boolean).join(', ')} · ${formatMoney(hh.funds)} · ${lot?.name || 'sans terrain'}`)),
              btn('Jouer ce foyer', () => { g.household = hh.id; W.d.activeHousehold = hh.id; const m = W.sim(hh.members[0]); if (m) g.selectSim(m.id, true); g.ui.hud.refresh(); close(); }, 'small'),
              lot ? btn('Voir', () => { g.rig.focus(lot.x + lot.w / 2, lot.y + lot.h / 2, 32); close(); }, 'small ghost') : null));
          }
          out.push(h('div', { class: 'row', style: { marginTop: '10px' } },
            btn('➕ Nouveau foyer (créateur)', () => { close(); g.ui.cas.open({ mode: 'household' }); }, 'primary'),
            btn('🖼️ Placer un habitant de la galerie', () => this.placeFromGallery())));
        } else if (tab === 'lots') {
          for (const lot of W.d.lots) {
            out.push(h('div', { class: 'list-item' },
              h('div', { style: { flex: 1 } }, h('b', {}, lot.name), h('div', { class: 'muted' }, `${lot.type === 'community' ? 'Lieu public' : 'Résidentiel'} · ${lot.w}×${lot.h}${lot.forSale ? ` · à vendre ✦${lot.price}` : ''}`)),
              btn('Voir', () => { g.rig.focus(lot.x + lot.w / 2, lot.y + lot.h / 2, 30); close(); }, 'small ghost'),
              lot.forSale ? btn('Acheter', () => { close(); this.buyLot(lot); }, 'small') : null,
              lot.type === 'residential' && !lot.householdId ? btn('→ Lieu public', () => { lot.type = 'community'; lot.venue = 'park'; lot.forSale = false; lot.name = 'Nouveau lieu public'; g.worldView.buildTerrain(); render(); }, 'small') : null,
              lot.type === 'community' ? btn('Renommer', async () => { const n = await promptBox('Nom du lieu', lot.name); if (n) { lot.name = n; render(); } }, 'small ghost') : null));
          }
        } else if (tab === 'sims') {
          for (const s of W.sims) out.push(h('div', { class: 'list-item' }, h('div', { class: 'portrait', style: { background: portraitBg(s), width: '36px', height: '36px' } }, s.first[0]),
            h('div', { style: { flex: 1 } }, h('b', {}, simName(s)), h('div', { class: 'muted' }, `${stageName(s.stage)} · ${registry.career(s.career.id).name} · ${registry.emotions[s.emotion]?.icon} ${registry.emotions[s.emotion]?.name}`)),
            btn('Voir', () => { g.rig.focus(s.pos.x, s.pos.y, 14); close(); }, 'small ghost'), btn('Profil', () => this.simProfile(s), 'small ghost')));
        } else if (tab === 'groups') {
          const groups = W.d.groups || [];
          if (!groups.length) out.push(h('p', { class: 'muted' }, 'Aucun groupe ou club formé pour le moment.'));
          for (const gr of groups) out.push(h('div', { class: 'list-item' }, h('b', {}, gr.name), h('span', { class: 'muted' }, gr.members.map(id => W.sim(id)?.first).filter(Boolean).join(', '))));
        } else {
          const day = Math.floor(W.time / 1440) + 1;
          out.push(h('div', { class: 'grid' }, ...[
            ['📅', 'Jour', day], ['👥', 'Habitants', W.sims.length], ['🏠', 'Foyers', W.d.households.length], ['🪑', 'Objets', W.objects.length],
            ['💒', 'Mariages', W.d.stats.weddings], ['🍼', 'Naissances', W.d.stats.babies], ['✨', 'Événements', W.d.stats.events], ['📜', 'Journal', W.d.journal.length],
          ].map(([i, l, v]) => h('div', { class: 'card' }, h('div', { class: 'big' }, i), h('div', { class: 'title' }, String(v)), h('div', { class: 'muted' }, l)))));
          out.push(h('p', { class: 'muted' }, `Mods actifs : ${W.d.mods.enabled.map(id => registry.activeMods.includes(id) ? id : `${id} (inactif)`).join(', ') || 'aucun'}`));
        }
        return out;
      },
    });
  }

  async placeFromGallery() {
    const gal = await getGallery();
    const g = this.game, W = this.W;
    openModal({
      title: 'Galerie de personnages', icon: '🖼️',
      body: (r, close) => gal.sims.length ? h('div', { class: 'grid' }, ...gal.sims.map(t => h('button', { class: 'card', onclick: () => {
        const hh = W.household(g.household);
        const s = simFromTemplate(t, W.rng);
        s.householdId = hh?.id || null;
        const lot = hh ? W.lot(hh.lotId) : null;
        const p = lot ? { x: lot.x + lot.w / 2, y: lot.y + lot.h / 2 } : { x: g.rig.target.x, y: g.rig.target.z };
        g.sim.addSim(s, p.x, p.y, 0);
        if (hh) hh.members.push(s.id);
        W.log('home', `👋 ${simName(s)} arrive dans le quartier.`, [s.id], { icon: '👋', important: true });
        close(); g.ui.hud.refresh();
      } }, h('div', { class: 'portrait', style: { background: portraitBg(t) } }, t.first[0]), h('div', { class: 'title' }, `${t.first} ${t.last}`), h('div', { class: 'muted' }, t.traits.map(x => registry.trait(x)?.icon || '❔').join(' '))))) : h('p', { class: 'muted' }, 'La galerie est vide. Enregistrez des personnages depuis le créateur.'),
    });
  }

  // ------------------------------------------------------------------ mode créatif total
  creative() {
    const g = this.game, W = this.W, S = this.S;
    let tab = 'world';
    openModal({
      title: 'Mode créatif total', icon: '✨', cls: 'wide',
      body: (render, close) => {
        const s = g.selectedSim();
        const out = [h('div', { class: 'tabs' }, ...[['world', '🌍 Monde'], ['sim', '👤 Habitant'], ['rel', '💞 Relations'], ['events', '🎲 Événements'], ['dup', '📑 Dupliquer'], ['scenario', '📋 Scénarios']].map(([k, v]) => h('button', { class: `tab ${tab === k ? 'active' : ''}`, onclick: () => { tab = k; render(); } }, v)))];
        if (tab === 'world') {
          out.push(
            h('div', { class: 'row' }, toggle('Construction gratuite', !!W.creativeFreeBuild, v => { W.creativeFreeBuild = v; W.d.creativeFreeBuild = v; })),
            h('h3', {}, 'Heure'), h('div', { class: 'row' }, ...[6, 9, 12, 15, 18, 21, 0].map(hr => btn(`${hr}h`, () => { g.snapshot('Changer l’heure'); const d = Math.floor(W.time / 1440); W.d.time = d * 1440 + hr * 60 + (hr === 0 ? 1440 : 0); toast(`Il est ${hr}h`, '🕒'); }, 'small'))),
            h('h3', {}, 'Météo'), h('div', { class: 'row' }, ...[['sun', '☀️ Soleil'], ['cloudy', '☁️ Nuageux'], ['rain', '🌧️ Pluie'], ['snow', '❄️ Neige']].map(([k, v]) => btn(v, () => { W.d.weather = { type: k, until: W.time + 600 }; }, 'small'))),
            h('h3', {}, 'Temps'), h('div', { class: 'row' }, ...SPEEDS.map((sp, i) => btn(i === 0 ? '⏸ Pause' : `×${sp}`, () => { S.setSpeed(i); g.ui.hud.refresh(); }, 'small')), btn('⏩ Avancer de 1 h', () => { for (let i = 0; i < 300; i++) S.step(0.2); }, 'small'), btn('⏩ Avancer de 6 h', () => { const l = loading('Simulation accélérée…'); setTimeout(() => { for (let i = 0; i < 1800; i++) S.step(0.2); l.done(); }, 30); }, 'small')),
            h('h3', {}, 'Habitants'), h('div', { class: 'row' }, btn('👤 Ajouter un habitant', () => { close(); g.ui.cas.open({ mode: 'new' }); }, 'small'), btn('🎲 Ajouter un inconnu', () => this.addRandomSim(), 'small'), btn('🦊 Ajouter une créature', () => { W.d.critters ||= []; W.d.critters.push({ id: uid('cr'), kind: W.rng.chance(0.5) ? 'fox' : 'skeleton', x: g.rig.target.x, y: g.rig.target.z, tx: Math.floor(g.rig.target.x), ty: Math.floor(g.rig.target.z), rot: 0, state: 'idle', t: 0 }); }, 'small'),
              registry.hasPowers() ? btn('🦹 Faire venir un super-vilain', () => S.powers.spawnVillain(), 'small') : null),
            h('h3', {}, 'Annulation'), h('div', { class: 'row' }, btn(`↩️ Annuler (${g.undoStack.length})`, () => { close(); g.undo(); }, 'small'), btn(`↪️ Rétablir (${g.redoStack.length})`, () => { close(); g.redo(); }, 'small')),
          );
        } else if (tab === 'sim') {
          if (!s) out.push(h('p', { class: 'muted' }, 'Sélectionnez un habitant.'));
          else {
            out.push(h('p', {}, `Habitant sélectionné : `, h('b', {}, simName(s))));
            for (const n of registry.needs) out.push(h('label', { class: 'field' }, `${n.icon} ${n.name}`, h('input', { type: 'range', min: 0, max: 100, value: Math.round(s.needs[n.id]), onchange: e => { g.snapshot('Modifier un besoin'); s.needs[n.id] = +e.target.value; } })));
            out.push(h('div', { class: 'row' }, btn('Tous les besoins au maximum', () => { g.snapshot('Besoins au max'); for (const n of registry.needs) s.needs[n.id] = 100; render(); }, 'small'), btn('Tout à zéro', () => { g.snapshot('Besoins à zéro'); for (const n of registry.needs) s.needs[n.id] = 5; render(); }, 'small')));
            out.push(h('h3', {}, 'Compétences'));
            for (const sk of registry.skills.values()) out.push(h('label', { class: 'field' }, `${sk.icon} ${sk.name} : ${Math.floor(s.skills[sk.id] || 0)}`, h('input', { type: 'range', min: 0, max: 10, step: 1, value: Math.floor(s.skills[sk.id] || 0), onchange: e => { g.snapshot('Modifier une compétence'); s.skills[sk.id] = +e.target.value; render(); } })));
            out.push(h('h3', {}, 'Argent du foyer'), h('div', { class: 'row' }, ...[1000, 10000, 100000].map(v => btn(`+✦${v}`, () => { W.earn(s, v); g.ui.hud.refresh(); }, 'small'))));
            out.push(h('div', { class: 'row', style: { marginTop: '10px' } }, btn('✏️ Apparence et personnalité', () => { close(); g.ui.cas.open({ mode: 'edit', sim: s }); }), btn('🗑️ Retirer du monde', async () => { if (await confirmBox(`Retirer ${s.first} du monde ?`, { danger: true, yes: 'Retirer' })) { g.snapshot('Retirer un habitant'); S.removeSim(s.id); close(); g.ui.hud.refresh(); } }, 'danger')));
          }
        } else if (tab === 'rel') {
          if (!s) out.push(h('p', { class: 'muted' }, 'Sélectionnez un habitant.'));
          else {
            out.push(h('p', { class: 'muted' }, `Modifier les relations de ${s.first}. Les deux sens sont ajustés.`));
            for (const o of W.sims.filter(x => x.id !== s.id)) {
              const r = W.rel(s.id, o.id);
              out.push(h('div', { class: 'list-item' }, h('b', { style: { minWidth: '140px' } }, simName(o)),
                h('label', { class: 'field', style: { flex: 1 } }, `🤝 ${Math.round(r.friend)}`, h('input', { type: 'range', min: -100, max: 100, value: Math.round(r.friend), onchange: e => { g.snapshot('Modifier une relation'); for (const rr of [W.rel(s.id, o.id), W.rel(o.id, s.id)]) { rr.friend = +e.target.value; rr.known = true; } S.social.updateStatus(s, o); S.social.updateStatus(o, s); render(); } })),
                h('label', { class: 'field', style: { flex: 1 } }, `💗 ${Math.round(r.romance)}`, h('input', { type: 'range', min: -100, max: 100, value: Math.round(r.romance), onchange: e => { g.snapshot('Modifier une romance'); for (const rr of [W.rel(s.id, o.id), W.rel(o.id, s.id)]) { rr.romance = +e.target.value; rr.known = true; } render(); } })),
                select(['', 'friend', 'best_friend', 'rival', 'enemy', 'partner', 'engaged', 'married', 'family'], '', v => { if (!v) return; g.snapshot('Changer un statut'); W.setStatus(s.id, o.id, v); if (v === 'family') { W.rel(s.id, o.id).flags.family = true; W.rel(o.id, s.id).flags.family = true; } render(); }, { '': 'Statut…', friend: 'Ami', best_friend: 'Meilleur ami', rival: 'Rival', enemy: 'Ennemi', partner: 'En couple', engaged: 'Fiancés', married: 'Mariés', family: 'Famille' })));
            }
          }
        } else if (tab === 'events') {
          const ev = S.events;
          const list = [['💘 Coup de foudre', () => ev.suddenLove()], ['😤 Dispute absurde', () => ev.absurdArgument()], ['✨ Nouvelle passion', () => ev.newPassion(W.rng.pick(ev.activeSims()))], ['🎁 Surprise', () => ev.surprise()],
            ['⚔️ Rivalité', () => ev.rivalry()], ['🎉 Fête spontanée', () => ev.spontaneousParty()], ['🗨️ Demande de conseil', () => ev.askPlayerAdvice()], ['💇 Changement de style', () => ev.styleChange()],
            ['🤝 Amitié improbable', () => ev.improbableFriendship()], ['🤭 Secret révélé', () => ev.secretReveal()], ['🎶 Activité collective', () => ev.groupActivity()], ['👥 Nouveau club', () => ev.club()]];
          for (const e of registry.events.values()) list.push([`${e.icon || '🧩'} ${e.name} (mod)`, () => { const a = s || W.rng.pick(ev.activeSims()); ev.applyEffects(e, a, W.rng.pick(ev.activeSims().filter(x => x.id !== a.id))); return true; }]);
          out.push(h('p', { class: 'muted' }, 'Déclenchez un événement : il s’appuie sur l’état réel des relations et peut échouer si les conditions ne sont pas réunies.'));
          out.push(h('div', { class: 'grid' }, ...list.map(([l, fn]) => btn(l, () => { g.snapshot(`Événement ${l}`); const ok = fn(); toast(ok ? 'Événement déclenché' : 'Conditions non réunies pour cet événement', ok ? '🎲' : '🤷'); }))));
        } else if (tab === 'dup') {
          out.push(h('p', { class: 'muted' }, 'Duplication de maisons, de quartiers, d’habitants et de groupes.'));
          out.push(h('div', { class: 'row' },
            s ? btn(`👥 Dupliquer ${s.first}`, () => { g.snapshot('Dupliquer un habitant'); const c = JSON.parse(JSON.stringify({ ...s, _rt: undefined })); c.id = uid('sim'); c.first = `${s.first} bis`; c.queue = []; c.memories = []; g.sim.addSim(c, s.pos.x + 1, s.pos.y, s.pos.l); W.household(s.householdId)?.members.push(c.id); toast('Habitant dupliqué', '👥'); }) : null,
            s ? btn(`👨‍👩‍👧 Dupliquer le foyer de ${s.first}`, () => this.duplicateHousehold(s)) : null,
            btn('🏠 Copier une maison (mode construction)', () => { close(); g.setMode('build'); g.ui.build.setTool('copy'); toast('Outil copie : tracez un rectangle autour de la maison', '📑'); }),
            btn('🏘️ Dupliquer un quartier entier', () => { close(); g.setMode('build'); g.ui.build.setTool('copy'); toast('Tracez un grand rectangle autour du quartier, puis cliquez où le coller', '🏘️'); })));
        } else if (tab === 'scenario') {
          W.d.scenario ||= { title: '', goals: [] };
          const sc = W.d.scenario;
          out.push(h('label', { class: 'field' }, 'Titre du scénario', h('input', { type: 'text', value: sc.title, onchange: e => { sc.title = e.target.value; } })));
          out.push(h('p', { class: 'muted' }, 'Ajoutez des objectifs que le jeu vérifie automatiquement.'));
          const goalTypes = { couples: 'Nombre de couples', friends: 'Paires d’amis', babies: 'Naissances', funds: 'Fonds du foyer joué', day: 'Atteindre le jour', heroes: 'Héros (mod pouvoirs)' };
          for (const gl of sc.goals) out.push(h('div', { class: 'list-item' }, `${goalTypes[gl.type]} ≥ ${gl.value}`, h('span', { class: this.goalDone(gl) ? 'ok' : 'muted' }, this.goalDone(gl) ? '✔ atteint' : `(actuel : ${this.goalValue(gl)})`), btn('✕', () => { sc.goals = sc.goals.filter(x => x !== gl); render(); }, 'small ghost')));
          let gt = 'couples', gv = 3;
          out.push(h('div', { class: 'row' }, select(Object.keys(goalTypes), gt, v => { gt = v; }, goalTypes), h('input', { type: 'text', value: '3', style: { width: '90px' }, onchange: e => { gv = +e.target.value || 1; } }), btn('Ajouter', () => { sc.goals.push({ type: gt, value: gv }); render(); }, 'small')));
        }
        return out;
      },
    });
  }

  goalValue(gl) {
    const W = this.W;
    const pairs = Object.entries(W.d.rel);
    switch (gl.type) {
      case 'couples': return pairs.filter(([k, r]) => ['partner', 'engaged', 'married'].includes(r.status) && k.split('|')[0] < k.split('|')[1]).length;
      case 'friends': return pairs.filter(([k, r]) => ['friend', 'best_friend'].includes(r.status) && k.split('|')[0] < k.split('|')[1]).length;
      case 'babies': return W.d.stats.babies;
      case 'funds': return W.household(this.game.household)?.funds || 0;
      case 'day': return Math.floor(W.time / 1440) + 1;
      case 'heroes': return W.sims.filter(s => this.S.powers.alignment(s) === 'hero').length;
    }
    return 0;
  }
  goalDone(gl) { return this.goalValue(gl) >= gl.value; }

  addRandomSim() {
    const g = this.game, W = this.W;
    import('../sim/factory.js').then(({ createSim }) => {
      const s = createSim(W.rng, {});
      s.attraction = W.rng.pick([['f'], ['m'], ['f', 'm']]);
      g.sim.addSim(s, g.rig.target.x, g.rig.target.z, 0);
      W.log('home', `👋 ${simName(s)} s’installe en ville (sans foyer).`, [s.id], { icon: '👋' });
      toast(`${simName(s)} est arrivé(e)`, '👋');
    });
  }

  duplicateHousehold(s) {
    const g = this.game, W = this.W;
    const hh = W.household(s.householdId);
    const free = W.d.lots.find(l => l.type === 'residential' && !l.householdId);
    if (!hh || !free) { toast('Aucun terrain libre pour le foyer dupliqué', '⚠️'); return; }
    g.snapshot('Dupliquer un foyer');
    const nh = { id: uid('hh'), name: `${hh.name} (bis)`, funds: hh.funds, lotId: free.id, members: [] };
    W.d.households.push(nh);
    free.householdId = nh.id; free.forSale = false; free.name = nh.name;
    for (const id of hh.members) {
      const o = W.sim(id); if (!o) continue;
      const c = JSON.parse(JSON.stringify({ ...o, _rt: undefined }));
      c.id = uid('sim'); c.householdId = nh.id; c.queue = []; c.memories = [];
      g.sim.addSim(c, free.x + free.w / 2, free.y + free.h / 2, 0);
      nh.members.push(c.id);
    }
    toast('Foyer dupliqué sur un terrain libre (construisez-lui une maison !)', '👨‍👩‍👧');
  }
}

// ------------------------------------------------------------------ petits composants
export function select(values, current, onChange, labels = {}) {
  return h('select', { onchange: e => onChange(e.target.value) }, ...values.map(v => h('option', { value: v, selected: String(v) === String(current) }, labels[v] ?? v)));
}
export function toggle(label, value, onChange) {
  const b = btn(`${value ? '✅' : '⬜'} ${label}`, () => { value = !value; b.textContent = `${value ? '✅' : '⬜'} ${label}`; onChange(value); }, 'small');
  return b;
}
export { clamp, DAYS, isAdult, listSaves, loadWorldJSON, setGallery };

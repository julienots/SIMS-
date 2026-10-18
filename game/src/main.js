// Point d'entrée : écran du studio, menu principal, création d'univers, chargement, crédits.
import { Game } from './game.js';
import { Input } from './engine/input.js';
import { h, btn, openModal, toast, loading, confirmBox, promptBox, focusFirst, usingPadRef, startIconObserver } from './ui/dom.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { BuildMode } from './ui/build.js';
import { CAS } from './ui/cas.js';
import { ModsUI } from './ui/modsui.js';
import { mods } from './mods/manager.js';
import { generateWorld, ENVIRONMENTS } from './sim/worldgen.js';
import { World, DEFAULT_SETTINGS } from './sim/world.js';
import { listSaves, loadWorldJSON, deleteSave, duplicateSave, restoreBackup, hasBackup, loadSettings, saveSettings, saveWorld } from './save/storage.js';
import { unlockAudio, startMusic, audioSettings, sfx } from './engine/audio.js';
import { GAME_VERSION } from './mods/validate.js';

class App {
  constructor() {
    startIconObserver(document.body);
    this.settings = loadSettings();
    audioSettings.sfx = this.settings.sfx ?? 0.5;
    audioSettings.music = this.settings.music ?? 0.25;
    this.canvas = document.getElementById('game');
    this.input = new Input(this.canvas);
    this.game = new Game(this.canvas, this.input, this.settings);
    const g = this.game;
    g.ui.hud = new Hud();
    g.ui.panels = new Panels(g, this);
    g.ui.build = new BuildMode(g);
    g.ui.cas = new CAS(g, this);
    g.ui.mods = new ModsUI(g, this);
    window.addEventListener('pointerdown', () => { unlockAudio(); startMusic(); }, { once: true });
    window.addEventListener('keydown', () => { unlockAudio(); startMusic(); }, { once: true });
    // Bouton « retour » Android : transmis par la passerelle native.
    window.__onBackPressed = () => { this.input.emit('key', { code: 'Escape' }); };
    window.__app = this;
    // Accès de débogage pour les tests automatisés.
    window.__mlu = { generateWorld, World, mods };
  }

  async boot() {
    const l = loading('Chargement des mods…');
    await mods.init();
    l.done();
    await this.splash();
    this.toMenu();
  }

  splash() {
    return new Promise(resolve => {
      const letters = (txt, cls, delay) => [...txt].map((ch, i) => h('span', { class: cls, style: { animationDelay: `${delay + i * 0.06}s` } }, ch));
      const el = h('div', { id: 'splash' }, h('div', { class: 'se-flash' }), h('div', { class: 'se-logo' }, ...letters('Super', 'w', 0.2), ...letters('Essence.', 'y', 0.5)), h('div', { class: 'se-sub' }, 'STUDIO'));
      document.body.appendChild(el);
      const end = () => { el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 700); };
      const t = setTimeout(end, 3200);
      el.addEventListener('pointerdown', () => { clearTimeout(t); end(); }, { once: true });
    });
  }

  hideMenu() { document.getElementById('menu')?.remove(); document.querySelector('.version')?.remove(); }

  toMenu() {
    this.game.stopWorld();
    this.game.mode = 'menu';
    this.hideMenu();
    const menu = h('div', { id: 'menu' },
      h('div', { class: 'panel menu-box' },
        h('h1', { class: 'game-title' }, 'MYLIFE', h('br'), h('span', { class: 'y' }, 'UNIVERSE')),
        h('div', { class: 'studio-tag' }, 'SUPERESSENCE STUDIO'),
        btn('✨  Nouvel univers', () => this.newWorldWizard(), 'primary'),
        btn('📂  Charger un univers', () => this.loadMenu()),
        btn('👤  Galerie de personnages', () => { this.hideMenu(); this.game.ui.cas.open({ mode: 'gallery' }); }),
        btn('🧩  Mods', () => this.game.ui.mods.manager()),
        btn('🛠️  Créateur de mods', () => this.game.ui.mods.creator()),
        btn('⚙️  Paramètres', () => this.game.ui.panels.settings()),
        btn('🎮  Commandes', () => this.game.ui.panels.controlsHelp()),
        btn('ℹ️  Crédits', () => this.credits())));
    document.getElementById('ui').appendChild(menu);
    document.getElementById('ui').appendChild(h('div', { class: 'version' }, `MYLIFE UNIVERSE v${GAME_VERSION} — SUPERESSENCE STUDIO`));
    focusFirst(menu);
  }

  // ------------------------------------------------------------------ assistant de création d'univers
  newWorldWizard() {
    const st = { ...DEFAULT_SETTINGS, mapSize: 128, population: 16 };
    let name = 'Mon univers';
    let modsOn = [...(this.settings.defaultMods || [])];
    let distribution = 'few';
    openModal({
      title: 'Créer un univers', icon: '🌍', cls: 'wide',
      body: (render) => {
        const opt = (label, key, values, labels) => h('label', { class: 'field' }, label, h('div', { class: 'row' }, ...values.map(v => btn(labels[v] ?? v, () => { st[key] = v; render(); }, `small ${st[key] === v ? 'active' : ''}`))));
        const sp = mods.get('superessence.superpowers');
        return [
          h('label', { class: 'field' }, 'Nom du monde', h('input', { type: 'text', value: name, maxlength: 40, onchange: e => { name = e.target.value || 'Mon univers'; } })),
          h('h3', {}, 'Environnement'),
          h('div', { class: 'grid' }, ...ENVIRONMENTS.map(e => h('button', { class: `card ${st.environment === e.id ? 'selected' : ''}`, onclick: () => { st.environment = e.id; render(); } }, h('div', { class: 'big' }, e.icon), h('div', { class: 'title' }, e.name), h('div', { class: 'muted' }, e.desc)))),
          opt('Taille de la carte', 'mapSize', [64, 96, 128, 160, 224, 288], { 64: 'Petite (1 quartier)', 96: 'Moyenne', 128: 'Grande', 160: 'Très grande', 224: 'Immense', 288: 'Ville entière' }),
          opt('Habitants au départ', 'population', [4, 8, 12, 18, 26], {}),
          opt('Style visuel', 'style', ['stylise', 'cartoon', 'realiste'], { stylise: 'Stylisé détaillé', cartoon: 'Cartoon lumineux', realiste: 'Plus réaliste' }),
          opt('Exigence des besoins (réalisme)', 'realism', ['detendu', 'equilibre', 'exigeant'], { detendu: 'Détendu', equilibre: 'Équilibré', exigeant: 'Exigeant' }),
          opt('Liberté créative', 'creativeLevel', ['normal', 'libre'], { normal: 'Normale (argent, terrain du foyer)', libre: 'Totale (construction partout)' }),
          opt('Vitesse du temps', 'timeScale', [0.5, 1, 1.5, 2], { 0.5: '×0,5', 1: '×1', 1.5: '×1,5', 2: '×2' }),
          opt('Autonomie des habitants', 'autonomy', ['off', 'low', 'full'], { off: 'Aucune', low: 'Faible', full: 'Complète' }),
          opt('Fréquence des événements', 'eventFrequency', [0, 1, 2], { 0: 'Rares', 1: 'Normale', 2: 'Fréquente' }),
          h('h3', {}, 'Règles sociales'),
          h('div', { class: 'row' }, ...[['romance', 'Romances entre adultes'], ['family', 'Familles et bébés'], ['aging', 'Vieillissement'], ['creatures', 'Créatures fantastiques et animaux'], ['directControl', 'Contrôle direct autorisé']].map(([k, n]) => btn(`${st[k] ? '✅' : '⬜'} ${n}`, () => { st[k] = !st[k]; render(); }, 'small'))),
          h('h3', {}, 'Mods'),
          h('div', { class: 'row' }, ...mods.list().filter(e => e.valid).map(e => btn(`${modsOn.includes(e.mod.id) ? '✅' : '⬜'} ${e.mod.icon || '🧩'} ${e.mod.name}`, () => {
            if (modsOn.includes(e.mod.id)) modsOn = modsOn.filter(x => x !== e.mod.id && !mods.dependents(e.mod.id, modsOn).includes(x));
            else modsOn = [...new Set([...modsOn, ...(e.mod.dependencies || []).map(d => d.id), e.mod.id])];
            render();
          }, 'small'))),
          sp && modsOn.includes(sp.mod.id) ? h('label', { class: 'field' }, '⚡ Répartition des super-pouvoirs', h('div', { class: 'row' }, ...sp.mod.content.rules[0].options.map(o => btn(o.name, () => { distribution = o.id; render(); }, `small ${distribution === o.id ? 'active' : ''}`)))) : null,
        ];
      },
      foot: (r, close) => [btn('Annuler', close, 'ghost'), btn('🌍 Créer l’univers', async () => {
        close();
        const l = loading('Création de l’univers…');
        await new Promise(res => setTimeout(res, 50));
        try {
          const w = generateWorld({ name, settings: st });
          w.d.mods.enabled = modsOn;
          if (modsOn.includes('superessence.superpowers')) w.d.mods.data['superessence.superpowers'] = { distribution, distributed: false };
          this.hideMenu();
          await this.game.startWorld(w);
          await saveWorld(w);
          toast(`Bienvenue dans « ${name} » !`, '🌍');
        } catch (e) { console.error(e); toast(`Erreur de création : ${e.message}`, '⛔'); }
        l.done();
      }, 'primary')],
    });
  }

  // ------------------------------------------------------------------ chargement
  async loadMenu() {
    const saves = await listSaves();
    openModal({
      title: 'Charger un univers', icon: '📂', cls: 'wide',
      body: (render, close) => saves.length ? h('div', { class: 'col' }, ...saves.map(s => h('div', { class: 'list-item' },
        h('div', { style: { fontSize: '30px' } }, ENVIRONMENTS.find(e => e.id === s.env)?.icon || '🌍'),
        h('div', { style: { flex: 1 } }, h('b', {}, s.name), h('div', { class: 'muted' }, `Jour ${s.day} · ${s.sims} habitants · ${new Date(s.updated).toLocaleString('fr-FR')} · ${(s.size / 1024).toFixed(0)} Ko${s.mods?.length ? ` · mods : ${s.mods.length}` : ''}`)),
        btn('Jouer', async () => {
          close();
          const l = loading('Chargement de l’univers…');
          try {
            const json = await loadWorldJSON(s.id);
            const w = World.deserialize(json);
            this.hideMenu();
            await this.game.startWorld(w);
            toast(`Univers « ${w.d.name} » chargé`, '📂');
          } catch (e) {
            console.error(e);
            toast(`Chargement impossible : ${e.message}`, '⛔');
            if (await hasBackup(s.id) && await confirmBox('La sauvegarde semble endommagée. Restaurer la copie de secours ?')) { await restoreBackup(s.id); toast('Copie de secours restaurée, réessayez', '🛟'); }
          }
          l.done();
        }, 'small primary'),
        btn('Dupliquer', async () => { const n = await promptBox('Nom de la copie', `${s.name} (copie)`); if (n) { await duplicateSave(s.id, n); close(); this.loadMenu(); } }, 'small ghost'),
        btn('Supprimer', async () => { if (await confirmBox(`Supprimer définitivement « ${s.name} » ?`, { danger: true, yes: 'Supprimer' })) { await deleteSave(s.id); close(); this.loadMenu(); } }, 'small danger')))) : h('p', { class: 'muted' }, 'Aucun univers sauvegardé. Créez-en un !'),
    });
  }

  credits() {
    openModal({
      title: 'Crédits', icon: 'ℹ️',
      body: [
        h('p', {}, h('b', {}, 'MYLIFE UNIVERSE'), ' — un jeu SUPERESSENCE STUDIO.'),
        h('h3', {}, 'Modèles 3D (licence CC0 sauf mention)'),
        h('ul', {}, ...[
          'Humains réalistes, animations de capture de mouvement et animaux : Microsoft Rocketbox Avatar Library — Copyright (c) Microsoft Corporation, licence MIT (github.com/microsoft/Microsoft-Rocketbox)',
          'Meubles réalistes : AI2-THOR, Allen Institute for AI — licence Apache 2.0 (github.com/allenai/ai2thor)',
          'Arbres, herbe 3D et fleurs : ez-tree par Daniel Greenheck — licence MIT ; écorces Poly Haven et TextureCan (CC0)',
          'Texture d’herbe « dark grass » (OpenGameArt) — CC-BY 3.0 ; ciel « Spruit Sunrise » par Greg Zaal (Poly Haven) — CC0',
          'Icônes : Lucide (lucide.dev) — licence ISC',
          'Personnages cartoon, animations, meubles, cuisine, ville, base spatiale : KayKit par Kay Lousberg (kaylousberg.com) — CC0',
          'Arbres et fontaine : Kenney (kenney.nl), Starter Kit City Builder — CC0',
          'Renard animé : modèle de PixelMannen (CC0), rig et animations de @tomkranis (CC BY 4.0), conversion glTF par @AsoboStudio et @scurest (CC BY 4.0) — Khronos glTF Sample Assets',
          'Objets sans asset libre disponible (toilettes, douche, télévision, ordinateur, instruments…) : modèles procéduraux créés pour le jeu',
        ].map(t => h('li', {}, t))),
        h('h3', {}, 'Technologies'),
        h('ul', {}, h('li', {}, 'Three.js (MIT)'), h('li', {}, 'Polices Fredoka et Nunito (SIL Open Font License)')),
        h('p', { class: 'muted' }, 'Personnages, objets et noms sont originaux. Aucun contenu des Sims ou de Tomodachi Life n’est utilisé.'),
      ],
    });
  }
}

const app = new App();
app.boot().catch(e => { console.error(e); document.body.appendChild(h('div', { class: 'loading' }, `Erreur de démarrage : ${e.message}`)); });
export { app, usingPadRef, sfx };

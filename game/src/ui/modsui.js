// Interfaces SUPERESSENCE STUDIO : gestionnaire de mods et créateur de mods sans code.
import { h, btn, openModal, toast, confirmBox, promptBox, loading } from './dom.js';
import { mods, BUILTIN_MODS } from '../mods/manager.js';
import { validateMod, GAME_VERSION } from '../mods/validate.js';
import { registry } from '../mods/registry.js';
import { EFFECT_TYPES } from '../sim/powers.js';
import { NEEDS, EMOTIONS, SKILLS } from '../sim/data/core-data.js';
import { CATEGORIES } from '../sim/data/objects.js';
import { storage, saveWorld, downloadFile, pickFile, saveSettings } from '../save/storage.js';
import { generateSandbox } from '../sim/worldgen.js';
import { uid } from '../core/util.js';

const MODEL_LIST = ['proc:tv', 'proc:stereo', 'proc:bookshelf', 'proc:computer', 'proc:easel', 'proc:guitar', 'proc:piano', 'proc:treadmill', 'proc:punchingbag', 'proc:chess', 'proc:arcade', 'proc:grill', 'proc:garden', 'proc:tree', 'proc:pine', 'proc:palm', 'proc:flowers', 'proc:crystal', 'proc:statue', 'proc:dummy', 'proc:toilet', 'proc:shower', 'proc:bathtub', 'proc:sink', 'proc:crib', 'proc:podium', 'proc:workbench'];
const ICONS = ['🧩', '⚡', '🍜', '🎭', '🧑‍🚀', '🦹', '🌈', '🎮', '🏰', '🐉', '🌸', '💎', '🔥', '❄️', '🎵', '🏆', '🍀', '🛸', '🧪', '🎪'];
const EFFECTS = ['moodlet', 'need', 'relationship', 'skill', 'money', 'journal', 'notify', 'bubble', 'trait_add', 'trait_remove', 'social', 'animation', 'grant_power', 'grant_random_power', 'use_power', 'alignment', 'duel', 'spawn_villain', 'form_team', 'spawn_object'];
const EFFECT_NAMES = { moodlet: 'Donner une humeur', need: 'Modifier un besoin', relationship: 'Modifier la relation', skill: 'Gagner une compétence', money: 'Argent', journal: 'Écrire dans le journal', notify: 'Notification', bubble: 'Bulle de pensée', trait_add: 'Ajouter un trait', trait_remove: 'Retirer un trait', social: 'Lancer une interaction sociale', animation: 'Jouer une animation', grant_power: 'Donner un pouvoir', grant_random_power: 'Donner un pouvoir au hasard', use_power: 'Utiliser un pouvoir', alignment: 'Changer d’alignement', duel: 'Provoquer un duel', spawn_villain: 'Faire venir un vilain', form_team: 'Former une équipe', spawn_object: 'Faire apparaître un objet' };

export class ModsUI {
  constructor(game, app) { this.game = game; this.app = app; }
  get W() { return this.game.world; }

  // ------------------------------------------------------------------ gestionnaire
  manager() {
    const inWorld = !!this.W;
    openModal({
      title: 'Gestionnaire de mods — SUPERESSENCE STUDIO', icon: '🧩', cls: 'wide',
      body: (render, close) => {
        const enabled = inWorld ? this.W.d.mods.enabled : (this.app.settings.defaultMods || []);
        const problems = mods.check(enabled);
        const out = [
          h('p', { class: 'muted' }, inWorld ? `Mods de l’univers « ${this.W.d.name} ». Une sauvegarde de secours est créée avant chaque changement.` : 'Mods activés par défaut pour les nouveaux univers. Les mods sont stockés localement (hors ligne).'),
          h('div', { class: 'row' }, btn('📥 Importer un mod (.json)', () => this.importMod(render), 'primary'), btn('🛠️ Créateur de mods', () => { close(); this.creator(); }), btn('📖 Guide du créateur', () => this.docs())),
        ];
        for (const p of problems) out.push(h('div', { class: p.level === 'error' ? 'err' : 'warn' }, `${p.level === 'error' ? '⛔' : '⚠️'} ${p.text}`));
        for (const e of mods.list()) {
          const m = e.mod;
          const on = enabled.includes(m.id);
          const counts = Object.entries(m.content || {}).filter(([, l]) => Array.isArray(l) && l.length).map(([k, l]) => `${l.length} ${({ powers: 'pouvoirs', objects: 'objets', traits: 'traits', events: 'événements', careers: 'métiers', moodlets: 'humeurs', socials: 'interactions sociales', affordances: 'interactions', skills: 'compétences', rules: 'règles' })[k] || k}`).join(' · ');
          out.push(h('div', { class: 'list-item', style: { alignItems: 'flex-start' } },
            h('div', { style: { fontSize: '30px' } }, m.icon || '🧩'),
            h('div', { style: { flex: 1 } },
              h('div', {}, h('b', {}, m.name), ' ', h('span', { class: 'tag' }, `v${m.version}`), ' ', e.builtin ? h('span', { class: 'tag yellow' }, m.official ? 'Officiel' : 'Exemple') : h('span', { class: 'tag' }, 'Communauté'), on ? h('span', { class: 'tag green' }, ' activé ') : null),
              h('div', { class: 'muted' }, `${m.author || 'Auteur inconnu'} — ${m.description || ''}`),
              h('div', { class: 'muted' }, counts),
              (m.dependencies || []).length ? h('div', { class: 'muted' }, `Dépend de : ${m.dependencies.map(d => `${d.name || d.id} ${d.version || ''}`).join(', ')}`) : null,
              ...e.errors.map(x => h('div', { class: 'err' }, `⛔ ${x}`)), ...e.warnings.slice(0, 3).map(x => h('div', { class: 'warn' }, `⚠️ ${x}`))),
            h('div', { class: 'col', style: { gap: '6px' } },
              btn(on ? 'Désactiver' : 'Activer', () => this.toggle(m.id, !on, render, close), on ? 'small danger' : 'small primary', { disabled: !e.valid && !on }),
              btn('Exporter', () => { const p = downloadFile(`${m.id}.json`, mods.export(m.id)); toast(`Exporté : ${p}`, '📤'); }, 'small ghost'),
              !e.builtin ? btn('Modifier', () => { close(); this.creator(JSON.parse(JSON.stringify(m))); }, 'small ghost') : btn('Copier dans le créateur', () => { close(); const c = JSON.parse(JSON.stringify(m)); c.id = `${m.id.split('.').pop()}.copie`; c.name = `${m.name} (copie)`; c.official = false; this.creator(c); }, 'small ghost'),
              !e.builtin ? btn('Désinstaller', async () => { if (await confirmBox(`Désinstaller « ${m.name} » ? Les données des mondes qui l’utilisent sont conservées.`, { danger: true, yes: 'Désinstaller' })) { await mods.uninstall(m.id); render(); } }, 'small danger') : null)));
        }
        out.push(h('p', { class: 'muted' }, `Version du jeu : ${GAME_VERSION}. Aucun partage en ligne n’est intégré : échangez les fichiers .json de mods directement.`));
        return out;
      },
    });
  }

  async toggle(id, on, render, close) {
    const e = mods.get(id);
    if (!this.W) {
      const s = this.app.settings;
      s.defaultMods ||= [];
      if (on) { s.defaultMods = [...new Set([...s.defaultMods, id, ...(e.mod.dependencies || []).map(d => d.id).filter(d => mods.get(d))])]; }
      else s.defaultMods = s.defaultMods.filter(x => x !== id && !mods.dependents(id, s.defaultMods).includes(x));
      saveSettings(s);
      render();
      return;
    }
    const W = this.W;
    let enabled = [...W.d.mods.enabled];
    if (on) {
      const deps = (e.mod.dependencies || []).map(d => d.id).filter(d => !enabled.includes(d));
      if (deps.length) {
        const missing = deps.filter(d => !mods.get(d));
        if (missing.length) { toast(`Dépendance manquante : ${missing.join(', ')}`, '⛔'); return; }
        if (!await confirmBox(`Ce mod nécessite : ${deps.map(d => mods.get(d).mod.name).join(', ')}. Les activer aussi ?`)) return;
        enabled.push(...deps);
      }
      enabled.push(id);
      // Règle de répartition des pouvoirs demandée à l'activation de SUPERPOWERS.
      if (id === 'superessence.superpowers') {
        const choice = await this.askDistribution();
        if (!choice) return;
        W.d.mods.data[id] = { ...(W.d.mods.data[id] || {}), distribution: choice, distributed: false };
      }
    } else {
      const dependents = mods.dependents(id, enabled);
      const affected = this.affectedContent(id);
      const msg = `Désactiver « ${e.mod.name} » ? ${affected}${dependents.length ? ` Les mods dépendants seront aussi désactivés : ${dependents.map(d => mods.get(d)?.mod.name).join(', ')}.` : ''} Les données sont conservées et reviendront si vous réactivez le mod.`;
      if (!await confirmBox(msg, { yes: 'Désactiver', danger: true })) return;
      enabled = enabled.filter(x => x !== id && !dependents.includes(x));
    }
    const l = loading('Sauvegarde de secours et application des mods…');
    try {
      await saveWorld(W, W.d.id);           // copie de secours avant le changement risqué
      W.d.mods.enabled = enabled;
      const json = W.serialize();
      const { World } = await import('../sim/world.js');
      const w2 = World.deserialize(json);
      await this.game.startWorld(w2);
      await saveWorld(w2, w2.d.id);
      toast(on ? `« ${e.mod.name} » activé` : `« ${e.mod.name} » désactivé`, '🧩');
    } catch (err) { toast(`Erreur : ${err.message}`, '⛔'); }
    l.done();
    close();
  }

  affectedContent(id) {
    const m = mods.get(id)?.mod;
    if (!m) return '';
    const W = this.W;
    const objIds = new Set((m.content?.objects || []).map(o => o.id));
    const nObj = W.objects.filter(o => objIds.has(o.def)).length;
    const traitIds = new Set((m.content?.traits || []).map(t => t.id));
    const nTraits = W.sims.filter(s => s.traits.some(t => traitIds.has(t))).length;
    const nPow = m.content?.powers ? W.sims.filter(s => s.modData?.powers && Object.keys(s.modData.powers.list).length).length : 0;
    const parts = [];
    if (nObj) parts.push(`${nObj} objet(s) deviendront des fantômes inactifs`);
    if (nTraits) parts.push(`${nTraits} habitant(s) perdront temporairement un trait`);
    if (nPow) parts.push(`${nPow} habitant(s) garderont leurs pouvoirs en sommeil`);
    return parts.length ? parts.join(', ') + '.' : 'Aucun contenu de ce mod n’est utilisé dans ce monde.';
  }

  askDistribution() {
    return new Promise(resolve => {
      const rule = mods.get('superessence.superpowers').mod.content.rules[0];
      let done = false;
      openModal({
        title: 'Règles des super-pouvoirs', icon: '⚡', cls: 'narrow',
        body: (r, close) => h('div', { class: 'col' }, h('p', {}, 'Comment les pouvoirs se répartissent-ils dans ce monde ?'), ...rule.options.map(o => btn(o.name, () => { done = true; close(); resolve(o.id); }, o.id === rule.default ? 'primary' : ''))),
        onClose: () => { if (!done) resolve(null); },
      });
    });
  }

  async importMod(render) {
    const f = await pickFile('.json,.mlmod');
    if (!f) return;
    const r = await mods.install(f.text);
    if (!r.ok) {
      openModal({ title: 'Import impossible', icon: '⛔', cls: 'narrow', body: [h('p', {}, `Le fichier « ${f.name} » n’a pas pu être installé :`), ...r.errors.map(e => h('div', { class: 'err' }, `• ${e}`))] });
      return;
    }
    toast(`Mod « ${r.mod.name} » ${r.replaced ? 'mis à jour' : 'installé'}`, '📥');
    for (const w of r.warnings.slice(0, 3)) toast(w, '⚠️');
    render?.();
  }

  docs() {
    openModal({
      title: 'Guide du créateur de mods', icon: '📖', cls: 'wide',
      body: [
        h('p', {}, 'Un mod MYLIFE UNIVERSE est un fichier JSON : il ajoute du contenu sans programmation. Le jeu refuse tout code exécutable (sécurité).'),
        h('h3', {}, 'Ce que les mods peuvent ajouter'),
        h('ul', {}, ...['Objets (modèles 3D du jeu, taille, prix, interactions)', 'Interactions d’objets (besoins satisfaits, durée, compétence, humeur)', 'Traits de personnalité (déclin des besoins, préférences, émotions)', 'Événements (déclencheurs horaires, quotidiens, sociaux ou liés aux pouvoirs, avec conditions et effets)', 'Pouvoirs construits à partir des 24 effets du moteur (projectile, vol, téléportation, mutation, arrêt du temps…)', 'Métiers, humeurs, compétences, interactions sociales, règles', 'Remplacement d’un élément du jeu de base (même identifiant) pour modifier ses statistiques'].map(t => h('li', {}, t))),
        h('h3', {}, 'Limites'),
        h('ul', {}, ...['Pas de scripts : les comportements complexes passent par les effets déclaratifs.', 'Les modèles 3D d’un mod doivent désigner les modèles intégrés au jeu (liste dans le créateur). L’import de fichiers GLB personnels n’est pas pris en charge dans cette version.', 'Pas de plateforme de partage en ligne : échangez les fichiers .json.'].map(t => h('li', {}, t))),
        h('p', { class: 'muted' }, 'La documentation complète (format JSON, exemples) se trouve dans docs/MODDING.md du projet.'),
      ],
    });
  }

  // ------------------------------------------------------------------ créateur de mods
  async creator(existing) {
    const drafts = (await storage.get('modDrafts')) || {};
    let mod = existing || null;
    if (!mod) {
      const pick = await this.creatorStart(drafts);
      if (!pick) return;
      mod = pick;
    }
    mod.content ||= {};
    let tab = 'meta';
    const saveDraft = async () => { drafts[mod.id] = mod; await storage.set('modDrafts', drafts); };
    const m = openModal({
      title: 'Créateur de mods', icon: '🛠️', cls: 'wide',
      body: (render) => {
        const v = validateMod(mod, { affordances: [...registry.affordances.keys()] });
        const tabs = [['meta', '📝 Infos'], ['objects', '🪑 Objets'], ['affordances', '✋ Interactions'], ['traits', '🧠 Traits'], ['events', '🎲 Événements'], ['powers', '⚡ Pouvoirs'], ['careers', '💼 Métiers'], ['moodlets', '😊 Humeurs'], ['overrides', '🔧 Modifier le jeu']];
        const out = [h('div', { class: 'tabs' }, ...tabs.map(([k, n]) => h('button', { class: `tab ${tab === k ? 'active' : ''}`, onclick: () => { tab = k; render(); } }, `${n}${Array.isArray(mod.content[k]) && mod.content[k].length ? ` (${mod.content[k].length})` : ''}`)))];
        out.push(h('div', { class: v.errors.length ? 'err' : 'ok' }, v.errors.length ? `⛔ ${v.errors.length} erreur(s) : ${v.errors.slice(0, 3).join(' · ')}` : '✅ Mod valide'), ...v.warnings.slice(0, 2).map(w => h('div', { class: 'warn' }, `⚠️ ${w}`)));
        out.push(...this.creatorTab(tab, mod, render));
        saveDraft();
        return out;
      },
      foot: (render, close) => [
        btn('📤 Exporter', () => { const p = downloadFile(`${mod.id}.json`, JSON.stringify(mod, null, 2)); toast(`Exporté : ${p}`, '📤'); }, 'ghost'),
        btn('🧪 Tester dans une zone de test', async () => { const r = await mods.install(mod); if (!r.ok) { toast(r.errors[0], '⛔'); return; } close(); this.testInSandbox(mod.id); }),
        btn('💾 Enregistrer et installer', async () => { const r = await mods.install(mod); if (!r.ok) { openModal({ title: 'Corrigez les erreurs', icon: '⛔', cls: 'narrow', body: r.errors.map(e => h('div', { class: 'err' }, `• ${e}`)) }); return; } toast(`« ${mod.name} » installé : activez-le dans le gestionnaire`, '💾'); }, 'primary'),
      ],
    });
    void m;
  }

  creatorStart(drafts) {
    return new Promise(resolve => {
      let done = false;
      const templates = [
        ['Pack d’objets', '🪑', { objects: [{ id: 'mon_objet', name: 'Mon objet', cat: 'deco', price: 100, model: 'proc:statue', size: [1, 1], aff: ['admire'], decor: 3 }] }],
        ['Pack de traits', '🧠', { traits: [{ id: 'mon_trait', name: 'Mon trait', icon: '🌟', desc: 'Description du trait.', needDecay: { social: 1.2 }, actionWeights: { fun: 1.5 }, emotionBias: { happy: 1.2 } }] }],
        ['Pack d’événements', '🎲', { events: [{ id: 'mon_evenement', name: 'Mon événement', icon: '🎉', trigger: { type: 'hourly', chance: 0.05 }, conditions: {}, effects: [{ type: 'moodlet', id: 'surprise' }, { type: 'journal', text: '🎉 {actor} vit un moment inattendu !' }] }] }],
        ['Pack de pouvoirs', '⚡', { powers: [{ id: 'mon_pouvoir', name: 'Mon pouvoir', family: 'Énergie', icon: '💥', effect: 'projectile', color: '#ff66cc', intensity: 1, range: 10, cost: 12, cooldown: 10, instability: 0.02, desc: 'Un pouvoir personnalisé.' }] }],
        ['Mod vide', '🧩', {}],
      ];
      openModal({
        title: 'Nouveau mod', icon: '🛠️',
        body: (r, close) => [
          h('h3', {}, 'Partir d’un modèle'),
          h('div', { class: 'grid' }, ...templates.map(([n, ic, content]) => h('button', { class: 'card', onclick: () => {
            done = true; close();
            const id = `mon.mod-${Date.now().toString(36).slice(-4)}`;
            resolve({ format: 1, id, name: n === 'Mod vide' ? 'Mon mod' : `Mon ${n.toLowerCase()}`, version: '1.0.0', author: 'Moi', icon: ic, description: '', dependencies: content.powers ? [{ id: 'superessence.superpowers', name: 'SUPERPOWERS', version: '>=1.0.0' }] : [], content: JSON.parse(JSON.stringify(content)) });
          } }, h('div', { class: 'big' }, ic), h('div', { class: 'title' }, n)))),
          Object.keys(drafts).length ? [h('h3', {}, 'Brouillons'), h('div', { class: 'col' }, ...Object.values(drafts).map(d => btn(`${d.icon || '🧩'} ${d.name} (${d.id})`, () => { done = true; close(); resolve(d); })))] : null,
        ],
        onClose: () => { if (!done) resolve(null); },
      });
    });
  }

  creatorTab(tab, mod, render) {
    const c = mod.content;
    const list = (key, make, editor) => {
      c[key] ||= [];
      const out = [btn(`➕ Ajouter`, () => { c[key].push(make()); render(); }, 'small primary')];
      c[key].forEach((e, i) => out.push(h('div', { class: 'panel', style: { padding: '10px', margin: '8px 0' } },
        h('div', { class: 'row' }, h('b', { style: { flex: 1 } }, `${e.icon || ''} ${e.name || e.id}`), btn('🗑️', () => { c[key].splice(i, 1); render(); }, 'small danger')), editor(e))));
      return out;
    };
    const F = (label, el) => h('label', { class: 'field', style: { flex: '1 1 180px' } }, label, el);
    const text = (o, k, onch) => h('input', { type: 'text', value: o[k] ?? '', onchange: e => { o[k] = e.target.value; onch?.(); render(); } });
    const num = (o, k, step = 1) => h('input', { type: 'text', value: o[k] ?? '', inputmode: 'decimal', onchange: e => { o[k] = e.target.value === '' ? undefined : +e.target.value; render(); } });
    const sel = (o, k, values, labels = {}) => h('select', { onchange: e => { o[k] = e.target.value; render(); } }, ...values.map(v => h('option', { value: v, selected: o[k] === v }, labels[v] ?? v)));
    const idFrom = o => { if (!o.idLocked) o.id = slug(o.name); };
    switch (tab) {
      case 'meta': return [
        h('div', { class: 'row' }, F('Nom du mod', text(mod, 'name')), F('Identifiant unique', text(mod, 'id')), F('Version', text(mod, 'version')), F('Auteur', text(mod, 'author'))),
        F('Description', h('textarea', { onchange: e => { mod.description = e.target.value; render(); } }, mod.description || '')),
        h('h3', {}, 'Icône'), h('div', { class: 'row' }, ...ICONS.map(i => btn(i, () => { mod.icon = i; render(); }, `icon small ${mod.icon === i ? 'active' : ''}`))),
        h('h3', {}, 'Dépendances'),
        ...mods.list().filter(e => e.mod.id !== mod.id).map(e => btn(`${(mod.dependencies || []).some(d => d.id === e.mod.id) ? '✅' : '⬜'} ${e.mod.name}`, () => {
          mod.dependencies ||= [];
          if (mod.dependencies.some(d => d.id === e.mod.id)) mod.dependencies = mod.dependencies.filter(d => d.id !== e.mod.id);
          else mod.dependencies.push({ id: e.mod.id, name: e.mod.name, version: `>=${e.mod.version}` });
          render();
        }, 'small')),
      ];
      case 'objects': return list('objects', () => ({ id: `objet_${uid('').slice(-4)}`, name: 'Nouvel objet', cat: 'deco', price: 100, model: 'proc:statue', size: [1, 1], aff: ['admire'], decor: 2 }), o => [
        h('div', { class: 'row' }, F('Nom', text(o, 'name', () => idFrom(o))), F('Identifiant', text(o, 'id', () => { o.idLocked = true; })), F('Prix', num(o, 'price')), F('Catégorie', sel(o, 'cat', CATEGORIES.map(x => x.id), Object.fromEntries(CATEGORIES.map(x => [x.id, x.name]))))),
        h('div', { class: 'row' }, F('Modèle 3D', sel(o, 'model', [...modelChoices()], {})), F('Largeur (cases)', h('input', { type: 'text', value: o.size[0], onchange: e => { o.size[0] = +e.target.value; render(); } })), F('Profondeur', h('input', { type: 'text', value: o.size[1], onchange: e => { o.size[1] = +e.target.value; render(); } })), F('Échelle', num(o, 'scale')), F('Décoration (0-6)', num(o, 'decor'))),
        h('div', { class: 'row' }, F('Teinte', h('input', { type: 'color', value: o.tint || '#ffffff', onchange: e => { o.tint = e.target.value; render(); } })), F('Lumière (0-2)', num(o, 'light'))),
        h('div', { class: 'muted' }, 'Interactions :'),
        h('div', { class: 'row' }, ...[...registry.affordances.values(), ...(mod.content.affordances || [])].filter((a, i, arr) => !a.hidden && arr.findIndex(x => x.id === a.id) === i).map(a => btn(`${o.aff.includes(a.id) ? '✅' : '⬜'} ${a.name}`, () => { o.aff = o.aff.includes(a.id) ? o.aff.filter(x => x !== a.id) : [...o.aff, a.id]; render(); }, 'small'))),
      ]);
      case 'affordances': return list('affordances', () => ({ id: `action_${uid('').slice(-4)}`, name: 'Nouvelle activité', pose: 'stand', anim: 'interact', needs: { fun: 0.3 }, minMin: 20, maxMin: 40, tags: ['fun'] }), a => [
        h('div', { class: 'row' }, F('Nom', text(a, 'name', () => idFrom(a))), F('Identifiant', text(a, 'id', () => { a.idLocked = true; })), F('Posture', sel(a, 'pose', ['stand', 'sit', 'lie'], { stand: 'Debout', sit: 'Assis', lie: 'Allongé' })), F('Animation', sel(a, 'anim', ['interact', 'use', 'cheer', 'dance', 'workout', 'pickup', 'hammer', 'cast', 'idle']))),
        h('div', { class: 'row' }, F('Durée min (minutes)', num(a, 'minMin')), F('Durée max', num(a, 'maxMin')), F('Coût', num(a, 'cost')), F('Compétence', sel(a, 'skill', ['', ...SKILLS.map(s => s.id), 'powers'], { '': '—' })), F('Humeur à la fin', sel(a, 'moodlet', ['', ...registry.moodlets.keys(), ...(mod.content.moodlets || []).map(m => m.id)], { '': '—' }))),
        h('div', { class: 'muted' }, 'Gain de besoin par minute (-2 à 3) :'),
        h('div', { class: 'row' }, ...NEEDS.map(n => F(`${n.icon} ${n.name}`, h('input', { type: 'text', value: a.needs?.[n.id] ?? '', onchange: e => { a.needs ||= {}; if (e.target.value === '') delete a.needs[n.id]; else a.needs[n.id] = +e.target.value; render(); } })))),
        h('div', { class: 'row' }, ...['fun', 'food', 'rest', 'skill', 'creative', 'sport', 'social', 'solo', 'party', 'hygiene'].map(t => btn(`${(a.tags || []).includes(t) ? '✅' : '⬜'} ${t}`, () => { a.tags = (a.tags || []).includes(t) ? a.tags.filter(x => x !== t) : [...(a.tags || []), t]; render(); }, 'small'))),
      ]);
      case 'traits': return list('traits', () => ({ id: `trait_${uid('').slice(-4)}`, name: 'Nouveau trait', icon: '🌟', desc: '', needDecay: {}, actionWeights: {}, emotionBias: {} }), t => [
        h('div', { class: 'row' }, F('Nom', text(t, 'name', () => idFrom(t))), F('Icône (emoji)', text(t, 'icon')), F('Description', text(t, 'desc'))),
        h('div', { class: 'muted' }, 'Vitesse de déclin des besoins (1 = normal) :'),
        h('div', { class: 'row' }, ...NEEDS.map(n => F(`${n.icon} ${n.name}`, h('input', { type: 'text', value: t.needDecay?.[n.id] ?? '', onchange: e => { t.needDecay ||= {}; if (e.target.value === '') delete t.needDecay[n.id]; else t.needDecay[n.id] = +e.target.value; render(); } })))),
        h('div', { class: 'muted' }, 'Préférences d’activités (multiplicateur) :'),
        h('div', { class: 'row' }, ...['fun', 'food', 'rest', 'skill', 'creative', 'sport', 'social', 'solo', 'party', 'help', 'mischief'].map(k => F(k, h('input', { type: 'text', value: t.actionWeights?.[k] ?? '', onchange: e => { t.actionWeights ||= {}; if (e.target.value === '') delete t.actionWeights[k]; else t.actionWeights[k] = +e.target.value; render(); } })))),
        h('div', { class: 'muted' }, 'Tendances émotionnelles :'),
        h('div', { class: 'row' }, ...Object.keys(EMOTIONS).filter(e => e !== 'fine').map(k => F(`${EMOTIONS[k].icon} ${EMOTIONS[k].name}`, h('input', { type: 'text', value: t.emotionBias?.[k] ?? '', onchange: e => { t.emotionBias ||= {}; if (e.target.value === '') delete t.emotionBias[k]; else t.emotionBias[k] = +e.target.value; render(); } })))),
      ]);
      case 'events': return list('events', () => ({ id: `evenement_${uid('').slice(-4)}`, name: 'Nouvel événement', icon: '🎉', trigger: { type: 'hourly', chance: 0.05 }, conditions: {}, effects: [{ type: 'journal', text: '🎉 {actor} vit quelque chose d’étonnant.' }] }), ev => [
        h('div', { class: 'row' }, F('Nom', text(ev, 'name', () => idFrom(ev))), F('Icône', text(ev, 'icon')), F('Déclencheur', sel(ev.trigger, 'type', ['hourly', 'daily', 'social', 'power_used'], { hourly: 'Chaque heure', daily: 'Chaque jour', social: 'Après une interaction sociale', power_used: 'Après un pouvoir' })), F('Probabilité (0-1)', num(ev.trigger, 'chance')), F('Délai entre deux fois (min)', num(ev, 'cooldown'))),
        ev.trigger.type === 'social' ? F('Interaction concernée', sel(ev.trigger, 'social', ['', ...registry.socials.keys()], { '': 'Toutes' })) : null,
        h('div', { class: 'muted' }, 'Conditions sur le personnage :'),
        h('div', { class: 'row' }, F('Trait requis', sel(ev.conditions, 'trait', ['', ...registry.traits.keys(), ...(mod.content.traits || []).map(t => t.id)], { '': '—' })), F('Émotion', sel(ev.conditions, 'emotion', ['', ...Object.keys(EMOTIONS)], { '': '—' })), F('Métier', sel(ev.conditions, 'career', ['', ...registry.careers.keys()], { '': '—' }))),
        h('div', { class: 'muted' }, 'Effets (dans l’ordre) — utilisez {actor} et {target} dans les textes :'),
        ...ev.effects.map((f, i) => h('div', { class: 'row' },
          F('Effet', sel(f, 'type', EFFECTS, EFFECT_NAMES)),
          ['moodlet', 'trait_add', 'trait_remove', 'social', 'grant_power', 'use_power', 'spawn_object'].includes(f.type) ? F('Élément', sel(f, 'id', ['', ...this.idsFor(f.type, mod)])) : null,
          f.type === 'need' ? F('Besoin', sel(f, 'need', NEEDS.map(n => n.id))) : null,
          f.type === 'skill' ? F('Compétence', sel(f, 'skill', [...SKILLS.map(s => s.id), 'powers'])) : null,
          ['need', 'money', 'skill'].includes(f.type) ? F('Quantité', num(f, 'amount')) : null,
          f.type === 'relationship' ? [F('Amitié', num(f, 'friend')), F('Romance', num(f, 'romance'))] : null,
          ['journal', 'notify'].includes(f.type) ? F('Texte', text(f, 'text')) : null,
          f.type === 'animation' ? F('Animation', sel(f, 'anim', ['cheer', 'dance', 'sad', 'angry', 'scared', 'cast', 'wave'])) : null,
          f.type === 'alignment' ? F('Alignement', sel(f, 'value', ['hero', 'antihero', 'villain', 'unstable', 'hidden'])) : null,
          F('Sur', sel(f, 'on', ['actor', 'target'], { actor: 'Le personnage', target: 'La cible' })),
          btn('✕', () => { ev.effects.splice(i, 1); render(); }, 'small ghost'))),
        btn('➕ Ajouter un effet', () => { ev.effects.push({ type: 'moodlet', id: 'surprise' }); render(); }, 'small'),
      ]);
      case 'powers': return [
        !registry.hasPowers() && !(mod.dependencies || []).some(d => d.id === 'superessence.superpowers') ? h('p', { class: 'warn' }, '⚠️ Conseil : ajoutez SUPERPOWERS en dépendance (onglet Infos) pour bénéficier de la compétence, des objets et des événements de pouvoirs.') : null,
        ...list('powers', () => ({ id: `pouvoir_${uid('').slice(-4)}`, name: 'Nouveau pouvoir', family: 'Énergie', icon: '💥', effect: 'projectile', color: '#ff66cc', intensity: 1, range: 10, cost: 12, cooldown: 10, instability: 0.02, desc: '' }), p => [
          h('div', { class: 'row' }, F('Nom', text(p, 'name', () => idFrom(p))), F('Icône', text(p, 'icon')), F('Famille', sel(p, 'family', ['Énergie', 'Éléments', 'Physiques', 'Mobilité', 'Psychiques', 'Mutations', 'Pouvoirs rares'])), F('Effet du moteur', sel(p, 'effect', EFFECT_TYPES))),
          h('div', { class: 'row' }, F('Couleur', h('input', { type: 'color', value: p.color || '#ff66cc', onchange: e => { p.color = e.target.value; render(); } })), F('Élément', sel(p, 'element', ['', 'fire', 'ice', 'electric', 'water', 'earth', 'wind'], { '': '—' })), p.effect === 'mutation' ? F('Mutation', sel(p, 'mutation', ['wings', 'arms', 'claws', 'tentacles', 'shell', 'monster'])) : null),
          h('div', { class: 'row' }, F('Intensité', num(p, 'intensity')), F('Portée', num(p, 'range')), F('Durée', num(p, 'duration')), F('Coût en énergie', num(p, 'cost')), F('Recharge (min)', num(p, 'cooldown')), F('Instabilité (0-1)', num(p, 'instability'))),
          F('Description', text(p, 'desc')),
        ]),
      ];
      case 'careers': return list('careers', () => ({ id: `metier_${uid('').slice(-4)}`, name: 'Nouveau métier', icon: '💼', venue: 'office', start: 9, end: 17, days: [0, 1, 2, 3, 4], skills: ['charisma'], levels: [{ title: 'Débutant', pay: 120 }, { title: 'Confirmé', pay: 220 }, { title: 'Expert', pay: 380 }, { title: 'Légende', pay: 650 }] }), k => [
        h('div', { class: 'row' }, F('Nom', text(k, 'name', () => idFrom(k))), F('Icône', text(k, 'icon')), F('Lieu', sel(k, 'venue', ['office', 'shop', 'school', 'cinema', 'restaurant', 'gym'])), F('Début (h)', num(k, 'start')), F('Fin (h)', num(k, 'end'))),
        h('div', { class: 'row' }, ...['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d, i) => btn(`${k.days.includes(i) ? '✅' : '⬜'} ${d}`, () => { k.days = k.days.includes(i) ? k.days.filter(x => x !== i) : [...k.days, i].sort(); render(); }, 'small'))),
        h('div', { class: 'row' }, ...k.levels.map(l => h('div', { class: 'col', style: { flex: '1 1 140px', gap: '4px' } }, text(l, 'title'), h('input', { type: 'text', value: l.pay, onchange: e => { l.pay = +e.target.value; render(); } })))),
      ]);
      case 'moodlets': return list('moodlets', () => ({ id: `humeur_${uid('').slice(-4)}`, name: 'Nouvelle humeur', emotion: 'happy', weight: 2, dur: 180 }), m => [
        h('div', { class: 'row' }, F('Nom', text(m, 'name', () => idFrom(m))), F('Émotion', sel(m, 'emotion', Object.keys(EMOTIONS), Object.fromEntries(Object.entries(EMOTIONS).map(([k, e]) => [k, `${e.icon} ${e.name}`])))), F('Intensité (1-5)', num(m, 'weight')), F('Durée (min)', num(m, 'dur'))),
      ]);
      case 'overrides': {
        return [
          h('p', { class: 'muted' }, 'Modifiez les statistiques d’un objet du jeu de base : une copie est ajoutée à votre mod avec le même identifiant et remplace l’original quand le mod est actif.'),
          h('div', { class: 'grid small' }, ...[...registry.objects.values()].filter(o => o.source === 'base' && !o.hiddenInCatalog).slice(0, 80).map(o => h('button', { class: 'card', onclick: () => {
            c.objects ||= [];
            if (c.objects.some(x => x.id === o.id)) { toast('Déjà dans le mod (onglet Objets)', 'ℹ️'); return; }
            const { source, ...copy } = o; copy.idLocked = true;
            c.objects.push(JSON.parse(JSON.stringify(copy)));
            toast(`${o.name} copié dans l’onglet Objets`, '🔧'); render();
          } }, h('div', { class: 'title' }, o.name), h('div', { class: 'muted' }, `✦${o.price}`)))),
        ];
      }
    }
    return [];
  }

  idsFor(type, mod) {
    const c = mod.content;
    if (type === 'moodlet') return [...registry.moodlets.keys(), ...(c.moodlets || []).map(x => x.id)];
    if (type.startsWith('trait')) return [...registry.traits.keys(), ...(c.traits || []).map(x => x.id)];
    if (type === 'social') return [...registry.socials.keys()];
    if (type === 'grant_power' || type === 'use_power') return [...registry.powers.keys(), ...(c.powers || []).map(x => x.id)];
    if (type === 'spawn_object') return [...registry.objects.keys(), ...(c.objects || []).map(x => x.id)];
    return [];
  }

  async testInSandbox(modId) {
    const l = loading('Préparation de la zone de test…');
    const deps = (mods.get(modId)?.mod.dependencies || []).map(d => d.id);
    const w = generateSandbox([...deps, modId]);
    if (deps.includes('superessence.superpowers') || mods.get(modId)?.mod.content?.powers) w.d.mods.data['superessence.superpowers'] = { distribution: 'everyone', distributed: false };
    w.creativeFreeBuild = true;
    l.done();
    this.app.hideMenu();
    await this.game.startWorld(w);
    toast('Zone de test : construction gratuite activée. Votre mod est actif.', '🧪');
  }
}

function slug(s) { return String(s || 'element').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'element'; }
function modelChoices() {
  const list = new Set(MODEL_LIST);
  for (const o of registry.objects.values()) if (o.model && !o.building) list.add(o.model);
  return [...list].sort();
}
export { BUILTIN_MODS };

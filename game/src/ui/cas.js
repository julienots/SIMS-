// Créateur de personnages : corps, visage, cheveux, tenue, accessoires, personnalité, histoire, pouvoirs (mod).
// Les changements modifient réellement le modèle 3D (couleurs de texture, proportions des os, accessoires).
import * as THREE from 'three';
import { h, btn, toast, openModal, focusFirst, usingPadRef } from './dom.js';
import { registry } from '../mods/registry.js';
import { SimView } from '../render/simview.js';
import { createSim, BODIES, SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, EXTRAS, EYE_COLORS, simToTemplate, simFromTemplate, pickTraits, defaultAppearance, SECRETS } from '../sim/factory.js';
import { LIKES, FEARS, LIFE_STAGES } from '../sim/data/core-data.js';
import { RNG, uid } from '../core/util.js';
import { getGallery, setGallery } from '../save/storage.js';
import { ALIGNMENTS, PASSIVE_EFFECTS } from '../sim/powers.js';
import { simName } from '../sim/simulation.js';
import { sfx } from '../engine/audio.js';

const OUTFIT_PRESETS = [
  ['Décontracté', { primary: '#2f6fd6', secondary: '#9aa5b1', accent: '#f2b632', hat: false, cape: false }],
  ['Chic', { primary: '#222831', secondary: '#f2f2f2', accent: '#d8344a', hat: false, cape: true }],
  ['Sport', { primary: '#ff8a2a', secondary: '#222831', accent: '#f2f2f2', hat: false, cape: false }],
  ['Nature', { primary: '#2fae66', secondary: '#7a5230', accent: '#f2b632', hat: true, cape: false }],
  ['Fantaisie', { primary: '#8a4fd6', secondary: '#ff7aa8', accent: '#21b5b5', hat: true, cape: true }],
  ['Super-héros', { primary: '#d8344a', secondary: '#2f6fd6', accent: '#f2b632', hat: false, cape: true }],
  ['Super-vilain', { primary: '#222831', secondary: '#8a4fd6', accent: '#3fae6b', hat: true, cape: true }],
];

export class CAS {
  constructor(game, app) {
    this.game = game; this.app = app;
    this.active = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1c2140');
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);
    game.casCamera = this.camera;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#444466', 1.2));
    const key = new THREE.DirectionalLight('#fff2dd', 2.4); key.position.set(3, 5, 4); key.castShadow = true; this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9bb8ff', 1.5); rim.position.set(-4, 3, -3); this.scene.add(rim);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.18, 40), new THREE.MeshStandardMaterial({ color: '#ffcf2e', roughness: 0.4 }));
    ped.position.y = -0.09; ped.receiveShadow = true; this.scene.add(ped);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: '#262c52' }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.18; this.scene.add(floor);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.tab = 'identity';
  }

  get W() { return this.game.world; }

  // opts.mode : 'new' (ajout au foyer), 'household' (nouveau foyer), 'edit', 'gallery' (hors partie)
  open(opts = {}) {
    this.opts = opts;
    this.rng = new RNG((Math.random() * 1e9) >>> 0);
    this.members = [];
    if (opts.mode === 'edit' && opts.sim) {
      this.original = opts.sim;
      this.sim = JSON.parse(JSON.stringify({ ...opts.sim, _rt: undefined }));
    } else this.sim = this.newSim();
    this.tab = opts.tab || 'identity';
    this.active = true;
    this.prevMode = this.game.mode;
    if (this.W && this.game.mode !== 'cas') this.game.setMode('cas');
    else this.game.mode = 'cas';
    this.game.casYaw = 0.3; this.game.casZoom = 1;
    this.root = h('div', { id: 'cas' });
    document.getElementById('ui').appendChild(this.root);
    this.refreshModel();
    this.render();
  }

  newSim() {
    const s = createSim(this.rng, { stage: 'young' });
    s.attraction = ['f', 'm'];
    return s;
  }

  close(apply) {
    if (apply) this.apply();
    this.active = false;
    this.root?.remove();
    this.view?.dispose(); this.view = null;
    if (this.W) this.game.setMode(this.prevMode && this.prevMode !== 'cas' ? this.prevMode : 'live');
    else { this.game.mode = 'menu'; this.app.toMenu(); }
  }

  refreshModel() {
    const s = this.sim;
    s._rt = { anim: 'idle', vfx: { mutations: s.modData?.powers?.mutations || [] }, hidden: false };
    s.pos = { x: 0, y: 0, l: 0, hz: 0 };
    s.rot = 0;
    if (!this.view) this.view = new SimView(s, this.holder);
    else { this.view.sim = s; this.view.builtKey = null; }
    this.idleT = 0;
  }

  update(dt) {
    if (!this.view) return;
    this.idleT += dt;
    // Petite animation de présentation.
    const s = this.sim;
    s._rt.anim = this.previewAnim || (Math.floor(this.idleT / 6) % 4 === 3 ? 'cheer' : 'idle');
    this.holder.rotation.y = this.game.casYaw || 0;
    this.view.update(dt, { now: performance.now() / 1000, camPos: this.camera.position, selected: null, viewLevel: 0 });
    const z = this.game.casZoom || 1;
    const scale = this.view.baseScale ? this.view.baseScale / 0.7 : 1;
    const focusY = 0.95 * scale;
    // Personnage décalé à gauche (le panneau occupe la droite).
    const wide = innerWidth > innerHeight;
    this.camera.position.set(wide ? 0.9 * z * scale : 0, focusY + 0.25, 4.6 * z * scale);
    this.camera.lookAt(wide ? 0.9 * z * scale : 0, focusY, 0);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ interface
  render() {
    const s = this.sim;
    this.root.innerHTML = '';
    const tabs = [['identity', '🪪', 'Identité'], ['body', '🧍', 'Corps'], ['face', '😊', 'Visage & cheveux'], ['outfit', '👕', 'Tenue'], ['traits', '🧠', 'Personnalité'], ['story', '📖', 'Histoire']];
    if (registry.hasPowers()) tabs.push(['powers', '⚡', 'Pouvoirs']);
    const body = h('div', { class: 'modal-body' }, this.tabBody());
    const titles = { new: 'Nouvel habitant', household: 'Nouveau foyer', edit: `Modifier ${s.first}`, gallery: 'Galerie de personnages' };
    const panel = h('div', { class: 'panel cas-panel', dataset: { scope: '1' } },
      h('div', { class: 'modal-head' }, h('span', { style: { fontSize: '26px' } }, '👤'), h('h2', {}, titles[this.opts.mode] || 'Créateur'), btn('✕', () => this.close(false), 'icon ghost', { dataset: { back: '1' } })),
      h('div', { style: { padding: '8px 14px 0' } }, h('div', { class: 'tabs' }, ...tabs.map(([id, ic, nm]) => h('button', { class: `tab ${this.tab === id ? 'active' : ''}`, onclick: () => { this.tab = id; this.render(); } }, `${ic} ${nm}`)))),
      body,
      h('div', { class: 'modal-foot' }, ...this.footer()));
    const left = h('div', { class: 'cas-left' },
      h('div', { class: 'panel', style: { padding: '8px 12px', fontFamily: 'var(--font-title)', fontSize: '20px' } }, simName(s)),
      ...[['idle', '🧍'], ['walk', '🚶'], ['cheer', '🙌'], ['sit', '🪑'], ['dance', '💃'], ['cast', '⚡']].map(([a, ic]) => btn(ic, () => { this.previewAnim = this.previewAnim === a ? null : a; }, 'icon small', { title: 'Animation' })),
      btn('⟲', () => { this.game.casYaw -= 0.6; }, 'icon small'), btn('⟳', () => { this.game.casYaw += 0.6; }, 'icon small'),
      btn('🔍', () => { this.game.casZoom = this.game.casZoom > 0.8 ? 0.55 : 1; }, 'icon small', { title: 'Zoom visage' }));
    if (this.opts.mode === 'household') left.appendChild(h('div', { class: 'panel', style: { padding: '8px', width: '100%' } }, h('div', { class: 'muted' }, `Membres du foyer (${this.members.length}) :`), h('div', { class: 'row' }, ...this.members.map((m, i) => h('span', { class: 'tag' }, m.first, ' ', h('a', { style: { cursor: 'pointer' }, onclick: () => { this.members.splice(i, 1); this.render(); } }, '✕'))))));
    this.root.append(left, panel);
    if (usingPadRef.value) focusFirst(panel);
  }

  footer() {
    const out = [btn('🎲 Aléatoire', () => this.randomize(), 'ghost'), btn('📂 Galerie', () => this.loadFromGallery(), 'ghost'), btn('💾 Enregistrer', () => this.saveToGallery(), 'ghost')];
    if (this.opts.mode === 'household') {
      out.push(btn('➕ Ajouter au foyer', () => { this.members.push(this.sim); this.sim = this.newSim(); this.sim.last = this.members[0].last; this.refreshModel(); this.render(); toast('Membre ajouté', '👤'); }));
      out.push(btn('🏡 Emménager', () => this.finishHousehold(), 'primary'));
    } else if (this.opts.mode === 'gallery') out.push(btn('✓ Terminer', () => { this.saveToGallery(); this.close(false); }, 'primary'));
    else out.push(btn('✓ Valider', () => this.close(true), 'primary'));
    return out;
  }

  set(path, value, rebuild = true) {
    const keys = path.split('.');
    let o = this.sim;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys[keys.length - 1]] = value;
    if (rebuild) this.view.builtKey = null;
    this.render();
    sfx('tick');
  }

  slider(label, path, min, max, step = 0.01) {
    const v = path.split('.').reduce((o, k) => o[k], this.sim);
    return h('label', { class: 'field' }, `${label}`, h('input', { type: 'range', min, max, step, value: v, oninput: e => { const keys = path.split('.'); let o = this.sim; for (const k of keys.slice(0, -1)) o = o[k]; o[keys[keys.length - 1]] = +e.target.value; this.view.builtKey = null; } }));
  }
  swatches(path, colors) {
    const v = path.split('.').reduce((o, k) => o[k], this.sim);
    return h('div', { class: 'swatches' }, ...colors.map(c => h('div', { class: `swatch ${v === c ? 'selected' : ''}`, tabindex: '0', style: { background: c }, onclick: () => this.set(path, c) })),
      h('input', { type: 'color', value: v, style: { width: '40px', height: '34px', border: 'none', background: 'none' }, onchange: e => this.set(path, e.target.value) }));
  }

  tabBody() {
    const s = this.sim, ap = s.appearance;
    const creative = this.W?.settings.creativeLevel === 'libre' || this.W?.creativeFreeBuild || this.opts.mode === 'gallery';
    switch (this.tab) {
      case 'identity': return [
        h('div', { class: 'row' }, h('label', { class: 'field', style: { flex: 1 } }, 'Prénom', h('input', { type: 'text', value: s.first, maxlength: 20, onchange: e => this.set('first', e.target.value || 'Sans nom', false) })),
          h('label', { class: 'field', style: { flex: 1 } }, 'Nom', h('input', { type: 'text', value: s.last, maxlength: 24, onchange: e => this.set('last', e.target.value, false) }))),
        h('h3', {}, 'Genre (pour les textes)'), h('div', { class: 'row' }, ...[['f', 'Féminin'], ['m', 'Masculin'], ['x', 'Non-binaire']].map(([g, n]) => btn(n, () => this.set('gender', g, false), `small ${s.gender === g ? 'active' : ''}`))),
        h('h3', {}, 'Âge'), h('div', { class: 'row' }, ...LIFE_STAGES.filter(st => st.id !== 'baby').map(st => btn(st.name, () => { this.set('stage', st.id); if (['child', 'teen'].includes(st.id)) s.career = { id: 'unemployed', level: 0, perf: 0, days: 0 }; }, `small ${s.stage === st.id ? 'active' : ''}`))),
        h('h3', {}, 'Attirance (personnages adultes)'), h('div', { class: 'row' }, ...[['f', 'Femmes'], ['m', 'Hommes'], ['x', 'Personnes non-binaires']].map(([g, n]) => btn(`${(s.attraction || []).includes(g) ? '✅' : '⬜'} ${n}`, () => { s.attraction ||= []; s.attraction = s.attraction.includes(g) ? s.attraction.filter(x => x !== g) : [...s.attraction, g]; this.render(); }, 'small'))),
        h('h3', {}, 'Aspiration'), h('div', { class: 'grid small' }, ...[...registry.aspirations.values()].map(a => h('button', { class: `card ${s.aspiration === a.id ? 'selected' : ''}`, onclick: () => this.set('aspiration', a.id, false) }, h('div', { class: 'big' }, a.icon), h('div', { class: 'title' }, a.name)))),
        ['young', 'adult', 'elder', 'teen'].includes(s.stage) ? [h('h3', {}, 'Métier'), h('select', { onchange: e => { s.career = { id: e.target.value, level: 0, perf: 0, days: 0 }; } }, ...[...registry.careers.values()].map(c => h('option', { value: c.id, selected: s.career.id === c.id }, `${c.icon} ${c.name}`)))] : null,
      ];
      case 'body': return [
        h('h3', {}, 'Morphologie de base'), h('div', { class: 'grid small' }, ...BODIES.map(b => h('button', { class: `card ${ap.body === b.id ? 'selected' : ''}`, onclick: () => this.set('appearance.body', b.id) }, h('div', { class: 'big' }, { Knight: '🧍', Barbarian: '🏋️', Mage: '🧙', Rogue: '🤸', Rogue_Hooded: '🥷' }[b.id]), h('div', { class: 'title' }, b.name)))),
        h('h3', {}, 'Teint'), this.swatches('appearance.skin', SKIN_TONES),
        h('h3', {}, 'Proportions'),
        this.slider('Taille', 'appearance.height', 0.82, 1.18), this.slider('Corpulence', 'appearance.build', 0.75, 1.35), this.slider('Carrure (épaules)', 'appearance.shoulders', 0.8, 1.25),
        this.slider('Taille de la tête', 'appearance.head', 0.85, 1.25), this.slider('Longueur des jambes', 'appearance.legs', 0.85, 1.15), this.slider('Longueur des bras', 'appearance.arms', 0.85, 1.15),
      ];
      case 'face': return [
        h('h3', {}, 'Couleur des cheveux et de la pilosité'), this.swatches('appearance.hair', HAIR_COLORS),
        h('h3', {}, 'Couleur des yeux'), this.swatches('appearance.eyes', EYE_COLORS),
        h('p', { class: 'muted' }, 'Les modèles libres utilisés ont des visages peints : la couleur des yeux est mémorisée pour l’héritage et l’affichage du portrait.'),
        h('h3', {}, 'Visage : traits distinctifs'),
        h('div', { class: 'row' }, ...EXTRAS.filter(e => ['glasses', 'sunglasses', 'mustache', 'beard', 'freckles', 'scar', 'makeup', 'earrings'].includes(e.id)).map(e => this.extraBtn(e))),
      ];
      case 'outfit': return [
        h('h3', {}, 'Styles prêts à porter'), h('div', { class: 'row' }, ...OUTFIT_PRESETS.map(([n, p]) => btn(n, () => { Object.assign(ap, p); this.view.builtKey = null; this.render(); }, 'small'))),
        h('h3', {}, 'Couleur principale'), this.swatches('appearance.primary', OUTFIT_COLORS),
        h('h3', {}, 'Couleur secondaire'), this.swatches('appearance.secondary', OUTFIT_COLORS),
        h('h3', {}, 'Couleur d’accent'), this.swatches('appearance.accent', OUTFIT_COLORS),
        h('h3', {}, 'Pièces de tenue'), h('div', { class: 'row' }, btn(`${ap.hat ? '✅' : '⬜'} Couvre-chef d’origine`, () => this.set('appearance.hat', !ap.hat), 'small'), btn(`${ap.cape ? '✅' : '⬜'} Cape / manteau`, () => this.set('appearance.cape', !ap.cape), 'small')),
        h('h3', {}, 'Accessoires et bijoux'), h('div', { class: 'row' }, ...EXTRAS.filter(e => ['crown', 'cap', 'tophat', 'flower', 'bow', 'headphones', 'necklace'].includes(e.id)).map(e => this.extraBtn(e))),
      ];
      case 'traits': {
        const max = creative ? 5 : 3;
        return [
          h('p', { class: 'muted' }, `Choisissez jusqu’à ${max} traits. Ils influencent réellement les décisions, les conversations et les relations.`),
          h('div', { class: 'grid small' }, ...[...registry.traits.values()].map(t => {
            const on = s.traits.includes(t.id);
            const conflict = !on && s.traits.some(x => (registry.trait(x)?.conflicts || []).includes(t.id) || (t.conflicts || []).includes(x));
            return h('button', { class: `card ${on ? 'selected' : ''}`, title: t.desc, style: conflict ? { opacity: 0.4 } : {}, onclick: () => {
              if (on) s.traits = s.traits.filter(x => x !== t.id);
              else if (conflict) { toast('Trait incompatible avec un trait choisi', '⚠️'); return; }
              else if (s.traits.length >= max) { toast(`Maximum ${max} traits`, 'ℹ️'); return; }
              else s.traits.push(t.id);
              this.render();
            } }, h('div', { class: 'big' }, t.icon), h('div', { class: 'title' }, t.name), h('div', { class: 'muted' }, t.desc), t.source !== 'base' ? h('span', { class: 'tag yellow' }, '🧩 Mod') : null);
          })),
          h('h3', {}, 'Goûts'),
          h('div', { class: 'row' }, h('label', { class: 'field', style: { flex: 1 } }, 'Musique', sel(LIKES.music, s.likes.music, v => { s.likes.music = v; })), h('label', { class: 'field', style: { flex: 1 } }, 'Activité préférée', sel(LIKES.activities, s.likes.activity, v => { s.likes.activity = v; })),
            h('label', { class: 'field', style: { flex: 1 } }, 'Couleur', sel(LIKES.colors, s.likes.color, v => { s.likes.color = v; })), h('label', { class: 'field', style: { flex: 1 } }, 'Déteste', sel(LIKES.activities, s.dislikes?.activity, v => { s.dislikes = { activity: v }; }))),
        ];
      }
      case 'story': return [
        h('label', { class: 'field' }, 'Histoire personnelle', h('textarea', { maxlength: 600, onchange: e => { s.backstory = e.target.value; } }, s.backstory || '')),
        h('label', { class: 'field' }, 'Objectifs (un par ligne)', h('textarea', { maxlength: 400, onchange: e => { s.goals = e.target.value.split('\n').filter(Boolean); } }, (s.goals || []).join('\n'))),
        h('h3', {}, 'Peurs'), h('div', { class: 'row' }, ...FEARS.map(f => btn(`${s.fears.includes(f) ? '✅' : '⬜'} ${f}`, () => { s.fears = s.fears.includes(f) ? s.fears.filter(x => x !== f) : [...s.fears, f]; this.render(); }, 'small'))),
        h('h3', {}, 'Secrets'),
        ...s.secrets.map((sc, i) => h('div', { class: 'row' }, h('input', { type: 'text', value: sc.text, style: { flex: 1 }, onchange: e => { sc.text = e.target.value; } }), btn('✕', () => { s.secrets.splice(i, 1); this.render(); }, 'small ghost'))),
        h('div', { class: 'row' }, btn('➕ Ajouter un secret', () => { s.secrets.push({ text: this.rng.pick(SECRETS), knownBy: [] }); this.render(); }, 'small')),
        h('h3', {}, 'Particularités'), h('label', { class: 'field' }, 'Note libre', h('input', { type: 'text', value: s.flags.quirk || '', maxlength: 80, onchange: e => { s.flags.quirk = e.target.value; } })),
        this.W && this.opts.mode !== 'gallery' ? [h('h3', {}, 'Famille, amis, ennemis'), h('p', { class: 'muted' }, 'Définissez les liens avec les habitants existants (appliqués à la validation).'),
          ...this.W.sims.filter(o => o.id !== s.id).slice(0, 40).map(o => h('div', { class: 'row' }, h('span', { style: { minWidth: '150px' } }, simName(o)),
            sel(['', 'friend', 'best_friend', 'family', 'rival', 'enemy', 'partner', 'married'], (this.links ||= {})[o.id] || '', v => { this.links[o.id] = v; }, { '': '—', friend: 'Ami', best_friend: 'Meilleur ami', family: 'Famille', rival: 'Rival', enemy: 'Ennemi', partner: 'En couple', married: 'Marié' })))] : null,
      ];
      case 'powers': {
        s.modData ||= {};
        const d = s.modData.powers ||= { alignment: 'civilian', list: {}, energy: 100, identity: 'public', reputation: 0, active: {}, mutations: [], firsts: {} };
        const families = {};
        for (const p of registry.powers.values()) (families[p.family] ||= []).push(p);
        const max = creative ? 99 : 4;
        return [
          h('h3', {}, 'Statut'), h('div', { class: 'row' }, ...Object.entries(ALIGNMENTS).map(([k, a]) => btn(`${a.icon} ${a.name}`, () => { d.alignment = k; if (k === 'hidden') d.identity = 'secret'; this.render(); }, `small ${d.alignment === k ? 'active' : ''}`))),
          h('div', { class: 'row' }, btn(`${d.identity === 'secret' ? '✅' : '⬜'} Cache ses capacités (identité secrète)`, () => { d.identity = d.identity === 'secret' ? 'public' : 'secret'; this.render(); }, 'small')),
          h('p', { class: 'muted' }, `Pouvoirs choisis : ${Object.keys(d.list).length}/${max === 99 ? '∞' : max}. Les mutations visibles s’activent en jeu.`),
          ...Object.entries(families).map(([fam, list]) => [h('h3', {}, fam), h('div', { class: 'grid small' }, ...list.map(p => {
            const on = !!d.list[p.id];
            return h('button', { class: `card ${on ? 'selected' : ''}`, title: p.desc, onclick: () => {
              if (on) { delete d.list[p.id]; if (p.effect === 'mutation') d.mutations = d.mutations.filter(m => m !== p.mutation); }
              else if (Object.keys(d.list).length >= max) { toast(`Maximum ${max} pouvoirs (illimité en mode créatif)`, 'ℹ️'); return; }
              else { d.list[p.id] = { mastery: 0, cd: 0, uses: 0 }; if (d.alignment === 'civilian') d.alignment = 'discovering'; }
              this.render();
            } }, h('div', { class: 'big' }, p.icon), h('div', { class: 'title' }, p.name), h('div', { class: 'muted' }, PASSIVE_EFFECTS.includes(p.effect) ? 'Passif' : `Coût ${p.cost || 0} · ${p.cooldown || 0} min`));
          }))]),
          h('h3', {}, 'Aperçu des mutations'), h('div', { class: 'row' }, ...['wings', 'arms', 'claws', 'tentacles', 'shell'].map(m => btn(`${d.mutations.includes(m) ? '✅' : '⬜'} ${{ wings: 'Ailes', arms: 'Bras', claws: 'Griffes', tentacles: 'Tentacules', shell: 'Carapace' }[m]}`, () => { d.mutations = d.mutations.includes(m) ? d.mutations.filter(x => x !== m) : [...d.mutations, m]; this.view.builtKey = null; this.render(); }, 'small'))),
        ];
      }
    }
    return [];
  }

  extraBtn(e) {
    const ap = this.sim.appearance;
    const on = (ap.extras || []).includes(e.id);
    return btn(`${on ? '✅' : '⬜'} ${e.name}`, () => { ap.extras = on ? ap.extras.filter(x => x !== e.id) : [...(ap.extras || []), e.id]; this.view.builtKey = null; this.render(); }, 'small');
  }

  randomize() {
    const s = this.sim;
    const keep = { first: s.first, last: s.last };
    const n = createSim(this.rng, { stage: s.stage });
    s.appearance = defaultAppearance(this.rng);
    s.traits = pickTraits(this.rng, 3);
    s.likes = n.likes; s.aspiration = n.aspiration; s.gender = n.gender; s.first = n.first;
    void keep;
    this.view.builtKey = null;
    this.render();
    sfx('click');
  }

  async saveToGallery() {
    const gal = await getGallery();
    const t = simToTemplate(this.sim);
    gal.sims = gal.sims.filter(x => !(x.first === t.first && x.last === t.last));
    gal.sims.push(t);
    await setGallery(gal);
    toast(`${this.sim.first} enregistré(e) dans la galerie (réutilisable dans tous vos mondes)`, '💾');
  }

  async loadFromGallery() {
    const gal = await getGallery();
    openModal({
      title: 'Galerie de personnages', icon: '🖼️',
      body: (r, close) => gal.sims.length ? h('div', { class: 'grid' }, ...gal.sims.map((t, i) => h('div', { class: 'card' },
        h('div', { class: 'title' }, `${t.first} ${t.last}`), h('div', { class: 'muted' }, t.traits.map(x => registry.trait(x)?.name || x).join(', ')),
        h('div', { class: 'row' }, btn('Charger', () => { const keepId = this.sim.id; this.sim = simFromTemplate(t, this.rng); if (this.opts.mode === 'edit') this.sim.id = keepId; this.refreshModel(); this.render(); close(); }, 'small primary'),
          btn('Supprimer', async () => { gal.sims.splice(i, 1); await setGallery(gal); r(); }, 'small danger'))))) : h('p', { class: 'muted' }, 'Galerie vide.'),
    });
  }

  // ------------------------------------------------------------------ application au monde
  apply() {
    const s = this.sim;
    const W = this.W, g = this.game;
    delete s._rt;
    if (this.opts.mode === 'edit' && this.original) {
      const o = this.original;
      const keep = { id: o.id, pos: o.pos, rot: o.rot, queue: o.queue, needs: o.needs, moodlets: o.moodlets, householdId: o.householdId, memories: o.memories };
      Object.assign(o, JSON.parse(JSON.stringify(s)), keep);
      g.sim.emit('appearance', o);
      this.applyLinks(o);
      W.log('cas', `✏️ ${simName(o)} a été modifié(e) dans le créateur.`, [o.id], { icon: '✏️' });
      return;
    }
    if (this.opts.mode === 'new' && W) {
      const hh = W.household(g.household);
      const sim = JSON.parse(JSON.stringify(s));
      sim.householdId = hh?.id || null;
      const lot = hh ? W.lot(hh.lotId) : null;
      const p = lot ? { x: lot.x + lot.w / 2, y: lot.y + lot.h / 2 } : { x: g.rig.target.x, y: g.rig.target.z };
      g.sim.addSim(sim, p.x, p.y, 0);
      if (hh) hh.members.push(sim.id);
      for (const m of hh?.members || []) if (m !== sim.id) { const r1 = W.rel(m, sim.id), r2 = W.rel(sim.id, m); r1.known = r2.known = true; r1.friend = r2.friend = 30; r1.status = r2.status = 'acquaintance'; }
      this.applyLinks(sim);
      W.log('home', `👋 ${simName(sim)} rejoint le foyer ${hh?.name || ''}.`, [sim.id], { icon: '👋', important: true });
      g.selectSim(sim.id, true);
    }
  }

  applyLinks(sim) {
    const W = this.W;
    if (!W || !this.links) return;
    for (const [oid, st] of Object.entries(this.links)) {
      if (!st || !W.sim(oid)) continue;
      const r1 = W.rel(sim.id, oid), r2 = W.rel(oid, sim.id);
      r1.known = r2.known = true;
      const f = { friend: 45, best_friend: 85, family: 55, rival: -45, enemy: -75, partner: 60, married: 70 }[st];
      r1.friend = r2.friend = f;
      if (['partner', 'married'].includes(st)) { r1.romance = r2.romance = 70; }
      if (st === 'family') r1.flags.family = r2.flags.family = true;
      if (st === 'rival' || st === 'enemy') r1.flags.rivals = r2.flags.rivals = true;
      r1.status = r2.status = st;
    }
  }

  finishHousehold() {
    const W = this.W, g = this.game;
    if (!this.members.includes(this.sim)) this.members.push(this.sim);
    const lots = W.d.lots.filter(l => l.type === 'residential' && !l.householdId);
    if (!lots.length) { toast('Aucun terrain libre : libérez-en un dans le panneau Monde', '⚠️'); return; }
    openModal({
      title: 'Choisir un terrain', icon: '🏡',
      body: (r, close) => h('div', { class: 'col' }, ...lots.map(l => btn(`${l.name} (${l.w}×${l.h})${W.objectsOnLot(l).length ? ' — maison existante' : ' — terrain nu'}`, () => {
        const last = this.members[0].last;
        const hh = { id: uid('hh'), name: `Famille ${last}`, funds: 20000, lotId: l.id, members: [] };
        W.d.households.push(hh);
        l.householdId = hh.id; l.forSale = false; l.name = `Maison ${last}`;
        for (const m of this.members) {
          const sim = JSON.parse(JSON.stringify({ ...m, _rt: undefined }));
          sim.householdId = hh.id;
          g.sim.addSim(sim, l.x + l.w / 2, l.y + l.h / 2, 0);
          hh.members.push(sim.id);
        }
        for (const a of hh.members) for (const b of hh.members) if (a !== b) { const rr = W.rel(a, b); rr.known = true; rr.friend = 50; rr.flags.family = true; rr.status = 'family'; }
        W.log('home', `🏡 Le foyer ${hh.name} s’installe (${hh.members.length} membre(s)).`, hh.members, { icon: '🏡', important: true });
        g.household = hh.id; W.d.activeHousehold = hh.id;
        g.selected = hh.members[0];
        close();
        this.close(false);
        g.rig.focus(l.x + l.w / 2, l.y + l.h / 2, 30);
        if (!W.objectsOnLot(l).length) toast('Terrain nu : passez en mode Construction pour bâtir votre maison !', '🔨');
      }))),
    });
  }
}

function sel(values, cur, onChange, labels = {}) {
  return h('select', { onchange: e => onChange(e.target.value) }, ...values.map(v => h('option', { value: v, selected: v === cur }, labels[v] ?? v)));
}

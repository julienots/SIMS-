// Modes Construction et Achat : murs, pièces, portes et fenêtres, sols, peinture, terrain, escaliers,
// toits, démolition, copie de bâtiments/quartiers, modèles de maisons, catalogue d'objets.
import * as THREE from 'three';
import { h, btn, toast, promptBox, setFocus, focusFirst, usingPadRef } from './dom.js';
import { registry } from '../mods/registry.js';
import { OPENINGS, WALL_STYLES, FLOOR_STYLES } from '../sim/data/objects.js';
import { LEVEL_HEIGHT, LEVELS } from '../sim/world.js';
import { objectModel } from '../render/assets.js';
import { formatMoney, uid, clamp } from '../core/util.js';
import { getGallery, setGallery } from '../save/storage.js';
import { PAD } from '../engine/input.js';
import { sfx } from '../engine/audio.js';

const BUILD_TOOLS = [
  ['room', '🟫', 'Pièce'], ['wall', '🧱', 'Mur'], ['delwall', '❌', 'Effacer murs'], ['opening', '🚪', 'Portes & fenêtres'],
  ['floor', '🔲', 'Sol'], ['wallpaint', '🎨', 'Peinture murale'], ['terrain', '🌱', 'Terrain'], ['stairs', '🪜', 'Escalier'],
  ['roof', '🏠', 'Toit'], ['delroof', '🏚️', 'Retirer toit'], ['demolish', '💥', 'Démolir zone'], ['copy', '📑', 'Copier / coller'], ['templates', '🏡', 'Modèles de maisons'],
];
const PRICES = { wall: 12, floor: 6, roof: 5, terrain: 1 };

export class BuildMode {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.tool = 'room';
    this.cat = 'salon';
    this.selectedDef = null;
    this.rot = 0;
    this.wallStyle = 'plaster';
    this.floorStyle = 'wood';
    this.terrainPaint = 1;
    this.opening = 'door';
    this.roofStyle = 'gable';
    this.ghost = new THREE.Group();
    this.ghost.renderOrder = 5;
    this.drag = null;
    this.clipboard = null;
    this.moving = null;
  }
  get W() { return this.game.world; }

  setActive(on, mode) {
    this.active = on;
    this.mode = mode;
    this.panel?.remove();
    this.clearGhost();
    this.drag = null; this.moving = null; this.selectedDef = null;
    if (!on) { this.game.scene.remove(this.ghost); return; }
    this.game.scene.add(this.ghost);
    if (mode === 'buy') this.tool = 'buy';
    else if (this.tool === 'buy') this.tool = 'room';
    this.renderPanel();
  }

  free() { return !!this.W.creativeFreeBuild; }
  canEdit(x, y) {
    if (this.free() || this.W.settings.creativeLevel === 'libre') return true;
    const hh = this.W.household(this.game.household);
    const lot = hh && this.W.lot(hh.lotId);
    return !!lot && x >= lot.x && y >= lot.y && x < lot.x + lot.w && y < lot.y + lot.h;
  }
  pay(amount, label) {
    if (this.free() || amount <= 0) return true;
    const hh = this.W.household(this.game.household);
    if (!hh || hh.funds < amount) { toast(`Fonds insuffisants pour ${label} (✦${amount})`, '💸'); sfx('error'); return false; }
    hh.funds -= amount;
    return true;
  }
  refund(amount) { const hh = this.W.household(this.game.household); if (hh && !this.free()) hh.funds += amount; }

  // ------------------------------------------------------------------ panneau d'outils
  renderPanel() {
    this.panel?.remove();
    const g = this.game;
    const isBuy = this.mode === 'buy';
    const p = h('div', { class: 'panel catalog', dataset: { scope: '1' } });
    const head = h('div', { class: 'tool-row' },
      h('b', { style: { fontFamily: 'var(--font-title)', fontSize: '18px', marginRight: '6px' } }, isBuy ? '🛒 Achat' : '🔨 Construction'),
      h('span', { class: 'tag yellow' }, this.free() ? 'Construction gratuite' : formatMoney(this.W.household(g.household)?.funds ?? 0)),
      btn(`Étage : ${g.viewLevel === 0 ? 'RDC' : g.viewLevel}`, () => { g.setViewLevel(g.viewLevel === 0 ? 1 : 0); this.renderPanel(); }, 'small'),
      btn('↩️', () => g.undo(), 'icon small', { title: 'Annuler (Ctrl+Z)' }), btn('↪️', () => g.redo(), 'icon small', { title: 'Rétablir (Ctrl+Y)' }),
      btn('⟳ Pivoter', () => { this.rotate(1); }, 'small', { title: 'R / LB / RB' }),
      btn('✓ Terminer', () => g.setMode('live'), 'small primary', { dataset: { back: '1' } }));
    p.appendChild(head);
    if (isBuy) {
      const cats = h('div', { class: 'tabs' }, ...[...registry.categories.values()].map(c => h('button', { class: `tab ${this.cat === c.id ? 'active' : ''}`, onclick: () => { this.cat = c.id; this.renderPanel(); } }, `${c.icon} ${c.name}`)));
      p.appendChild(cats);
      const items = h('div', { class: 'items' });
      for (const def of registry.objects.values()) {
        if (def.cat !== this.cat || def.hiddenInCatalog) continue;
        items.appendChild(h('button', { class: `item ${this.selectedDef === def.id ? 'selected' : ''}`, onclick: () => this.pickDef(def.id) },
          h('div', { class: 'ic' }, catIcon(def)), h('div', { class: 'nm' }, def.name), h('div', { class: 'pr' }, `✦${def.price}`), def.source !== 'base' ? h('div', { class: 'tag yellow' }, '🧩') : null));
      }
      p.appendChild(items);
      p.appendChild(h('div', { class: 'muted' }, 'Cliquez sur un objet du monde pour le déplacer, Suppr / X pour le vendre (75 % remboursés).'));
    } else {
      p.appendChild(h('div', { class: 'tabs' }, ...BUILD_TOOLS.map(([id, ic, nm]) => h('button', { class: `tab ${this.tool === id ? 'active' : ''}`, onclick: () => this.setTool(id) }, `${ic} ${nm}`))));
      const opts = h('div', { class: 'items' });
      if (this.tool === 'room' || this.tool === 'wall' || this.tool === 'wallpaint') for (const s of WALL_STYLES) opts.appendChild(styleItem(s, this.wallStyle === s.id, () => { this.wallStyle = s.id; this.renderPanel(); }));
      if (this.tool === 'floor' || this.tool === 'room') for (const s of FLOOR_STYLES) opts.appendChild(styleItem({ ...s, name: `Sol : ${s.name}` }, this.floorStyle === s.id, () => { this.floorStyle = s.id; this.renderPanel(); }));
      if (this.tool === 'opening') for (const o of OPENINGS) opts.appendChild(h('button', { class: `item ${this.opening === o.id ? 'selected' : ''}`, onclick: () => { this.opening = o.id; this.renderPanel(); } }, h('div', { class: 'ic' }, o.kind === 'window' ? '🪟' : o.kind === 'arch' ? '⛩️' : '🚪'), h('div', { class: 'nm' }, o.name), h('div', { class: 'pr' }, `✦${o.price}`)));
      if (this.tool === 'terrain') for (const [v, n, c] of [[0, 'Herbe', '#6aa84f'], [1, 'Allée', '#cfc6b4'], [2, 'Sable', '#e6d3a1'], [4, 'Eau', '#3f8fd1']]) opts.appendChild(styleItem({ name: n, color: c }, this.terrainPaint === v, () => { this.terrainPaint = v; this.renderPanel(); }));
      if (this.tool === 'roof') for (const [v, n] of [['gable', 'Toit à deux pans'], ['hip', 'Toit à quatre pans'], ['flat', 'Toit plat']]) opts.appendChild(h('button', { class: `item ${this.roofStyle === v ? 'selected' : ''}`, onclick: () => { this.roofStyle = v; this.renderPanel(); } }, h('div', { class: 'ic' }, v === 'flat' ? '▬' : v === 'hip' ? '🔺' : '🏠'), h('div', { class: 'nm' }, n)));
      if (this.tool === 'templates') this.renderTemplates(opts);
      if (this.tool === 'copy') opts.appendChild(h('div', { class: 'muted', style: { gridColumn: '1/-1' } }, this.clipboard ? `📋 Copie en mémoire : ${this.clipboard.w}×${this.clipboard.h} cases (${this.clipboard.objects.length} objets). Cliquez pour coller. ` : 'Tracez un rectangle pour copier murs, sols, toits et objets.'));
      p.appendChild(opts);
      p.appendChild(h('div', { class: 'muted' }, this.help()));
    }
    document.getElementById('ui').appendChild(p);
    this.panel = p;
  }

  help() {
    return {
      room: 'Glissez pour tracer une pièce (murs + sol).', wall: 'Glissez d’un coin à l’autre pour tracer un mur.', delwall: 'Glissez sur les murs à effacer.',
      opening: 'Cliquez sur un mur pour poser la porte ou la fenêtre.', floor: 'Glissez pour peindre le sol.', wallpaint: 'Cliquez ou glissez le long des murs pour les repeindre.',
      terrain: 'Glissez pour peindre le terrain.', stairs: 'Cliquez pour poser un escalier (il relie l’étage du dessus).', roof: 'Glissez sur une maison pour ajouter un toit.',
      delroof: 'Cliquez sur un toit pour le retirer.', demolish: 'Glissez pour tout démolir dans la zone.', copy: 'Glissez pour copier, puis cliquez pour coller.', templates: 'Enregistrez une maison ou placez un modèle.',
    }[this.tool] || '';
  }

  setTool(t) {
    this.tool = t;
    this.clearGhost();
    this.drag = null;
    if (t === 'stairs') this.selectedDef = 'stairs'; else if (this.mode === 'build') this.selectedDef = null;
    if (t === 'stairs') this.loadGhostModel('stairs');
    this.renderPanel();
  }

  pickDef(id) {
    this.selectedDef = id;
    this.moving = null;
    this.loadGhostModel(id);
    this.renderPanel();
    sfx('click');
  }

  async loadGhostModel(id) {
    this.clearGhost();
    const def = registry.object(id);
    const m = await objectModel(def);
    if (this.selectedDef !== id && this.moving?.def !== id) return;
    m.scale.setScalar(def.scale || 1);
    if (def.wall) m.position.set(0, def.wallY || 0, -0.5 * def.size[1] + 0.02);
    m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.65; o.castShadow = false; } });
    this.ghostModel = m;
    this.ghost.add(m);
    this.ghostBase = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#4cd964', transparent: true, opacity: 0.35, depthWrite: false }));
    this.ghostBase.rotation.x = -Math.PI / 2;
    this.ghost.add(this.ghostBase);
  }

  clearGhost() {
    while (this.ghost.children.length) this.ghost.remove(this.ghost.children[0]);
    this.ghostModel = null; this.ghostBase = null;
  }

  rotate(d) {
    this.rot = (this.rot + d + 4) % 4;
    if (this.moving) this.moving.rot = this.rot;
    sfx('tick');
  }

  cancelTool() {
    if (this.drag) { this.drag = null; this.clearPreview(); return true; }
    if (this.moving) { this.moving = null; this.clearGhost(); return true; }
    if (this.selectedDef) { this.selectedDef = null; this.clearGhost(); this.renderPanel(); return true; }
    return false;
  }

  key(code) {
    if (code === 'KeyR' || code === 'Comma' || code === 'Period') { this.rotate(code === 'Comma' ? -1 : 1); return true; }
    if (code === 'Delete' || code === 'Backspace') { this.deleteHovered(); return true; }
    return false;
  }

  // ------------------------------------------------------------------ pointeur
  tileAt(x, y) { return this.game.groundTile(x, y, this.game.viewLevel); }

  hover(e) { this.hoverPos = { x: e.x, y: e.y }; }

  tap(e) {
    const t = this.tileAt(e.x, e.y);
    if (!t) return;
    if (this.mode === 'buy' || this.tool === 'stairs') { this.placeOrPick(t, e); return; }
    if (this.tool === 'opening') this.placeOpening(t);
    else if (this.tool === 'wallpaint') this.paintWallAt(t);
    else if (this.tool === 'delroof') this.deleteRoofAt(t);
    else if (this.tool === 'copy' && this.clipboard) this.paste(t);
    else if (['room', 'floor', 'terrain', 'roof', 'demolish', 'copy', 'wall', 'delwall'].includes(this.tool)) { this.drag = { start: t, end: t }; this.dragEnd(e); }
  }

  onDrag(e) {
    const t = this.tileAt(e.x, e.y);
    if (!t) return;
    if (this.mode === 'buy') return;
    if (this.tool === 'wallpaint') { this.paintWallAt(t, true); return; }
    if (!this.drag) { const s = this.tileAt(e.sx, e.sy); this.drag = { start: s || t, end: t }; }
    this.drag.end = t;
    this.preview();
  }

  dragEnd() {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    this.clearPreview();
    switch (this.tool) {
      case 'room': this.buildRoom(d); break;
      case 'wall': this.buildWalls(d, false); break;
      case 'delwall': this.buildWalls(d, true); break;
      case 'floor': this.paintFloor(d); break;
      case 'terrain': this.paintTerrain(d); break;
      case 'roof': this.addRoof(d); break;
      case 'demolish': this.demolish(d); break;
      case 'copy': this.copy(d); break;
    }
  }

  // Manette : curseur au centre / curseur au sol.
  pad(p, scr, dt) {
    if (p.pressed[PAD.Y]) { this.game.ui.hud.setHudNav(true); return; }
    if (p.pressed[PAD.LB]) this.rotate(-1);
    if (p.pressed[PAD.RB]) this.rotate(1);
    if (p.pressed[PAD.X]) this.deleteHovered();
    if (p.pressed[PAD.B]) { if (!this.cancelTool()) this.game.setMode('live'); return; }
    this.hoverPos = { x: scr.x, y: scr.y };
    const t = this.tileAt(scr.x, scr.y);
    if (!t) return;
    const dragTools = ['room', 'wall', 'delwall', 'floor', 'terrain', 'roof', 'demolish'].includes(this.tool) || (this.tool === 'copy' && !this.clipboard);
    if (this.mode === 'build' && dragTools) {
      if (p.pressed[PAD.A]) this.drag = { start: t, end: t };
      else if (p.buttons[PAD.A] && this.drag) { this.drag.end = t; this.preview(); }
      else if (!p.buttons[PAD.A] && this.drag) this.dragEnd();
      return;
    }
    if (p.pressed[PAD.A]) this.tap(scr);
  }

  // ------------------------------------------------------------------ image par image : fantôme
  frame() {
    if (!this.hoverPos) return;
    const t = this.tileAt(this.hoverPos.x, this.hoverPos.y);
    if (!t) return;
    const defId = this.moving?.def || this.selectedDef;
    if (defId && this.ghostModel) {
      const def = registry.object(defId);
      const rot = this.moving ? this.moving.rot : this.rot;
      const fw = rot % 2 ? def.size[1] : def.size[0], fd = rot % 2 ? def.size[0] : def.size[1];
      const x = t.x - Math.floor((fw - 1) / 2), y = t.y - Math.floor((fd - 1) / 2);
      this.ghostTile = { x, y, rot };
      this.ghost.position.set(x + fw / 2, this.game.viewLevel * LEVEL_HEIGHT + 0.02, y + fd / 2);
      this.ghost.rotation.y = -rot * Math.PI / 2;
      const ok = this.W.canPlace(defId, x, y, rot, this.game.viewLevel, this.moving?.id).ok && this.canEdit(x, y);
      if (this.ghostBase) { this.ghostBase.scale.set(def.size[0], def.size[1], 1); this.ghostBase.material.color.set(ok ? '#4cd964' : '#ff5a5f'); }
      this.ghost.visible = true;
    } else if (this.mode === 'build' && !this.drag) {
      // Marqueur de case.
      if (!this.cellMarker) {
        this.cellMarker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffcf2e', transparent: true, opacity: 0.35, depthWrite: false }));
        this.cellMarker.rotation.x = -Math.PI / 2;
        this.ghost.add(this.cellMarker);
      }
      this.ghost.position.set(0, 0, 0); this.ghost.rotation.y = 0;
      const corner = ['wall', 'room', 'delwall', 'roof'].includes(this.tool);
      this.cellMarker.position.set(corner ? Math.round(t.fx) : t.x + 0.5, this.game.viewLevel * LEVEL_HEIGHT + 0.05, corner ? Math.round(t.fz) : t.y + 0.5);
      this.cellMarker.scale.setScalar(corner ? 0.4 : 1);
      this.ghost.visible = true;
    }
  }

  // ------------------------------------------------------------------ achat / placement d'objets
  placeOrPick(t) {
    const W = this.W, g = this.game;
    const level = g.viewLevel;
    if (this.moving) {
      const m = this.moving, gt = this.ghostTile;
      if (!gt) return;
      if (!W.canPlace(m.def, gt.x, gt.y, m.rot, level, m.id).ok || !this.canEdit(gt.x, gt.y)) { sfx('error'); toast(W.canPlace(m.def, gt.x, gt.y, m.rot, level, m.id).why || 'Hors de votre terrain', '⛔'); return; }
      g.snapshot('Déplacer un objet');
      W.moveObject(m.id, gt.x, gt.y, m.rot, level);
      this.moving = null; this.clearGhost(); sfx('place');
      return;
    }
    if (this.selectedDef) {
      const def = registry.object(this.selectedDef);
      const gt = this.ghostTile || { x: t.x, y: t.y, rot: this.rot };
      const chk = W.canPlace(def.id, gt.x, gt.y, this.rot, level);
      if (!chk.ok) { toast(chk.why, '⛔'); sfx('error'); return; }
      if (!this.canEdit(gt.x, gt.y)) { toast('Vous ne pouvez construire que sur le terrain de votre foyer (ou activez la construction gratuite du mode créatif).', '⛔'); return; }
      if (!this.pay(def.price, def.name)) return;
      g.snapshot(`Acheter ${def.name}`);
      W.addObject(def.id, gt.x, gt.y, this.rot, level);
      sfx('place');
      if (def.stairs) this.game.sim.nav.refresh();
      return;
    }
    // Sélection d'un objet existant pour le déplacer.
    const hit = g.pick(this.hoverPos?.x ?? 0, this.hoverPos?.y ?? 0);
    const o = hit?.type === 'object' ? hit.obj : W.objectAtTile(level, t.x, t.y);
    if (o) {
      if (!this.canEdit(o.x, o.y)) { toast('Cet objet n’est pas sur votre terrain', '⛔'); return; }
      this.moving = { id: o.id, def: o.def, rot: o.rot };
      this.rot = o.rot;
      this.loadGhostModel(o.def);
      toast(`Déplacement : ${registry.object(o.def)?.name || o.def} (Suppr pour vendre)`, '✋');
    }
  }

  deleteHovered() {
    const W = this.W, g = this.game;
    let o = this.moving ? W.obj(this.moving.id) : null;
    if (!o && this.hoverPos) { const hit = g.pick(this.hoverPos.x, this.hoverPos.y); if (hit?.type === 'object') o = hit.obj; }
    if (!o) return;
    if (!this.canEdit(o.x, o.y)) { toast('Cet objet n’est pas sur votre terrain', '⛔'); return; }
    const def = registry.object(o.def);
    g.snapshot(`Vendre ${def?.name || 'objet'}`);
    W.removeObject(o.id);
    const ref = Math.round((def?.price || 0) * 0.75);
    this.refund(ref);
    this.moving = null; this.clearGhost();
    toast(`${def?.name || 'Objet'} vendu (✦${ref})`, '💰'); sfx('money');
  }

  // ------------------------------------------------------------------ construction
  rectOf(d) {
    const x0 = Math.min(d.start.x, d.end.x), x1 = Math.max(d.start.x, d.end.x) + 1;
    const y0 = Math.min(d.start.y, d.end.y), y1 = Math.max(d.start.y, d.end.y) + 1;
    return { x0, y0, x1, y1 };
  }
  editableRect(r) {
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) if (!this.canEdit(x, y)) return false;
    return true;
  }
  structureChanged() { const wv = this.game.worldView; wv._dirty = true; wv.rebuildStructure(); this.W.rebuildOccupancy(); this.renderPanel(); }

  buildRoom(d) {
    const r = this.rectOf(d), W = this.W, l = this.game.viewLevel;
    if (r.x1 - r.x0 < 2 || r.y1 - r.y0 < 2) { toast('Une pièce doit faire au moins 2×2 cases', 'ℹ️'); return; }
    if (!this.editableRect(r)) { toast('Hors de votre terrain', '⛔'); return; }
    const perim = 2 * ((r.x1 - r.x0) + (r.y1 - r.y0)), tiles = (r.x1 - r.x0) * (r.y1 - r.y0);
    if (!this.pay(perim * PRICES.wall + tiles * PRICES.floor, 'la pièce')) return;
    this.game.snapshot('Construire une pièce');
    for (let x = r.x0; x < r.x1; x++) { setW(W, l, 'h', x, r.y0, this.wallStyle); setW(W, l, 'h', x, r.y1, this.wallStyle); }
    for (let y = r.y0; y < r.y1; y++) { setW(W, l, 'v', r.x0, y, this.wallStyle); setW(W, l, 'v', r.x1, y, this.wallStyle); }
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) W.setFloor(l, x, y, this.floorStyle);
    sfx('place');
    this.structureChanged();
    toast('Pièce construite. Pensez à ajouter une porte !', '🟫');
  }

  wallLine(d) {
    // Coins de la grille (valeurs arrondies), ligne horizontale ou verticale.
    const a = { x: Math.round(d.start.fx), y: Math.round(d.start.fz) }, b = { x: Math.round(d.end.fx), y: Math.round(d.end.fz) };
    const segs = [];
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) { for (let x = Math.min(a.x, b.x); x < Math.max(a.x, b.x); x++) segs.push(['h', x, a.y]); }
    else for (let y = Math.min(a.y, b.y); y < Math.max(a.y, b.y); y++) segs.push(['v', a.x, y]);
    return segs;
  }

  buildWalls(d, del) {
    const W = this.W, l = this.game.viewLevel;
    const segs = this.wallLine(d).filter(([dir, x, y]) => this.canEdit(x, y) || this.canEdit(dir === 'h' ? x : x - 1, dir === 'h' ? y - 1 : y));
    if (!segs.length) return;
    if (!del && !this.pay(segs.length * PRICES.wall, 'les murs')) return;
    this.game.snapshot(del ? 'Effacer des murs' : 'Construire des murs');
    for (const [dir, x, y] of segs) { if (del) { if (W.getWall(l, dir, x, y)) this.refund(PRICES.wall / 2); W.setWall(l, dir, x, y, null); } else setW(W, l, dir, x, y, this.wallStyle); }
    sfx('place');
    this.structureChanged();
  }

  nearestEdge(t) {
    const fx = t.fx - t.x, fz = t.fz - t.y;
    const opts = [['h', t.x, t.y, fz], ['h', t.x, t.y + 1, 1 - fz], ['v', t.x, t.y, fx], ['v', t.x + 1, t.y, 1 - fx]];
    opts.sort((a, b) => a[3] - b[3]);
    return opts[0];
  }

  placeOpening(t) {
    const W = this.W, l = this.game.viewLevel;
    const [dir, x, y] = this.nearestEdge(t);
    const wall = W.getWall(l, dir, x, y);
    if (!wall) { toast('Cliquez sur un mur existant', 'ℹ️'); return; }
    if (!this.canEdit(x, y) && !this.canEdit(dir === 'h' ? x : x - 1, dir === 'h' ? y - 1 : y)) { toast('Hors de votre terrain', '⛔'); return; }
    const o = OPENINGS.find(q => q.id === this.opening);
    if (wall.opening?.id === o.id) { this.game.snapshot('Retirer une ouverture'); wall.opening = null; W._navDirty = true; W.navVersion++; this.structureChanged(); return; }
    if (!this.pay(o.price, o.name)) return;
    this.game.snapshot(`Poser ${o.name}`);
    wall.opening = { kind: o.kind, id: o.id };
    W._navDirty = true; W.navVersion = (W.navVersion || 0) + 1;
    sfx('place');
    this.structureChanged();
  }

  paintWallAt(t, dragging) {
    const W = this.W, l = this.game.viewLevel;
    const [dir, x, y] = this.nearestEdge(t);
    const wall = W.getWall(l, dir, x, y);
    if (!wall || wall.style === this.wallStyle) return;
    if (!dragging || !this.paintSnap) { this.game.snapshot('Peindre des murs'); this.paintSnap = true; setTimeout(() => { this.paintSnap = false; }, 800); }
    wall.style = this.wallStyle;
    this.game.worldView._dirty = true; this.game.worldView.rebuildStructure();
  }

  paintFloor(d) {
    const r = this.rectOf(d), W = this.W, l = this.game.viewLevel;
    if (!this.editableRect(r)) { toast('Hors de votre terrain', '⛔'); return; }
    const n = (r.x1 - r.x0) * (r.y1 - r.y0);
    if (!this.pay(n * PRICES.floor, 'le sol')) return;
    this.game.snapshot('Poser un sol');
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) W.setFloor(l, x, y, this.floorStyle);
    sfx('place');
    this.structureChanged();
  }

  paintTerrain(d) {
    const r = this.rectOf(d), W = this.W;
    if (!this.editableRect(r)) { toast('Hors de votre terrain', '⛔'); return; }
    this.game.snapshot('Peindre le terrain');
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) if (!W.isRoad(x, y)) W.setTerrain(x, y, this.terrainPaint);
    W.rebuildOccupancy();
    this.game.worldView.buildTerrain();
    sfx('place');
  }

  addRoof(d) {
    const W = this.W, l = this.game.viewLevel;
    const a = { x: Math.round(d.start.fx), y: Math.round(d.start.fz) }, b = { x: Math.round(d.end.fx), y: Math.round(d.end.fz) };
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), hh = Math.abs(b.y - a.y);
    if (w < 2 || hh < 2) { toast('Tracez le toit d’un coin du bâtiment à l’autre', 'ℹ️'); return; }
    if (!this.pay(w * hh * PRICES.roof, 'le toit')) return;
    this.game.snapshot('Ajouter un toit');
    W.d.roofs.push({ id: uid('roof'), level: l, x: x0, y: y0, w, h: hh, style: this.roofStyle, color: '#8b3a2f' });
    this.game.worldView.buildRoofs();
    if (this.game.worldView.wallMode !== 'up') toast('Toit ajouté (visible en mode « murs hauts », touche V)', '🏠');
    sfx('place');
  }

  deleteRoofAt(t) {
    const W = this.W;
    const r = W.d.roofs.find(r => t.x >= r.x && t.y >= r.y && t.x < r.x + r.w && t.y < r.y + r.h);
    if (!r) { toast('Aucun toit ici', 'ℹ️'); return; }
    this.game.snapshot('Retirer un toit');
    W.d.roofs = W.d.roofs.filter(x => x !== r);
    this.game.worldView.buildRoofs();
  }

  demolish(d) {
    const r = this.rectOf(d), W = this.W, l = this.game.viewLevel;
    if (!this.editableRect(r)) { toast('Hors de votre terrain', '⛔'); return; }
    this.game.snapshot('Démolir');
    for (const k of Object.keys(W.d.walls)) {
      const [lv, dir, xs, ys] = k.split('|'); const x = +xs, y = +ys;
      if (+lv !== l) continue;
      if (dir === 'h' && x >= r.x0 && x < r.x1 && y >= r.y0 && y <= r.y1) delete W.d.walls[k];
      if (dir === 'v' && y >= r.y0 && y < r.y1 && x >= r.x0 && x <= r.x1) delete W.d.walls[k];
    }
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) W.setFloor(l, x, y, null);
    for (const o of [...W.objects]) if ((o.level || 0) === l && o.x >= r.x0 && o.x < r.x1 && o.y >= r.y0 && o.y < r.y1 && !registry.object(o.def)?.building) { this.refund(Math.round((registry.object(o.def)?.price || 0) * 0.5)); W.removeObject(o.id); }
    W.d.roofs = W.d.roofs.filter(rf => !(rf.x >= r.x0 - 1 && rf.y >= r.y0 - 1 && rf.x + rf.w <= r.x1 + 1 && rf.y + rf.h <= r.y1 + 1));
    sfx('error');
    this.structureChanged();
    this.game.worldView.buildRoofs();
  }

  // ------------------------------------------------------------------ copie / modèles
  captureRegion(r, level = 0) {
    const W = this.W;
    const data = { w: r.x1 - r.x0, h: r.y1 - r.y0, walls: [], floors: [], objects: [], roofs: [] };
    for (const [k, v] of Object.entries(W.d.walls)) {
      const [lv, dir, xs, ys] = k.split('|'); const x = +xs, y = +ys;
      const inside = dir === 'h' ? x >= r.x0 && x < r.x1 && y >= r.y0 && y <= r.y1 : y >= r.y0 && y < r.y1 && x >= r.x0 && x <= r.x1;
      if (inside) data.walls.push({ l: +lv, dir, x: x - r.x0, y: y - r.y0, w: JSON.parse(JSON.stringify(v)) });
    }
    for (const [k, v] of Object.entries(W.d.floors)) { const [lv, xs, ys] = k.split('|'); const x = +xs, y = +ys; if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) data.floors.push({ l: +lv, x: x - r.x0, y: y - r.y0, s: v }); }
    for (const o of W.objects) if (o.x >= r.x0 && o.x < r.x1 && o.y >= r.y0 && o.y < r.y1 && !registry.object(o.def)?.temporary && o.def !== 'meal_plate') data.objects.push({ def: o.def, x: o.x - r.x0, y: o.y - r.y0, rot: o.rot, level: o.level || 0 });
    for (const rf of W.d.roofs) if (rf.x >= r.x0 - 1 && rf.y >= r.y0 - 1 && rf.x + rf.w <= r.x1 + 1 && rf.y + rf.h <= r.y1 + 1) data.roofs.push({ ...rf, x: rf.x - r.x0, y: rf.y - r.y0 });
    void level;
    return data;
  }

  copy(d) {
    const r = this.rectOf(d);
    this.clipboard = this.captureRegion(r);
    toast(`Zone copiée (${this.clipboard.objects.length} objets). Cliquez pour coller.`, '📋');
    this.renderPanel();
  }

  paste(t, data = this.clipboard, label = 'Coller') {
    const W = this.W;
    const r = { x0: t.x, y0: t.y, x1: t.x + data.w, y1: t.y + data.h };
    if (r.x1 > W.w || r.y1 > W.h) { toast('La copie dépasse de la carte', '⛔'); return false; }
    if (!this.editableRect(r)) { toast('Zone hors de votre terrain (activez la construction gratuite pour coller ailleurs)', '⛔'); return false; }
    const cost = data.objects.reduce((a, o) => a + (registry.object(o.def)?.price || 0), 0) + data.walls.length * PRICES.wall + data.floors.length * PRICES.floor;
    if (!this.pay(cost, label.toLowerCase())) return false;
    this.game.snapshot(label);
    for (const wl of data.walls) W.setWall(wl.l, wl.dir, wl.x + t.x, wl.y + t.y, JSON.parse(JSON.stringify(wl.w)));
    for (const f of data.floors) W.setFloor(f.l, f.x + t.x, f.y + t.y, f.s);
    let skipped = 0;
    for (const o of data.objects) { if (!registry.object(o.def)) { skipped++; continue; } if (W.canPlace(o.def, o.x + t.x, o.y + t.y, o.rot, o.level).ok) W.addObject(o.def, o.x + t.x, o.y + t.y, o.rot, o.level); else skipped++; }
    for (const rf of data.roofs) W.d.roofs.push({ ...rf, id: uid('roof'), x: rf.x + t.x, y: rf.y + t.y });
    this.structureChanged();
    this.game.worldView.buildRoofs();
    toast(`${label} : ${data.objects.length - skipped} objets posés${skipped ? `, ${skipped} ignorés (emplacement occupé ou mod absent)` : ''}`, '📋');
    sfx('place');
    return true;
  }

  async renderTemplates(container) {
    const gal = await getGallery();
    container.appendChild(btn('💾 Enregistrer la maison du foyer comme modèle', () => this.saveHouseTemplate(), 'small'));
    for (const t of gal.houses) container.appendChild(h('button', { class: 'item', onclick: () => { this.clipboard = t.data; this.tool = 'copy'; this.renderPanel(); toast(`Modèle « ${t.name} » prêt : cliquez pour le placer`, '🏡'); } }, h('div', { class: 'ic' }, '🏡'), h('div', { class: 'nm' }, t.name), h('div', { class: 'pr' }, `${t.data.w}×${t.data.h}`)));
  }

  async saveHouseTemplate() {
    const hh = this.W.household(this.game.household);
    const lot = hh && this.W.lot(hh.lotId);
    if (!lot) { toast('Votre foyer n’a pas de terrain', '⛔'); return; }
    const name = await promptBox('Nom du modèle de maison', `Maison ${hh.name}`);
    if (!name) return;
    const data = this.captureRegion({ x0: lot.x, y0: lot.y, x1: lot.x + lot.w, y1: lot.y + lot.h });
    const gal = await getGallery();
    gal.houses.push({ id: uid('house'), name, data, savedAt: Date.now() });
    await setGallery(gal);
    toast(`Modèle « ${name} » enregistré dans la galerie`, '🏡');
    this.renderPanel();
  }

  // ------------------------------------------------------------------ aperçus de tracé
  preview() {
    this.clearPreview();
    const d = this.drag;
    if (!d) return;
    const l = this.game.viewLevel;
    const grp = new THREE.Group();
    const okCol = this.tool === 'demolish' || this.tool === 'delwall' ? '#ff5a5f' : '#4cd964';
    if (['wall', 'delwall'].includes(this.tool)) {
      for (const [dir, x, y] of this.wallLine(d)) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(dir === 'h' ? 1 : 0.16, 2.6, dir === 'h' ? 0.16 : 1), new THREE.MeshBasicMaterial({ color: okCol, transparent: true, opacity: 0.45 }));
        m.position.set(dir === 'h' ? x + 0.5 : x, l * LEVEL_HEIGHT + 1.3, dir === 'h' ? y : y + 0.5);
        grp.add(m);
      }
    } else {
      const r = this.tool === 'roof' ? { x0: Math.min(Math.round(d.start.fx), Math.round(d.end.fx)), y0: Math.min(Math.round(d.start.fz), Math.round(d.end.fz)), x1: Math.max(Math.round(d.start.fx), Math.round(d.end.fx)), y1: Math.max(Math.round(d.start.fz), Math.round(d.end.fz)) } : this.rectOf(d);
      const ok = this.editableRect(r);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.1, r.x1 - r.x0), Math.max(0.1, r.y1 - r.y0)), new THREE.MeshBasicMaterial({ color: ok ? okCol : '#ff5a5f', transparent: true, opacity: 0.35, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((r.x0 + r.x1) / 2, l * LEVEL_HEIGHT + 0.08 + (this.tool === 'roof' ? LEVEL_HEIGHT : 0), (r.y0 + r.y1) / 2);
      grp.add(m);
      if (this.tool === 'room') {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(r.x1 - r.x0, 2.6, r.y1 - r.y0)), new THREE.LineBasicMaterial({ color: '#ffffff' }));
        edges.position.set((r.x0 + r.x1) / 2, l * LEVEL_HEIGHT + 1.3, (r.y0 + r.y1) / 2);
        grp.add(edges);
      }
      this.sizeLabel = `${r.x1 - r.x0} × ${r.y1 - r.y0}`;
    }
    this.previewGroup = grp;
    this.game.scene.add(grp);
  }
  clearPreview() { if (this.previewGroup) { this.game.scene.remove(this.previewGroup); this.previewGroup = null; } }
}

function setW(W, l, dir, x, y, style) {
  const ex = W.getWall(l, dir, x, y);
  if (ex) { ex.style = style; return; }
  W.setWall(l, dir, x, y, { style });
}
function styleItem(s, selected, onclick) {
  return h('button', { class: `item ${selected ? 'selected' : ''}`, onclick }, h('div', { class: 'ic' }, h('span', { class: 'swatch', style: { background: s.color, display: 'inline-block' } })), h('div', { class: 'nm' }, s.name));
}
export function catIcon(def) {
  const map = { couch: '🛋️', armchair: '💺', tv: '📺', stereo: '📻', bookshelf: '📚', fridge: '🧊', stove: '🍳', oven: '♨️', counter: '🗄️', sink: '🚰', table: '🍽️', chair: '🪑', stool: '🪑', bed: '🛏️', dresser: '🗄️', crib: '👶', toilet: '🚽', shower: '🚿', bathtub: '🛁', computer: '💻', desk: '🗃️', easel: '🎨', guitar: '🎸', piano: '🎹', treadmill: '🏃', punching: '🥊', chess: '♟️', arcade: '🕹️', podium: '🎤', grill: '🔥', garden: '🥕', bench: '🪑', fountain: '⛲', tree: '🌳', pine: '🌲', bush: '🌿', flowers: '🌷', cactus: '🌵', rug: '🟫', frame: '🖼️', shelf: '📦', cabinet: '🗄️', lamp: '💡', ceiling: '💡', streetlight: '🏮', toolbench: '🔧', trash: '🗑️', venue: '🏢', car: '🚗', hydrant: '🚒', watertower: '🗼', space: '🚀', resto: '🍽️', towels: '🧺', wall: '🗄️', nightstand: '🛏️', sp_dummy: '🎯', sp_crystal: '💎', sp_statue: '🗿', wok: '🥢', pizza: '🍕', stairs: '🪜' };
  for (const k in map) if (def.id.startsWith(k)) return map[k];
  return def.icon || '📦';
}
export { clamp, LEVELS, setFocus, focusFirst, usingPadRef };

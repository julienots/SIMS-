// Contrôleur principal : rendu Three.js, monde, simulation, modes de jeu, sélection, contrôle direct,
// entrées (souris / tactile / clavier / manette), sauvegardes et annulation.
import * as THREE from 'three';
import { CameraRig, CAM_MODES } from './render/camera.js';
import { WorldView } from './render/worldview.js';
import { SimView } from './render/simview.js';
import { Simulation, simName } from './sim/simulation.js';
import { World, LEVEL_HEIGHT, LEVELS } from './sim/world.js';
import { registry } from './mods/registry.js';
import { mods } from './mods/manager.js';
import { PAD } from './engine/input.js';
import { saveWorld } from './save/storage.js';
import { toast, modalCount, activeScope, moveFocus, activateFocus, backAction, cycleTabs, usingPadRef, setFocus, focusables } from './ui/dom.js';
import { sfx } from './engine/audio.js';
import { clamp } from './core/util.js';

export class Game {
  constructor(canvas, input, settings) {
    this.canvas = canvas;
    this.input = input;
    this.settings = settings;
    this.quality = qualityPreset(settings.quality || 'auto');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.aa, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = settings.style === 'realiste' ? 0.95 : 1.1;
    this.scene = new THREE.Scene();
    this.rig = new CameraRig(innerWidth / innerHeight);
    this.mode = 'menu';
    this.simViews = new Map();
    this.selected = null;
    this.hover = null;
    this.cursor = { x: 0, z: 0, active: false };
    this.undoStack = []; this.redoStack = [];
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.listeners = [];
    this.ui = {};
    this.fps = 60;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.bindInput();
    // Curseur au sol (manette).
    this.cursorMesh = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 28), new THREE.MeshBasicMaterial({ color: '#ffcf2e', transparent: true, opacity: 0.9, depthTest: false }));
    this.cursorMesh.rotation.x = -Math.PI / 2;
    this.cursorMesh.renderOrder = 20;
    this.cursorMesh.visible = false;
    this.scene.add(this.cursorMesh);
    // Scène de fond du menu.
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
    if (this.casCamera) { this.casCamera.aspect = w / h; this.casCamera.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------------ chargement d'un monde
  async startWorld(world) {
    this.stopWorld();
    const rep = mods.applyToRegistry(world);
    for (const p of rep.problems) toast(p.text, p.level === 'error' ? '⛔' : '⚠️');
    this.world = world;
    this.sim = new Simulation(world);
    // Règles de pouvoirs du mod SUPERPOWERS : distribution initiale si besoin.
    const sp = world.d.mods.data['superessence.superpowers'];
    if (registry.hasPowers() && (!sp || !sp.distributed)) this.sim.powers.distribute(sp?.distribution || 'few');
    this.worldView = new WorldView(this.scene, world, this.sim, this.quality);
    this.rig.bounds = { w: world.w, h: world.h };
    for (const s of world.sims) this.addSimView(s);
    this.listeners = [
      this.sim.on('simAdded', s => this.addSimView(s)),
      this.sim.on('simRemoved', s => this.removeSimView(s.id)),
      this.sim.on('notify', n => { toast(n.text, n.icon, () => n.sim && this.selectSim(n.sim, true)); sfx('notify'); }),
      this.sim.on('dialog', d => this.ui.hud?.showDialog(d)),
      this.sim.on('pickDestination', ({ sim, action }) => this.ui.hud?.pickDestination(sim, action)),
      this.sim.on('timeStopped', () => document.body.appendChild(Object.assign(document.createElement('div'), { className: 'timestop-tint', id: 'tstint' }))),
      this.sim.on('timeResumed', () => document.getElementById('tstint')?.remove()),
      this.sim.on('powerUsed', () => sfx('power')),
      world.on('journal', e => { if (e.important) this.ui.hud?.onJournal(e); }),
    ];
    // Foyer joué : le premier foyer, ou celui mémorisé.
    this.household = world.d.activeHousehold && world.household(world.d.activeHousehold) ? world.d.activeHousehold : world.d.households[0]?.id;
    world.d.activeHousehold = this.household;
    const hh = world.household(this.household);
    const first = hh ? world.sim(hh.members.find(id => world.sim(id)?.stage !== 'baby') || hh.members[0]) : world.sims[0];
    if (first) { this.selected = first.id; this.rig.focus(first.pos.x, first.pos.y, 24); this.rig.target.copy(this.rig.goal); }
    else this.rig.focus(world.w / 2, world.h / 2, 60);
    this.cursor = { x: this.rig.goal.x, z: this.rig.goal.z, active: false };
    this.mode = 'live';
    this.setViewLevel(0);
    this.ui.hud?.mount(this);
    this.ui.hud?.refresh();
    this.lastAutosave = performance.now();
  }

  stopWorld() {
    if (!this.world) return;
    this.listeners.forEach(u => u());
    this.listeners = [];
    for (const v of this.simViews.values()) v.dispose();
    this.simViews.clear();
    this.worldView?.dispose();
    this.worldView = null;
    this.world = null; this.sim = null; this.selected = null;
    this.ui.hud?.unmount();
    this.undoStack = []; this.redoStack = [];
  }

  addSimView(s) { if (!this.simViews.has(s.id)) this.simViews.set(s.id, new SimView(s, this.scene)); }
  removeSimView(id) { this.simViews.get(id)?.dispose(); this.simViews.delete(id); if (this.selected === id) this.selected = null; }

  householdSims() {
    const hh = this.world?.household(this.household);
    return hh ? hh.members.map(id => this.world.sim(id)).filter(Boolean) : [];
  }
  selectedSim() { return this.selected ? this.world?.sim(this.selected) : null; }

  selectSim(id, focus) {
    const s = this.world.sim(id);
    if (!s) return;
    this.selected = id;
    if (focus) { this.rig.focus(s.pos.x, s.pos.y); }
    this.ui.hud?.refresh();
    sfx('click');
  }
  cycleSim(d = 1) {
    const list = this.householdSims().filter(s => s.stage !== 'baby');
    if (!list.length) return;
    const i = list.findIndex(s => s.id === this.selected);
    this.selectSim(list[(i + d + list.length) % list.length].id, true);
  }

  setViewLevel(l) {
    this.viewLevel = clamp(l, 0, LEVELS - 1);
    this.worldView?.setViewLevel(this.viewLevel);
    this.ui.hud?.refresh();
  }

  setMode(mode) {
    if (!this.world) return;
    const prev = this.mode;
    if (prev === mode) return;
    if (this.controlledSim) this.toggleDirectControl(false);
    // Les modes construction / achat / création mettent la simulation en pause (comme dans une simulation de vie classique).
    if (['build', 'buy', 'cas'].includes(mode) && !['build', 'buy', 'cas'].includes(prev)) { this.pausedSpeed = this.sim.speedIdx; this.sim.setSpeed(0); }
    if (!['build', 'buy', 'cas'].includes(mode) && ['build', 'buy', 'cas'].includes(prev)) this.sim.setSpeed(this.pausedSpeed ?? 1);
    this.mode = mode;
    if (mode === 'build' || mode === 'buy') { this.rig.setMode('build'); if (this.worldView.wallMode === 'up') this.worldView.setWallMode('cutaway'); }
    else if (prev === 'build' || prev === 'buy') this.rig.setMode('free');
    this.ui.build?.setActive(mode === 'build' || mode === 'buy', mode);
    this.ui.hud?.refresh();
  }

  // ------------------------------------------------------------------ contrôle direct
  get controlledSim() { return this.sim?.controlled ? this.world.sim(this.sim.controlled) : null; }
  toggleDirectControl(on) {
    if (!this.world) return;
    const s = this.selectedSim();
    if (on === undefined) on = !this.sim.controlled;
    if (on && (!s || s.stage === 'baby')) return;
    if (on && !this.world.settings.directControl) { toast('Le contrôle direct est désactivé dans les règles de ce monde.', '🕹️'); return; }
    if (on) {
      this.sim.dropAll(s);
      this.sim.controlled = s.id;
      this.prevCamMode = this.rig.mode;
      this.rig.setMode('third');
      toast(`Contrôle direct de ${s.first}`, '🕹️');
    } else {
      this.sim.controlled = null;
      this.sim.controlInput = null;
      this.rig.setMode(this.prevCamMode && this.prevCamMode !== 'third' ? this.prevCamMode : 'follow');
    }
    this.ui.hud?.refresh();
  }

  // Objet ou sim le plus proche du sim contrôlé (pour « Interagir »).
  nearestInteractable(s) {
    let best = null, bd = 2.6;
    for (const o of this.world.sims) {
      if (o.id === s.id || o._rt.hidden || o.pos.l !== s.pos.l) continue;
      const d = Math.hypot(o.pos.x - s.pos.x, o.pos.y - s.pos.y);
      if (d < bd) { bd = d; best = { type: 'sim', sim: o }; }
    }
    for (const o of this.world.objects) {
      const def = registry.object(o.def);
      if (!def?.aff?.length || (o.level || 0) !== s.pos.l) continue;
      const f = this.world.footprint(o);
      const cx = clamp(s.pos.x, f.x, f.x + f.w), cy = clamp(s.pos.y, f.y, f.y + f.d);
      const d = Math.hypot(cx - s.pos.x, cy - s.pos.y);
      if (d < bd) { bd = d; best = { type: 'object', obj: o }; }
    }
    return best;
  }

  // ------------------------------------------------------------------ sélection / picking
  ndc(x, y) { return new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); }

  pick(x, y) {
    if (!this.world) return null;
    this.raycaster.setFromCamera(this.ndc(x, y), this.rig.camera);
    const ray = this.raycaster.ray;
    // Sims (volumes simplifiés).
    let bestSim = null, bestT = Infinity;
    const tmp = new THREE.Vector3();
    for (const [id, v] of this.simViews) {
      if (!v.group.visible) continue;
      const s = this.world.sim(id);
      const scale = v.baseScale ? v.baseScale / 0.7 : 1;
      for (const hgt of [0.4, 0.9, 1.4].map(k => k * scale)) {
        tmp.set(v.group.position.x, v.group.position.y + hgt, v.group.position.z);
        const d2 = ray.distanceSqToPoint(tmp);
        if (d2 < 0.36 * scale) {
          const t = ray.origin.distanceTo(tmp);
          if (t < bestT) { bestT = t; bestSim = s; }
        }
      }
    }
    // Objets.
    let obj = null, objT = Infinity;
    const hits = this.raycaster.intersectObjects(this.worldView.objRoot.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.objId) o = o.parent;
      if (o?.userData.objId && o.visible) { obj = this.world.obj(o.userData.objId); objT = h.distance; break; }
    }
    const tile = this.groundTile(x, y);
    if (bestSim && bestT <= objT + 0.5) return { type: 'sim', sim: bestSim, tile };
    if (obj) return { type: 'object', obj, tile };
    return tile ? { type: 'ground', tile } : null;
  }

  groundTile(x, y, level = this.viewLevel) {
    this.raycaster.setFromCamera(this.ndc(x, y), this.rig.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -level * LEVEL_HEIGHT);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, p)) return null;
    return { x: Math.floor(p.x), y: Math.floor(p.z), fx: p.x, fz: p.z, l: level };
  }

  screenOf(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.rig.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, behind: v.z > 1 };
  }

  // Interaction principale à un point de l'écran (clic, tap, bouton A).
  interactAt(x, y) {
    if (!this.world) return;
    if (this.mode === 'build' || this.mode === 'buy') return;
    const hit = this.pick(x, y);
    this.ui.hud?.closePie();
    if (!hit) return;
    const me = this.selectedSim();
    if (hit.type === 'sim') {
      const t = hit.sim;
      if (this.householdSims().some(s => s.id === t.id) && t.id !== this.selected && !this.controlledSim) { this.selectSim(t.id); return; }
      this.ui.hud?.openPie(x, y, { type: 'sim', sim: t });
    } else if (hit.type === 'object') {
      this.ui.hud?.openPie(x, y, { type: 'object', obj: hit.obj, tile: hit.tile });
    } else if (hit.type === 'ground' && me) {
      this.ui.hud?.openPie(x, y, { type: 'ground', tile: hit.tile });
    }
  }

  // ------------------------------------------------------------------ annulation (construction / créatif)
  snapshot(label) {
    if (!this.world) return;
    this.undoStack.push({ label, json: this.world.serialize() });
    if (this.undoStack.length > 25) this.undoStack.shift();
    this.redoStack = [];
  }
  async undo() { return this.restoreFrom(this.undoStack, this.redoStack, 'Annulé'); }
  async redo() { return this.restoreFrom(this.redoStack, this.undoStack, 'Rétabli'); }
  restoreFrom(from, to, verb) {
    const snap = from.pop();
    if (!snap) { toast('Rien à annuler', '↩️'); return; }
    to.push({ label: snap.label, json: this.world.serialize() });
    const keepTime = this.world.d.time, keepJournal = this.world.d.journal;
    const w = World.deserialize(snap.json);
    w.d.time = keepTime; w.d.journal = keepJournal;
    const mode = this.mode, sel = this.selected, cam = { x: this.rig.goal.x, z: this.rig.goal.z, d: this.rig.goalDist, yaw: this.rig.goalYaw };
    const speed = this.pausedSpeed;
    this.startWorld(w);
    this.selected = sel;
    this.rig.goal.set(cam.x, 0, cam.z); this.rig.goalDist = cam.d; this.rig.goalYaw = cam.yaw;
    if (mode !== 'live') { this.pausedSpeed = speed; this.mode = 'live'; this.setMode(mode); }
    toast(`${verb} : ${snap.label}`, '↩️');
  }

  async save(label) {
    try {
      const meta = await saveWorld(this.world, this.world.d.id, label);
      toast(`Partie sauvegardée (${(meta.size / 1024).toFixed(0)} Ko)`, '💾');
      return true;
    } catch (e) {
      toast(`Échec de la sauvegarde : ${e.message}`, '⛔');
      return false;
    }
  }

  // ------------------------------------------------------------------ entrées
  bindInput() {
    const inp = this.input;
    inp.on('tap', e => {
      if (!this.world || this.mode === 'cas') return;
      if (this.ui.build?.active) { this.ui.build.tap(e); return; }
      if (this.ui.hud?.destinationPick) { this.ui.hud.resolveDestination(e.x, e.y); return; }
      this.cursor.active = false;
      this.interactAt(e.x, e.y);
    });
    inp.on('longpress', e => { if (this.world && !this.ui.build?.active) this.interactAt(e.x, e.y); });
    inp.on('pan', e => {
      if (!this.world || this.mode === 'cas') return;
      if (this.ui.build?.active && !e.touch && this.input.pointers.size < 2) return;
      const k = 0.045 * (this.rig.dist / 25);
      this.rig.pan(-e.dx * k / Math.max(0.4, this.rig.dist / 25), -e.dy * k / Math.max(0.4, this.rig.dist / 25));
    });
    inp.on('drag', e => {
      if (!this.world) return;
      if (this.ui.build?.active) this.ui.build.onDrag(e);
      else { const k = 0.045; this.rig.pan(-e.dx * k, -e.dy * k); }
    });
    inp.on('dragEnd', e => { if (this.ui.build?.active) this.ui.build.dragEnd(e); });
    inp.on('rotateDrag', e => { if (this.mode === 'cas') { this.casYaw = (this.casYaw || 0) + e.dx * 0.01; return; } this.rig.rotate(-e.dx * 0.006); this.rig.tilt(e.dy * 0.004); });
    inp.on('rotate', e => this.rig.rotate(-e.d));
    inp.on('zoom', e => { if (this.mode === 'cas') { this.casZoom = clamp((this.casZoom || 1) * e.factor, 0.5, 2); return; } this.rig.zoom(e.factor); });
    inp.on('hover', e => { if (this.world && this.ui.build?.active) this.ui.build.hover(e); else this.mouseHover = e; });
    inp.on('key', e => this.onKey(e));
  }

  onKey({ code, ctrl, shift }) {
    if (code === 'Escape') {
      if (backAction()) return;
      if (this.ui.hud?.closePie()) return;
      if (this.ui.build?.active && this.ui.build.cancelTool()) return;
      if (this.mode !== 'live' && this.world) { this.setMode('live'); return; }
      if (this.controlledSim) { this.toggleDirectControl(false); return; }
      if (this.world) this.ui.panels?.pauseMenu();
      return;
    }
    if (!this.world || modalCount() || this.mode === 'cas') return;
    if (ctrl && code === 'KeyZ') { this.undo(); return; }
    if (ctrl && (code === 'KeyY' || (shift && code === 'KeyZ'))) { this.redo(); return; }
    if (ctrl && code === 'KeyS') { this.save(); return; }
    if (this.ui.build?.active && this.ui.build.key(code)) return;
    switch (code) {
      case 'Space': case 'KeyP': this.sim.setSpeed(this.sim.speedIdx === 0 ? (this.lastSpeed || 1) : (this.lastSpeed = this.sim.speedIdx, 0)); this.ui.hud?.refresh(); break;
      case 'Digit1': this.sim.setSpeed(1); this.ui.hud?.refresh(); break;
      case 'Digit2': this.sim.setSpeed(2); this.ui.hud?.refresh(); break;
      case 'Digit3': this.sim.setSpeed(3); this.ui.hud?.refresh(); break;
      case 'Digit0': this.sim.setSpeed(0); this.ui.hud?.refresh(); break;
      case 'Tab': this.cycleSim(shift ? -1 : 1); break;
      case 'KeyC': if (!this.controlledSim) this.toggleDirectControl(true); break;
      case 'KeyF': { const s = this.selectedSim(); if (s) { this.rig.setMode('follow'); this.rig.focus(s.pos.x, s.pos.y); } break; }
      case 'F1': this.setMode('live'); break;
      case 'F2': this.setMode('buy'); break;
      case 'F3': this.setMode('build'); break;
      case 'F4': this.ui.panels?.worldPanel(); break;
      case 'KeyJ': this.ui.panels?.journal(); break;
      case 'PageUp': this.setViewLevel(this.viewLevel + 1); break;
      case 'PageDown': this.setViewLevel(this.viewLevel - 1); break;
      case 'KeyV': this.ui.hud?.cycleWallMode(); break;
      case 'Home': this.ui.hud?.cycleCamera(); break;
      case 'KeyE': if (this.controlledSim) this.directInteract(); break;
    }
  }

  directInteract() {
    const s = this.controlledSim;
    if (!s) return;
    const n = this.nearestInteractable(s);
    if (!n) { toast('Rien à proximité', '🤷'); return; }
    const pos = n.type === 'sim' ? n.sim.pos : this.world.objCenter(n.obj);
    const scr = this.screenOf(pos.x, (n.type === 'sim' ? n.sim.pos.hz : 0) + 1, n.type === 'sim' ? n.sim.pos.y : pos.y);
    this.ui.hud?.openPie(scr.x, scr.y, n.type === 'sim' ? { type: 'sim', sim: n.sim } : { type: 'object', obj: n.obj });
  }

  handlePad(dt) {
    const p = this.input.pollPad();
    usingPadRef.value = this.input.usingPad;
    if (!p.connected) { this.cursorMesh.visible = false; return; }
    const scope = activeScope();
    // Menus et fenêtres : navigation par focus.
    if (scope) {
      if (p.nav) { if (!moveFocus(p.nav) && !document.querySelector('.gp-focus')) { const els = focusables(scope); if (els[0]) setFocus(els[0]); } }
      if (p.pressed[PAD.A]) activateFocus();
      if (p.pressed[PAD.B]) { if (!backAction()) { const hud = document.querySelector('[data-hudnav="1"]'); if (hud) this.ui.hud?.setHudNav(false); } }
      if (p.pressed[PAD.LB]) cycleTabs(-1);
      if (p.pressed[PAD.RB]) cycleTabs(1);
      if (p.pressed[PAD.VIEW] && document.querySelector('[data-hudnav="1"]')) this.ui.hud?.setHudNav(false);
      if (this.mode === 'cas') { this.casYaw = (this.casYaw || 0) + p.rx * dt * 2.5; }
      if (p.pressed[PAD.MENU] && this.world && !modalCount()) this.ui.panels?.pauseMenu();
      if (!(this.ui.build?.active && document.querySelector('[data-hudnav="1"]'))) return;
    }
    if (!this.world || this.mode === 'cas') return;
    // Caméra : stick droit = rotation / inclinaison, gâchettes = zoom.
    this.rig.rotate(-p.rx * dt * 2.2);
    this.rig.tilt(p.ry * dt * 1.2);
    if (p.lt > 0.05) this.rig.zoom(1 + p.lt * dt * 1.8);
    if (p.rt > 0.05 && !this.controlledSim) this.rig.zoom(1 - p.rt * dt * 1.5);
    if (p.pressed[PAD.MENU]) { this.ui.panels?.pauseMenu(); return; }
    if (p.pressed[PAD.VIEW]) { this.ui.hud?.setHudNav(true); return; }
    // Contrôle direct.
    const ctl = this.controlledSim;
    if (ctl) {
      const f = this.rig.forward(), r = this.rig.right();
      const ix = r.x * p.lx - f.x * p.ly, iz = r.z * p.lx - f.z * p.ly;
      this.sim.controlInput = { x: ix, y: iz, run: p.buttons[PAD.RT] || p.rt > 0.5, alt: this.flyAlt ?? 3 };
      if (p.buttons[PAD.LB]) this.flyAlt = clamp((this.flyAlt ?? 3) - dt * 3, 0.5, 12);
      if (p.buttons[PAD.RB]) this.flyAlt = clamp((this.flyAlt ?? 3) + dt * 3, 0.5, 12);
      if (p.pressed[PAD.A]) this.directInteract();
      if (p.pressed[PAD.B] || p.pressed[PAD.Y]) this.toggleDirectControl(false);
      if (p.pressed[PAD.X]) this.ui.hud?.openSelfMenu();
      this.cursorMesh.visible = false;
      return;
    }
    // Curseur au sol déplacé par le stick gauche (relatif à la caméra).
    if (Math.abs(p.lx) + Math.abs(p.ly) > 0) {
      if (!this.cursor.active) { this.cursor = { x: this.rig.target.x, z: this.rig.target.z, active: true }; }
      const f = this.rig.forward(), r = this.rig.right();
      const sp = dt * (6 + this.rig.dist * 0.5);
      this.cursor.x += (r.x * p.lx - f.x * p.ly) * sp;
      this.cursor.z += (r.z * p.lx - f.z * p.ly) * sp;
      this.cursor.x = clamp(this.cursor.x, 0, this.world.w - 0.01);
      this.cursor.z = clamp(this.cursor.z, 0, this.world.h - 0.01);
      // La caméra suit le curseur s'il s'éloigne.
      const dx = this.cursor.x - this.rig.goal.x, dz = this.cursor.z - this.rig.goal.z;
      const lim = this.rig.dist * 0.35;
      if (Math.hypot(dx, dz) > lim) { const k = 1 - lim / Math.hypot(dx, dz); this.rig.goal.x += dx * k; this.rig.goal.z += dz * k; if (this.rig.mode === 'follow') this.rig.mode = 'free'; }
    }
    if (this.cursor.active) {
      this.cursorMesh.visible = true;
      this.cursorMesh.position.set(this.cursor.x, this.viewLevel * LEVEL_HEIGHT + 0.06, this.cursor.z);
    }
    const scr = this.cursor.active ? this.screenOf(this.cursor.x, this.viewLevel * LEVEL_HEIGHT + 0.3, this.cursor.z) : { x: innerWidth / 2, y: innerHeight / 2 };
    if (this.ui.build?.active) { this.ui.build.pad(p, scr, dt); return; }
    if (this.cursor.active && this.frameCount % 6 === 0) this.ui.hud?.hoverAt(scr.x, scr.y);
    if (p.pressed[PAD.A]) {
      if (this.ui.hud?.destinationPick) this.ui.hud.resolveDestination(scr.x, scr.y);
      else { const hit = this.pickNearCursor(); if (hit) this.interactWithHit(hit, scr); }
    }
    if (p.pressed[PAD.B]) { if (!this.ui.hud?.closePie() && this.selected) { const s = this.selectedSim(); if (s?.queue.length) this.sim.cancel(s, s.queue[s.queue.length - 1].id); } }
    if (p.pressed[PAD.X]) this.cycleSim(1);
    if (p.pressed[PAD.Y]) this.toggleDirectControl(true);
    if (p.pressed[PAD.LB]) { this.sim.setSpeed(Math.max(0, this.sim.speedIdx - 1)); this.ui.hud?.refresh(); }
    if (p.pressed[PAD.RB]) { this.sim.setSpeed(Math.min(3, this.sim.speedIdx + 1)); this.ui.hud?.refresh(); }
    if (p.pressed[PAD.UP]) this.setViewLevel(this.viewLevel + 1);
    if (p.pressed[PAD.DOWN]) this.setViewLevel(this.viewLevel - 1);
    if (p.pressed[PAD.LEFT]) this.ui.hud?.cycleWallMode();
    if (p.pressed[PAD.RIGHT]) this.ui.hud?.cycleCamera();
    if (p.pressed[PAD.LS]) this.ui.panels?.journal();
    if (p.pressed[PAD.RS]) { const s = this.selectedSim(); if (s) { this.rig.setMode('follow'); this.cursor.active = false; } }
  }

  // Sélection autour du curseur manette : sims et objets dans un rayon d'environ une case.
  pickNearCursor() {
    const cx = this.cursor.active ? this.cursor.x : this.rig.target.x, cz = this.cursor.active ? this.cursor.z : this.rig.target.z;
    let best = null, bd = 1.2;
    for (const s of this.world.sims) {
      if (s._rt.hidden || s.pos.l !== this.viewLevel) continue;
      const d = Math.hypot(s.pos.x - cx, s.pos.y - cz);
      if (d < bd) { bd = d; best = { type: 'sim', sim: s }; }
    }
    if (best) return best;
    const o = this.world.objectAtTile(this.viewLevel, Math.floor(cx), Math.floor(cz)) || this.world.objects.find(ob => { const def = registry.object(ob.def); if (!def || !(def.noCollide || def.wall)) return false; const f = this.world.footprint(ob); return (ob.level || 0) === this.viewLevel && cx >= f.x && cx < f.x + f.w && cz >= f.y && cz < f.y + f.d; });
    if (o) return { type: 'object', obj: o };
    return { type: 'ground', tile: { x: Math.floor(cx), y: Math.floor(cz), l: this.viewLevel } };
  }
  interactWithHit(hit, scr) {
    this.ui.hud?.closePie();
    if (hit.type === 'sim' && this.householdSims().some(s => s.id === hit.sim.id) && hit.sim.id !== this.selected) { this.selectSim(hit.sim.id); return; }
    this.ui.hud?.openPie(scr.x, scr.y, hit);
  }

  handleKeyboardCamera(dt) {
    if (!this.world || modalCount() || this.mode === 'cas') return;
    const k = this.input;
    if (this.controlledSim) {
      let x = 0, y = 0;
      if (k.key('KeyW') || k.key('ArrowUp')) y -= 1;
      if (k.key('KeyS') || k.key('ArrowDown')) y += 1;
      if (k.key('KeyA') || k.key('ArrowLeft')) x -= 1;
      if (k.key('KeyD') || k.key('ArrowRight')) x += 1;
      if (x || y || !this.input.pad.connected) {
        const f = this.rig.forward(), r = this.rig.right();
        const pad = this.ui.hud?.touchStick;
        if (pad && (pad.x || pad.y)) { x = pad.x; y = pad.y; }
        this.sim.controlInput = { x: r.x * x - f.x * y, y: r.z * x - f.z * y, run: k.key('ShiftLeft') || this.ui.hud?.touchRun, alt: this.flyAlt ?? 3 };
      }
      if (k.key('KeyQ')) this.rig.rotate(dt * 1.8);
      if (k.key('KeyR')) this.flyAlt = clamp((this.flyAlt ?? 3) + dt * 3, 0.5, 12);
      if (k.key('KeyF')) this.flyAlt = clamp((this.flyAlt ?? 3) - dt * 3, 0.5, 12);
      return;
    }
    const sp = dt * 14;
    let px = 0, pz = 0;
    if (k.key('KeyW') || k.key('ArrowUp')) pz -= sp;
    if (k.key('KeyS') || k.key('ArrowDown')) pz += sp;
    if (k.key('KeyA') || k.key('ArrowLeft')) px -= sp;
    if (k.key('KeyD') || k.key('ArrowRight')) px += sp;
    if (px || pz) this.rig.pan(px, pz);
    if (k.key('KeyQ')) this.rig.rotate(dt * 1.6);
    if (k.key('KeyE')) this.rig.rotate(-dt * 1.6);
    if (k.key('Equal') || k.key('NumpadAdd')) this.rig.zoom(1 - dt);
    if (k.key('Minus') || k.key('NumpadSubtract')) this.rig.zoom(1 + dt);
  }

  // ------------------------------------------------------------------ boucle
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());
    this.frameCount = (this.frameCount || 0) + 1;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    this.handlePad(dt);
    if (this.mode === 'cas' && this.ui.cas?.active) {
      this.ui.cas.update(dt);
      this.renderer.render(this.ui.cas.scene, this.ui.cas.camera);
      return;
    }
    if (!this.world) { this.renderMenuBackground(dt); return; }
    this.handleKeyboardCamera(dt);
    if (!modalCount() || this.ui.panels?.keepRunning) this.sim.update(dt);
    const sel = this.selectedSim();
    const followTarget = (this.rig.mode === 'follow' || this.rig.mode === 'close' || this.rig.mode === 'third') && sel ? { x: sel.pos.x, y: sel.pos.hz, z: sel.pos.y } : null;
    this.rig.update(dt, followTarget);
    const now = performance.now() / 1000;
    this.worldView.updateSky(this.rig.target);
    this.worldView.updateWeather(dt, this.rig.target);
    if (this.worldView.wallMode === 'cutaway') this.worldView.rebuildStructure(this.rig.yaw);
    this.worldView.syncCritters(dt);
    this.worldView.updateVfx(this.sim.powers.vfx, this.world.time, performance.now());
    this.worldView.tick(now);
    const ctx = { now, camPos: this.rig.camera.position, selected: this.selected, viewLevel: this.viewLevel, mood: sel ? this.sim.mood(sel) : 50 };
    for (const v of this.simViews.values()) v.update(dt, ctx);
    if (this.ui.build?.active) this.ui.build.frame(dt);
    this.renderer.render(this.scene, this.rig.camera);
    if (this.frameCount % 15 === 0) this.ui.hud?.tick();
    // Sauvegarde automatique toutes les 5 minutes réelles.
    if (this.settings.autosave !== false && performance.now() - this.lastAutosave > 5 * 60 * 1000 && this.mode === 'live' && !modalCount()) {
      this.lastAutosave = performance.now();
      saveWorld(this.world, this.world.d.id).then(() => toast('Sauvegarde automatique', '💾')).catch(() => {});
    }
  }

  renderMenuBackground(dt) {
    if (!this.menuScene) {
      this.menuScene = new THREE.Scene();
      this.menuScene.background = new THREE.Color('#0b0d16');
      const g = new THREE.Group();
      for (let i = 0; i < 60; i++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + Math.random() * 0.6, 0), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.7, 0.6), flatShading: true }));
        m.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 18, -10 - Math.random() * 20);
        m.userData.s = Math.random() * 0.5 + 0.2;
        g.add(m);
      }
      this.menuScene.add(g, new THREE.HemisphereLight('#ffffff', '#443366', 1.4));
      const d = new THREE.DirectionalLight('#ffcf2e', 2); d.position.set(5, 5, 5); this.menuScene.add(d);
      this.menuGroup = g;
      this.menuCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
    }
    this.menuCam.aspect = innerWidth / innerHeight; this.menuCam.updateProjectionMatrix();
    for (const m of this.menuGroup.children) { m.rotation.x += dt * m.userData.s; m.rotation.y += dt * m.userData.s * 0.7; m.position.y += Math.sin(performance.now() / 1000 + m.position.x) * 0.003; }
    this.renderer.render(this.menuScene, this.menuCam);
  }
}

export function qualityPreset(q) {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (q === 'auto') q = mobile ? 'medium' : 'high';
  return {
    low: { name: 'low', aa: false, pixelRatio: 0.85, shadows: false, shadowSize: 512, lights: 2, particles: false },
    medium: { name: 'medium', aa: false, pixelRatio: 1.25, shadows: true, shadowSize: 1024, lights: 4, particles: true },
    high: { name: 'high', aa: true, pixelRatio: 2, shadows: true, shadowSize: 2048, lights: 6, particles: true },
  }[q] || { name: 'medium', aa: false, pixelRatio: 1.25, shadows: true, shadowSize: 1024, lights: 4, particles: true };
}

export { CAM_MODES, simName };

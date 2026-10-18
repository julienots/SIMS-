// Rendu des habitants : modèle riggé KayKit, animations, couleurs, proportions, accessoires,
// mutations (mod), bulles de pensée, indicateur de sélection et effets d'activité.
import * as THREE from 'three';
import { characterTemplate, cloneCharacter, recoloredTexture, ANIM_MAP, ONE_SHOT, CHAR_SCALE, REAL_ANIM_MAP, REAL_TALK } from './assets.js';

// Os du squelette Biped (personnages réalistes) correspondant aux os utilisés par le jeu.
const BIPED = { head: 'Bip01_Head', chest: 'Bip01_Spine2', spine: 'Bip01_Spine', hips: 'Bip01_Pelvis', handl: 'Bip01_L_Hand', handr: 'Bip01_R_Hand' };
const LIE = new Set(['lie', 'lie_down', 'lie_up', 'faint']);
import { mat } from './procmodels.js';
import { LIFE_STAGES } from '../sim/data/core-data.js';
import { registry } from '../mods/registry.js';
import { REAL_BODIES } from '../sim/factory.js';
import { registerRealBodies } from './assets.js';
registerRealBodies(REAL_BODIES);

const WEAPONS = /sword|shield|staff|wand|spellbook|knife|throwable|crossbow|axe|mug|arrow|quiver|blade/i;
const HATS = /helmet|_hat|hood/i;
const CAPES = /cape/i;

const bubbleCache = new Map();
function bubbleTexture(icon) {
  if (bubbleCache.has(icon)) return bubbleCache.get(icon);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 4;
  g.beginPath(); g.roundRect(8, 8, 112, 92, 30); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(52, 98); g.lineTo(64, 122); g.lineTo(76, 98); g.fill();
  g.font = '64px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(icon, 64, 56);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  bubbleCache.set(icon, t);
  return t;
}

export class SimView {
  constructor(sim, parent) {
    this.sim = sim;
    this.group = new THREE.Group();
    this.group.userData.simId = sim.id;
    parent.add(this.group);
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.actions = {};
    this.cur = null;
    this.bones = {};
    this.frame = 0;
    this.ready = false;
    this.build();
    // Bulle.
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.bubble.scale.set(0.8, 0.8, 1);
    this.bubble.renderOrder = 10;
    this.bubble.visible = false;
    this.group.add(this.bubble);
    // Indicateur de sélection (cristal d'essence).
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshStandardMaterial({ color: '#7dff6a', emissive: '#3fcf2a', emissiveIntensity: 0.8, roughness: 0.2, transparent: true, opacity: 0.92 }));
    gem.scale.y = 1.7;
    gem.visible = false;
    this.gem = gem;
    this.group.add(gem);
    // Effets.
    this.fx = new THREE.Group(); this.group.add(this.fx);
  }

  appearanceKey() {
    const s = this.sim;
    const ap = s._rt?.vfx?.disguise || s.appearance;
    return JSON.stringify([ap, s.stage, s.modData?.powers?.mutations, s._rt?.vfx?.monster]);
  }

  async build() {
    const s = this.sim;
    const ap = { ...(s._rt?.vfx?.disguise || s.appearance) };
    const monster = !!s._rt?.vfx?.monster;
    ap.monster = monster;
    this.builtKey = this.appearanceKey();
    const token = Symbol('build');
    this.buildToken = token;
    let tpl;
    try { tpl = await characterTemplate(ap.body || 'Knight'); }
    catch { tpl = await characterTemplate('Knight'); }
    if (this.buildToken !== token) return;
    if (this.model) { this.inner.remove(this.model); this.mixer?.stopAllAction(); }
    const model = cloneCharacter(tpl);
    this.model = model;
    this.real = !!tpl.real;
    this.animRoot = tpl.animRoot;
    const stage = LIFE_STAGES.find(x => x.id === s.stage) || { scale: 1 };
    this.bones = {};
    model.traverse(o => { if (o.isBone || /^Bip01/.test(o.name)) this.bones[o.name] = o; });
    if (this.real) {
      // Modèle réaliste : textures d'origine ; seule la teinte des cheveux peut être ajustée.
      model.traverse(o => {
        if ((!o.isMesh && !o.isSkinnedMesh) || !o.material) return;
        o.material = o.material.clone();
        if (ap.hairTint && /opacity/i.test(o.material.name)) o.material.color = new THREE.Color(ap.hair);
        if (monster) { o.material.color = new THREE.Color('#7fd06a'); o.material.emissive = new THREE.Color('#0d2a08'); }
      });
      for (const [k, n] of Object.entries(BIPED)) if (this.bones[n]) this.bones[k] = this.bones[n];
      const childBody = /child/i.test(ap.body);
      const ageScale = s.stage === 'baby' ? 0.42 : childBody ? 1 : s.stage === 'teen' ? 0.94 : s.stage === 'child' ? 0.72 : s.stage === 'elder' ? 0.97 : 1;
      this.baseScale = ageScale * (ap.height || 1) * (monster ? 1.35 : 1);
      this.heightM = 1.72 * this.baseScale * (childBody ? 0.75 : 1);
      this.headScale = ap.head || 1;
      this.rootRef = this.bones.Bip01?.position.length() || 1;
    } else {
      // Visibilité des accessoires d'origine.
      model.traverse(o => {
        if (!o.isMesh && !o.isSkinnedMesh) return;
        const n = o.name || o.parent?.name || '';
        if (WEAPONS.test(n)) o.visible = false;
        else if (HATS.test(n)) o.visible = !!ap.hat;
        else if (CAPES.test(n)) o.visible = !!ap.cape;
      });
      // Recoloration (après la visibilité, pour n'analyser que les maillages affichés).
      model.traverse(o => {
        if ((!o.isMesh && !o.isSkinnedMesh) || !o.material?.map) return;
        o.material = o.material.clone();
        o.material.map = recoloredTexture(o.material.map, ap, ap.body, tpl.scene);
        if (monster) o.material.emissive = new THREE.Color('#123b10');
      });
      this.baseScale = CHAR_SCALE * stage.scale * (ap.height || 1) * (monster ? 1.45 : 1);
      this.heightM = 2.3 * this.baseScale;
      this.headScale = (ap.head || 1) * (s.stage === 'child' ? 1.25 : s.stage === 'baby' ? 1.4 : 1);
    }
    this.pickScale = this.heightM / 1.6;
    this.inner.add(model);
    this.inner.scale.setScalar(this.baseScale);
    this.ap = ap;
    // Animations.
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = tpl.animations;
    this.actions = {};
    this.cur = null;
    this.curKey = null;
    this.attachExtras(ap);
    this.attachMutations();
    this.ready = true;
    this.play(this.sim._rt?.anim || 'idle', true);
  }

  clipName(name) {
    if (!this.real) return ANIM_MAP[name] || 'Idle';
    if (name === 'talk') return REAL_TALK[this.sim.emotion] || (this.talkAlt ? 'gestic_talk_neutral_02' : 'gestic_talk_neutral_01');
    if (name === 'idle' && this.sim.needs?.sleep < 20) return 'idle_yawn_01';
    if (name === 'idle' && this.sim.emotion === 'angry') return 'idle_angry_01';
    if (name === 'idle' && ['tense', 'scared'].includes(this.sim.emotion)) return 'idle_nervous_01';
    if (name === 'dance' && this.danceAlt) return 'dancing_cool';
    return REAL_ANIM_MAP[name] || 'idle_neutral_01';
  }

  clip(name) {
    const clipName = this.clipName(name);
    if (!this.actions[clipName]) {
      let c = this.clips.find(a => a.name === clipName) || this.clips.find(a => a.name === (this.real ? 'idle_neutral_01' : 'Idle'));
      if (!c) return null;
      if (this.real) c = this.fitClip(c);
      const act = this.mixer.clipAction(c);
      if (ONE_SHOT.has(name) && !LIE.has(name)) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
      this.actions[clipName] = act;
    }
    return this.actions[clipName];
  }

  // Adapte la translation de la racine à la taille du personnage (enfants, adultes de tailles différentes).
  fitClip(c) {
    const tr = c.tracks.find(t => t.name === 'Bip01.position');
    if (!tr) return c;
    // Rapport des hauteurs de repos (corps / squelette des animations), identique pour tous les clips :
    // ne pas le calculer sur la 1re image, qui est déjà assise ou accroupie dans certains clips.
    const k = this.rootRef / (this.animRoot || 0.919);
    const cc = c.clone();
    const t2 = cc.tracks.find(t => t.name === 'Bip01.position');
    const v = t2.values, times = t2.times, n = times.length, T = times[n - 1] || 1;
    // Le déplacement est géré par la simulation : on retire l'avancée horizontale des clips (la marche avance
    // de 1,2 m par cycle, sinon le Sim « recule » à chaque boucle). On garde le balancement et la hauteur.
    // S'asseoir / se lever : le bassin recule de ~45 cm dans la capture ; le jeu place déjà le Sim sur l'assise,
    // on supprime donc tout mouvement horizontal.
    const inPlace = /sit_down|stand_up/.test(c.name);
    const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2];
    const out = new Float32Array(v.length);
    for (let i = 0; i < n; i++) {
      const f = times[i] / T;
      out[i * 3] = (inPlace ? v[0] : v[i * 3] - dx * f) * k;
      out[i * 3 + 1] = v[i * 3 + 1] * k;
      out[i * 3 + 2] = (inPlace ? v[2] : v[i * 3 + 2] - dz * f) * k;
    }
    t2.values = out;
    return cc;
  }

  play(name, instant) {
    if (!this.ready) return;
    const key = ONE_SHOT.has(name) && !LIE.has(name) ? name : this.clipName(name);
    if (key === this.curKey) return;
    const act = this.clip(name);
    if (!act) return;
    const prev = this.cur;
    act.reset();
    act.timeScale = name === 'dance' ? 1.15 : name === 'workout' ? 1.1 : 1;
    act.play();
    if (prev && prev !== act && !instant) { act.crossFadeFrom(prev, 0.3, false); }
    else if (prev && prev !== act) prev.stop();
    this.cur = act;
    this.curKey = key;
    if (name === 'talk') this.talkAlt = !this.talkAlt;
    if (name === 'dance') this.danceAlt = Math.random() < 0.5;
  }

  // ---------------------------------------------------------------- accessoires
  attachExtras(ap) {
    const head = this.bones.head;
    if (!head) return;
    if (this.extras) this.extras.parent?.remove(this.extras);
    const ex = new THREE.Group();
    this.extras = ex;
    if (this.real) {
      // Squelette Biped : on suit la position de la tête, orienté comme le personnage (repère commun aux accessoires).
      ex.scale.setScalar(0.2);
      ex.userData.follow = head;
      ex.userData.offset = new THREE.Vector3(0, -0.03, 0.0);
      this.inner.add(ex);
    } else head.add(ex);
    // Repère du visage (espace de l'os de la tête) : yeux à ~0,42, bouche à ~0,2, face vers +z.
    const fy = 0.55, fz = 0.5, eyeY = 0.42, mouthY = 0.24;
    const hair = new THREE.Color(ap.hair || '#4a2e1c');
    for (const id of ap.extras || []) {
      switch (id) {
        case 'glasses': case 'sunglasses': {
          const m = mat(id === 'sunglasses' ? '#111' : '#222', { rough: 0.3 });
          for (const x of [-0.17, 0.17]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 16), m); r.position.set(x, eyeY, fz + 0.04); ex.add(r); if (id === 'sunglasses') { const l = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), mat('#1a1a2e', { opacity: 0.85 })); l.position.set(x, eyeY, fz + 0.045); ex.add(l); } }
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), m); b.position.set(0, eyeY, fz + 0.04); ex.add(b);
          break;
        }
        case 'headphones': {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 20, Math.PI), mat('#e84393')); band.position.set(0, fy + 0.1, 0); ex.add(band);
          for (const x of [-0.42, 0.42]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 14), mat('#2d3436')); c.rotation.z = Math.PI / 2; c.position.set(x, fy + 0.05, 0); ex.add(c); }
          break;
        }
        case 'crown': {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.2, 8, 1, true), mat('#f1c40f', { metal: 0.9, rough: 0.2 })); c.position.set(0, fy + 0.62, 0); ex.add(c);
          for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), mat('#f1c40f', { metal: 0.9, rough: 0.2 })); sp.position.set(Math.cos(i / 8 * 6.28) * 0.28, fy + 0.78, Math.sin(i / 8 * 6.28) * 0.28); ex.add(sp); }
          break;
        }
        case 'tophat': {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 20), mat('#1e1e1e')); b.position.set(0, fy + 0.5, 0); ex.add(b);
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 20), mat('#1e1e1e')); t.position.set(0, fy + 0.73, 0); ex.add(t);
          break;
        }
        case 'cap': {
          const c = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(ap.accent || '#e74c3c')); c.position.set(0, fy + 0.3, 0); ex.add(c);
          const v = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.3), mat(ap.accent || '#e74c3c')); v.position.set(0, fy + 0.3, 0.45); ex.add(v);
          break;
        }
        case 'flower': { const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat('#ff6b81')); f.position.set(0.35, fy + 0.35, 0.2); ex.add(f); break; }
        case 'bow': { for (const x of [-0.09, 0.09]) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), mat('#ff4d94')); b.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2; b.position.set(x, fy + 0.5, -0.1); ex.add(b); } break; }
        case 'mustache': { const m = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12, Math.PI), mat(`#${hair.getHexString()}`)); m.rotation.z = Math.PI; m.position.set(0, mouthY + 0.01, fz + 0.03); ex.add(m); break; }
        case 'beard': { const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(`#${hair.getHexString()}`)); b.position.set(0, mouthY + 0.05, fz - 0.15); b.scale.set(1, 1.1, 0.7); ex.add(b); break; }
        case 'earrings': { for (const x of [-0.45, 0.45]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat('#f1c40f', { metal: 0.9 })); e.position.set(x, mouthY + 0.05, 0.05); ex.add(e); } break; }
        case 'scar': { const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.01), mat('#a33')); s.rotation.z = 0.4; s.position.set(0.2, eyeY + 0.08, fz + 0.02); ex.add(s); break; }
        case 'freckles': { for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.012, 6), mat('#a0522d')); d.position.set((i % 3 - 1) * 0.04 + (i < 3 ? -0.18 : 0.18), eyeY - 0.12 + (i % 2) * 0.02, fz + 0.02); ex.add(d); } break; }
        case 'makeup': { for (const x of [-0.2, 0.2]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), mat('#ff8fab', { opacity: 0.6 })); c.position.set(x, eyeY - 0.13, fz + 0.02); ex.add(c); } break; }
        case 'necklace': { const n = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 20), mat('#f5f5f5', { metal: 0.5 })); n.rotation.x = Math.PI / 2; n.position.set(0, -0.05, 0.05); ex.add(n); break; }
        default: {
          // Accessoire ajouté par un mod : forme générique colorée.
          const def = registry.objects.get(id);
          if (def?.accessory) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(def.color || '#fff')); m.position.set(0, fy + 0.5, 0); ex.add(m); }
        }
      }
    }
  }

  attachMutations() {
    const muts = this.sim.modData?.powers?.mutations || [];
    if (this.mutGroup) this.mutGroup.parent?.remove(this.mutGroup);
    if (!muts.length) return;
    const chest = this.bones.chest || this.bones.spine;
    if (!chest) return;
    const g = new THREE.Group();
    this.mutGroup = g;
    if (this.real) { g.scale.setScalar(0.42); g.userData.follow = chest; g.userData.offset = new THREE.Vector3(0, -0.1, 0); this.inner.add(g); }
    else chest.add(g);
    const skin = this.ap?.skin || '#f6c9a3';
    for (const m of muts) {
      if (m === 'wings') {
        for (const side of [-1, 1]) {
          const shape = new THREE.Shape();
          shape.moveTo(0, 0); shape.quadraticCurveTo(0.8, 0.9, 1.6, 0.7); shape.quadraticCurveTo(1.1, 0.2, 1.4, -0.4); shape.quadraticCurveTo(0.6, -0.1, 0, 0);
          const w = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: '#f5f0ff', side: THREE.DoubleSide, transparent: true, opacity: 0.92, emissive: '#5a4a8a', emissiveIntensity: 0.15 }));
          w.scale.set(side, 1, 1); w.position.set(0.1 * side, 0.4, -0.35); w.rotation.y = side * 0.5;
          w.name = side < 0 ? 'wingL' : 'wingR';
          g.add(w);
        }
      } else if (m === 'arms') {
        for (const side of [-1, 1]) { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 4, 8), mat(skin)); a.position.set(0.45 * side, 0.05, 0.05); a.rotation.z = side * 1.0; a.name = 'extraArm'; g.add(a); }
      } else if (m === 'tentacles') {
        for (let i = 0; i < 4; i++) {
          const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, -0.3), new THREE.Vector3((i - 1.5) * 0.3, -0.3, -0.6), new THREE.Vector3((i - 1.5) * 0.5, -0.8, -0.5), new THREE.Vector3((i - 1.5) * 0.6, -1.1, -0.2)]);
          const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.06, 6), mat('#8e44ad')); t.name = 'tentacle'; g.add(t);
        }
      } else if (m === 'shell') {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#5d6d2f', { rough: 0.4 })); s.rotation.x = -Math.PI / 2; s.position.set(0, 0.2, -0.3); s.scale.set(1, 1, 0.6); g.add(s);
      } else if (m === 'claws') {
        for (const hn of ['handl', 'handr']) {
          const h = this.bones[hn]; if (!h) continue;
          const cg = new THREE.Group(); cg.name = 'claws';
          for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3, 5), mat('#ddd', { metal: 0.8, rough: 0.2 })); c.position.set((i - 1) * 0.06, 0.25, 0.05); cg.add(c); }
          h.add(cg);
          this.clawGroups = (this.clawGroups || []); this.clawGroups.push(cg);
        }
      }
    }
  }

  // ---------------------------------------------------------------- mise à jour par image
  update(dt, ctx) {
    const s = this.sim;
    const rt = s._rt;
    if (!rt) return;
    if (this.appearanceKey() !== this.builtKey) { this.clawGroups?.forEach(c => c.parent?.remove(c)); this.clawGroups = null; this.build(); }
    const visible = !rt.hidden && (s.pos.l <= ctx.viewLevel);
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.set(s.pos.x, s.pos.hz + (rt.poseY || 0) + (rt.vfx?.levitate ? 0.6 + Math.sin(ctx.now * 2) * 0.1 : 0), s.pos.y);
    this.group.rotation.y = s.rot;
    if (!this.ready) return;
    // Niveau de détail : animation moins fréquente au loin.
    const d = ctx.camPos.distanceTo(this.group.position);
    this.inner.visible = d < 150;
    this.frame++;
    const every = d > 80 ? 4 : d > 45 ? 2 : 1;
    let anim = rt.once || rt.anim || 'idle';
    if (s.stage === 'baby') anim = 'lie';
    if (rt.vfx?.flying && (anim === 'walk' || anim === 'run' || anim === 'idle')) anim = 'fly';
    this.play(anim);
    // Cadence de marche/course calée sur la vitesse réelle au sol (pieds qui ne glissent pas).
    if (this.real && dt > 0 && this.cur && (anim === 'walk' || anim === 'run')) {
      const p = this.group.position, lp = this.lastPos || (this.lastPos = p.clone());
      const v = Math.hypot(p.x - lp.x, p.z - lp.z) / dt;
      this.gs = this.gs === undefined ? v : this.gs + (v - this.gs) * Math.min(1, dt * 6);
      const clipSpeed = (anim === 'run' ? 2.86 : 1.02) * (this.rootRef / (this.animRoot || 0.919));
      this.cur.timeScale = THREE.MathUtils.clamp(this.gs / clipSpeed, 0.4, 3);
    }
    (this.lastPos ||= new THREE.Vector3()).copy(this.group.position);
    if (this.frame % every === 0) this.mixer.update(dt * every);
    // Allongé (lit, baignoire) : les animations réalistes n'ont pas de pose couchée, on bascule le corps.
    const lying = this.real && LIE.has(anim);
    if (lying !== !!this.lying) {
      this.lying = lying;
      this.model.rotation.x = lying ? -Math.PI / 2 : 0;
      this.model.position.set(0, lying ? 0.12 : 0, lying ? 0.85 : 0);
    }
    // Les accessoires des modèles réalistes suivent les os.
    for (const anchor of [this.extras, this.mutGroup]) {
      const f = anchor?.userData.follow;
      if (!f) continue;
      f.getWorldPosition(this._tmpV ||= new THREE.Vector3());
      this.inner.worldToLocal(this._tmpV);
      anchor.position.copy(this._tmpV).add(anchor.userData.offset);
      if (this.lying) { anchor.rotation.x = -Math.PI / 2; } else anchor.rotation.x = 0;
    }
    // Proportions (après l'animation).
    const ap = this.ap || {};
    const b = this.bones;
    if (this.real) {
      if (b.head) b.head.scale.setScalar(this.headScale || 1);
      const w = Math.sqrt((ap.shoulders || 1) * (ap.build || 1));
      if (b.spine) b.spine.scale.set(1, w, w);
      // Squelette Biped : l'axe X local suit la longueur de l'os.
      for (const [n, k] of [['Bip01_L_Thigh', 'legs'], ['Bip01_R_Thigh', 'legs'], ['Bip01_L_UpperArm', 'arms'], ['Bip01_R_UpperArm', 'arms']]) if (b[n]) b[n].scale.x = ap[k] || 1;
    } else if (b.head) b.head.scale.setScalar(this.headScale || 1);
    if (!this.real) {
    if (b.chest) b.chest.scale.set((ap.shoulders || 1) * (ap.build || 1), 1, ap.build || 1);
    if (b.hips) b.hips.scale.set(ap.build || 1, 1, ap.build || 1);
    if (b.upperlegl) b.upperlegl.scale.y = ap.legs || 1;
    if (b.upperlegr) b.upperlegr.scale.y = ap.legs || 1;
    if (b.upperarml) b.upperarml.scale.y = ap.arms || 1;
    if (b.upperarmr) b.upperarmr.scale.y = ap.arms || 1;
    }
    // Ailes qui battent en vol.
    if (this.mutGroup) for (const c of this.mutGroup.children) if (c.name.startsWith('wing')) c.rotation.y = (c.name === 'wingL' ? -1 : 1) * (0.5 + (rt.vfx?.flying ? Math.sin(ctx.now * 12) * 0.5 : Math.sin(ctx.now * 2) * 0.08));
    // Bulle.
    if (rt.bubble) {
      if (this.bubbleIcon !== rt.bubble.icon) { this.bubble.material.map = bubbleTexture(rt.bubble.icon); this.bubble.material.needsUpdate = true; this.bubbleIcon = rt.bubble.icon; }
      this.bubble.visible = true;
      this.bubble.position.y = (this.lying ? 0.9 : this.heightM + 0.35) + Math.sin(ctx.now * 3) * 0.04;
    } else this.bubble.visible = false;
    // Cristal de sélection coloré selon l'humeur.
    this.gem.visible = ctx.selected === s.id;
    if (this.gem.visible) {
      this.gem.position.y = (this.lying ? 0.9 : this.heightM) + (rt.bubble ? 0.95 : 0.4);
      this.gem.rotation.y = ctx.now * 1.5;
      const mood = ctx.mood ?? 60;
      const col = new THREE.Color().setHSL(Math.max(0, mood) / 100 * 0.33, 0.9, 0.55);
      this.gem.material.color.copy(col); this.gem.material.emissive.copy(col).multiplyScalar(0.5);
    }
    this.updateFx(ctx);
  }

  updateFx(ctx) {
    const rt = this.sim._rt;
    const vfx = rt.vfx || {};
    const want = { shield: !!vfx.shield, speed: !!vfx.speed, activity: vfx.activity || null, carry: rt.carry || null, sleep: !!rt.sleeping, flying: !!vfx.flying };
    const key = JSON.stringify(want);
    if (key !== this.fxKey) {
      this.fxKey = key;
      while (this.fx.children.length) this.fx.remove(this.fx.children[0]);
      if (want.shield) { const sh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), new THREE.MeshBasicMaterial({ color: '#6fd3ff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); sh.position.y = 0.9; sh.name = 'shield'; this.fx.add(sh); }
      if (want.speed) { for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.2), new THREE.MeshBasicMaterial({ color: '#fff176', transparent: true, opacity: 0.7 })); l.position.set((i - 1.5) * 0.25, 0.4 + i * 0.3, -0.9); l.name = 'trail'; this.fx.add(l); } }
      if (want.carry === 'plate') { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.03, 16), mat('#fff')); p.position.set(0, 0.95, 0.35); this.fx.add(p); const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat('#e67e22')); f.position.set(0, 1.0, 0.35); this.fx.add(f); }
      if (want.activity === 'water') this.addParticles('#9fd8ff', 40, 2.1, 'down');
      if (want.activity === 'notes') this.addSprites('🎵', 3);
      if (want.activity === 'smoke') this.addParticles('#bbbbbb', 25, 1.0, 'up');
      if (want.activity === 'bubbles') this.addParticles('#ffffff', 25, 0.6, 'up');
      if (want.sleep) this.addSprites('💤', 2);
      if (want.flying) { for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 })); l.position.set((i - 1) * 0.5, 0.5 + i * 0.4, -0.8); l.name = 'trail'; this.fx.add(l); } }
    }
    for (const c of this.fx.children) {
      if (c.name === 'shield') c.material.opacity = 0.2 + Math.sin(ctx.now * 4) * 0.06;
      if (c.name === 'trail') c.material.opacity = 0.3 + Math.random() * 0.5;
      if (c.userData.particles) {
        const arr = c.geometry.attributes.position.array;
        for (let i = 1; i < arr.length; i += 3) {
          arr[i] += (c.userData.dir === 'down' ? -3 : 0.8) * 0.016;
          if (arr[i] < 0 || arr[i] > c.userData.h + 1) arr[i] = c.userData.dir === 'down' ? c.userData.h : 0.8;
        }
        c.geometry.attributes.position.needsUpdate = true;
      }
      if (c.isSprite) { c.position.y = 1.6 + ((ctx.now * 0.5 + c.userData.off) % 1) * 1.2; c.material.opacity = 1 - ((ctx.now * 0.5 + c.userData.off) % 1); }
    }
  }

  addParticles(color, n, h, dir) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 0.7; p[i * 3 + 1] = Math.random() * h; p[i * 3 + 2] = (Math.random() - 0.5) * 0.7; }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.06, transparent: true, opacity: 0.8 }));
    pts.userData = { particles: true, dir, h };
    this.fx.add(pts);
  }
  addSprites(icon, n) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(icon), transparent: true, depthTest: false }));
      sp.scale.set(0.35, 0.35, 1); sp.position.x = (i - (n - 1) / 2) * 0.35; sp.userData.off = i / n;
      this.fx.add(sp);
    }
  }

  dispose() { this.group.parent?.remove(this.group); this.mixer?.stopAllAction(); }
}

const emojiCache = new Map();
function emojiTexture(icon) {
  if (emojiCache.has(icon)) return emojiCache.get(icon);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.font = '52px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, 32, 36);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; emojiCache.set(icon, t); return t;
}

// Rendu du monde : terrain, routes, eau, murs (géométrie fusionnée), sols, toits, objets, créatures,
// ciel jour/nuit, météo et effets visuels des pouvoirs.
import * as THREE from 'three';
import { registry } from '../mods/registry.js';
import { WALL_STYLES, FLOOR_STYLES } from '../sim/data/objects.js';
import { ANIMALS } from '../sim/data/animals.js';
import { LEVEL_HEIGHT, LEVELS } from '../sim/world.js';
import { objectModel, loadGLB } from './assets.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const WALL_H = LEVEL_HEIGHT, WALL_T = 0.14, LOW_H = 0.3;
const TERRAIN_COLORS = ['#6aa84f', '#cfc6b4', '#e6d3a1', '#3c3f45', '#3f8fd1'];

// ------------------------------------------------------------------------------ textures procédurales
const texCache = new Map();
function patternTexture(color, pattern, size = 128) {
  const k = `${color}|${pattern}`;
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const base = new THREE.Color(color);
  const shade = f => `#${base.clone().multiplyScalar(f).getHexString()}`;
  g.fillStyle = color; g.fillRect(0, 0, size, size);
  if (pattern === 'planks') {
    for (let i = 0; i < 8; i++) { g.fillStyle = shade(0.9 + (i % 3) * 0.06); g.fillRect(0, i * size / 8, size, size / 8 - 2); g.fillStyle = shade(0.7); g.fillRect(((i * 37) % size), i * size / 8, 2, size / 8); }
  } else if (pattern === 'tiles') {
    g.strokeStyle = shade(0.82); g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * size / 4, 0); g.lineTo(i * size / 4, size); g.stroke(); g.beginPath(); g.moveTo(0, i * size / 4); g.lineTo(size, i * size / 4); g.stroke(); }
  } else if (pattern === 'checker') {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) { g.fillStyle = '#2b2b2b'; g.fillRect(x * size / 4, y * size / 4, size / 4, size / 4); }
  } else if (pattern === 'brick') {
    g.fillStyle = shade(0.75); g.fillRect(0, 0, size, size);
    for (let r = 0; r < 8; r++) for (let q = -1; q < 4; q++) { g.fillStyle = shade(0.92 + ((r * 7 + q * 3) % 5) * 0.03); g.fillRect(q * size / 4 + (r % 2) * size / 8 + 2, r * size / 8 + 2, size / 4 - 4, size / 8 - 4); }
  } else {
    // Léger grain.
    for (let i = 0; i < 400; i++) { g.fillStyle = shade(0.94 + Math.random() * 0.1); g.fillRect(Math.random() * size, Math.random() * size, 2, 2); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(k, t);
  return t;
}

// Constructeur de géométrie fusionnée (boîtes / quads avec UV en mètres).
class GeoBuilder {
  constructor() { this.pos = []; this.norm = []; this.uv = []; this.idx = []; }
  quad(a, b, c, d, n, uvScale = [1, 1]) {
    const i = this.pos.length / 3;
    for (const p of [a, b, c, d]) this.pos.push(p[0], p[1], p[2]);
    for (let k = 0; k < 4; k++) this.norm.push(n[0], n[1], n[2]);
    this.uv.push(0, 0, uvScale[0], 0, uvScale[0], uvScale[1], 0, uvScale[1]);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  box(x0, y0, z0, x1, y1, z1) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [w, h]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [w, h]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [d, h]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [d, h]);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [w, d]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [w, d]);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.pos.length === 0; }
}

export class WorldView {
  constructor(scene, world, sim, quality) {
    this.scene = scene;
    this.world = world;
    this.sim = sim;
    this.quality = quality;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.objRoot = new THREE.Group(); this.root.add(this.objRoot);
    this.objViews = new Map();
    this.levelGroups = [];
    for (let l = 0; l < LEVELS; l++) { const g = new THREE.Group(); g.name = `level${l}`; this.root.add(g); this.levelGroups.push(g); }
    this.viewLevel = 0;
    this.wallMode = 'cutaway';
    this.camQuadrant = -1;
    this.critterViews = new Map();
    this.vfxViews = new Map();
    this.setupLights();
    this.buildTerrain();
    this.rebuildStructure();
    for (const o of world.objects) this.addObjectView(o);
    this.unsub = [
      world.on('objectAdded', o => this.addObjectView(o)),
      world.on('objectRemoved', o => this.removeObjectView(o.id)),
      world.on('objectMoved', o => this.placeObjectView(o)),
    ];
  }

  dispose() {
    this.unsub.forEach(u => u());
    this.scene.remove(this.root);
    this.scene.remove(this.sun); this.scene.remove(this.sun.target); this.scene.remove(this.hemi);
    if (this.weatherPts) this.scene.remove(this.weatherPts);
    if (this.sky) this.scene.remove(this.sky);
  }

  // ---------------------------------------------------------------- lumières et ciel
  setupLights() {
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#4a5a3a', 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.2);
    this.sun.castShadow = this.quality.shadows;
    const s = this.quality.shadowSize || 2048;
    this.sun.shadow.mapSize.set(s, s);
    const r = 30;
    Object.assign(this.sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 160 });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.pointLights = [];
    for (let i = 0; i < (this.quality.lights ?? 6); i++) { const p = new THREE.PointLight('#ffd9a0', 0, 9, 1.6); this.scene.add(p); this.pointLights.push(p); this.root.add(p); }
    this.scene.fog = new THREE.Fog('#bfe3ff', 90, 320);
    // Ciel : dôme dégradé + lune + planètes (univers futuriste / spatial).
    const skyGeo = new THREE.SphereGeometry(600, 24, 12);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#5fa8ff') }, bottom: { value: new THREE.Color('#dff1ff') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.4+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }',
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 900; i++) { const v = new THREE.Vector3().randomDirection(); if (v.y < 0.05) v.y = -v.y + 0.05; v.multiplyScalar(560); sp.push(v.x, v.y, v.z); }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    this.sky.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 16), new THREE.MeshBasicMaterial({ map: this.planetTexture('#d9d9e0', '#a9a9b5'), fog: false }));
    this.sky.add(this.moon);
    if (this.world.settings.environment === 'futuristic' || this.world.settings.environment === 'fantasy') {
      const p = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 20), new THREE.MeshBasicMaterial({ map: this.planetTexture('#e3a35a', '#b0603a', true), fog: false, transparent: true, opacity: 0.85 }));
      p.position.set(-260, 230, -380); this.sky.add(p); this.planet = p;
      const ring = new THREE.Mesh(new THREE.RingGeometry(95, 130, 48), new THREE.MeshBasicMaterial({ color: '#f1d7a8', side: THREE.DoubleSide, transparent: true, opacity: 0.45, fog: false }));
      ring.rotation.x = 1.2; p.add(ring);
      const station = new THREE.Group();
      station.add(new THREE.Mesh(new THREE.TorusGeometry(10, 1.2, 8, 32), new THREE.MeshBasicMaterial({ color: '#cfd8dc', fog: false })));
      station.add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 22, 12), new THREE.MeshBasicMaterial({ color: '#90a4ae', fog: false })));
      station.children[1].rotation.z = Math.PI / 2;
      station.position.set(220, 300, -300); this.sky.add(station); this.station = station;
    }
  }

  planetTexture(c1, c2, bands) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = c1; g.fillRect(0, 0, 128, 64);
    if (bands) for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? c2 : c1; g.globalAlpha = 0.5; g.fillRect(0, i * 7, 128, 4); }
    else for (let i = 0; i < 30; i++) { g.fillStyle = c2; g.globalAlpha = 0.5; g.beginPath(); g.arc(Math.random() * 128, Math.random() * 64, 2 + Math.random() * 6, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  updateSky(camTarget) {
    const w = this.world;
    const hour = (w.time / 60) % 24;
    const env = w.settings.environment;
    // Soleil : lever 6h, coucher 20h.
    const dayT = (hour - 6) / 14;
    const sunUp = dayT > 0 && dayT < 1;
    const ang = Math.PI * Math.min(1, Math.max(0, dayT));
    const elev = Math.sin(ang);
    const night = !sunUp ? 1 : Math.max(0, 1 - elev * 4);
    const dusk = sunUp ? Math.max(0, 1 - Math.abs(elev) * 3) : 0;
    this.sun.position.set(camTarget.x + Math.cos(ang) * 60, 10 + Math.max(0.15, elev) * 70, camTarget.z + 30);
    this.sun.target.position.set(camTarget.x, 0, camTarget.z);
    this.sun.intensity = sunUp ? 0.4 + elev * 2.2 : 0.05;
    this.sun.color.set(dusk > 0.4 ? '#ffb070' : '#fff3dc');
    this.hemi.intensity = 0.25 + (1 - night) * 0.75;
    const weather = w.d.weather?.type || 'sun';
    const cloudy = weather === 'rain' || weather === 'cloudy' || weather === 'snow';
    const topDay = new THREE.Color(cloudy ? '#8a9bb0' : env === 'futuristic' ? '#4b6fd8' : '#4f9bff');
    const botDay = new THREE.Color(cloudy ? '#c7d0da' : '#dff1ff');
    const topNight = new THREE.Color('#070b1f'), botNight = new THREE.Color('#1b2340');
    const duskC = new THREE.Color('#ff9a5c');
    const top = topDay.clone().lerp(topNight, night);
    const bot = botDay.clone().lerp(botNight, night).lerp(duskC, dusk * 0.6);
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.bottom.value.copy(bot);
    this.scene.fog.color.copy(bot);
    this.scene.fog.near = cloudy ? 50 : 90;
    this.scene.fog.far = cloudy ? 220 : 340;
    this.stars.material.opacity = night * (cloudy ? 0.2 : 1);
    this.moon.position.set(Math.cos(ang + Math.PI) * 400, 150 + Math.abs(Math.sin(ang)) * 200, -300);
    this.moon.visible = night > 0.2;
    this.sky.position.set(camTarget.x, 0, camTarget.z);
    if (this.station) this.station.rotation.z += 0.001;
    this.nightFactor = night;
    // Lumières nocturnes : les lampes les plus proches de la caméra s'allument.
    if (night > 0.3 || this.viewInterior) this.updatePointLights(camTarget, night);
    else for (const p of this.pointLights) p.intensity = 0;
  }

  updatePointLights(t, night) {
    const lights = [];
    for (const o of this.world.objects) {
      const def = registry.object(o.def);
      if (!def?.light) continue;
      const c = this.world.objCenter(o);
      const d = (c.x - t.x) ** 2 + (c.y - t.z) ** 2;
      if (d < 50 * 50 && (o.level || 0) <= this.viewLevel) lights.push({ o, def, c, d });
    }
    lights.sort((a, b) => a.d - b.d);
    this.pointLights.forEach((p, i) => {
      const L = lights[i];
      if (!L) { p.intensity = 0; return; }
      const h = L.def.ceiling ? 2.6 : L.def.id === 'streetlight' ? 4.2 : 1.8;
      p.position.set(L.c.x, (L.o.level || 0) * LEVEL_HEIGHT + h, L.c.y);
      p.intensity = 6 * L.def.light * Math.max(0.3, night);
      p.distance = L.def.id === 'streetlight' ? 14 : 8;
    });
  }

  // ---------------------------------------------------------------- terrain
  buildTerrain() {
    const w = this.world;
    if (this.terrain) { this.root.remove(this.terrain); this.terrain.geometry.dispose(); }
    const px = 8;
    const c = document.createElement('canvas');
    c.width = w.w * px; c.height = w.h * px;
    const g = c.getContext('2d');
    const env = w.settings.environment;
    const grass = env === 'futuristic' ? '#7f8f86' : env === 'fantasy' ? '#4f9a5c' : env === 'tropical' ? '#7cc061' : '#6aa84f';
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const t = w.terrainAt(x, y);
      let col = t === 0 ? grass : TERRAIN_COLORS[t];
      const base = new THREE.Color(col);
      const n = ((x * 928371 + y * 123457) % 97) / 97;
      if (t === 0) base.offsetHSL(0, 0, (n - 0.5) * 0.025);
      g.fillStyle = `#${base.getHexString()}`;
      g.fillRect(x * px, y * px, px, px);
      if (t === 1) { g.strokeStyle = 'rgba(0,0,0,0.08)'; g.strokeRect(x * px + 0.5, y * px + 0.5, px - 1, px - 1); }
      if (t === 0 && n > 0.8) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x * px + 2, y * px + 3, 1, 2); }
    }
    // Marquage routier : ligne centrale pointillée.
    g.fillStyle = '#f2e9b5';
    const rx = w.d.map.roadsX || [], ry = w.d.map.roadsY || [];
    for (const r of rx) for (let y = 0; y < w.h; y++) if (y % 3 && !ry.some(q => y >= q && y < q + 4)) g.fillRect((r + 2) * px - 1, y * px, 2, px);
    for (const r of ry) for (let x = 0; x < w.w; x++) if (x % 3 && !rx.some(q => x >= q && x < q + 4)) g.fillRect(x * px, (r + 2) * px - 1, px, 2);
    // Passages piétons aux intersections.
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const r of rx) for (const q of ry) for (let k = 0; k < 4; k++) { g.fillRect((r + k) * px + 1, (q - 1) * px + 1, px - 2, px - 2); g.fillRect((r - 1) * px + 1, (q + k) * px + 1, px - 2, px - 2); }
    // Limites des terrains (lots).
    for (const lot of w.d.lots) {
      g.strokeStyle = lot.type === 'community' ? 'rgba(255,215,64,0.35)' : lot.forSale ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)';
      g.setLineDash([6, 4]); g.lineWidth = 2;
      g.strokeRect(lot.x * px + 1, lot.y * px + 1, lot.w * px - 2, lot.h * px - 2);
      g.setLineDash([]);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.magFilter = THREE.LinearFilter;
    this.terrainTex = tex;
    const geo = new THREE.PlaneGeometry(w.w, w.h);
    geo.rotateX(-Math.PI / 2);
    geo.translate(w.w / 2, 0, w.h / 2);
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    this.terrain.receiveShadow = true;
    this.terrain.name = 'terrain';
    this.root.add(this.terrain);
    // Sol au-delà de la carte (ou océan).
    if (!this.outer) {
      const og = new THREE.PlaneGeometry(1400, 1400); og.rotateX(-Math.PI / 2); og.translate(w.w / 2, -0.05, w.h / 2);
      const water = env === 'tropical';
      this.outer = new THREE.Mesh(og, new THREE.MeshStandardMaterial({ color: water ? '#2f86c9' : grass, roughness: water ? 0.25 : 1, metalness: water ? 0.1 : 0 }));
      this.outer.receiveShadow = true;
      this.root.add(this.outer);
    }
    // Eau animée.
    if (this.water) this.root.remove(this.water);
    const wb = new GeoBuilder();
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.terrainAt(x, y) === 4) wb.quad([x, 0.04, y + 1], [x + 1, 0.04, y + 1], [x + 1, 0.04, y], [x, 0.04, y], [0, 1, 0]);
    if (!wb.empty) {
      this.water = new THREE.Mesh(wb.build(), new THREE.MeshStandardMaterial({ color: '#3aa0e0', transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.2 }));
      this.root.add(this.water);
    }
  }

  // ---------------------------------------------------------------- murs, sols, toits
  setViewLevel(l) { this.viewLevel = l; this.rebuildStructure(); this.refreshObjectVisibility(); }
  setWallMode(m) { this.wallMode = m; this.rebuildStructure(); }

  rebuildStructure(camYaw) {
    if (camYaw !== undefined) {
      // Direction de la caméra quantifiée sur 8 secteurs : on ne reconstruit qu'au changement de secteur.
      const sn = Math.sin(camYaw), cs = Math.cos(camYaw);
      const q = `${Math.abs(sn) > 0.38 ? Math.sign(sn) : 0},${Math.abs(cs) > 0.38 ? Math.sign(cs) : 0}`;
      if (q === this.camQuadrant && !this._dirty) return;
      this.camQuadrant = q;
      this.camDir = { x: Math.abs(sn) > 0.38 ? Math.sign(sn) : 0, z: Math.abs(cs) > 0.38 ? Math.sign(cs) : 0 };
    }
    this._dirty = false;
    for (const g of this.levelGroups) { while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose(); } }
    const w = this.world;
    // Murs groupés par style.
    for (let l = 0; l < LEVELS; l++) {
      if (l > this.viewLevel) continue;
      const byStyle = new Map();
      const glass = new GeoBuilder(), doors = new GeoBuilder(), frames = new GeoBuilder();
      const y0 = l * LEVEL_HEIGHT;
      for (const k in w.d.walls) {
        const [lv, dir, xs, ys] = k.split('|');
        if (+lv !== l) continue;
        const x = +xs, y = +ys;
        const wall = w.d.walls[k];
        const low = this.isLowered(l, dir, x, y);
        const H = low ? LOW_H : WALL_H;
        if (!byStyle.has(wall.style)) byStyle.set(wall.style, new GeoBuilder());
        const gb = byStyle.get(wall.style);
        const seg = (a, b, h0, h1) => {
          // a,b : abscisses le long de l'arête (0..1)
          if (dir === 'h') gb.box(x + a, y0 + h0, y - WALL_T / 2, x + b, y0 + h1, y + WALL_T / 2);
          else gb.box(x - WALL_T / 2, y0 + h0, y + a, x + WALL_T / 2, y0 + h1, y + b);
        };
        const op = wall.opening;
        if (!op) { seg(dir === 'h' ? -WALL_T / 2 : -WALL_T / 2, 1 + WALL_T / 2, 0, H); continue; }
        if (op.kind === 'door' || op.kind === 'arch') {
          const top = op.kind === 'arch' ? 2.5 : 2.2;
          seg(0, 0.1, 0, H); seg(0.9, 1, 0, H);
          if (!low) seg(0.1, 0.9, top, H);
          if (op.kind === 'door' && !low) {
            // Porte entrouverte.
            const px = dir === 'h' ? x + 0.1 : x, pz = dir === 'h' ? y : y + 0.1;
            const len = 0.8, ang = 1.2;
            const dx = dir === 'h' ? Math.cos(ang) : Math.sin(ang) * 0.0, dz = dir === 'h' ? Math.sin(ang) : Math.cos(ang);
            const ex = px + (dir === 'h' ? dx * len : Math.sin(ang) * len), ez = pz + (dir === 'h' ? dz * len : Math.cos(ang) * len);
            const t = 0.05;
            const nx = -(ez - pz), nz = ex - px, nl = Math.hypot(nx, nz) || 1;
            const ox = nx / nl * t, oz = nz / nl * t;
            const b = op.id === 'door_glass' ? glass : doors;
            b.quad([px - ox, y0, pz - oz], [ex - ox, y0, ez - oz], [ex - ox, y0 + top, ez - oz], [px - ox, y0 + top, pz - oz], [-ox / t, 0, -oz / t]);
            b.quad([ex + ox, y0, ez + oz], [px + ox, y0, pz + oz], [px + ox, y0 + top, pz + oz], [ex + ox, y0 + top, ez + oz], [ox / t, 0, oz / t]);
          }
        } else if (op.kind === 'window') {
          const bot = op.id === 'window_tall' ? 0.3 : 0.9, top = op.id === 'window_tall' ? 2.5 : 2.0;
          seg(0, 0.12, 0, H); seg(0.88, 1, 0, H);
          seg(0.12, 0.88, 0, Math.min(bot, H));
          if (!low) {
            seg(0.12, 0.88, top, H);
            if (dir === 'h') { glass.box(x + 0.12, y0 + bot, y - 0.02, x + 0.88, y0 + top, y + 0.02); frames.box(x + 0.12, y0 + bot - 0.05, y - 0.09, x + 0.88, y0 + bot, y + 0.09); }
            else { glass.box(x - 0.02, y0 + bot, y + 0.12, x + 0.02, y0 + top, y + 0.88); frames.box(x - 0.09, y0 + bot - 0.05, y + 0.12, x + 0.09, y0 + bot, y + 0.88); }
          }
        }
      }
      const grp = this.levelGroups[l];
      for (const [style, gb] of byStyle) {
        const st = WALL_STYLES.find(s => s.id === style) || WALL_STYLES[0];
        const m = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ map: patternTexture(st.color, st.pattern || 'grain'), roughness: 0.85 }));
        m.castShadow = true; m.receiveShadow = true; m.name = 'walls';
        grp.add(m);
      }
      if (!glass.empty) grp.add(new THREE.Mesh(glass.build(), new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3 })));
      if (!doors.empty) { const d = new THREE.Mesh(doors.build(), new THREE.MeshStandardMaterial({ color: '#8a5a3c', roughness: 0.6, side: THREE.DoubleSide })); d.castShadow = true; grp.add(d); }
      if (!frames.empty) grp.add(new THREE.Mesh(frames.build(), new THREE.MeshStandardMaterial({ color: '#f5f5f5' })));
      // Sols.
      const floors = new Map();
      for (const k in w.d.floors) {
        const [lv, xs, ys] = k.split('|');
        if (+lv !== l) continue;
        const st = w.d.floors[k];
        if (!floors.has(st)) floors.set(st, new GeoBuilder());
        const x = +xs, y = +ys, fy = y0 + (l === 0 ? 0.03 : 0.02);
        const fb = floors.get(st);
        fb.quad([x, fy, y + 1], [x + 1, fy, y + 1], [x + 1, fy, y], [x, fy, y], [0, 1, 0]);
        if (l > 0) fb.quad([x, y0 - 0.2, y], [x + 1, y0 - 0.2, y], [x + 1, y0 - 0.2, y + 1], [x, y0 - 0.2, y + 1], [0, -1, 0]);
      }
      for (const [style, fb] of floors) {
        const st = FLOOR_STYLES.find(s => s.id === style) || FLOOR_STYLES[0];
        const m = new THREE.Mesh(fb.build(), new THREE.MeshStandardMaterial({ map: patternTexture(st.color, st.pattern || 'grain'), roughness: 0.8 }));
        m.receiveShadow = true; m.name = 'floors';
        grp.add(m);
      }
    }
    this.buildRoofs();
    this.updateWallObjects();
  }

  // Les objets muraux (tableaux, placards) disparaissent quand leur mur est abaissé.
  updateWallObjects() {
    for (const o of this.world.objects) {
      const def = registry.object(o.def);
      if (!def?.wall) continue;
      const v = this.objViews.get(o.id);
      if (!v) continue;
      const r = o.rot & 3, x = o.x, y = o.y;
      const [dir, ex, ey] = [['h', x, y], ['v', x + 1, y], ['h', x, y + 1], ['v', x, y]][r];
      const l = o.level || 0;
      v.visible = l <= this.viewLevel && !(this.world.getWall(l, dir, ex, ey) && this.isLowered(l, dir, ex, ey));
    }
  }

  // Mode découpé : on abaisse les murs entre la caméra et l'intérieur des pièces.
  isLowered(l, dir, x, y) {
    if (this.wallMode === 'down') return true;
    if (this.wallMode === 'up') return false;
    if (l < this.viewLevel) return false;
    const w = this.world;
    const c = this.camDir || { x: 1, z: 1 };
    // On abaisse un mur quand la caméra est de son côté et qu'une pièce se trouve derrière lui.
    if (dir === 'h') {
      if (c.z > 0) return !!w.getFloor(l, x, y - 1);
      if (c.z < 0) return !!w.getFloor(l, x, y);
      return false;
    }
    if (c.x > 0) return !!w.getFloor(l, x - 1, y);
    if (c.x < 0) return !!w.getFloor(l, x, y);
    return false;
  }
  interior(l, x, y) { return !!this.world.getFloor(l, x, y); }

  buildRoofs() {
    if (this.roofGroup) { this.root.remove(this.roofGroup); this.roofGroup.traverse(o => o.geometry?.dispose()); }
    this.roofGroup = new THREE.Group();
    this.root.add(this.roofGroup);
    const show = this.wallMode === 'up';
    this.roofGroup.visible = show;
    for (const r of this.world.d.roofs) {
      const y = (r.level + 1) * LEVEL_HEIGHT;
      const mat = new THREE.MeshStandardMaterial({ color: r.color || '#8b3a2f', roughness: 0.8, side: THREE.DoubleSide, flatShading: true });
      const ov = 0.35;
      const x0 = r.x - ov, x1 = r.x + r.w + ov, z0 = r.y - ov, z1 = r.y + r.h + ov;
      let geo;
      if (r.style === 'flat') {
        geo = new THREE.BoxGeometry(r.w + 0.3, 0.25, r.h + 0.3);
        geo.translate(r.x + r.w / 2, y + 0.12, r.y + r.h / 2);
      } else {
        const h = Math.min(r.w, r.h) * 0.42;
        const pos = [];
        const tri = (a, b, c) => pos.push(...a, ...b, ...c);
        if (r.style === 'gable') {
          // Faîtage parallèle au côté le plus long.
          if (r.w >= r.h) {
            const zm = (z0 + z1) / 2;
            tri([x0, y, z0], [x1, y, z0], [x1, y + h, zm]); tri([x0, y, z0], [x1, y + h, zm], [x0, y + h, zm]);
            tri([x1, y, z1], [x0, y, z1], [x0, y + h, zm]); tri([x1, y, z1], [x0, y + h, zm], [x1, y + h, zm]);
            tri([x0 + ov, y, z0 + ov], [x0 + ov, y + h, zm], [x0 + ov, y, z1 - ov]); tri([x1 - ov, y, z1 - ov], [x1 - ov, y + h, zm], [x1 - ov, y, z0 + ov]);
          } else {
            const xm = (x0 + x1) / 2;
            tri([x0, y, z1], [x0, y, z0], [xm, y + h, z0]); tri([x0, y, z1], [xm, y + h, z0], [xm, y + h, z1]);
            tri([x1, y, z0], [x1, y, z1], [xm, y + h, z1]); tri([x1, y, z0], [xm, y + h, z1], [xm, y + h, z0]);
            tri([x0 + ov, y, z0 + ov], [x1 - ov, y, z0 + ov], [xm, y + h, z0 + ov]); tri([x1 - ov, y, z1 - ov], [x0 + ov, y, z1 - ov], [xm, y + h, z1 - ov]);
          }
        } else {
          // Toit à quatre pans.
          const inset = Math.min(r.w, r.h) / 2;
          const a = [x0 + inset, y + h, z0 + inset], b = [x1 - inset, y + h, z0 + inset], c = [x1 - inset, y + h, z1 - inset], d = [x0 + inset, y + h, z1 - inset];
          tri([x0, y, z0], [x1, y, z0], b); tri([x0, y, z0], b, a);
          tri([x1, y, z0], [x1, y, z1], c); tri([x1, y, z0], c, b);
          tri([x1, y, z1], [x0, y, z1], d); tri([x1, y, z1], d, c);
          tri([x0, y, z1], [x0, y, z0], a); tri([x0, y, z1], a, d);
        }
        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
      }
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.roofId = r.id;
      this.roofGroup.add(m);
    }
  }

  // ---------------------------------------------------------------- objets
  async addObjectView(o) {
    const def = registry.object(o.def);
    const holder = new THREE.Group();
    holder.userData.objId = o.id;
    this.objViews.set(o.id, holder);
    this.objRoot.add(holder);
    this.placeObjectView(o);
    const model = await objectModel(def || null);
    if (!this.objViews.has(o.id)) return;
    if (!def) {
      // Objet d'un mod désactivé : conservé, affiché en fantôme.
      model.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.35; } });
      holder.userData.ghost = true;
    }
    const s = def?.scale || 1;
    model.scale.setScalar(s * (o.state?.size && def?.building ? o.state.size / (def.size[0]) : 1));
    // sy : étirement vertical des meubles cartoon pour des humains à l'échelle réelle (plan de travail à 90 cm…).
    if (def?.sy) model.scale.y *= def.sy;
    // fit : les meubles réalistes sont à l'échelle réelle ; s'ils dépassent leur emprise au sol (cases), on les
    // resserre en largeur/profondeur seulement, la hauteur reste réelle (assise, plan de travail).
    if (def?.fit) {
      const b = new THREE.Box3().setFromObject(model), sz = b.getSize(new THREE.Vector3());
      const fx = Math.min(1, (def.size[0] * 0.98) / (sz.x || 1)), fz = Math.min(1, (def.size[1] * 0.98) / (sz.z || 1));
      model.scale.x *= fx; model.scale.z *= fz;
    }
    // Assiettes : posées à la hauteur du plan (top) sur lequel elles sont servies, sinon au sol.
    if (o.def === 'meal_plate') { const on = o.state?.on && this.world.objects.find(x => x.id === o.state.on); model.position.y = (on ? registry.object(on.def)?.top ?? 0.86 : 0) - 0.86; }
    if (def?.wall) model.position.set(0, def.wallY || 0, -0.5 * (def.size[1] || 1) + (def.model?.startsWith('proc:') ? 0.05 : 0.02));
    if (def?.flat) model.position.y = 0.01;
    holder.add(model);
    holder.userData.model = model;
    holder.traverse(m => { if (m.isMesh) m.userData.objId = o.id; });
    this.applyObjectState(o);
  }

  placeObjectView(o) {
    const v = this.objViews.get(o.id);
    if (!v) return;
    const c = this.world.objCenter(o);
    v.position.set(c.x, (o.level || 0) * LEVEL_HEIGHT, c.y);
    v.rotation.y = -(o.rot & 3) * Math.PI / 2;
    v.visible = (o.level || 0) <= this.viewLevel;
    if (registry.object(o.def)?.wall) this.updateWallObjects();
  }

  removeObjectView(id) {
    const v = this.objViews.get(id);
    if (!v) return;
    this.objRoot.remove(v);
    this.objViews.delete(id);
  }

  applyObjectState(o) {
    const v = this.objViews.get(o.id);
    if (!v) return;
    const burnt = o.state?.burnt > this.world.time, frozen = o.state?.frozen > this.world.time;
    if (burnt === !!v.userData.burnt && frozen === !!v.userData.frozen) return;
    v.userData.burnt = burnt; v.userData.frozen = frozen;
    v.traverse(m => {
      if (!m.isMesh) return;
      if (!m.userData.origMat) m.userData.origMat = m.material;
      if (burnt || frozen) { m.material = m.userData.origMat.clone(); m.material.color = new THREE.Color(burnt ? '#2b2b2b' : '#a8e4ff'); if (frozen) { m.material.roughness = 0.1; m.material.metalness = 0.3; } }
      else m.material = m.userData.origMat;
    });
  }

  refreshObjectVisibility() { for (const o of this.world.objects) this.placeObjectView(o); }

  // ---------------------------------------------------------------- créatures d'ambiance
  async syncCritters(dt) {
    const list = this.world.d.critters || [];
    for (const c of list) {
      let v = this.critterViews.get(c.id);
      const def = ANIMALS[c.kind] || ANIMALS.fox;
      if (!v) {
        v = { group: new THREE.Group(), mixer: null, actions: {}, rig: null, t: Math.random() * 100 };
        this.critterViews.set(c.id, v);
        this.root.add(v.group);
        Promise.all([loadGLB(def.model), c.kind === 'skeleton' ? loadGLB('characters/Skeleton_Warrior') : null]).then(([g, anim]) => {
          const m = skeletonClone(g.scene);
          m.scale.setScalar(c.kind === 'skeleton' ? 0.55 : c.kind === 'fox' ? 0.012 : 1);
          m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
          v.group.add(m);
          v.model = m;
          const clips = (anim || g).animations;
          if (!clips.length) { v.rig = animalRig(m, v.group); return; }
          v.mixer = new THREE.AnimationMixer(m);
          const find = n => clips.find(a => a.name === n);
          v.actions.idle = v.mixer.clipAction(find(c.kind === 'skeleton' ? 'Idle' : 'Survey') || clips[0]);
          v.actions.walk = v.mixer.clipAction(find(c.kind === 'skeleton' ? 'Walking_D_Skeletons' : 'Walk') || find('Walking_A') || clips[0]);
          v.actions.run = v.mixer.clipAction(find(c.kind === 'skeleton' ? 'Running_A' : 'Run') || clips[0]);
          v.actions.idle.play();
          v.cur = 'idle';
        }).catch(() => {});
      }
      v.group.position.set(c.x, 0, c.y);
      v.group.rotation.y = c.rot;
      if (v.mixer) {
        const want = c.state === 'flee' ? 'run' : c.state === 'walk' ? 'walk' : 'idle';
        if (want !== v.cur && v.actions[want]) { v.actions[v.cur]?.fadeOut(0.3); v.actions[want].reset().fadeIn(0.3).play(); v.cur = want; }
        v.mixer.update(dt);
      } else if (v.rig) animateRig(v, def, c.state, dt);
    }
  }

  // ---------------------------------------------------------------- météo
  updateWeather(dt, target) {
    const type = this.world.d.weather?.type;
    const active = type === 'rain' || type === 'snow';
    if (!active) { if (this.weatherPts) this.weatherPts.visible = false; return; }
    if (!this.weatherPts || this.weatherKind !== type) {
      if (this.weatherPts) this.scene.remove(this.weatherPts);
      const n = this.quality.particles ? 2500 : 900;
      const g = new THREE.BufferGeometry();
      const p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 60; p[i * 3 + 1] = Math.random() * 30; p[i * 3 + 2] = (Math.random() - 0.5) * 60; }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.weatherPts = new THREE.Points(g, new THREE.PointsMaterial({ color: type === 'snow' ? '#ffffff' : '#a9c8ff', size: type === 'snow' ? 0.18 : 0.08, transparent: true, opacity: 0.8 }));
      this.weatherKind = type;
      this.scene.add(this.weatherPts);
    }
    this.weatherPts.visible = true;
    this.weatherPts.position.set(target.x, 0, target.z);
    const arr = this.weatherPts.geometry.attributes.position.array;
    const sp = type === 'snow' ? 2 : 18;
    for (let i = 1; i < arr.length; i += 3) { arr[i] -= sp * dt; if (arr[i] < 0) arr[i] = 30; if (type === 'snow') arr[i - 1] += Math.sin(arr[i] + i) * 0.01; }
    this.weatherPts.geometry.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------- effets visuels des pouvoirs
  updateVfx(list, now, realNow) {
    const seen = new Set();
    for (const fx of list) {
      seen.add(fx.id);
      let v = this.vfxViews.get(fx.id);
      if (!v) { v = this.makeVfx(fx); this.vfxViews.set(fx.id, v); this.root.add(v); }
      const u = fx.realUntil ? Math.min(1, 1 - (fx.realUntil - realNow) / 8000) : Math.min(1, (now - fx.t0) / Math.max(0.01, (fx.until - fx.t0)));
      this.animateVfx(v, fx, u, now);
    }
    for (const [id, v] of this.vfxViews) if (!seen.has(id)) { this.root.remove(v); v.traverse(o => o.geometry?.dispose()); this.vfxViews.delete(id); }
  }

  makeVfx(fx) {
    const g = new THREE.Group();
    const col = new THREE.Color(fx.color || '#7fd4ff');
    const glow = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    switch (fx.type) {
      case 'projectile': { const s = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), glow); const h = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), glow.clone()); h.material.opacity = 0.3; s.add(h); g.add(s); g.userData.ball = s; break; }
      case 'beam': { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 10, 1, true), glow); g.add(c); g.userData.beam = c; break; }
      case 'pulse': case 'gravity': case 'timestop': {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 40), glow); ring.rotation.x = Math.PI / 2; g.add(ring); g.userData.ring = ring;
        const s = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), glow.clone()); s.material.opacity = 0.18; g.add(s); g.userData.sph = s; break;
      }
      case 'teleport': case 'absorb': { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3, 16, 1, true), glow); c.position.y = 1.5; g.add(c); g.userData.col = c; break; }
      case 'illusion': {
        const kind = fx.kind;
        if (kind === 'cake') {
          for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(2.2 - i * 0.6, 2.2 - i * 0.6, 1, 24), new THREE.MeshStandardMaterial({ color: ['#ffb6c1', '#fff0f5', '#ff69b4'][i], transparent: true, opacity: 0.8 })); t.position.y = 0.5 + i; g.add(t); }
        } else {
          loadGLB('characters/Skeleton_Warrior').then(gl => {
            const m = skeletonClone(gl.scene); m.scale.setScalar(kind === 'dragon' ? 2.6 : 2.0);
            m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.6; o.material.color = new THREE.Color(kind === 'dragon' ? '#ff6b3c' : '#b04cff'); o.frustumCulled = false; } });
            g.add(m);
            const mixer = new THREE.AnimationMixer(m); const clip = gl.animations.find(a => a.name === 'Cheer') || gl.animations[0]; mixer.clipAction(clip).play(); g.userData.mixer = mixer;
          }).catch(() => {});
        }
        break;
      }
      case 'carry': break;
      default: g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3), glow));
    }
    return g;
  }

  animateVfx(v, fx, u, now) {
    switch (fx.type) {
      case 'projectile': {
        const k = Math.min(1, u * (fx.until - fx.t0) / (fx.dur || 0.6));
        v.position.set(fx.from.x + (fx.to.x - fx.from.x) * k, fx.from.hz + (fx.to.hz - fx.from.hz) * k + Math.sin(k * Math.PI) * 0.5, fx.from.y + (fx.to.y - fx.from.y) * k);
        v.visible = k < 1;
        break;
      }
      case 'beam': {
        const a = new THREE.Vector3(fx.from.x, fx.from.hz, fx.from.y), b = new THREE.Vector3(fx.to.x, fx.to.hz, fx.to.y);
        const len = a.distanceTo(b);
        v.position.copy(a).lerp(b, 0.5);
        v.lookAt(b); v.rotateX(Math.PI / 2);
        v.userData.beam.scale.set(1 + Math.sin(now * 40) * 0.2, len, 1 + Math.sin(now * 40) * 0.2);
        v.userData.beam.material.opacity = 0.9 * (1 - u);
        break;
      }
      case 'pulse': case 'gravity': case 'timestop': {
        const r = (fx.radius || 3) * (fx.type === 'pulse' ? u : 1);
        v.position.set(fx.at.x, (fx.at.hz || 0) + 0.3, fx.at.y);
        v.userData.ring.scale.setScalar(Math.max(0.05, r));
        v.userData.sph.scale.setScalar(Math.max(0.05, fx.type === 'pulse' ? r * 0.8 : r));
        v.userData.ring.material.opacity = fx.type === 'pulse' ? 1 - u : 0.6 + Math.sin(now * 3) * 0.2;
        if (fx.type === 'gravity') v.userData.ring.position.y = (Math.sin(now * 2) + 1);
        break;
      }
      case 'teleport': case 'absorb':
        v.position.set(fx.at.x, (fx.at.hz || 0) - 1, fx.at.y);
        v.userData.col.scale.set(1 - u, 1 + u, 1 - u);
        v.userData.col.material.opacity = 0.8 * (1 - u);
        break;
      case 'illusion':
        v.position.set(fx.at.x, fx.at.hz || 0, fx.at.y);
        v.rotation.y += 0.01;
        v.userData.mixer?.update(0.016);
        break;
    }
  }

  // Animation des petits éléments (portails, écrans).
  tick(now) {
    for (const [id, v] of this.objViews) {
      const m = v.userData.model;
      if (!m) continue;
      const disc = m.getObjectByName('portalDisc');
      if (disc) disc.rotation.z = now * 2;
      const spin = m.getObjectByName('spin');
      if (spin) spin.rotation.y = now;
      const o = this.world.obj(id);
      if (o?.state && (o.state.burnt || o.state.frozen)) this.applyObjectState(o);
    }
  }
}

// ---------------------------------------------------------------- animation procédurale des animaux
// Les animaux Rocketbox sont livrés riggés mais sans animation : on fait osciller pattes, tête et queue.
const _q = new THREE.Quaternion();
function animalRig(model, group) {
  model.updateMatrixWorld(true);
  const gq = group.getWorldQuaternion(new THREE.Quaternion());
  const lateral = new THREE.Vector3(1, 0, 0).applyQuaternion(gq), up = new THREE.Vector3(0, 1, 0).applyQuaternion(gq);
  const bones = {};
  model.traverse(o => {
    if (!o.isBone && o.type !== 'Object3D') return;
    const n = o.name.replace(/_/g, ' ');
    const key = /\bL Thigh$/.test(n) ? 'thighL' : /\bR Thigh$/.test(n) ? 'thighR' : /\bL Calf$/.test(n) ? 'calfL' : /\bR Calf$/.test(n) ? 'calfR'
      : /\bL UpperArm$/.test(n) ? 'armL' : /\bR UpperArm$/.test(n) ? 'armR' : /\bL Forearm$/.test(n) ? 'foreL' : /\bR Forearm$/.test(n) ? 'foreR'
      : /\bNeck$/.test(n) ? 'neck' : /\bHead$/.test(n) ? 'head' : /\bTail$/.test(n) ? 'tail' : /\bTail1$/.test(n) ? 'tail1' : null;
    if (!key || bones[key] || !o.parent) return;
    const pq = o.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bones[key] = { o, rest: o.quaternion.clone(), lat: lateral.clone().applyQuaternion(pq).normalize(), up: up.clone().applyQuaternion(pq).normalize() };
  });
  return Object.keys(bones).length >= 4 ? bones : null;
}
function turn(b, axis, a) { if (b) b.o.quaternion.copy(_q.setFromAxisAngle(b[axis], a)).multiply(b.rest); }
function animateRig(v, def, state, dt) {
  const r = v.rig, moving = state === 'walk' || state === 'flee';
  v.blend = THREE.MathUtils.damp(v.blend || 0, moving ? 1 : 0, 6, dt);
  v.t += dt * (def.gait || 1.5) * (state === 'flee' ? 1.8 : 1);
  const p = v.t * Math.PI * 2, amp = (state === 'flee' ? 0.55 : 0.32) * v.blend;
  if (def.biped) {
    turn(r.thighL, 'lat', Math.sin(p) * amp); turn(r.thighR, 'lat', Math.sin(p + Math.PI) * amp);
  } else {
    turn(r.armL, 'lat', Math.sin(p) * amp); turn(r.armR, 'lat', Math.sin(p + Math.PI) * amp);
    turn(r.thighL, 'lat', Math.sin(p + Math.PI) * amp); turn(r.thighR, 'lat', Math.sin(p) * amp);
    turn(r.foreL, 'lat', Math.max(0, Math.sin(p + 0.6)) * amp * 0.7); turn(r.foreR, 'lat', Math.max(0, Math.sin(p + Math.PI + 0.6)) * amp * 0.7);
    turn(r.calfL, 'lat', -Math.max(0, Math.sin(p + Math.PI + 0.6)) * amp * 0.6); turn(r.calfR, 'lat', -Math.max(0, Math.sin(p + 0.6)) * amp * 0.6);
  }
  // Tête : regarde autour, ou broute (herbivores) quand l'animal est à l'arrêt.
  const slow = v.t / (def.gait || 1.5);
  const graze = def.graze && !moving ? Math.max(0, Math.sin(slow * 0.35)) : 0;
  v.graze = THREE.MathUtils.damp(v.graze || 0, graze, 3, dt);
  turn(r.neck, 'lat', v.graze * 0.9);
  turn(r.head, 'up', Math.sin(slow * 0.5) * 0.35 * (1 - v.blend));
  turn(r.tail, 'up', Math.sin(v.t * Math.PI * (def.rig ? 3 : 1.2)) * (def.rig ? 0.5 : 0.25));
  if (def.tailDrop && r.tail) r.tail.o.quaternion.premultiply(_q.setFromAxisAngle(r.tail.lat, def.tailDrop));
  turn(r.tail1, 'up', Math.sin(v.t * Math.PI * (def.rig ? 3 : 1.2) - 0.8) * 0.3);
  if (v.model) v.model.position.y = Math.abs(Math.sin(p)) * 0.025 * v.blend;
}

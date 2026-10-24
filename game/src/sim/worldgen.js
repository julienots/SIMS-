// Générateur d'univers : routes, terrains, maisons meublées, lieux publics, foyers et habitants.
import { uid, clamp } from '../core/util.js';
import { registry } from '../mods/registry.js';
import { World } from './world.js';
import { createSim } from './factory.js';
import { Navigator } from './nav.js';
import { FAUNA } from './data/animals.js';

export const ENVIRONMENTS = [
  { id: 'modern', name: 'Ville moderne', icon: '🏙️', desc: 'Immeubles, commerces et quartiers animés.', ground: '#6aa84f', venues: ['park', 'restaurant', 'gym', 'library', 'cinema', 'office', 'shop', 'school'] },
  { id: 'village', name: 'Village paisible', icon: '🏡', desc: 'Petites maisons, jardins et place du marché.', ground: '#7bbf5a', venues: ['park', 'restaurant', 'library', 'shop', 'office', 'school'] },
  { id: 'tropical', name: 'Île tropicale', icon: '🏝️', desc: 'Sable chaud, palmiers et océan turquoise.', ground: '#86c06c', venues: ['park', 'restaurant', 'gym', 'shop', 'office', 'cinema'] },
  { id: 'futuristic', name: 'Ville futuriste', icon: '🚀', desc: 'Modules spatiaux, rovers et technologies de pointe.', ground: '#8a9aa8', venues: ['park', 'restaurant', 'gym', 'library', 'office', 'cinema', 'shop', 'school'] },
  { id: 'fantasy', name: 'Univers fantastique', icon: '🧙', desc: 'Créatures étranges, forêts magiques et mystères.', ground: '#5b9a58', venues: ['park', 'restaurant', 'library', 'gym', 'shop', 'office'] },
  { id: 'suburb', name: 'Quartier résidentiel', icon: '🏘️', desc: 'Maisons avec jardins, rues calmes.', ground: '#71b356', venues: ['park', 'restaurant', 'gym', 'school', 'shop', 'office'] },
  { id: 'custom', name: 'Monde personnalisé', icon: '🧩', desc: 'Une carte presque vide, routes comprises : tout est à construire.', ground: '#6aa84f', venues: ['park'] },
];

const T = { GRASS: 0, PATH: 1, SAND: 2, ROAD: 3, WATER: 4 };
const STRIDE = 34, ROAD = 4;

export function generateWorld({ name, settings, seed }) {
  const world = World.create({ name, settings, seed });
  const g = new Generator(world);
  g.run();
  return world;
}

class Generator {
  constructor(world) {
    this.w = world;
    this.rng = world.rng;
    this.env = ENVIRONMENTS.find(e => e.id === world.settings.environment) || ENVIRONMENTS[0];
    this.nav = new Navigator(world);
  }

  run() {
    this.layoutRoads();
    this.makeLots();
    this.assignVenues();
    this.populate();
    this.decorate();
    this.w.rebuildIndexes();
    this.w.log('world', `🌍 L’univers « ${this.w.d.name} » est né (${this.env.name}).`, [], { icon: '🌍', important: true });
  }

  roadCoords(n) {
    const off = Math.floor((n % STRIDE) / 2) + 4;
    const out = [];
    for (let c = off; c + ROAD <= n; c += STRIDE) out.push(c);
    return out;
  }

  layoutRoads() {
    const w = this.w, n = w.w;
    this.roadsX = this.roadCoords(n);
    this.roadsY = this.roadCoords(n);
    const isRoad = (x, y) => this.roadsX.some(r => x >= r && x < r + ROAD) || this.roadsY.some(r => y >= r && y < r + ROAD);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (isRoad(x, y)) w.setTerrain(x, y, T.ROAD);
    }
    // Trottoirs autour des routes.
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (w.terrainAt(x, y) === T.ROAD) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.inBounds(x + dx, y + dy) && w.terrainAt(x + dx, y + dy) === T.ROAD) { w.setTerrain(x, y, T.PATH); break; }
    }
    if (this.env.id === 'tropical') {
      // Une île : océan sur le pourtour, plage de sable.
      const c = n / 2;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const d = Math.max(Math.abs(x - c), Math.abs(y - c)) / c + (Math.sin(x * 0.3) + Math.cos(y * 0.25)) * 0.015;
        if (d > 0.97) w.setTerrain(x, y, T.WATER);
        else if (d > 0.9 && w.terrainAt(x, y) !== T.ROAD) w.setTerrain(x, y, T.SAND);
      }
    }
    w.d.map.roadsX = this.roadsX; w.d.map.roadsY = this.roadsY;
  }

  // Découpe les blocs entre les routes en terrains de 14x14 (ou moins en bordure).
  segments(roads, n) {
    const segs = [];
    let start = 0;
    for (const r of [...roads, n]) {
      const a = start + 1, b = r - 1;   // garde une case de trottoir
      const len = b - a;
      if (len >= 12) {
        if (len >= 28) { segs.push([a, 14, 'low']); segs.push([b - 14, 14, 'high']); }
        else segs.push([r === n ? a : b - Math.min(14, len), Math.min(14, len), r === n ? 'low' : 'high']);
      }
      start = r + ROAD;
    }
    return segs;
  }

  makeLots() {
    const w = this.w, n = w.w;
    const xs = this.segments(this.roadsX, n), ys = this.segments(this.roadsY, n);
    let i = 0;
    for (const [y, h, ySide] of ys) for (const [x, wd] of xs) {
      // La façade donne sur la route la plus proche (nord ou sud).
      const front = ySide === 'high' ? 's' : 'n';
      const lot = { id: uid('lot'), name: `Terrain ${++i}`, type: 'residential', venue: null, x, y, w: wd, h, front, householdId: null, forSale: true, price: 3000 + wd * h * 10 };
      // On ignore les terrains noyés.
      let water = 0;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + wd; xx++) if (w.terrainAt(xx, yy) === T.WATER) water++;
      if (water > wd * h * 0.2) continue;
      w.d.lots.push(lot);
    }
    this.rng.shuffle(w.d.lots);
  }

  assignVenues() {
    const w = this.w;
    const lots = w.d.lots;
    const custom = this.env.id === 'custom';
    const maxVenues = Math.max(1, Math.floor(lots.length * (custom ? 0.1 : 0.45)));
    const venues = this.env.venues.slice(0, maxVenues);
    const names = { park: 'Parc central', restaurant: 'Restaurant « Le Savoureux »', gym: 'Salle de sport « Pulse »', library: 'Médiathèque', cinema: 'Cinéma Étoile', office: 'Tour SuperEssence', shop: 'Galeries du Centre', school: 'Académie des Talents' };
    let vi = 0;
    for (const lot of lots) {
      if (vi >= venues.length) break;
      if (lot.w < 13 || lot.h < 13) continue;
      lot.type = 'community'; lot.venue = venues[vi++]; lot.name = names[lot.venue]; lot.forSale = false;
      this.buildVenue(lot);
    }
  }

  // ------------------------------------------------------------------ outils de placement
  place(defId, x, y, rot = 0, level = 0, extra) {
    const w = this.w;
    if (!registry.object(defId)) return null;
    if (!w.canPlace(defId, x, y, rot, level).ok) return null;
    return w.addObject(defId, x, y, rot, level, extra);
  }

  wallRect(x0, y0, x1, y1, level, style) {
    // Rectangle de murs [x0,x1) x [y0,y1)
    const w = this.w;
    for (let x = x0; x < x1; x++) { w.setWall(level, 'h', x, y0, { style }); w.setWall(level, 'h', x, y1, { style }); }
    for (let y = y0; y < y1; y++) { w.setWall(level, 'v', x0, y, { style }); w.setWall(level, 'v', x1, y, { style }); }
  }
  floorRect(x0, y0, x1, y1, level, style) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.w.setFloor(level, x, y, style); }
  opening(level, dir, x, y, id) {
    const o = { door: { kind: 'door', id: 'door' }, door_glass: { kind: 'door', id: 'door_glass' }, window: { kind: 'window', id: 'window' }, window_tall: { kind: 'window', id: 'window_tall' }, arch: { kind: 'arch', id: 'arch' } }[id];
    const wall = this.w.getWall(level, dir, x, y);
    if (wall) wall.opening = o;
  }

  // Meuble une pièce en posant les objets le long des murs, en gardant les accès dégagés.
  furnish(room, items, reserved) {
    const w = this.w;
    const placed = [];
    for (const it of items) {
      const def = registry.object(it);
      if (!def) continue;
      let ok = false;
      const cands = [];
      for (let y = room.y0; y < room.y1; y++) for (let x = room.x0; x < room.x1; x++) {
        // rot orienté vers l'intérieur selon le mur le plus proche.
        const dN = y - room.y0, dS = room.y1 - 1 - y, dW = x - room.x0, dE = room.x1 - 1 - x;
        const m = Math.min(dN, dS, dW, dE);
        const rot = m === dN ? 0 : m === dS ? 2 : m === dW ? 3 : 1;
        cands.push({ x, y, rot, m });
      }
      this.rng.shuffle(cands);
      cands.sort((a, b) => a.m - b.m);
      for (const c of cands) {
        if (def.wall && c.m !== 0) continue;
        const f = w.footprint({ def: it, x: c.x, y: c.y, rot: c.rot });
        if (f.x < room.x0 || f.y < room.y0 || f.x + f.w > room.x1 || f.y + f.d > room.y1) continue;
        let clash = false;
        for (let yy = f.y; yy < f.y + f.d && !clash; yy++) for (let xx = f.x; xx < f.x + f.w; xx++) if (reserved.has(`${xx},${yy}`) && !def.wall) { clash = true; break; }
        if (clash) continue;
        // La rangée devant l'objet doit rester libre.
        const front = [];
        const fr = c.rot;
        for (let k = 0; k < (fr % 2 === 0 ? f.w : f.d); k++) {
          const fx = fr === 0 ? f.x + k : fr === 2 ? f.x + k : fr === 1 ? f.x - 1 : f.x + f.w;
          const fy = fr === 0 ? f.y + f.d : fr === 2 ? f.y - 1 : f.y + k;
          front.push([fx, fy]);
        }
        if (!def.wall && !def.noCollide && front.some(([fx, fy]) => fx < room.x0 || fy < room.y0 || fx >= room.x1 || fy >= room.y1 || (reserved.has(`${fx},${fy}`) && reserved.get(`${fx},${fy}`) === 'obj'))) continue;
        const o = this.place(it, c.x, c.y, c.rot, room.level || 0);
        if (!o) continue;
        if (!def.wall && !def.noCollide) {
          for (let yy = f.y; yy < f.y + f.d; yy++) for (let xx = f.x; xx < f.x + f.w; xx++) reserved.set(`${xx},${yy}`, 'obj');
          for (const [fx, fy] of front) if (!reserved.has(`${fx},${fy}`)) reserved.set(`${fx},${fy}`, 'front');
        }
        placed.push(o);
        ok = true;
        break;
      }
      void ok;
    }
    return placed;
  }

  // Place des chaises autour d'une table.
  chairsAround(table, chairId, max = 4) {
    const w = this.w;
    const f = w.footprint(table);
    const spots = [];
    for (let x = f.x; x < f.x + f.w; x++) { spots.push([x, f.y - 1, 2]); spots.push([x, f.y + f.d, 0]); }
    for (let y = f.y; y < f.y + f.d; y++) { spots.push([f.x - 1, y, 1]); spots.push([f.x + f.w, y, 3]); }
    let n = 0;
    for (const [x, y, rotToward] of spots) {
      if (n >= max) break;
      // La chaise regarde la table : rot opposé à l'emplacement.
      const rot = rotToward === 0 ? 2 : rotToward === 2 ? 0 : rotToward === 1 ? 3 : 1;
      if (this.place(chairId, x, y, rot, table.level || 0)) n++;
    }
  }

  // ------------------------------------------------------------------ maisons
  buildHouse(lot, size) {
    const w = this.w, rng = this.rng;
    const hw = clamp(size === 'big' ? 12 : size === 'small' ? 8 : 10, 6, lot.w - 2);
    const hd = clamp(size === 'big' ? 10 : size === 'small' ? 7 : 8, 6, lot.h - 4);
    const x0 = lot.x + Math.floor((lot.w - hw) / 2);
    const y0 = lot.front === 'n' ? lot.y + 4 : lot.y + lot.h - 4 - hd;
    const x1 = x0 + hw, y1 = y0 + hd;
    const wallStyle = rng.pick(['plaster', 'peach', 'mint', 'sky', 'brick', 'lilac', 'wood']);
    const inner = rng.pick(['plaster', 'peach', 'mint', 'sky', 'lilac']);
    const frontY = lot.front === 'n' ? y0 : y1;
    this.wallRect(x0, y0, x1, y1, 0, wallStyle);
    // Pièces : salon/cuisine côté façade, chambres et salle de bain à l'arrière.
    const split = lot.front === 'n' ? y0 + Math.ceil(hd * 0.55) : y1 - Math.ceil(hd * 0.55);
    for (let x = x0; x < x1; x++) w.setWall(0, 'h', x, split, { style: inner });
    const backY0 = lot.front === 'n' ? split : y0, backY1 = lot.front === 'n' ? y1 : split;
    const frontRoomY0 = lot.front === 'n' ? y0 : split, frontRoomY1 = lot.front === 'n' ? split : y1;
    const bathW = 3;
    const bedSplit = x1 - bathW;
    for (let y = backY0; y < backY1; y++) w.setWall(0, 'v', bedSplit, y, { style: inner });
    let bed2 = null;
    if (hw >= 10) { bed2 = x0 + Math.floor((bedSplit - x0) / 2); for (let y = backY0; y < backY1; y++) w.setWall(0, 'v', bed2, y, { style: inner }); }
    // Sols.
    const fl = rng.pick(['wood', 'dark_wood', 'marble']);
    this.floorRect(x0, frontRoomY0, x1, frontRoomY1, 0, fl);
    this.floorRect(x0, backY0, bedSplit, backY1, 0, rng.pick(['carpet', 'wood']));
    this.floorRect(bedSplit, backY0, x1, backY1, 0, 'tiles');
    // Portes et fenêtres.
    const doorX = x0 + Math.floor(hw / 2);
    this.opening(0, 'h', doorX, frontY, 'door');
    const midX = (a, b) => a + Math.floor((b - a) / 2);
    this.opening(0, 'h', midX(bedSplit, x1), split, 'door');
    if (bed2) { this.opening(0, 'h', midX(x0, bed2), split, 'door'); this.opening(0, 'h', midX(bed2, bedSplit), split, 'door'); }
    else this.opening(0, 'h', midX(x0, bedSplit), split, 'door');
    for (let x = x0 + 1; x < x1 - 1; x += 3) if (x !== doorX && Math.abs(x - doorX) > 1) this.opening(0, 'h', x, frontY, rng.chance(0.5) ? 'window_tall' : 'window');
    const backY = lot.front === 'n' ? y1 : y0;
    for (let x = x0 + 1; x < x1 - 1; x += 3) this.opening(0, 'h', x, backY, 'window');
    for (let y = y0 + 1; y < y1 - 1; y += 3) { this.opening(0, 'v', x0, y, 'window'); this.opening(0, 'v', x1, y, 'window'); }
    // Toit.
    w.d.roofs.push({ id: uid('roof'), level: 0, x: x0, y: y0, w: hw, h: hd, style: rng.pick(['gable', 'hip']), color: rng.pick(['#8b3a2f', '#3b4a6b', '#4d5d3a', '#6b4a3a', '#5a5a5a']) });

    // Ameublement.
    const res = new Map();
    const reserveDoor = (x, y) => { res.set(`${x},${y}`, 'door'); };
    // Cases devant les portes.
    reserveDoor(doorX, lot.front === 'n' ? y0 : y1 - 1);
    reserveDoor(midX(bedSplit, x1), split); reserveDoor(midX(bedSplit, x1), split - 1);
    if (bed2) { reserveDoor(midX(x0, bed2), split); reserveDoor(midX(x0, bed2), split - 1); reserveDoor(midX(bed2, bedSplit), split); reserveDoor(midX(bed2, bedSplit), split - 1); }
    else { reserveDoor(midX(x0, bedSplit), split); reserveDoor(midX(x0, bedSplit), split - 1); }
    // Couloir libre entre la porte d'entrée et les portes intérieures.
    const corridorY = lot.front === 'n' ? split - 1 : split;
    for (let x = x0; x < x1; x++) res.set(`${x},${corridorY}`, 'door');
    for (let y = Math.min(frontRoomY0, frontRoomY1); y < Math.max(frontRoomY0, frontRoomY1); y++) res.set(`${doorX},${y}`, 'door');

    const living = { x0, y0: frontRoomY0, x1, y1: frontRoomY1 };
    const kitchenItems = ['fridge', 'stove', 'counter_a', 'sink_kitchen', 'counter_b'];
    const livingItems = ['couch', 'tv', 'bookshelf', 'lamp_floor', 'armchair', rng.pick(['stereo', 'computer_desk', 'easel', 'chess', 'piano']), 'cactus', 'frame_large', 'ceiling_light'];
    // Cuisine dans la moitié gauche du séjour, salon dans la moitié droite.
    const kitchen = { ...living, x1: doorX };
    const lounge = { ...living, x0: doorX + 1 };
    this.furnish(kitchen, kitchenItems, res);
    const table = this.furnish({ ...kitchen, x0: kitchen.x0 + 1, x1: kitchen.x1, y0: kitchen.y0 + 1, y1: kitchen.y1 - 1 }, ['table_kitchen'], res)[0];
    if (table) this.chairsAround(table, rng.pick(['chair_kitchen', 'chair_wood', 'chair_a']), 3);
    this.placeTvSetup(lounge, res);
    this.furnish(lounge, livingItems.filter(i => i !== 'couch' && i !== 'tv'), res);
    // Chambres.
    const bedA = { x0, y0: backY0, x1: bed2 || bedSplit, y1: backY1 };
    this.furnish(bedA, [rng.pick(['bed_double', 'bed_double_b']), 'dresser', 'nightstand', 'lamp_table', 'frame_small'], res);
    if (bed2) this.furnish({ x0: bed2, y0: backY0, x1: bedSplit, y1: backY1 }, [rng.pick(['bed_single', 'bed_single_b']), rng.pick(['computer_desk', 'guitar', 'easel']), 'dresser_deco', 'cactus_small'], res);
    // Salle de bain.
    this.furnish({ x0: bedSplit, y0: backY0, x1, y1: backY1 }, ['toilet', rng.chance(0.5) ? 'shower' : 'bathtub', 'sink_bath', 'towels'], res);
    // Jardin.
    this.garden(lot, { x0, y0, x1, y1 });
    // Allée vers la rue.
    const pathFrom = lot.front === 'n' ? lot.y : y1;
    const pathTo = lot.front === 'n' ? y0 : lot.y + lot.h;
    for (let y = pathFrom; y < pathTo; y++) w.setTerrain(doorX, y, T.PATH);
    this.frontYard(lot, { x0, y0, x1, y1 }, doorX);
    this.validateReachability({ x: doorX, y: lot.front === 'n' ? y0 - 1 : y1 }, lot);
    return { x0, y0, x1, y1, doorX };
  }

  placeTvSetup(room, res) {
    const w = this.w;
    // Télé contre un mur, canapé en face.
    const tv = this.furnish({ ...room, y1: room.y0 + 1 }, ['tv'], res)[0] || this.furnish(room, ['tv'], res)[0];
    if (!tv) { this.furnish(room, ['couch'], res); return; }
    const f = w.footprint(tv);
    const facing = tv.rot;
    for (let dist = 3; dist <= 4; dist++) {
      const cx = facing === 0 ? f.x : facing === 2 ? f.x : facing === 1 ? f.x - dist - 1 : f.x + f.w + dist;
      const cy = facing === 0 ? f.y + f.d + dist - 1 : facing === 2 ? f.y - dist : f.y;
      const rot = (facing + 2) % 4;
      if (cx < room.x0 || cy < room.y0 || cx + 2 > room.x1 || cy >= room.y1) continue;
      const c = this.place('couch', cx, cy, rot, 0);
      if (c) { const cf = w.footprint(c); for (let yy = cf.y; yy < cf.y + cf.d; yy++) for (let xx = cf.x; xx < cf.x + cf.w; xx++) res.set(`${xx},${yy}`, 'obj'); this.place('rug', cx, facing === 0 ? cy - 1 : cy + 1, 0, 0); return; }
    }
    this.furnish(room, ['couch'], res);
  }

  // Jardin de devant à la Sims : allée de garage avec voiture, boîte aux lettres, poubelle, clôture blanche,
  // massifs de fleurs le long de la façade.
  frontYard(lot, house, doorX) {
    const w = this.w, rng = this.rng;
    if (this.env.id === 'futuristic' || this.env.id === 'fantasy') return;
    const north = lot.front === 'n';
    const street = north ? lot.y : lot.y + lot.h - 1;       // rangée côté rue
    const faceRot = north ? 2 : 0;                           // face avant vers la rue
    const facadeRow = north ? house.y0 - 1 : house.y1;       // rangée juste devant la façade
    const step = north ? 1 : -1;
    // Allée de garage (2 cases) sur le côté le plus large, si la place le permet.
    const right = lot.x + lot.w - house.x1, left = house.x0 - lot.x;
    let drive = null;
    if (right >= 3) drive = house.x1 + 1; else if (left >= 3) drive = house.x0 - 3;
    const driveRows = [];
    if (drive !== null) {
      // De la rue jusqu'au milieu du flanc de la maison (6 à 7 cases : la voiture en fait 4).
      for (let k = 0; k < 7; k++) { const y = street + k * step; if (y < lot.y || y >= lot.y + lot.h) break; driveRows.push(y); }
      for (const y of driveRows) for (const x of [drive, drive + 1]) w.setTerrain(x, y, T.PATH);
      if (driveRows.length >= 5 && rng.chance(0.8)) {
        const carY = north ? street + 1 : street - 4;
        this.place(rng.pick(['car_sedan', 'car_hatchback', 'car_stationwagon']), drive, carY, rng.chance(0.5) ? 0 : 2, 0);
      }
    }
    const blocked = x => x === doorX || (drive !== null && (x === drive || x === drive + 1));
    // Boîte aux lettres et poubelle au bord de la rue.
    this.place('mailbox', doorX + 1 < lot.x + lot.w && !blocked(doorX + 1) ? doorX + 1 : doorX - 1, street, faceRot, 0);
    if (drive !== null) this.place('trash', drive + 2 < lot.x + lot.w ? drive + 2 : drive - 1, street, faceRot, 0);
    // Clôture blanche sur la rangée côté rue, ouverte devant l'allée piétonne et le garage.
    if (this.env.id !== 'tropical' || rng.chance(0.5)) {
      for (let x = lot.x; x < lot.x + lot.w; x++) {
        if (blocked(x) || Math.abs(x - doorX) <= 1) continue;
        if (!w.objectAtTile(0, x, street)) this.place('fence', x, street, faceRot, 0);
      }
    }
    // Massifs de fleurs le long de la façade.
    for (let x = house.x0; x < house.x1; x++) {
      if (Math.abs(x - doorX) <= 1 || w.terrainAt(x, facadeRow) === T.PATH) continue;
      if (rng.chance(0.7)) this.place('flowers', x, facadeRow, faceRot, 0);
    }
  }

  garden(lot, house) {
    const rng = this.rng;
    const items = [];
    if (this.env.id === 'tropical') items.push('tree', 'tree', 'flowers', 'flowers', 'grill');
    else if (this.env.id === 'futuristic') items.push('space_solar', 'flowers', 'bush', 'bush');
    else if (this.env.id === 'fantasy') items.push('pine', 'pine', 'tree', 'flowers', 'flowers', 'garden_plot');
    else items.push('tree', rng.pick(['pine', 'tree']), 'bush', 'bush', 'flowers', 'flowers', rng.pick(['grill', 'garden_plot']));
    for (const it of items) {
      for (let tries = 0; tries < 30; tries++) {
        const x = lot.x + rng.int(0, lot.w - 2), y = lot.y + rng.int(0, lot.h - 2);
        if (x >= house.x0 - 1 && x <= house.x1 && y >= house.y0 - 1 && y <= house.y1) continue;
        if (this.w.terrainAt(x, y) === T.PATH) continue;
        if (this.place(it, x, y, rng.int(0, 3), 0)) break;
      }
    }
  }

  // Retire les objets inaccessibles depuis l'entrée (évite les habitants coincés).
  validateReachability(entry, lot) {
    const w = this.w;
    w.rebuildOccupancy();
    const nav = new Navigator(w);
    const objs = w.objectsOnLot(lot);
    for (const o of objs) {
      const def = registry.object(o.def);
      if (!def?.aff?.length || def.building) continue;
      const fake = { usePoints: null };
      void fake;
      const f = w.footprint(o);
      const goals = [];
      for (let x = f.x - 1; x <= f.x + f.w; x++) for (let y = f.y - 1; y <= f.y + f.d; y++) {
        if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.d) continue;
        goals.push({ l: o.level || 0, x, y });
      }
      const path = nav.findPath({ l: 0, x: entry.x, y: entry.y }, goals, { maxNodes: 6000 });
      if (!path) w.removeObject(o.id);
    }
  }

  // ------------------------------------------------------------------ lieux publics
  buildVenue(lot) {
    const w = this.w, rng = this.rng;
    const cx = lot.x + Math.floor(lot.w / 2), cy = lot.y + Math.floor(lot.h / 2);
    const buildingDefs = { cinema: 'venue_cinema', office: 'venue_office', shop: 'venue_shop', school: 'venue_school' };
    if (buildingDefs[lot.venue]) {
      // Grand bâtiment « boîte noire » : les sims y entrent.
      const def = registry.object(buildingDefs[lot.venue]);
      const size = Math.min(lot.w, lot.h) - 2;
      const bx = lot.x + Math.floor((lot.w - size) / 2), by = lot.y + (lot.front === 'n' ? 2 : 0);
      const o = w.addObject(buildingDefs[lot.venue], bx, by, lot.front === 'n' ? 2 : 0, 0, { state: { size } });
      void def;
      // Parvis.
      for (let x = lot.x; x < lot.x + lot.w; x++) for (let y = lot.y; y < lot.y + lot.h; y++) if (!w.objectAtTile(0, x, y)) w.setTerrain(x, y, T.PATH);
      this.place('bench', lot.x, lot.front === 'n' ? lot.y : lot.y + lot.h - 1, lot.front === 'n' ? 0 : 2);
      this.place('streetlight', lot.x + lot.w - 1, lot.front === 'n' ? lot.y : lot.y + lot.h - 1, 0);
      void o;
      return;
    }
    if (lot.venue === 'park') {
      for (let x = lot.x; x < lot.x + lot.w; x++) { w.setTerrain(x, cy, T.PATH); }
      for (let y = lot.y; y < lot.y + lot.h; y++) { w.setTerrain(cx, y, T.PATH); }
      this.place('fountain', cx - 1, cy - 1, 0);
      const ring = [['bench', cx - 4, cy - 3, 0], ['bench', cx + 2, cy + 3, 2], ['bench', cx - 4, cy + 3, 2], ['bench', cx + 3, cy - 3, 0], ['chess', cx + 4, cy - 1, 3], ['chess', cx - 5, cy + 1, 1],
        ['grill', lot.x + 1, lot.y + lot.h - 2, 0], ['guitar', lot.x + lot.w - 2, lot.y + 1, 0], ['stereo', lot.x + 2, lot.y + 1, 0], ['trees_patch', lot.x + lot.w - 3, lot.y + lot.h - 3, 0]];
      for (const [d, x, y, r] of ring) this.place(d, x, y, r);
      for (let i = 0; i < 12; i++) { const x = lot.x + rng.int(0, lot.w - 1), y = lot.y + rng.int(0, lot.h - 1); if (w.terrainAt(x, y) !== T.PATH) this.place(rng.pick(['tree', 'tree', 'pine', 'flowers', 'bush']), x, y, rng.int(0, 3)); }
      return;
    }
    // Lieux bâtis visitables (restaurant, salle de sport, médiathèque).
    const hw = lot.w - 2, hd = lot.h - 4;
    const x0 = lot.x + 1, y0 = lot.front === 'n' ? lot.y + 3 : lot.y + 1, x1 = x0 + hw, y1 = y0 + hd;
    const style = { restaurant: 'brick', gym: 'night', library: 'wood' }[lot.venue] || 'plaster';
    this.wallRect(x0, y0, x1, y1, 0, style);
    this.floorRect(x0, y0, x1, y1, 0, { restaurant: 'checker', gym: 'concrete', library: 'dark_wood' }[lot.venue]);
    const frontY = lot.front === 'n' ? y0 : y1;
    const doorX = x0 + Math.floor(hw / 2);
    this.opening(0, 'h', doorX, frontY, 'door_glass');
    this.opening(0, 'h', doorX - 1, frontY, 'door_glass');
    for (let x = x0 + 1; x < x1 - 1; x += 2) if (Math.abs(x - doorX) > 1) this.opening(0, 'h', x, frontY, 'window_tall');
    w.d.roofs.push({ id: uid('roof'), level: 0, x: x0, y: y0, w: hw, h: hd, style: 'flat', color: '#55585e' });
    const res = new Map();
    for (let y = y0; y < y1; y++) { res.set(`${doorX},${y}`, 'door'); res.set(`${doorX - 1},${y}`, 'door'); }
    const room = { x0, y0, x1, y1 };
    const items = {
      restaurant: ['stove', 'oven', 'fridge', 'counter_a', 'sink_kitchen', 'resto_table', 'resto_table', 'resto_table', 'resto_table', 'resto_table', 'cactus', 'frame_large', 'stereo', 'ceiling_light'],
      gym: ['treadmill', 'treadmill', 'punching_bag', 'punching_bag', 'treadmill', 'shower', 'shower', 'sink_bath', 'stereo', 'bench'],
      library: ['bookshelf', 'bookshelf', 'bookshelf', 'computer_desk', 'computer_desk', 'chess', 'armchair', 'armchair', 'podium', 'easel', 'piano', 'lamp_floor'],
    }[lot.venue];
    this.furnish(room, items, res);
    for (let y = lot.y; y < lot.y + lot.h; y++) for (let x = lot.x; x < lot.x + lot.w; x++) if (x < x0 || x >= x1 || y < y0 || y >= y1) if ((y === lot.y || y === lot.y + lot.h - 1) || x === doorX || x === doorX - 1) w.setTerrain(x, y, T.PATH);
    this.place('bench', x0, lot.front === 'n' ? lot.y + 1 : y1 + 1, 0);
    this.place('tree', x1 - 1, lot.front === 'n' ? lot.y + 1 : y1 + 1, 0);
    this.validateReachability({ x: doorX, y: lot.front === 'n' ? y0 - 1 : y1 }, lot);
  }

  // ------------------------------------------------------------------ habitants
  populate() {
    const w = this.w, rng = this.rng;
    const free = w.d.lots.filter(l => l.type === 'residential');
    let remaining = w.settings.population;
    const houses = [];
    const custom = this.env.id === 'custom';
    for (const lot of free) {
      if (remaining <= 0) break;
      if (custom && houses.length >= 1) break;
      const kind = rng.pick(['single', 'couple', 'family', 'roommates', 'family']);
      const n = Math.min(remaining, { single: 1, couple: 2, family: rng.int(3, 4), roommates: rng.int(2, 3) }[kind]);
      remaining -= n;
      const house = this.buildHouse(lot, n >= 3 ? 'big' : n === 1 ? 'small' : 'medium');
      const last = rng.pick(['Martin', 'Dubois', 'Nguyen', 'Diallo', 'Rossi', 'Tanaka', 'Silva', 'Fontaine', 'Okafor', 'Benali', 'Lambert', 'Kowalski']);
      const hh = { id: uid('hh'), name: `Famille ${last}`, funds: rng.int(6000, 18000), lotId: lot.id, members: [] };
      lot.householdId = hh.id; lot.forSale = false; lot.name = `Maison ${last}`;
      w.d.households.push(hh);
      const members = [];
      for (let i = 0; i < n; i++) {
        let stage = 'young';
        if (kind === 'family') stage = i < 2 ? rng.pick(['young', 'adult']) : rng.pick(['child', 'teen']);
        else if (kind === 'couple') stage = rng.pick(['young', 'adult', 'elder']);
        else stage = rng.pick(['young', 'adult']);
        const sim = createSim(rng, { householdId: hh.id, last: kind === 'roommates' ? undefined : last, stage });
        if (kind === 'roommates') hh.name = 'Colocation';
        sim.pos = { x: house.doorX + 0.5 + (i % 2), y: (lot.front === 'n' ? house.y0 + 1 : house.y1 - 2) + 0.5, l: 0, hz: 0 };
        const f = this.nav.nearestFree(0, sim.pos.x, sim.pos.y, 6);
        if (f) { sim.pos.x = f.x + 0.5; sim.pos.y = f.y + 0.5; }
        w.d.sims.push(sim);
        hh.members.push(sim.id);
        members.push(sim);
      }
      // Liens familiaux et amoureux.
      for (const a of members) for (const b of members) {
        if (a === b) continue;
        const r = w.rel(a.id, b.id);
        r.known = true;
        if (kind === 'family' || kind === 'couple') { r.flags.family = !(kind === 'couple' || (a.stage !== 'child' && a.stage !== 'teen' && b.stage !== 'child' && b.stage !== 'teen')); r.friend = 45; r.status = r.flags.family ? 'family' : 'acquaintance'; }
        if (kind === 'roommates') { r.friend = 25; r.status = 'acquaintance'; }
      }
      if ((kind === 'couple' || kind === 'family') && members.length >= 2 && members[0].stage !== 'child' && members[1].stage !== 'child') {
        const [a, b] = members;
        a.attraction = [b.gender]; b.attraction = [a.gender];
        for (const [x, y] of [[a, b], [b, a]]) { const r = w.rel(x.id, y.id); r.romance = 70; r.friend = 60; r.status = kind === 'couple' && rng.chance(0.5) ? 'married' : 'married'; r.flags.family = false; }
        for (const c of members.slice(2)) { c.parents = [a.id, b.id]; c.last = a.last; }
      }
      houses.push({ lot, house, hh });
    }
    // Attirance par défaut pour les autres.
    for (const s of w.d.sims) if (!s.attraction) s.attraction = rng.pick([['f'], ['m'], ['f', 'm'], ['f', 'm', 'x'], ['m', 'x'], ['f', 'x']]);
    // Quelques voisins se connaissent déjà.
    for (const a of w.d.sims) for (const b of w.d.sims) {
      if (a.id >= b.id || a.householdId === b.householdId) continue;
      if (rng.chance(0.18)) {
        const f = rng.int(-30, 40);
        for (const [x, y] of [[a, b], [b, a]]) { const r = w.rel(x.id, y.id); r.known = true; r.friend = f + rng.int(-8, 8); r.status = r.friend >= 30 ? 'friend' : r.friend <= -35 ? 'rival' : 'acquaintance'; }
      }
    }
    // Terrains vides : à vendre.
    for (const lot of free) if (!lot.householdId) { lot.forSale = true; lot.name = 'Terrain à vendre'; }
  }

  decorate() {
    const w = this.w, rng = this.rng;
    // Réverbères le long des routes, véhicules garés.
    for (const rx of this.roadsX) for (let y = 2; y < w.h - 2; y += 11) this.place('streetlight', rx - 1, y, 3);
    for (const ry of this.roadsY) for (let x = 6; x < w.w - 2; x += 13) this.place('streetlight', x, ry + ROAD, 0);
    if (this.env.id === 'futuristic') {
      for (const lot of w.d.lots.filter(l => l.type === 'residential' && !l.householdId).slice(0, 2)) {
        this.place('space_pad', lot.x + 2, lot.y + 2, 0); this.place('space_lander', lot.x + 3, lot.y + 3, 0); this.place('space_turbine', lot.x + lot.w - 4, lot.y + 1, 0);
        lot.forSale = false; lot.type = 'community'; lot.venue = 'spaceport'; lot.name = 'Astroport';
      }
    }
    // Forêt sur les espaces libres en bordure.
    for (let i = 0; i < w.w * 1.5; i++) {
      const x = rng.int(0, w.w - 1), y = rng.int(0, w.h - 1);
      if (w.lotAt(x, y) || w.terrainAt(x, y) !== T.GRASS) continue;
      this.place(this.env.id === 'tropical' ? 'tree' : rng.pick(['tree', 'pine', 'pine', 'bush']), x, y, rng.int(0, 3));
    }
    // Créatures et animaux.
    w.d.critters = [];
    if (w.settings.creatures) {
      const fauna = FAUNA[this.env.id] || FAUNA.default;
      const n = Math.max(fauna.length, Math.floor(w.w / 10));
      for (let i = 0; i < n; i++) {
        // De préférence hors des parcelles habitées (prés, bois) ; sinon n'importe où hors de l'eau.
        let x = 0, y = 0;
        for (let k = 0; k < 30; k++) {
          x = rng.int(4, w.w - 5); y = rng.int(4, w.h - 5);
          if (w.terrainAt(x, y) !== T.WATER && (k > 20 || !w.lotAt(x, y))) break;
        }
        if (w.terrainAt(x, y) === T.WATER) continue;
        w.d.critters.push({ id: uid('cr'), kind: fauna[i % fauna.length], x: x + 0.5, y: y + 0.5, tx: x, ty: y, rot: rng.range(0, 6.28), state: 'idle', t: 0 });
      }
    }
  }
}

// Monde d'essai (bac à sable du créateur de mods) : un petit terrain meublé et deux habitants.
export function generateSandbox(mods = []) {
  const world = generateWorld({ name: 'Zone de test', settings: { mapSize: 64, population: 3, environment: 'suburb', creatures: false }, seed: 4242 });
  world.d.mods.enabled = mods;
  world.d.isSandbox = true;
  return world;
}

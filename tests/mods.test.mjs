// Tests du système de mods et du mod SUPERPOWERS (sans rendu).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ModManager } from '../game/src/mods/manager.js';
import { validateMod } from '../game/src/mods/validate.js';
import { registry } from '../game/src/mods/registry.js';
import { generateWorld } from '../game/src/sim/worldgen.js';
import { Simulation } from '../game/src/sim/simulation.js';
import { World } from '../game/src/sim/world.js';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const fetchJSON = async p => JSON.parse(fs.readFileSync(`game/${p}`, 'utf8'));
async function manager() { const m = new ModManager(); await m.init(fetchJSON); return m; }

test('les mods intégrés sont valides', async () => {
  const m = await manager();
  assert.equal(m.list().length, 5);
  for (const e of m.list()) assert.deepEqual(e.errors, [], `${e.mod.id}: ${e.errors.join(' | ')}`);
});

test('validation : erreurs compréhensibles', () => {
  const r = validateMod({ id: 'Bad ID', name: '', version: 'x', content: { objects: [{ id: 'o1', name: 'O', model: 'nope', size: [0, 1], price: -1, aff: ['inconnu'] }], script: 'alert(1)' } });
  assert.ok(r.errors.length >= 4, r.errors.join('\n'));
  const code = validateMod({ id: 'a.b', name: 'X', version: '1.0.0', script: 'x()', content: {} });
  assert.ok(code.errors.some(e => e.includes('code exécutable')));
});

test('dépendances : un mod dépendant est bloqué sans son prérequis', async () => {
  const m = await manager();
  const problems = m.check(['example.vilains-extremes']);
  assert.ok(problems.some(p => p.level === 'error' && p.text.includes('SUPERPOWERS')));
  assert.deepEqual(m.check(['superessence.superpowers', 'example.vilains-extremes']).filter(p => p.level === 'error'), []);
  assert.deepEqual(m.loadOrder(['example.vilains-extremes', 'superessence.superpowers']), ['superessence.superpowers', 'example.vilains-extremes']);
});

test('SUPERPOWERS : activation, pouvoirs utilisés, désactivation sans perte de données', async () => {
  const m = await manager();
  const w = generateWorld({ name: 'Héros', settings: { mapSize: 96, population: 12 }, seed: 11 });
  w.d.mods.enabled = ['superessence.superpowers'];
  const rep = m.applyToRegistry(w);
  assert.deepEqual(rep.applied, ['superessence.superpowers']);
  assert.equal(registry.powers.size, 35);
  const sim = new Simulation(w);
  sim.powers.distribute('everyone');
  const powered = w.sims.filter(s => sim.powers.hasAnyPower(s));
  assert.ok(powered.length >= 8, `sims avec pouvoirs: ${powered.length}`);
  let used = 0;
  sim.on('powerUsed', () => used++);
  // Vol : le déplacement passe réellement en mode « fly ».
  const flyer = powered[0];
  sim.powers.grant(flyer, 'sp_flight');
  sim.enqueue(flyer, { kind: 'power', power: 'sp_flight' }, true);
  for (let i = 0; i < 20; i++) sim.step(0.2);
  assert.ok(sim.powers.isFlying(flyer), 'le sim vole');
  sim.enqueue(flyer, { kind: 'goto', x: 5, y: 5, l: 0 }, true);
  for (let i = 0; i < 10; i++) sim.step(0.2);
  assert.equal(flyer._rt.moveMode, 'fly');
  assert.ok(flyer.pos.hz > 0.5, `altitude ${flyer.pos.hz}`);
  // Téléportation : position modifiée instantanément.
  const tp = powered[1];
  sim.powers.grant(tp, 'sp_teleport');
  tp.modData.powers.energy = 100;
  const before = { x: tp.pos.x, y: tp.pos.y };
  const target = sim.nav.nearestFree(0, 30, 30, 10);
  sim.dropAll(tp);
  sim.enqueue(tp, { kind: 'power', power: 'sp_teleport', point: { x: target.x, y: target.y, l: 0 } }, true);
  for (let i = 0; i < 15; i++) sim.step(0.2);
  assert.ok(Math.hypot(tp.pos.x - before.x, tp.pos.y - before.y) > 3, 'téléporté');
  // Simulation longue avec pouvoirs.
  for (let i = 0; i < 300 * 48; i++) sim.step(0.2);
  console.log('Pouvoirs utilisés en 2 jours :', used, '— entrées de journal pouvoirs :', w.d.journal.filter(j => j.type === 'power').length);
  assert.ok(used > 5, `pouvoirs utilisés: ${used}`);
  // Désactivation : données conservées, contenu retiré du registre.
  const json = w.serialize();
  w.d.mods.enabled = [];
  m.applyToRegistry(w);
  assert.equal(registry.powers.size, 0);
  const w2 = World.deserialize(json);
  w2.d.mods.enabled = [];
  m.applyToRegistry(w2);
  const keep = w2.sims.filter(s => s.modData.powers && Object.keys(s.modData.powers.list).length);
  assert.ok(keep.length >= 8, 'données de pouvoirs conservées après désactivation');
  const sim2 = new Simulation(w2);
  for (let i = 0; i < 300 * 6; i++) sim2.step(0.2);   // le jeu de base tourne sans le mod
  // Réactivation : les pouvoirs reviennent.
  w2.d.mods.enabled = ['superessence.superpowers'];
  m.applyToRegistry(w2);
  assert.ok(w2.sims.filter(s => sim2.powers.hasAnyPower(s)).length >= 8);
});

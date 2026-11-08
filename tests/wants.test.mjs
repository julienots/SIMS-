// Envies et récompenses : tirage selon la personnalité, réalisation en jouant, points, boutique, effets permanents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../game/src/sim/worldgen.js';
import { Simulation } from '../game/src/sim/simulation.js';
import { World } from '../game/src/sim/world.js';

test('envies : 3 par Sim, réalisées en autonomie, points de satisfaction', () => {
  const w = generateWorld({ name: 'Envies', settings: { mapSize: 96, population: 12, environment: 'modern' }, seed: 5 });
  const S = new Simulation(w);
  for (let i = 0; i < 300 * 2; i++) S.step(0.2);        // 2 heures : les envies sont tirées
  const adults = w.sims.filter(s => s.stage !== 'baby');
  for (const s of adults) assert.equal(s.wants.length, 3, `${s.first} : ${s.wants.length} envies`);
  for (let i = 0; i < 300 * 46; i++) S.step(0.2);       // ~2 jours de vie
  const total = adults.reduce((a, s) => a + s.satisfaction, 0);
  const fulfilled = w.d.journal.filter(e => e.type === 'want').length;
  console.log('envies réalisées :', fulfilled, '— points cumulés :', total);
  assert.ok(fulfilled >= adults.length, `envies réalisées : ${fulfilled}`);
  assert.ok(total > 0);
  // Sauvegarde : envies et points conservés.
  const w2 = World.deserialize(w.serialize());
  assert.deepEqual(w2.sims.map(s => s.satisfaction), w.sims.map(s => s.satisfaction));
});

test('boutique : achat, refus sans points, trait permanent appliqué', () => {
  const w = generateWorld({ name: 'Boutique', settings: { mapSize: 64, population: 3 }, seed: 9 });
  const S = new Simulation(w);
  const s = w.sims.find(x => x.stage !== 'baby');
  S.wants.ensure(s);
  s.satisfaction = 100;
  assert.equal(S.wants.buy(s, 'never_hungry'), 'Pas assez de points');
  s.satisfaction = 2000;
  assert.equal(S.wants.buy(s, 'never_hungry'), null);
  assert.equal(s.satisfaction, 500);
  assert.equal(S.wants.buy(s, 'never_hungry'), 'Déjà obtenue');
  assert.equal(S.wants.needMult(s, 'hunger'), 0.5);
  // La faim baisse deux fois moins vite qu'un Sim identique sans le trait.
  const t = w.sims.find(x => x !== s && x.stage !== 'baby');
  const traitsS = s.traits, traitsT = t.traits; s.traits = []; t.traits = [];
  s.needs.hunger = t.needs.hunger = 80;
  S.decayNeeds(s, 60); S.decayNeeds(t, 60);
  s.traits = traitsS; t.traits = traitsT;
  const lostS = 80 - s.needs.hunger, lostT = 80 - t.needs.hunger;
  assert.ok(Math.abs(lostS - lostT * 0.5) < 0.01, `faim perdue ${lostS} vs ${lostT}`);
  // Potion : effet immédiat.
  s.satisfaction = 400; s.needs.energy = 10;
  assert.equal(S.wants.buy(s, 'potion_energy'), null);
  assert.equal(s.needs.energy, 100);
});

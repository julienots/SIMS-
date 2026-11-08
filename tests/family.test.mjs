// Grossesse : 3 jours avec des humeurs par trimestre, puis naissance d'un bébé dans le foyer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../game/src/sim/worldgen.js';
import { Simulation } from '../game/src/sim/simulation.js';

test('grossesse de 3 jours puis naissance', () => {
  const w = generateWorld({ name: 'Famille', settings: { mapSize: 64, population: 6 }, seed: 12 });
  const S = new Simulation(w);
  const adults = w.sims.filter(s => ['young', 'adult'].includes(s.stage));
  const a = adults.find(s => s.gender === 'f') || adults[0];
  const b = adults.find(s => s !== a && s.householdId === a.householdId) || adults.find(s => s !== a);
  b.householdId = a.householdId;
  const h = w.household(a.householdId); if (!h.members.includes(b.id)) h.members.push(b.id);
  const before = w.sims.length;
  S.life.scheduleBaby(a, b);
  const mom = a.flags.babyDue ? a : b;
  assert.ok(mom.flags.babyDue, 'grossesse programmée');
  assert.equal(S.life.trimester(mom), 1);
  assert.ok(mom.moodlets.some(m => m.id === 'preg_early'), 'nausées au 1er trimestre');
  const step = minutes => { for (let i = 0; i < minutes / 0.5; i++) S.step(0.5); };
  step(1440);
  assert.equal(S.life.trimester(mom), 2);
  assert.ok(mom.moodlets.some(m => m.id === 'preg_glow'), 'radieuse au 2e trimestre');
  assert.equal(w.sims.length, before, 'pas encore né');
  step(1440);
  assert.equal(S.life.trimester(mom), 3);
  assert.equal(mom.flags.belly, 3);
  step(1440);
  assert.equal(w.sims.length, before + 1, 'bébé né au 4e jour');
  assert.ok(!mom.flags.babyDue && !mom.flags.belly);
  const baby = w.sims[w.sims.length - 1];
  assert.equal(baby.stage, 'baby');
  assert.equal(baby.householdId, mom.householdId);
});

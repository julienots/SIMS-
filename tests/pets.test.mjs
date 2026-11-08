// Animaux de compagnie : adoption, vie sur le terrain, soins autonomes par le foyer, interactions, sauvegarde.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../game/src/sim/worldgen.js';
import { Simulation } from '../game/src/sim/simulation.js';
import { World } from '../game/src/sim/world.js';

test('chien adopté : reste chez lui, le foyer s’en occupe', () => {
  const w = generateWorld({ name: 'Chien', settings: { mapSize: 96, population: 10, environment: 'suburb' }, seed: 8 });
  const S = new Simulation(w);
  const h = w.d.households.find(x => x.members.length >= 2 && x.lotId);
  h.funds += 1000;
  const funds = h.funds;
  const { pet, error } = S.pets.adopt(h.id, 'beagle', 'Rex');
  assert.ok(pet, error);
  assert.equal(h.funds, funds - 300);
  const lot = w.lot(h.lotId);
  let onLot = 0, samples = 0, cared = 0;
  const log0 = w.d.journal.length;
  for (let hr = 0; hr < 36; hr++) {
    for (let i = 0; i < 300; i++) S.step(0.2);
    samples++;
    if (pet.x >= lot.x - 2 && pet.x <= lot.x + lot.w + 2 && pet.y >= lot.y - 2 && pet.y <= lot.y + lot.h + 2) onLot++;
  }
  cared = w.sims.filter(s => s.householdId === h.id).reduce((a, s) => a + s.moodlets.filter(m => m.id === 'pet_cuddle' || m.id === 'pet_play').length, 0);
  console.log(`chien sur son terrain ${onLot}/${samples} h — besoins`, pet.needs, '— humeurs « chien » actives', cared);
  assert.ok(onLot >= samples * 0.8, `présence sur le terrain ${onLot}/${samples}`);
  assert.ok(pet.needs.hunger > 20, `faim du chien ${pet.needs.hunger.toFixed(0)} : le foyer le nourrit`);
  // Interaction ordonnée par le joueur.
  const s = w.sims.find(x => x.householdId === h.id && x.stage !== 'baby' && !x._rt.hidden);
  if (s) {
    S.clearQueue(s);
    pet.needs.fun = 10;
    S.enqueue(s, { kind: 'pet', petId: pet.id, act: 'pet_play', name: 'Jouer' }, true);
    for (let i = 0; i < 300 * 2; i++) S.step(0.2);
    assert.ok(pet.needs.fun > 40, `jeu effectué (envie de jouer ${pet.needs.fun.toFixed(0)})`);
  }
  const w2 = World.deserialize(w.serialize());
  assert.equal(w2.d.critters.filter(c => c.pet).length, 1);
});

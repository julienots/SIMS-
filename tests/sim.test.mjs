// Tests de la simulation sans rendu : génération, autonomie longue durée, relations, sauvegarde.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../game/src/sim/worldgen.js';
import { Simulation } from '../game/src/sim/simulation.js';
import { World } from '../game/src/sim/world.js';

function run(sim, gameMinutes, step = 0.2) {
  const n = Math.round(gameMinutes / step);
  for (let i = 0; i < n; i++) sim.step(step);
}

test('génération d’un monde moderne', () => {
  const w = generateWorld({ name: 'Test', settings: { mapSize: 96, population: 12, environment: 'modern' }, seed: 1 });
  assert.ok(w.sims.length >= 10, `habitants: ${w.sims.length}`);
  assert.ok(w.d.lots.length >= 8, `terrains: ${w.d.lots.length}`);
  assert.ok(w.objects.length > 100, `objets: ${w.objects.length}`);
  assert.ok(w.d.households.length >= 3);
  const venues = w.d.lots.filter(l => l.type === 'community').map(l => l.venue);
  assert.ok(venues.includes('park'));
});

test('simulation autonome sur 3 jours : besoins entretenus, pas de blocage', () => {
  const w = generateWorld({ name: 'Long', settings: { mapSize: 96, population: 12, environment: 'modern' }, seed: 7 });
  const sim = new Simulation(w);
  const stuck = new Map();
  const t0 = w.time;
  const positions = new Map(w.sims.map(s => [s.id, { x: s.pos.x, y: s.pos.y, idle: 0 }]));
  for (let h = 0; h < 72; h++) {
    run(sim, 60);
    for (const s of w.sims) {
      const p = positions.get(s.id) || { x: s.pos.x, y: s.pos.y, idle: 0 };
      const moved = Math.hypot(s.pos.x - p.x, s.pos.y - p.y) > 0.05 || s.queue.length > 0;
      p.idle = moved ? 0 : p.idle + 1;
      p.x = s.pos.x; p.y = s.pos.y;
      positions.set(s.id, p);
      if (p.idle >= 4 && s.stage !== 'baby') stuck.set(s.id, p.idle);
    }
  }
  assert.ok(w.time - t0 >= 72 * 60 - 1);
  const adults = w.sims.filter(s => s.stage !== 'baby');
  const avg = n => adults.reduce((a, s) => a + s.needs[n], 0) / adults.length;
  const report = ['hunger', 'thirst', 'sleep', 'hygiene', 'energy', 'fun', 'social', 'comfort'].map(n => `${n}=${avg(n).toFixed(0)}`).join(' ');
  console.log('Besoins moyens après 3 jours :', report);
  console.log('Journal :', w.d.journal.length, 'entrées ; événements :', w.d.stats.events);
  for (const n of ['hunger', 'sleep', 'hygiene', 'social', 'fun']) assert.ok(avg(n) > 25, `besoin ${n} trop bas: ${avg(n).toFixed(1)} — ${report}`);
  assert.equal(stuck.size, 0, `sims immobiles sans action pendant 4h+: ${[...stuck.keys()].join(',')}`);
  const known = Object.values(w.d.rel).filter(r => r.known).length;
  assert.ok(known > 20, `relations connues: ${known}`);
});

test('sauvegarde et rechargement conservent tout', () => {
  const w = generateWorld({ name: 'Save', settings: { mapSize: 64, population: 6 }, seed: 3 });
  const sim = new Simulation(w);
  run(sim, 240);
  const json = w.serialize();
  const w2 = World.deserialize(json);
  assert.equal(w2.sims.length, w.sims.length);
  assert.equal(w2.objects.length, w.objects.length);
  assert.equal(Object.keys(w2.d.rel).length, Object.keys(w.d.rel).length);
  assert.equal(w2.d.journal.length, w.d.journal.length);
  assert.ok(Math.abs(w2.time - w.time) < 1e-6);
  const sim2 = new Simulation(w2);
  run(sim2, 120);
  assert.ok(w2.time > w.time);
});

test('performances : 40 habitants sur une grande carte', () => {
  const w = generateWorld({ name: 'Grand', settings: { mapSize: 160, population: 40, environment: 'modern' }, seed: 99 });
  const sim = new Simulation(w);
  const t0 = performance.now();
  run(sim, 6 * 60);
  const ms = performance.now() - t0;
  const perHour = ms / 6;
  console.log(`${w.sims.length} habitants, ${w.objects.length} objets : ${perHour.toFixed(0)} ms de calcul par heure de jeu (${(perHour / 60).toFixed(2)} ms par seconde réelle à vitesse ×1)`);
  assert.ok(w.sims.length >= 35);
  assert.ok(perHour / 60 < 8, 'la simulation doit rester sous 8 ms par seconde réelle');
});

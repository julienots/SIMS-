import { generateWorld } from '../../game/src/sim/worldgen.js';
import { Simulation } from '../../game/src/sim/simulation.js';
const w = generateWorld({ name: 'Dbg', settings: { mapSize: 96, population: 12, environment: 'modern' }, seed: 7 });
const sim = new Simulation(w);
const counts = {};
const fails = {};
const origFinish = sim.finish.bind(sim);
sim.finish = (s, a, cancelled) => { const k = `${a.kind}:${a.aff || a.social || ''}:${a.phase}`; if (cancelled) fails[k] = (fails[k] || 0) + 1; else counts[k] = (counts[k] || 0) + 1; return origFinish(s, a, cancelled); };
const hours = +process.argv[2] || 12;
for (let h = 0; h < hours; h++) {
  for (let i = 0; i < 300; i++) sim.step(0.2);
  const s = w.sims[0];
  console.log(`h${h}`, w.sims.slice(0, 4).map(s => `${s.first}:${s.queue[0] ? s.queue[0].kind + '/' + (s.queue[0].aff || s.queue[0].social || '') + '/' + s.queue[0].phase : '-'} H${s.needs.hunger.toFixed(0)}`).join(' | '));
}
console.log('done', counts);
console.log('fails', fails);

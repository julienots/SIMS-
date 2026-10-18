// Orientation des Sims sur les objets : assis, allongés ou debout, ils doivent être tournés dans le sens de l'objet
// (même sens qu'un siège, vers un bureau ou un piano, vers le meuble qu'ils utilisent debout), dans les 4 rotations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../game/src/sim/worldgen.js';
import { Simulation } from '../game/src/sim/simulation.js';
import { registry } from '../game/src/mods/registry.js';

const norm = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

test('orientation des Sims sur tous les objets utilisables, dans les 4 rotations', () => {
  const w = generateWorld({ name: 'Orient', settings: { mapSize: 64, population: 1, environment: 'suburb', creatures: false }, seed: 11 });
  // Terrain vide : on retire tout pour poser chaque objet seul.
  for (const o of [...w.objects]) w.removeObject(o.id);
  w.d.walls = {}; w.d.floors = {};
  w.rebuildOccupancy();
  const S = new Simulation(w);
  const s = w.sims[0];
  s.needs && Object.keys(s.needs).forEach(k => { s.needs[k] = 60; });
  const failures = [];
  let checked = 0;
  for (const def of registry.objects.values()) {
    if (def.building || def.wall || def.hiddenInCatalog || def.temporary || !def.aff?.length) continue;
    const affId = def.aff.find(a => { const af = registry.aff(a); return af && !af.venueAction && !af.cost && !af.minStage && af.pose !== 'hidden'; });
    if (!affId) continue;
    const aff = registry.aff(affId);
    for (let rot = 0; rot < 4; rot++) {
      const o = w.addObject(def.id, 28, 28, rot, 0);
      if (!o) continue;
      S.nav.refresh();
      s.pos.x = 28.5; s.pos.y = 36.5; s.pos.l = 0; s.pos.hz = 0;
      S.clearQueue(s);
      S.enqueue(s, { kind: 'object', objId: o.id, aff: affId, name: aff.name }, true);
      let a = null;
      for (let i = 0; i < 900; i++) { S.step(0.05); a = s.queue[0]; if (!a || a.phase === 'loop') break; }
      if (a?.phase === 'loop') {
        checked++;
        const face = w.objFacing(o);
        const pt = a.pt;
        let want;
        if (pt.pose === 'stand' && !def.inside) {
          const c = w.objCenter(o);
          want = Math.atan2(c.x - s.pos.x, c.y - s.pos.y);
        } else want = pt.rot;
        const err = Math.abs(norm(s.rot - want));
        // Assis / allongé : vérifie aussi la règle (même sens que l'objet, ou face à lui pour un siège avant).
        let ruleErr = 0;
        if (pt.pose === 'sit' && Array.isArray(def.seats?.[0])) ruleErr = Math.abs(norm(s.rot - (face + (def.seatInFront ? Math.PI : 0))));
        if (pt.pose === 'lie') ruleErr = Math.abs(norm(s.rot - (face + (def.size[0] > def.size[1] ? Math.PI / 2 : 0))));
        if (err > 0.25 || ruleErr > 0.25) failures.push(`${def.id} rot${rot} ${pt.pose}: écart ${err.toFixed(2)} / règle ${ruleErr.toFixed(2)}`);
      }
      S.clearQueue(s);
      for (let i = 0; i < 80; i++) S.step(0.05);
      w.removeObject(o.id);
    }
  }
  assert.ok(checked > 80, `cas vérifiés : ${checked}`);
  assert.deepEqual(failures, []);
});

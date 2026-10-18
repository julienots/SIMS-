// Utilisation d'objets par un Sim réaliste (orientation, hauteur) : un objet posé seul sur un terrain dégagé.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const w = window.__mlu.generateWorld({ name: 'U', settings: { mapSize: 64, population: 1, environment: 'suburb', creatures: false }, seed: 11 });
    for (const o of [...w.objects]) w.removeObject(o.id);
    w.d.walls = {}; w.d.floors = {}; w.rebuildOccupancy();
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
  });
  await wait(4000);
  const list = (process.env.OBJS || 'toilet,computer_desk,bed_double,couch,chair_kitchen,bathtub,piano').split(',');
  for (const id of list) {
    const r = await ev(id => {
      const g = window.__app.game, W = g.world, S = g.sim, s = W.sims[0];
      for (const o of [...W.objects]) if (o.def !== 'meal_plate') W.removeObject(o.id);
      const o = W.addObject(id, 28, 28, 1, 0);
      S.nav.refresh();
      s.pos.x = 28.5; s.pos.y = 33.5;
      S.clearQueue(s);
      const item = S.objectMenu(s, o).find(i => !i.disabled);
      S.enqueue(s, { ...item.action }, true);
      g.selected = s.id; g.rig.setMode('close'); g.rig.goalDist = 4.5; g.rig.goalPitch = 0.7; g.rig.yaw = 0.6;
      S.setSpeed(3);
      return item.label;
    }, id);
    await wait(10000);
    const st = await ev(() => { const g = window.__app.game, s = g.world.sims[0]; g.sim.setSpeed(1); return `${s._rt.anim} ${s.queue[0]?.phase}`; });
    console.log(id, r, st);
    await wait(1500); await shot(`90-use-${id}`);
  }
};

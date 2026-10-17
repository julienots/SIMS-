// Proportions humains réalistes / meubles : vue de la cuisine avec un habitant debout près du plan de travail.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  const info = await ev(async () => {
    const w = window.__mlu.generateWorld({ name: 'T', settings: { mapSize: 64, population: 4, environment: 'suburb', creatures: false }, seed: 5 });
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
    const g = window.__app.game, W = g.world;
    const c = W.objects.find(o => o.def === 'counter_a' || o.def === 'counter_b' || o.def === 'stove');
    const s = W.sims[0];
    if (c) { const cc = W.objCenter(c); s.pos.x = cc.x + 0.9; s.pos.y = cc.y + 0.9; }
    g.sim.setSpeed(0);
    g.selected = s.id; g.rig.setMode('close'); g.rig.goalDist = 4.5; g.rig.goalPitch = 0.2;
    return c ? c.def : 'aucun plan';
  });
  console.log('objet', info);
  await wait(5000); await shot('62-scale-kitchen');
};

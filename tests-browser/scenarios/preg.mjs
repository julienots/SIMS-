// Ventre de grossesse : même Sim de profil, sans puis avec ventre (3e trimestre).
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const w = window.__mlu.generateWorld({ name: 'P', settings: { mapSize: 64, population: 1, environment: 'suburb', creatures: false }, seed: 11 });
    for (const o of [...w.objects]) w.removeObject(o.id);
    w.d.walls = {}; w.d.floors = {}; w.rebuildOccupancy();
    const s = w.sims[0]; s.appearance.body = 'Female_Adult_03'; s.gender = 'f'; s.pos.x = 28.5; s.pos.y = 28.5;
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
    const g = window.__app.game; g.sim.setSpeed(0); s.rot = Math.PI / 2;
    g.selected = null; g.rig.setMode('free'); g.rig.focus(28.5, 28.5, 3.4); g.rig.goalPitch = 0.12; g.rig.yaw = 0;
  });
  await wait(5000);
  const side = () => ev(() => { const g = window.__app.game, s = g.world.sims[0]; s.rot = g.rig.yaw + Math.PI / 2; g.rig.target.y = 0.9; return { axis: g.simViews.get(s.id).bellyAxis, rot: s.rot }; });
  console.log(JSON.stringify(await side())); await wait(2500); await shot('98-preg-0');
  await ev(() => { const s = window.__app.game.world.sims[0]; s.flags.babyDue = 99; s.flags.belly = 3; });
  await side(); await wait(2500); await shot('99-preg-3');
};

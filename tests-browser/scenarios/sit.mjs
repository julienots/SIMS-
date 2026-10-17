// Hauteur d'assise des humains réalistes : chaise puis canapé.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const w = window.__mlu.generateWorld({ name: 'T', settings: { mapSize: 64, population: 4, environment: 'suburb', creatures: false }, seed: 5 });
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
  });
  await wait(3000);
  for (const [name, re] of [['63-sit-chair', /^chair/], ['64-sit-couch', /^couch|^armchair/]]) {
    const r = await ev(src => {
      const g = window.__app.game, W = g.world, S = g.sim, re = new RegExp(src);
      const s = W.sims[0];
      const o = W.objects.find(o => re.test(o.def) && (o.level || 0) === 0);
      if (!o) return 'aucun';
      const aff = (window.__mlu.registry || {}).object ? null : null;
      S.clearQueue(s);
      const affId = ['sit', 'sit_down', 'relax', 'watch_tv'].find(a => true);
      const menu = S.objectMenu ? S.objectMenu(s, o) : null;
      const item = (menu || []).find(i => /assoir|Assoir|Se détendre|Sit/i.test(i.label)) || (menu || [])[0];
      if (item) S.enqueue(s, { ...item.action }, true);
      g.selected = s.id; g.rig.setMode('close'); g.rig.goalDist = 3.5; g.rig.goalPitch = 0.25;
      return `${o.def} ${item ? item.label : 'pas de menu'}`;
    }, re.source);
    console.log(name, r);
    await ev(() => window.__app.game.sim.setSpeed(3));
    await wait(9000);
    await ev(() => window.__app.game.sim.setSpeed(1));
    console.log(' anim', await ev(() => window.__app.game.world.sims[0]._rt.anim));
    await wait(1500); await shot(name);
  }
};

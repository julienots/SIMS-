export default async ({ page, wait, shot, ev }) => {
  await wait(4600);
  await page.click('text=Nouvel univers');
  await wait(600); await shot('10-wizard');
  await page.click('text=Créer l’univers');
  await page.waitForFunction(() => window.__app?.game?.world && document.querySelector('#hud'), null, { timeout: 60000 });
  await wait(6000); await shot('11-world');
  const info = await ev(() => { const g = window.__app.game; return { sims: g.world.sims.length, objs: g.world.objects.length, views: g.worldView.objViews.size, fps: Math.round(g.fps), sel: g.selected, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }; });
  console.log(JSON.stringify(info));
  // Zoom sur le sim sélectionné.
  await ev(() => { const g = window.__app.game; g.rig.setMode('close'); });
  await wait(3000); await shot('12-close');
  await ev(() => { const g = window.__app.game; g.rig.setMode('neighborhood'); });
  await wait(3000); await shot('13-neighborhood');
};

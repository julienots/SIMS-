// Vue aérienne d'un quartier : les routes doivent passer entre les terrains, jamais sous les maisons.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  const info = await ev(async () => {
    const w = window.__mlu.generateWorld({ name: 'A', settings: { mapSize: 96, population: 8, environment: 'suburb', creatures: false }, seed: 4 });
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
    const g = window.__app.game, lot = w.d.lots.find(l => w.objectsOnLot(l).length > 20) || w.d.lots[0];
    g.selected = null; g.rig.setMode('free'); g.rig.focus(lot.x + lot.w / 2, lot.y + lot.h / 2, 46); g.rig.goalPitch = 1.25;
    window.__lot = lot;
    return { lot: [lot.x, lot.y, lot.w, lot.h], roadsX: w.d.map.roadsX, roadsY: w.d.map.roadsY };
  });
  console.log(JSON.stringify(info));
  await wait(6000); await shot('95-aerial');
};

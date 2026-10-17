// Vérification rapide d'une espèce : node tests-browser/shot.mjs horse
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const w = window.__mlu.generateWorld({ name: 'F', settings: { mapSize: 64, population: 2, environment: 'suburb', creatures: true }, seed: 9 });
    w.d.critters = w.d.critters.filter(c => c.kind === 'horse');
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
    const g = window.__app.game, c = w.d.critters[0];
    g.rig.setMode('close'); g.rig.goalPitch = 0.25;
    setInterval(() => { g.rig.focus(c.x, c.y, 4.5); g.rig.yaw = c.rot + Math.PI / 2; }, 30);
  });
  await wait(6000); await shot('61-horse');
};

// Animaux réalistes (Rocketbox) : capture de chaque espèce présente dans un monde généré.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const { generateWorld } = window.__mlu;
    const w = generateWorld({ name: 'Faune', settings: { mapSize: 96, population: 4, environment: 'suburb', creatures: true }, seed: 9 });
    document.getElementById('splash')?.remove();
    window.__app.hideMenu();
    await window.__app.game.startWorld(w);
  });
  await wait(6000);
  const kinds = await ev(() => [...new Set(window.__app.game.world.d.critters.map(c => c.kind))]);
  console.log('espèces', kinds.join(','));
  for (const k of kinds) {
    await ev(k => {
      const g = window.__app.game, c = g.world.d.critters.find(x => x.kind === k);
      g.selected = null; g.rig.setMode('close'); g.rig.focus(c.x, c.y, 4); g.rig.goalPitch = 0.3;
      window.__follow = setInterval(() => g.rig.focus(c.x, c.y), 50);
    }, k);
    await wait(2500);
    await shot(`60-animal-${k}`);
    await ev(() => clearInterval(window.__follow));
  }
};

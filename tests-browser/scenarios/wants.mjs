// Envies : bulles à côté du portrait, onglet Envies avec boutique de récompenses.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const w = window.__mlu.generateWorld({ name: 'E', settings: { mapSize: 64, population: 4, environment: 'suburb', creatures: false }, seed: 5 });
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
    const g = window.__app.game;
    for (let i = 0; i < 300 * 3; i++) g.sim.step(0.2);
    const s = g.selectedSim(); s.satisfaction = 1800;
    g.ui.hud.tab = 'wants'; g.ui.hud.refresh();
  });
  await wait(4000); await shot('96-wants');
  const info = await ev(() => { const s = window.__app.game.selectedSim(); return { wants: s.wants.map(x => x.label), pts: s.satisfaction, bubbles: document.querySelectorAll('.want-bubble').length, cards: document.querySelectorAll('.reward-card').length }; });
  console.log(JSON.stringify(info));
  await page.click('.reward-card:has-text("Estomac") button'); await wait(800);
  console.log('après achat', await ev(() => { const s = window.__app.game.selectedSim(); return { pts: s.satisfaction, rewards: s.rewards }; }));
  await shot('97-wants-bought');
};

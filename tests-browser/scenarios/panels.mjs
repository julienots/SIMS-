// Fenêtres : mods, journal, créatif, monde, sim (besoins/relations/pouvoirs), créateur de mods. Vue mobile.
export default async ({ page, wait, shot, ev }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const { generateWorld } = window.__mlu;
    const w = generateWorld({ name: 'Panneaux', settings: { mapSize: 64, population: 8, environment: 'tropical' }, seed: 21 });
    w.d.mods.enabled = ['superessence.superpowers', 'example.cuisine-du-monde'];
    w.d.mods.data['superessence.superpowers'] = { distribution: 'public_heroes', distributed: false };
    window.__app.hideMenu();
    await window.__app.game.startWorld(w);
    const g = window.__app.game;
    for (let i = 0; i < 300 * 20; i++) g.sim.step(0.2);   // 20 heures de vie accélérée
  });
  await wait(3000); await shot('70-tropical');
  // Les fenêtres secondaires sont rangées dans le menu déroulant (HUD épuré façon Sims).
  const menu = async label => { await page.click('button[title="Menu (Échap)"]'); await wait(400); await page.click(`.main-dropdown button:has-text("${label}")`); };
  await page.click('button[title="Menu (Échap)"]'); await wait(500); await shot('70b-menu'); await page.click('.main-dropdown button:has-text("Mods")'); await wait(800); await shot('71-mods');
  await page.click('.modal-head .btn'); await wait(300);
  await menu('Journal du monde'); await wait(800); await shot('72-journal');
  await page.click('.modal-head .btn'); await wait(300);
  await menu('Mode créatif total'); await wait(800); await shot('73-creative');
  await page.click('.modal .tab:has-text("Événements")'); await wait(400); await shot('74-creative-events');
  await page.click('.modal-head .btn'); await wait(300);
  await menu('Monde et quartiers'); await wait(800); await shot('75-world');
  await page.click('.modal-head .btn'); await wait(300);
  await page.click('.sim-tabs button[title="Relations"]'); await wait(600); await shot('76-relations');
  await page.click('.sim-tabs button[title="Pouvoirs"]'); await wait(600); await shot('77-powers');
  const j = await ev(() => { const w = window.__app.game.world; return { journal: w.d.journal.length, important: w.d.journal.filter(e => e.important).length, last: w.d.journal.filter(e => e.important).slice(-8).map(e => e.text) }; });
  console.log(JSON.stringify(j, null, 1));
  await page.setViewportSize({ width: 844, height: 390 });
  await wait(1500); await shot('78-mobile');
};

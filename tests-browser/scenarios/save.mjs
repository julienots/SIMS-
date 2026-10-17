// Sauvegarde dans IndexedDB, rechargement complet de la page, puis chargement de l'univers.
export default async ({ page, wait, ev }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  const before = await ev(async () => {
    const { generateWorld } = window.__mlu;
    const w = generateWorld({ name: 'Persistant', settings: { mapSize: 64, population: 5 }, seed: 77 });
    window.__app.hideMenu();
    await window.__app.game.startWorld(w);
    const g = window.__app.game;
    for (let i = 0; i < 300 * 5; i++) g.sim.step(0.2);
    await g.save();
    return { id: w.d.id, time: Math.round(w.time), sims: w.sims.length, rel: Object.keys(w.d.rel).length, journal: w.d.journal.length };
  });
  console.log('avant :', JSON.stringify(before));
  await page.reload();
  await page.waitForSelector('#menu', { timeout: 30000 });
  await page.click('text=Charger un univers');
  await wait(800);
  await page.click('.modal .btn:has-text("Jouer")');
  await page.waitForFunction(() => window.__app.game.world, null, { timeout: 30000 });
  const after = await ev(() => { const w = window.__app.game.world; return { id: w.d.id, time: Math.round(w.time), sims: w.sims.length, rel: Object.keys(w.d.rel).length, journal: w.d.journal.length }; });
  console.log('après rechargement :', JSON.stringify(after));
  console.log('identique :', before.id === after.id && before.sims === after.sims && before.rel === after.rel && before.journal === after.journal && Math.abs(before.time - after.time) < 2);
};

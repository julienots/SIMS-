export default async ({ page, wait, shot, ev }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await page.click('text=Galerie de personnages');
  await wait(4000); await shot('30-cas-identity');
  await page.click('.cas-panel .tab:has-text("Corps")'); await wait(1500); await shot('31-cas-body');
  // Change de morphologie et de couleurs.
  for (const body of ['Policière', 'Fille 1', 'Garçon 2', 'Agile']) { await page.click(`.cas-panel .card:has-text("${body}")`); await wait(3500); await shot(`32-cas-${body}`); }
  await page.click('.cas-panel .tab:has-text("Tenue")'); await wait(500);
  await page.click('.cas-panel button:has-text("Super-héros")'); await wait(2000); await shot('33-cas-outfit');
  await page.click('.cas-panel .tab:has-text("Visage")'); await wait(500);
  await page.click('.cas-panel button:has-text("Lunettes de soleil")'); await page.click('.cas-panel button:has-text("Moustache")');
  await ev(() => { window.__app.game.casZoom = 0.55; });
  await wait(2500); await shot('34-cas-face');
};

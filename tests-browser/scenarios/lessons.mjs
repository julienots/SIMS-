// Leçons de démarrage : apparition, validation automatique en faisant l'action, enchaînement.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    localStorage.removeItem('mlu:lessons');
    const w = window.__mlu.generateWorld({ name: 'L', settings: { mapSize: 64, population: 3, environment: 'suburb', creatures: false }, seed: 5 });
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
  });
  await wait(4000); await shot('103-lesson-1');
  const title = () => ev(() => document.querySelector('.lesson')?.textContent.slice(0, 60) || '(aucune)');
  console.log('1 :', await title());
  await page.click('.lesson button:has-text("Compris")'); await wait(2500);
  console.log('2 :', await title());
  // Leçon « Interagir » : ouvrir un menu radial la valide.
  await ev(() => { const g = window.__app.game; g.ui.hud.openPie(400, 300, { type: 'ground', tile: { x: 10, y: 10, l: 0 } }); });
  await wait(2500); await ev(() => window.__app.game.ui.hud.closePie());
  console.log('3 :', await title());
  await ev(() => { const g = window.__app.game; g.ui.hud.tab = 'needs'; g.ui.hud.refresh(); });
  await wait(2500);
  console.log('4 :', await title());
  await shot('104-lesson-4');
};

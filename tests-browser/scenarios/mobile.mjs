// Téléphone en paysage : partie en cours avec notifications, envies, file d'actions, leçon, panneau ouvert, menu radial.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await shot('m0-menu');
  await ev(async () => {
    localStorage.removeItem('mlu:lessons');
    const w = window.__mlu.generateWorld({ name: 'M', settings: { mapSize: 64, population: 6, environment: 'suburb', creatures: false }, seed: 5 });
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
    const g = window.__app.game;
    for (let i = 0; i < 300 * 2; i++) g.sim.step(0.2);
  });
  await wait(5000); await shot('m1-live');
  // Question d'un Sim : petite carte à droite (attend si l'écran est occupé).
  await ev(() => { const g = window.__app.game; g.sim.lastDialogAt = -1e9; g.sim.events.askPlayerAdvice(); });
  await wait(2500); await shot('m1b-dialog');
  console.log('question :', await ev(() => !!document.querySelector('.dialog-pop')), '— leçon visible :', await ev(() => { const l = document.querySelector('.lesson'); return !!l && l.style.display !== 'none'; }));
  await ev(() => document.querySelector('.dialog-pop')?.remove());
  await ev(() => { const g = window.__app.game, s = g.selectedSim(); for (let i = 0; i < 3; i++) g.sim.enqueue(s, { kind: 'idle', dur: 30, name: 'Réfléchir', icon: '💭' }, true); g.ui.hud.refresh(); });
  await wait(2500); await shot('m2-queue');
  await ev(() => { const g = window.__app.game; g.ui.hud.tab = 'needs'; g.ui.hud.refresh(); });
  await wait(2500); await shot('m3-needs');
  await ev(() => { const g = window.__app.game; g.ui.hud.tab = 'wants'; g.ui.hud.refresh(); });
  await wait(2500); await shot('m4-wants');
  await ev(() => { const g = window.__app.game; g.ui.hud.tab = null; g.ui.hud.refresh(); g.ui.hud.openPie(420, 200, { type: 'sim', sim: g.world.sims.find(x => x.id !== g.selected && x.stage !== 'baby') }); });
  await wait(2500); await shot('m5-pie');
  await ev(() => window.__app.game.ui.hud.closePie());
  await page.click('button[title="Menu (Échap)"]'); await wait(800); await shot('m6-menu');
  await ev(() => document.querySelector('.main-dropdown')?.remove());
  await ev(() => window.__app.game.setMode('buy')); await wait(3000); await shot('m7-buy');
  await ev(() => window.__app.game.setMode('build')); await wait(3000); await shot('m8-build');
  await ev(() => window.__app.game.setMode('live')); await wait(1500);
  await ev(() => window.__app.game.ui.cas.open({ mode: 'new' })); await wait(4000); await shot('m9-cas');
};

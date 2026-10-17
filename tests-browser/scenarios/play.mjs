// Interactions réelles : menu radial sur un objet, interaction sociale, construction, achat, contrôle direct.
export default async ({ page, wait, shot, ev }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const { generateWorld } = window.__mlu;
    const w = generateWorld({ name: 'Jeu', settings: { mapSize: 64, population: 6, environment: 'suburb' }, seed: 9 });
    w.d.mods.enabled = ['superessence.superpowers'];
    w.d.mods.data['superessence.superpowers'] = { distribution: 'everyone', distributed: false };
    window.__app.hideMenu();
    await window.__app.game.startWorld(w);
  });
  await wait(4000);
  // Clic sur le frigo du foyer sélectionné.
  const fridge = await ev(() => {
    const g = window.__app.game; const s = g.selectedSim();
    const hh = g.world.household(g.household); const lot = g.world.lot(hh.lotId);
    const f = g.world.objectsOnLot(lot).find(o => o.def.startsWith('fridge'));
    g.rig.focus(f.x + 0.5, f.y + 0.5, 12); g.rig.goalPitch = 0.9;
    return f ? { x: f.x, y: f.y } : null;
  });
  await wait(2500);
  const scr = await ev(f => window.__app.game.screenOf(f.x + 0.5, 1.0, f.y + 0.5), fridge);
  await page.mouse.click(scr.x, scr.y);
  await wait(800); await shot('40-pie-object');
  const items = await page.$$eval('.pie .btn', bs => bs.map(b => b.textContent));
  console.log('menu frigo :', items.join(' | '));
  await page.click('.pie .btn:has-text("Prendre un en-cas")');
  await wait(3000); await shot('41-queue');
  const q = await ev(() => window.__app.game.selectedSim().queue.map(a => `${a.kind}:${a.aff}:${a.phase}`));
  console.log('file :', q);
  // Menu social sur un autre habitant.
  const other = await ev(() => { const g = window.__app.game; const me = g.selectedSim(); const hh = g.world.household(g.household); const o = g.world.sims.find(s => !hh.members.includes(s.id) && s.stage !== 'baby' && !s._rt.hidden); g.rig.focus(o.pos.x, o.pos.y, 10); return o.id; });
  await wait(2000);
  const os = await ev(id => { const g = window.__app.game; const o = g.world.sim(id); return g.screenOf(o.pos.x, o.pos.hz + 0.9, o.pos.y); }, other);
  await page.mouse.click(os.x, os.y);
  await wait(800); await shot('42-pie-social');
  // Pouvoirs du sim sélectionné.
  const pw = await ev(() => { const g = window.__app.game; const s = g.selectedSim(); g.sim.powers.grant(s, 'sp_fire'); g.sim.powers.grant(s, 'sp_flight'); s.modData.powers.energy = 100; return g.sim.powers.powersOf(s).map(p => p.name); });
  console.log('pouvoirs :', pw);
  if (await page.$('.pie')) await page.click('.pie .btn:has-text("Fermer")');
  await ev(() => { const g = window.__app.game; const s = g.selectedSim(); g.sim.dropAll(s); const t = g.world.sims.find(o => o.id !== s.id && !o._rt.hidden && o.stage !== 'baby'); g.sim.enqueue(s, { kind: 'power', power: 'sp_fire', target: t.id }); g.rig.setMode('follow'); g.rig.goalDist = 9; });
  for (let i = 0; i < 8; i++) { await wait(400); const ph = await ev(() => window.__app.game.selectedSim().queue[0]?.phase); if (ph === 'recover') break; }
  await wait(200); await shot('43-power-fire');
  await ev(() => { const g = window.__app.game; const s = g.selectedSim(); g.sim.enqueue(s, { kind: 'power', power: 'sp_flight' }); });
  await wait(2500);
  await ev(() => { const g = window.__app.game; const s = g.selectedSim(); g.sim.enqueue(s, { kind: 'goto', x: 50, y: 50, l: 0 }); });
  await wait(2500); await shot('44-flight');
  // Mode construction.
  await ev(() => { const g = window.__app.game; g.sim.dropAll(g.selectedSim()); g.sim.powers.toggleFlight(g.selectedSim(), false); g.setMode('build'); g.world.creativeFreeBuild = true; const hh = g.world.household(g.household); const lot = g.world.lot(hh.lotId); g.rig.focus(lot.x + lot.w / 2, lot.y + lot.h / 2, 30); });
  await wait(2500); await shot('45-build');
  // Construire une pièce par glisser sur un terrain libre.
  const free = await ev(() => { const g = window.__app.game; const lot = g.world.d.lots.find(l => l.type === 'residential' && !l.householdId); g.rig.focus(lot.x + lot.w / 2, lot.y + lot.h / 2, 26); g.rig.goalPitch = 1.1; return lot; });
  await wait(2500);
  const a = await ev(l => window.__app.game.screenOf(l.x + 3, 0, l.y + 3), free);
  const b = await ev(l => window.__app.game.screenOf(l.x + 9, 0, l.y + 8), free);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 }); await page.mouse.move(b.x, b.y, { steps: 5 });
  await shot('46-build-drag');
  await page.mouse.up();
  await wait(800); await shot('47-room-built');
  const walls = await ev(() => Object.keys(window.__app.game.world.d.walls).length);
  console.log('murs :', walls);
  // Achat : placer un canapé.
  await ev(() => window.__app.game.setMode('buy'));
  await wait(500);
  await page.click('.catalog .tab:has-text("Salon")');
  await page.click('.catalog .item:has-text("Canapé moelleux")');
  await wait(1500);
  const c = await ev(l => window.__app.game.screenOf(l.x + 5, 0, l.y + 5), free);
  await page.mouse.move(c.x, c.y); await wait(500); await shot('48-buy-ghost');
  await page.mouse.click(c.x, c.y); await wait(800); await shot('49-buy-placed');
  const n = await ev(() => window.__app.game.world.objects.filter(o => o.def === 'couch').length);
  console.log('canapés :', n);
  await ev(() => window.__app.game.setMode('live'));
  // Contrôle direct.
  await ev(() => { const g = window.__app.game; g.toggleDirectControl(true); });
  await page.keyboard.down('KeyW'); await wait(1500); await page.keyboard.up('KeyW');
  await wait(500); await shot('50-direct');
  const pos = await ev(() => { const s = window.__app.game.controlledSim; return s ? [s.pos.x.toFixed(1), s.pos.y.toFixed(1), s._rt.anim] : null; });
  console.log('contrôle direct :', pos);
};

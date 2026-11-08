// Animaux de compagnie : adoption par le menu, chien sur le terrain, menu d'interactions, partie de balle.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const w = window.__mlu.generateWorld({ name: 'C', settings: { mapSize: 64, population: 4, environment: 'suburb', creatures: false }, seed: 5 });
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
    const g = window.__app.game; g.world.household(g.household).funds += 2000;
  });
  await wait(3000);
  await page.click('button[title="Menu (Échap)"]'); await wait(400);
  await page.click('.main-dropdown button:has-text("Adopter un chien")'); await wait(800);
  await shot('100-adopt');
  await page.click('.modal button:has-text("Adopter")'); await wait(1500);
  const info = await ev(() => {
    const g = window.__app.game, pet = g.world.d.critters.find(c => c.pet), s = g.selectedSim();
    s.pos.x = pet.x + 1.5; s.pos.y = pet.y; pet.busyUntil = g.world.time + 30;
    g.rig.setMode('close'); g.rig.goalDist = 4; g.rig.goalPitch = 0.55;
    g.sim.clearQueue(s); g.sim.enqueue(s, { kind: 'pet', petId: pet.id, act: 'pet_play', name: 'Jouer' }, true);
    return { pet: pet.name, kind: pet.kind };
  });
  console.log('adopté', JSON.stringify(info));
  await wait(7000); await shot('101-pet-play');
  // Menu radial sur le chien.
  const scr = await ev(() => { const g = window.__app.game, pet = g.world.d.critters.find(c => c.pet); const p = g.screenOf(pet.x, 0.35, pet.y); return p; });
  await page.mouse.click(scr.x, scr.y); await wait(1000);
  console.log('menu', await ev(() => [...document.querySelectorAll('.pie button')].map(b => b.textContent.trim()).join(' | ')));
  await shot('102-pet-menu');
};

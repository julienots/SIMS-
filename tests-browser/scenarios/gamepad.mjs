// Manette simulée : d'abord via la passerelle Android (window.NativePad), puis via l'API Gamepad standard.
export default async ({ page, wait, shot, ev }) => {
  await page.evaluate(() => {
    window.__padState = { connected: true, name: 'Xbox Wireless Controller', lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: new Array(17).fill(0), downs: new Array(17).fill(0) };
    window.NativePad = { getState: () => JSON.stringify(window.__padState) };
  });
  const press = async (i, hold = 250) => {
    await page.evaluate(i => { window.__padState.buttons[i] = 1; window.__padState.downs[i]++; }, i); await wait(hold);
    await page.evaluate(i => { window.__padState.buttons[i] = 0; }, i); await wait(150);
  };
  const stick = async (lx, ly, ms) => { await page.evaluate(([x, y]) => { window.__padState.lx = x; window.__padState.ly = y; }, [lx, ly]); await wait(ms); await page.evaluate(() => { window.__padState.lx = 0; window.__padState.ly = 0; }); await wait(150); };
  const focused = () => page.evaluate(() => document.querySelector('.gp-focus')?.textContent?.trim().slice(0, 40) || null);
  await page.waitForSelector('#menu', { timeout: 30000 });
  await wait(500);
  await press(13); console.log('focus après ↓ :', await focused());
  await press(13); console.log('focus après ↓ :', await focused());
  await press(12); await press(12); console.log('focus après ↑↑ :', await focused());
  await shot('60-pad-menu');
  await press(0); await wait(800); // A → assistant
  console.log('assistant ouvert :', await page.evaluate(() => !!document.querySelector('.modal')));
  await shot('61-pad-wizard');
  await press(1); await wait(400); // B → ferme
  console.log('assistant fermé (B) :', await page.evaluate(() => !document.querySelector('.modal')));
  // Monde de test, puis contrôle à la manette.
  await ev(async () => {
    const { generateWorld } = window.__mlu;
    const w = generateWorld({ name: 'Pad', settings: { mapSize: 64, population: 4, environment: 'village' }, seed: 3 });
    window.__app.hideMenu();
    await window.__app.game.startWorld(w);
  });
  await wait(3000);
  await stick(0.9, 0, 900); // déplace le curseur
  const cur = await ev(() => { const g = window.__app.game; return { active: g.cursor.active, x: g.cursor.x.toFixed(1), z: g.cursor.z.toFixed(1), visible: g.cursorMesh.visible }; });
  console.log('curseur :', JSON.stringify(cur));
  await shot('62-pad-cursor');
  // RB : vitesse, X : sim suivant, Y : contrôle direct.
  await press(5); console.log('vitesse après RB :', await ev(() => window.__app.game.sim.speedIdx));
  const sel0 = await ev(() => window.__app.game.selected);
  await press(2); console.log('sim changé avec X :', sel0 !== await ev(() => window.__app.game.selected));
  await press(3); await wait(500);
  console.log('contrôle direct (Y) :', await ev(() => !!window.__app.game.controlledSim));
  const p0 = await ev(() => { const s = window.__app.game.controlledSim; return [s.pos.x, s.pos.y]; });
  await stick(0, -1, 1500);
  const p1 = await ev(() => { const g = window.__app.game; const s = g.controlledSim; return [s.pos.x, s.pos.y, s._rt.anim, JSON.stringify(g.sim.controlInput), s._rt.engagedBy, s.queue.length]; });
  console.log('état :', p1.slice(2));
  console.log('déplacement manette :', p0.map(v => v.toFixed(1)), '→', p1.slice(0, 2).map(v => v.toFixed(1)));
  await shot('63-pad-direct');
  await stick(0, 1, 800); await press(0); await wait(900); // A : interagir avec l'objet le plus proche
  console.log('menu d’interaction (A) :', await page.evaluate(() => !!document.querySelector('.pie')));
  await shot('64-pad-interact');
  await press(1); await wait(300); await press(1); await wait(300);
  console.log('contrôle direct quitté (B) :', await ev(() => !window.__app.game.controlledSim));
  await press(9); await wait(600);
  console.log('pause (Menu) :', await page.evaluate(() => document.querySelector('.modal h2')?.textContent));
  await shot('65-pad-pause');
  await press(1); await wait(300);
  // API Gamepad standard (navigateur / PC).
  await page.evaluate(() => {
    delete window.NativePad;
    const pad = { id: 'Xbox 360 Controller (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__std = pad;
    navigator.getGamepads = () => [pad];
  });
  await page.evaluate(() => { window.__std.buttons[9].pressed = true; }); await wait(700); await page.evaluate(() => { window.__std.buttons[9].pressed = false; }); await wait(500);
  console.log('API Gamepad standard → pause :', await page.evaluate(() => document.querySelector('.modal h2')?.textContent));
};

export default async ({ page, wait, shot, ev }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await wait(300);
  await ev(async () => {
    const { generateWorld } = window.__mlu;
    const w = generateWorld({ name: 'Test', settings: { mapSize: 64, population: 6, environment: 'suburb' }, seed: 5 });
    document.getElementById('splash')?.remove();
    window.__app.hideMenu();
    await window.__app.game.startWorld(w);
  });
  await wait(5000);
  const look = async (name, pred) => {
    const ok = await ev((p) => {
      const g = window.__app.game;
      const f = new Function('s', `return ${p}`);
      const s = g.world.sims.find(x => f(x));
      if (!s) return null;
      g.selected = s.id; g.rig.setMode('close'); g.rig.goalDist = 5.5; g.rig.goalPitch = 0.35;
      g.ui.hud.refresh();
      return `${s.first} ${s._rt.anim} ${s.queue[0]?.kind}:${s.queue[0]?.aff || s.queue[0]?.social || ''}`;
    }, pred);
    console.log(name, ok);
    if (ok) { await wait(2500); await shot(name); }
  };
  await look('20-sim-idle', "true");
  await ev(() => window.__app.game.sim.setSpeed(3));
  await wait(12000);
  await ev(() => window.__app.game.sim.setSpeed(1));
  await look('21-sim-sit', "['sit','sit_use'].includes(s._rt.anim)");
  await look('22-sim-walk', "['walk','run'].includes(s._rt.anim)");
  await look('23-sim-talk', "s._rt.anim==='talk' || s._rt.engagedBy");
  await look('24-sim-lie', "s._rt.anim==='lie'");
  await look('25-sim-use', "['interact','use'].includes(s._rt.anim)");
};

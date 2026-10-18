// Marche sans saccade : le bassin d'un Sim qui marche ne doit jamais reculer le long de sa direction.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const w = window.__mlu.generateWorld({ name: 'T', settings: { mapSize: 64, population: 3, environment: 'suburb', creatures: false }, seed: 5 });
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
  });
  await wait(4000);
  const res = await ev(async () => {
    const g = window.__app.game, S = g.sim, s = g.world.sims.find(x => g.simViews.get(x.id)?.real && g.simViews.get(x.id)?.bones?.hips) || g.world.sims[0];
    S.clearQueue(s);
    // Destination : une case libre à ~10 m.
    const f = S.nav.nearestFree(0, Math.floor(s.pos.x) + 10, Math.floor(s.pos.y), 6) || { x: Math.floor(s.pos.x), y: Math.floor(s.pos.y) + 10, l: 0 };
    S.enqueue(s, { kind: 'goto', x: f.x, y: f.y, l: 0, name: 'Aller', icon: '' }, true);
    g.selected = s.id; g.rig.setMode('close'); g.rig.goalDist = 5;
    const v = g.simViews.get(s.id);
    const THREE_V = v.group.position.constructor;
    const samples = [];
    await new Promise(r => { const t0 = performance.now(); const tick = () => {
      const hip = v.bones.hips || v.bones.Bip01;
      const p = new THREE_V(); hip.getWorldPosition(p);
      samples.push({ x: p.x, z: p.z, gx: v.group.position.x, gz: v.group.position.z, rot: s.rot, anim: s._rt.anim });
      if (performance.now() - t0 < 8000) setTimeout(tick, 40); else r();
    }; tick(); });
    let back = 0, walking = 0, maxBack = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      if (b.anim !== 'walk' || a.anim !== 'walk') continue;
      walking++;
      const fx = Math.sin(b.rot), fz = Math.cos(b.rot);
      const prog = (b.x - a.x) * fx + (b.z - a.z) * fz;
      if (prog < -0.02) { back++; maxBack = Math.max(maxBack, -prog); }
    }
    // Écart bassin - position du Sim le long de la marche : doit rester petit (pas d'avancée propre au clip).
    let lo = Infinity, hi = -Infinity;
    for (const b of samples) if (b.anim === 'walk') { const o = (b.x - b.gx) * Math.sin(b.rot) + (b.z - b.gz) * Math.cos(b.rot); lo = Math.min(lo, o); hi = Math.max(hi, o); }
    const a0 = samples.find(b => b.anim === 'walk'), a1 = [...samples].reverse().find(b => b.anim === 'walk');
    return { frames: samples.length, walking, back, maxBack: +maxBack.toFixed(3), hipOffsetRange: +(hi - lo).toFixed(3), dist: a0 && a1 ? +Math.hypot(a1.gx - a0.gx, a1.gz - a0.gz).toFixed(2) : 0, fps: v.frame };
  });
  console.log('MARCHE', JSON.stringify(res));
  await shot('70-walk');
};

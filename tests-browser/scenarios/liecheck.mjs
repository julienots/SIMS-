// Sens de couchage : la tête doit être du côté de la tête de lit (arrière de l'objet), pour chaque rotation.
export default async ({ wait, ev, page, shot }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  await ev(async () => {
    const w = window.__mlu.generateWorld({ name: 'L', settings: { mapSize: 64, population: 1, environment: 'suburb', creatures: false }, seed: 11 });
    for (const o of [...w.objects]) w.removeObject(o.id);
    w.d.walls = {}; w.d.floors = {}; w.rebuildOccupancy();
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
  });
  await wait(3000);
  for (const id of (process.env.OBJS || 'bed_double,bed_single').split(',')) for (const rot of [0, 1]) {
    await ev(([id, rot]) => {
      const g = window.__app.game, W = g.world, S = g.sim, s = W.sims[0];
      for (const o of [...W.objects]) W.removeObject(o.id);
      const o = W.addObject(id, 28, 28, rot, 0); S.nav.refresh();
      s.pos.x = 28.5; s.pos.y = 33.5; S.clearQueue(s);
      const item = S.objectMenu(s, o).find(i => !i.disabled);
      S.enqueue(s, { ...item.action }, true); S.setSpeed(3); window.__o = o;
    }, [id, rot]);
    await wait(9000);
    const r = await ev(() => {
      const g = window.__app.game, W = g.world, s = W.sims[0], v = g.simViews.get(s.id), o = window.__o;
      const V = v.group.position.constructor;
      const head = new V(), hips = new V();
      v.bones.head.getWorldPosition(head); v.bones.hips.getWorldPosition(hips);
      const f = W.objFacing(o), back = { x: -Math.sin(f), z: -Math.cos(f) };
      // Haut du modèle du lit : centre des sommets les plus hauts (tête de lit).
      const holder = g.worldView.objViews.get(o.id);
      let hb = null; holder.updateMatrixWorld(true);
      const pts = []; holder.traverse(m => { if (m.isMesh) { const p = m.geometry.attributes.position, vv = new V(); for (let i = 0; i < p.count; i += 7) { vv.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); pts.push(vv.clone()); } } });
      const maxY = Math.max(...pts.map(p => p.y)); const top = pts.filter(p => p.y > maxY - 0.15);
      const c = W.objCenter(o); const tz = top.reduce((a, p) => a + (p.x - c.x) * back.x + (p.z - c.y) * back.z, 0) / top.length;
      const dir = (head.x - hips.x) * back.x + (head.z - hips.z) * back.z;
      return { anim: s._rt.anim, headToBack: +dir.toFixed(2), headboardOnBackSide: +tz.toFixed(2) };
    });
    console.log(id, 'rot', rot, JSON.stringify(r));
  }
};

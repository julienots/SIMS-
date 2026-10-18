// Mesures de rendu : appels de dessin, triangles, images/s, par catégorie d'objets.
export default async ({ wait, shot, ev, page }) => {
  await page.waitForSelector('#menu', { timeout: 30000 });
  const size = +(process.env.MAP || 64);
  await ev(async (size) => {
    const w = window.__mlu.generateWorld({ name: 'P', settings: { mapSize: size, population: 6, environment: 'suburb' }, seed: 5 });
    document.getElementById('splash')?.remove(); window.__app.hideMenu();
    await window.__app.game.startWorld(w);
  }, size);
  await wait(8000);
  const info = await ev(() => {
    const g = window.__app.game, r = g.renderer.info.render;
    const cats = {};
    g.scene.traverse(o => { if (o.isMesh && o.visible) { const k = o.isInstancedMesh ? 'instanced' : (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) > 30000 ? 'big' : 'small'; cats[k] = (cats[k] || 0) + 1; } });
    let treeTris = 0, trees = 0;
    for (const o of g.world.objects) if (o.def === 'tree' || o.def === 'pine' || o.def === 'bush') { trees++; }
    g.scene.traverse(o => { if (o.isMesh && o.geometry?.index && o.material?.alphaTest) treeTris += o.geometry.index.count / 3; });
    return { fps: Math.round(g.fps), calls: r.calls, tris: r.triangles, cats, trees, alphaTris: Math.round(treeTris), grass: g.worldView.grass?.mesh?.count };
  });
  console.log('PERF', JSON.stringify(info));
  await shot('80-perf');
};

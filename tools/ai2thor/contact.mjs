// Planche contact des meubles convertis (avec un humain Rocketbox de 1,7 m pour l'échelle).
// Usage : npx esbuild tools/ai2thor/viewer.js --bundle --format=esm --outfile=/tmp/b.js
//         node tools/ai2thor/contact.mjs /tmp/b.js <dossier glb> <sortie.png> [noms…]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const [bundle, dir, outPng, ...names] = process.argv.slice(2);
const list = names.length ? names : fs.readdirSync(dir).filter(f => f.endsWith('.glb')).map(f => f.slice(0, -4));
const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url);
  if (u === '/') { s.end(`<html><body style="margin:0"><script>window.LIST=${JSON.stringify(list.map(n => '/m/' + n + '.glb'))};window.HUMAN='/human.glb';window.VIEW=${JSON.stringify(process.env.VIEW || '')}</script><script type="module" src="/b.js"></script></body></html>`); return; }
  const f = u.startsWith('/m/') ? path.join(dir, u.slice(3)) : u === '/human.glb' ? 'game/assets/models/real/Female_Adult_01.glb' : u === '/b.js' ? bundle : null;
  if (!f || !fs.existsSync(f)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'model/gltf-binary' }); fs.createReadStream(f).pipe(s);
}).listen(0);
const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await br.newPage();
pg.on('pageerror', e => console.log('ERR', e.message));
await pg.goto(`http://localhost:${srv.address().port}/`);
await pg.waitForFunction(() => window.RESULT, null, { timeout: 600000 });
const res = await pg.evaluate(() => window.RESULT);
const cols = 6, cell = 300;
const html = `<html><body style="margin:0;display:grid;grid-template-columns:repeat(${cols},${cell}px);background:#222;font:14px sans-serif;color:#fff">${list.map(n => `<div style="position:relative;height:${cell}px"><img src="${res['/m/' + n + '.glb'] || ''}" width=${cell} height=${cell}><div style="position:absolute;left:4px;top:4px;background:#000a;padding:2px 4px">${n}</div></div>`).join('')}</body></html>`;
await pg.setViewportSize({ width: cols * cell, height: Math.ceil(list.length / cols) * cell });
await pg.setContent(html);
await pg.screenshot({ path: outPng, fullPage: true });
await br.close(); srv.close();
console.log('planche', outPng, list.length);

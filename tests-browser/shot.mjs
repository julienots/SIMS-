// Outil de test navigateur : lance le jeu, exécute un scénario et prend des captures.
// Usage : node tests-browser/shot.mjs <scénario> [dossier]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('dist/web');
const OUT = process.argv[3] || '/tmp/claude-0/-home-user-SIMS-/1c62fffe-99e0-555d-b321-fb55d641ff17/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;
const scenario = process.argv[2] || 'menu';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${port}/`);
const wait = ms => page.waitForTimeout(ms);
const shot = async name => { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 150000 }); console.log('capture', name); };
const ev = (fn, arg) => page.evaluate(fn, arg);
try {
  const mod = await import(path.resolve(`tests-browser/scenarios/${scenario}.mjs`));
  await mod.default({ page, wait, shot, ev, errors });
} catch (e) { console.log('ÉCHEC SCÉNARIO', e.message); await shot('failure'); }
console.log('--- erreurs console ---');
console.log(errors.slice(0, 40).join('\n') || '(aucune)');
await browser.close();
server.close();

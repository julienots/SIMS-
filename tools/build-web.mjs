// Construit la version web autonome du jeu dans dist/web (un seul script, assets copiés).
// Le même dossier est embarqué dans l'APK Android.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'dist/web';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: ['game/src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['chrome80', 'safari14'],
  minify: process.argv.includes('--dev') ? false : true,
  sourcemap: process.argv.includes('--dev') ? 'inline' : false,
  outfile: `${OUT}/game.js`,
  legalComments: 'none',
  logLevel: 'warning',
});

const copy = (src, dst) => {
  const st = fs.statSync(src);
  if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dst, f)); }
  else fs.copyFileSync(src, dst);
};
copy('game/index.html', `${OUT}/index.html`);
copy('game/style.css', `${OUT}/style.css`);
copy('game/assets', `${OUT}/assets`);
copy('game/mods', `${OUT}/mods`);
if (fs.existsSync('game/icon.png')) copy('game/icon.png', `${OUT}/icon.png`);
fs.mkdirSync(`${OUT}/fonts`, { recursive: true });
for (const [pkg, files] of [['fredoka', ['fredoka-latin-600-normal.woff2', 'fredoka-latin-700-normal.woff2']], ['nunito', ['nunito-latin-400-normal.woff2', 'nunito-latin-700-normal.woff2', 'nunito-latin-800-normal.woff2']]]) {
  for (const f of files) copy(`node_modules/@fontsource/${pkg}/files/${f}`, `${OUT}/fonts/${f}`);
}
let size = 0;
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else size += s.size; } };
walk(OUT);
console.log(`dist/web prêt : ${(size / 1048576).toFixed(1)} Mo (game.js ${(fs.statSync(`${OUT}/game.js`).size / 1024).toFixed(0)} Ko)`);

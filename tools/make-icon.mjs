// Génère l'icône du jeu (rendu HTML avec la police Fredoka) : game/icon.png et mipmaps Android.
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
const font = fs.readFileSync('node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff2').toString('base64');
const html = `<html><head><style>@font-face{font-family:F;src:url(data:font/woff2;base64,${font})}
body{margin:0;width:512px;height:512px;background:transparent}
.i{width:512px;height:512px;border-radius:112px;background:radial-gradient(circle at 30% 20%,#2a2f5a,#0b0d16 70%);display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:F;position:relative;overflow:hidden}
.g{position:absolute;inset:0;background:radial-gradient(circle at 50% 60%,rgba(255,207,46,.35),transparent 55%)}
.m{font-size:250px;color:#ffcf2e;line-height:.9;text-shadow:10px 12px 0 #000;position:relative}
.u{font-size:62px;color:#fff;letter-spacing:4px;text-shadow:5px 6px 0 #000;position:relative;margin-top:6px}
.d{position:absolute;right:92px;top:120px;width:46px;height:46px;border-radius:50%;background:#fff;box-shadow:5px 6px 0 #000}</style></head>
<body><div class="i"><div class="g"></div><div class="m">ML</div><div class="u">UNIVERSE</div></div></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 512, height: 512 } });
await p.setContent(html);
await p.waitForTimeout(400);
const buf = await p.screenshot({ omitBackground: true });
await b.close();
fs.writeFileSync('game/icon.png', await sharp(buf).resize(192).png().toBuffer());
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [k, s] of Object.entries(sizes)) {
  fs.mkdirSync(`android/res/mipmap-${k}`, { recursive: true });
  fs.writeFileSync(`android/res/mipmap-${k}/ic_launcher.png`, await sharp(buf).resize(s).png().toBuffer());
}
console.log('icônes générées');

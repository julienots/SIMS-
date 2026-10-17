// Convertit les avatars, animations et animaux Microsoft Rocketbox (MIT) en GLB optimisés pour le jeu.
// Usage : RB=/chemin/clone FBX2GLTF=/chemin/FBX2glTF node tools/rocketbox/convert.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const RB = process.env.RB, FBX = process.env.FBX2GLTF;
if (!RB || !FBX) { console.error('RB et FBX2GLTF requis'); process.exit(1); }
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve('game/assets/models/real');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-'));
fs.mkdirSync(`${OUT}/thumbs`, { recursive: true });
fs.mkdirSync('game/assets/models/animals', { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const list = f => fs.readFileSync(path.join(HERE, f), 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const find = (root, re) => {
  const out = [];
  const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (re.test(p)) out.push(p); } };
  walk(root);
  return out;
};
const fbx2glb = (src, name) => {
  const dst = path.join(TMP, name);
  execFileSync(FBX, ['-b', '-i', src, '-o', dst], { stdio: 'ignore' });
  return dst + '.glb';
};
// TGA -> JPEG/PNG redimensionné (Pillow).
const img = (src, dst, size, fmt) => {
  execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1])
im = im.resize((int(sys.argv[3]), int(sys.argv[3])), Image.LANCZOS)
if sys.argv[4] == 'jpg':
    im.convert('RGB').save(sys.argv[2], 'JPEG', quality=84, optimize=True)
else:
    im.convert('RGBA').save(sys.argv[2], 'PNG', optimize=True)
`, src, dst, String(size), fmt]);
  return fs.readFileSync(dst);
};

async function texturize(doc, texFiles, opts = {}) {
  const root = doc.getRoot();
  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMaterials()) {
    const n = m.getName().toLowerCase();
    let file = null, kind = 'jpg', size = opts.size || 1024;
    if (n.includes('opacity')) { file = texFiles.find(f => /opacity_color/i.test(f)); kind = 'png'; size = 512; }
    else if (n.includes('head')) file = texFiles.find(f => /head_color/i.test(f));
    else if (n.includes('body')) file = texFiles.find(f => /body_color/i.test(f));
    else file = texFiles.find(f => /_color\.tga$/i.test(f));
    m.setMetallicFactor(0).setRoughnessFactor(0.75);
    m.setBaseColorFactor([1, 1, 1, 1]);
    if (!file) continue;
    const buf = img(file, path.join(TMP, `${path.basename(file)}.${kind}`), size, kind);
    const tex = doc.createTexture(path.basename(file)).setImage(buf).setMimeType(kind === 'png' ? 'image/png' : 'image/jpeg');
    m.setBaseColorTexture(tex);
    if (kind === 'png') { m.setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true); }
    else m.setAlphaMode('OPAQUE');
  }
}

// ---------------------------------------------------------------- avatars
const manifest = { avatars: [], animals: [] };
for (const a of list('avatars.txt')) {
  const fbx = find(path.join(RB, 'Assets/Avatars'), new RegExp(`/${a}/Export/${a}\\.fbx$`))[0];
  if (!fbx) { console.warn('absent', a); continue; }
  const dir = path.dirname(path.dirname(fbx));
  const glb = fbx2glb(fbx, a);
  const doc = await io.read(glb);
  for (const an of doc.getRoot().listAnimations()) an.dispose();
  await texturize(doc, find(path.join(dir, 'Textures'), /_color\.tga$/i));
  await doc.transform(dedup(), prune());
  await io.write(`${OUT}/${a}.glb`, doc);
  const png = path.join(dir, `${a}.png`);
  if (fs.existsSync(png)) execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); w, h = im.size; s = min(w, h)
im = im.crop(((w - s) // 2, 0, (w + s) // 2, s)).resize((160, 160), Image.LANCZOS)
im.save(sys.argv[2], 'JPEG', quality=82)`, png, `${OUT}/thumbs/${a}.jpg`]);
  const gender = /female/i.test(a) ? 'f' : 'm';
  const age = /child/i.test(a) ? 'child' : 'adult';
  manifest.avatars.push({ id: a, gender, age, size: fs.statSync(`${OUT}/${a}.glb`).size });
  console.log('avatar', a, (fs.statSync(`${OUT}/${a}.glb`).size / 1024).toFixed(0), 'Ko');
}

// ---------------------------------------------------------------- animations (une bibliothèque par sexe)
for (const g of ['m', 'f']) {
  const names = list('animations.txt').filter(n => n.startsWith(g + '_'));
  let base = null, nodeByName = null;
  for (const n of names) {
    const fbx = find(path.join(RB, 'Assets/Animations'), new RegExp(`/${n}\\.max\\.fbx$`))[0];
    if (!fbx) { console.warn('animation absente', n); continue; }
    const doc = await io.read(fbx2glb(fbx, n));
    const anim = doc.getRoot().listAnimations()[0];
    if (!anim) { console.warn('pas de piste', n); continue; }
    const clip = n.slice(2);
    if (!base) {
      base = doc;
      for (const m of base.getRoot().listMeshes()) m.dispose();
      anim.setName(clip);
      nodeByName = new Map(base.getRoot().listNodes().map(nd => [nd.getName(), nd]));
      continue;
    }
    // Copie de l'animation dans le document de base, en reliant les pistes par nom d'os.
    const dst = base.createAnimation(clip);
    const buffer = base.getRoot().listBuffers()[0];
    for (const ch of anim.listChannels()) {
      const target = nodeByName.get(ch.getTargetNode()?.getName());
      if (!target) continue;
      const s = ch.getSampler();
      const input = base.createAccessor().setType(s.getInput().getType()).setArray(s.getInput().getArray().slice()).setBuffer(buffer);
      const output = base.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buffer);
      const sampler = base.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
      dst.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    }
  }
  await base.transform(prune({ keepLeaves: true }));
  await io.write(`${OUT}/anims_${g}.glb`, base);
  console.log(`anims_${g}`, base.getRoot().listAnimations().length, 'clips', (fs.statSync(`${OUT}/anims_${g}.glb`).size / 1024).toFixed(0), 'Ko');
}

// ---------------------------------------------------------------- animaux
for (const a of list('animals.txt')) {
  const fbx = path.join(RB, 'Assets/Animals', a, 'Export', `${a}.fbx`);
  if (!fs.existsSync(fbx)) { console.warn('absent', a); continue; }
  const doc = await io.read(fbx2glb(fbx, a));
  for (const an of doc.getRoot().listAnimations()) an.dispose();
  await texturize(doc, find(path.join(RB, 'Assets/Animals', a, 'Textures'), /_color\.tga$/i), { size: 512 });
  await doc.transform(dedup(), prune());
  await io.write(`game/assets/models/animals/${a}.glb`, doc);
  manifest.animals.push(a);
  console.log('animal', a);
}
fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
fs.rmSync(TMP, { recursive: true, force: true });

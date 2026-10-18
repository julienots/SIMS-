// Convertit des meubles réalistes AI2-THOR (Allen Institute for AI, licence Apache 2.0) en GLB pour le jeu.
// Les objets AI2-THOR sont des préfabriqués Unity : hiérarchie de transformations + maillages FBX + matériaux .mat
// référencés par GUID. Ce script relit ces fichiers YAML, assemble le meuble et y applique couleurs et textures.
// Usage : AI2THOR=/chemin/clone/unity/Assets FBX2GLTF=/chemin/FBX2glTF node tools/ai2thor/convert.mjs [id…]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureTransform } from '@gltf-transform/extensions';
import { prune, dedup, getBounds, mergeDocuments } from '@gltf-transform/functions';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as THREE from 'three';

const ROOT = process.env.AI2THOR, FBX = process.env.FBX2GLTF;
if (!ROOT || !FBX) { console.error('AI2THOR et FBX2GLTF requis'); process.exit(1); }
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve('game/assets/models/furniture-real');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'thor-'));
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const LIST = JSON.parse(fs.readFileSync(path.join(HERE, 'furniture.json'), 'utf8'));
const only = process.argv.slice(2);

// ------------------------------------------------------------------ index des fichiers
// Le clone peut être partiel (sparse + blobless) : les FBX et textures sont extraits à la demande.
const REPO = path.resolve(ROOT, '../..');
function ensure(file) {
  if (!file || fs.existsSync(file)) return file;
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, execFileSync('git', ['-C', REPO, 'show', `HEAD:${path.relative(REPO, file)}`], { maxBuffer: 1 << 30 })); } catch { /* absent */ }
  return file;
}
const files = [];
for (const f of execFileSync('git', ['-C', REPO, 'ls-tree', '-r', '--name-only', 'HEAD'], { maxBuffer: 1 << 28 }).toString().split('\n')) if (f.startsWith('unity/Assets/')) files.push(path.join(REPO, f));
const byGuid = new Map();
for (const f of files) if (f.endsWith('.meta') && fs.existsSync(f)) {
  const m = /guid: ([0-9a-f]{32})/.exec(fs.readFileSync(f, 'utf8'));
  if (m) byGuid.set(m[1], f.slice(0, -5));
}
const prefabByName = new Map(files.filter(f => f.endsWith('.prefab')).map(f => [path.basename(f, '.prefab'), f]));

// ------------------------------------------------------------------ lecture YAML Unity (sous-ensemble)
function docs(file) {
  const out = new Map();
  for (const part of fs.readFileSync(file, 'utf8').split(/^--- /m).slice(1)) {
    const m = /^!u!(\d+) &(-?\d+)( stripped)?/.exec(part);
    if (m) out.set(m[2], { cls: +m[1], text: part, stripped: !!m[3] });
  }
  return out;
}
const num = (t, k) => { const m = new RegExp(`${k}: (-?[\\d.e-]+)`).exec(t); return m ? +m[1] : undefined; };
const vec = (t, k) => { const m = new RegExp(`${k}: \\{([^}]*)\\}`).exec(t); if (!m) return null; const o = {}; for (const kv of m[1].split(',')) { const [a, b] = kv.split(':').map(s => s.trim()); o[a] = isNaN(+b) || a === 'fileID' ? b : +b; } return o; };
const refs = (t, k) => { const m = new RegExp(`${k}:\\n((?:  - .*\\n)+)`).exec(t); return m ? [...m[1].matchAll(/\{fileID: (-?\d+)(?:, guid: ([0-9a-f]+))?/g)].map(x => ({ fileID: x[1], guid: x[2] })) : []; };

// Nom du maillage FBX correspondant à un fileID Unity (table de l'importeur, ancien ou nouveau format).
const fbxNames = new Map();
function meshName(fbx, fileID) {
  if (!fbxNames.has(fbx)) {
    const t = fs.readFileSync(fbx + '.meta', 'utf8'), map = new Map();
    ensure(fbx);
    for (const m of t.matchAll(/- first:\n\s+(\d+): (-?\d+)\n\s+second: (.+)/g)) if (m[1] === '43') map.set(m[2], m[3].trim());
    for (const m of t.matchAll(/^\s+(43\d{5}): (.+)$/gm)) map.set(m[1], m[2].trim());
    fbxNames.set(fbx, map);
  }
  return fbxNames.get(fbx).get(fileID);
}

// ------------------------------------------------------------------ matériaux
const srgb = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function readMat(guid) {
  const f = byGuid.get(guid);
  if (!f || !f.endsWith('.mat')) return null;
  const t = fs.readFileSync(f, 'utf8');
  const tex = name => { const m = new RegExp(`- ${name}:\\n\\s+m_Texture: \\{fileID: \\d+(?:, guid: ([0-9a-f]+))?[^}]*\\}\\n\\s+m_Scale: \\{x: ([-\\d.e]+), y: ([-\\d.e]+)\\}\\n\\s+m_Offset: \\{x: ([-\\d.e]+), y: ([-\\d.e]+)\\}`).exec(t); return m && m[1] ? { file: byGuid.get(m[1]), scale: [+m[2], +m[3]], offset: [+m[4], +m[5]] } : null; };
  return { name: /m_Name: (.*)/.exec(t)?.[1] || 'mat', color: vec(t, '_Color') || { r: 1, g: 1, b: 1, a: 1 }, emission: vec(t, '_EmissionColor'), metallic: num(t, '_Metallic') ?? 0, gloss: num(t, '_Glossiness') ?? 0.5, mode: num(t, '_Mode') ?? 0, main: tex('_MainTex'), keywords: /m_ShaderKeywords: (.*)/.exec(t)?.[1] || '' };
}
const texCache = new Map();
function image(file, size, alpha) {
  const key = `${file}|${size}|${alpha}`;
  if (texCache.has(key)) return texCache.get(key);
  if (!/\.(png|jpe?g|tga|tif|tiff|bmp)$/i.test(file) || !fs.existsSync(ensure(file))) return null;
  const dst = path.join(TMP, `t${texCache.size}.${alpha ? 'png' : 'jpg'}`);
  try {
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]); s = int(sys.argv[3])
w, h = im.size; k = min(1, s / max(w, h)); im = im.resize((max(4, int(w * k)), max(4, int(h * k))), Image.LANCZOS)
if sys.argv[4] == '1': im.convert('RGBA').save(sys.argv[2], 'PNG', optimize=True)
else: im.convert('RGB').save(sys.argv[2], 'JPEG', quality=82, optimize=True)
`, file, dst, String(size), alpha ? '1' : '0']);
  } catch { return null; }
  const r = { buf: fs.readFileSync(dst), mime: alpha ? 'image/png' : 'image/jpeg' };
  texCache.set(key, r);
  return r;
}
function applyMat(doc, m, info, texSize) {
  const c = info.color;
  const transparent = info.mode >= 2;
  m.setName(info.name).setBaseColorFactor([srgb(c.r), srgb(c.g), srgb(c.b), transparent ? c.a : 1])
    .setMetallicFactor(Math.min(1, info.metallic)).setRoughnessFactor(Math.max(0.05, 1 - info.gloss));
  m.setAlphaMode(transparent ? 'BLEND' : info.mode === 1 ? 'MASK' : 'OPAQUE');
  if (info.mode === 1) m.setAlphaCutoff(0.5);
  if (info.keywords.includes('_EMISSION') && info.emission && (info.emission.r + info.emission.g + info.emission.b) > 0.05) m.setEmissiveFactor([srgb(Math.min(1, info.emission.r)), srgb(Math.min(1, info.emission.g)), srgb(Math.min(1, info.emission.b))]);
  if (info.main?.file) {
    const img = image(info.main.file, texSize, info.mode >= 1);
    if (img) {
      const tex = doc.createTexture(path.basename(info.main.file)).setImage(img.buf).setMimeType(img.mime);
      m.setBaseColorTexture(tex);
      const [sx, sy] = info.main.scale, [ox, oy] = info.main.offset;
      if (sx !== 1 || sy !== 1 || ox || oy) {
        const ext = doc.createExtension(KHRTextureTransform).setRequired(false);
        // Unity a l'origine des UV en bas à gauche, glTF en haut à gauche.
        m.getBaseColorTextureInfo().setExtension('KHR_texture_transform', ext.createTransform().setScale([sx, sy]).setOffset([ox, 1 - sy - oy]));
      }
    }
  }
}

// ------------------------------------------------------------------ assemblage d'un préfabriqué
const fbxDocs = new Map();
async function fbxDoc(fbx) {
  if (!fbxDocs.has(fbx)) {
    const dst = path.join(TMP, `f${fbxDocs.size}`);
    execFileSync(FBX, ['-b', '-i', ensure(fbx), '-o', dst], { stdio: 'ignore' });
    fbxDocs.set(fbx, dst + '.glb');
  }
  return io.read(fbxDocs.get(fbx));
}

// Maillages visibles d'un préfabriqué (les variantes héritent de leur Master et appliquent leurs surcharges).
function collect(pf, item, depth = 0) {
  const D = docs(pf);
  const inst = [...D.values()].find(d => d.cls === 1001 && /m_TransformParent: \{fileID: 0\}/.test(d.text));
  if (inst && depth < 6) {
    const src = byGuid.get(/m_SourcePrefab: \{fileID: \d+, guid: ([0-9a-f]+)/.exec(inst.text)?.[1]);
    const meshes = src ? collect(src, item, depth + 1) : [];
    const mods = [...inst.text.matchAll(/- target: \{fileID: (-?\d+)[^}]*\}\s+propertyPath: (.+)\s+value: (.*)\s+objectReference: \{fileID: -?\d+(?:, guid: ([0-9a-f]+))?/g)];
    for (const [, target, prop, value, guid] of mods) {
      const mm = /^m_Materials\.Array\.data\[(\d+)\]$/.exec(prop.trim());
      for (const m of meshes) {
        if (mm && guid && m.rend === target) m.mats[+mm[1]] = guid;
        if (prop.trim() === 'm_Enabled' && value.trim() === '0' && m.rend === target) m.hidden = true;
        if (prop.trim() === 'm_IsActive' && value.trim() === '0' && m.gos.includes(target)) m.hidden = true;
      }
    }
    return meshes.filter(m => !m.hidden);
  }
  const go = new Map(), tr = new Map();
  for (const [id, d] of D) {
    if (d.cls === 1) go.set(id, { name: /m_Name: (.*)/.exec(d.text)?.[1] || '', active: num(d.text, 'm_IsActive') !== 0 });
    if (d.cls === 4) tr.set(id, { go: vec(d.text, 'm_GameObject')?.fileID + '', pos: vec(d.text, 'm_LocalPosition'), rot: vec(d.text, 'm_LocalRotation'), scl: vec(d.text, 'm_LocalScale'), father: vec(d.text, 'm_Father')?.fileID + '' });
  }
  const trByGo = new Map([...tr].map(([id, t]) => [t.go, id]));
  const meshes = [];
  for (const [, d] of D) {
    if (d.cls !== 33) continue;
    const g = vec(d.text, 'm_GameObject').fileID + '';
    const mref = /m_Mesh: \{fileID: (-?\d+), guid: ([0-9a-f]+)/.exec(d.text);
    if (!mref) continue;
    const rendE = [...D.entries()].find(([, x]) => x.cls === 23 && vec(x.text, 'm_GameObject')?.fileID + '' === g);
    if (!rendE || num(rendE[1].text, 'm_Enabled') === 0) continue;
    // Chaîne de parents : objet inactif => ignoré ; transformation relative à la racine du préfabriqué.
    let t = trByGo.get(g), chain = [], ok = true;
    while (t && tr.has(t)) { const T = tr.get(t); if (go.get(T.go)?.active === false) ok = false; chain.push(T); t = T.father; }
    if (!ok || (item.skip && item.skip.some(s => chain.some(T => go.get(T.go)?.name.includes(s))))) continue;
    const gos = chain.map(T => T.go);
    chain.pop(); // la racine reste à l'origine
    meshes.push({ fbx: byGuid.get(mref[2]), fileID: mref[1], mats: refs(rendE[1].text, 'm_Materials').map(r => r.guid), chain, gos, rend: rendE[0], goName: go.get(g)?.name });
  }
  return meshes;
}

// Un meuble du jeu peut assembler plusieurs objets AI2-THOR (TV posée sur son meuble, évier encastré…) :
// chaque pièce est centrée sur son emprise, posée au sol (ou sur le dessus d'une pièce précédente : onTop),
// puis décalée de pos et tournée de rotY.
async function addPart(out, root, part, item, built) {
  const pf = prefabByName.get(part.prefab);
  if (!pf) throw new Error(`préfabriqué introuvable : ${part.prefab}`);
  const meshes = collect(pf, item);
  if (!meshes.length) throw new Error(`aucun maillage visible (${part.prefab})`);
  const holder = out.createNode(part.prefab), content = out.createNode();
  holder.addChild(content); root.addChild(holder);
  const firstUse = new Map();
  for (const fbx of [...new Set(meshes.map(m => m.fbx))]) {
    const src = await fbxDoc(fbx);
    const byName = new Map(src.getRoot().listNodes().filter(n => n.getMesh()).map(n => [n.getName(), n]));
    const ident = n => n.getTranslation().every(v => Math.abs(v) < 1e-4) && Math.abs(n.getRotation()[3]) > 0.9999 && n.getScale().every(v => Math.abs(v - 1) < 1e-4);
    const frozen = src.getRoot().listNodes().every(ident);
    // Les maillages utiles sont marqués puis le document source est fusionné dans le document de sortie.
    const wanted = new Map();
    for (const m of meshes.filter(x => x.fbx === fbx)) {
      // Table de noms vide (FBX importés par un Unity récent, identifiants hachés) : repli sur le nom indiqué
      // dans furniture.json ou sur le nom du préfabriqué en minuscules.
      let nm = meshName(fbx, m.fileID);
      if (!byName.has(nm)) nm = [part.mesh, part.prefab.toLowerCase()].find(x => x && byName.has(x)) || nm;
      const n = byName.get(nm);
      if (!n) { console.warn('   maillage absent', nm, m.goName); continue; }
      n.getMesh().setExtras({ ...n.getMesh().getExtras(), __want: true });
      wanted.set(m, n.getMesh().getName());
    }
    for (const s of src.getRoot().listScenes()) s.dispose();
    for (const mesh of src.getRoot().listMeshes()) if (!mesh.getExtras().__want) mesh.dispose();
    const map = mergeDocuments(out, src);
    const byMesh = new Map([...map.entries()].filter(([a]) => a.propertyType === 'Mesh').map(([a, b]) => [a.getName(), b]));
    for (const [m, nm] of wanted) {
      let mesh = byMesh.get(nm);
      if (!mesh) continue;
      mesh = mesh.clone();
      mesh.listPrimitives().forEach((p, i) => {
        const info = readMat(m.mats[Math.min(i, m.mats.length - 1)]);
        const mat = out.createMaterial(info?.name || 'mat');
        if (info) applyMat(out, mat, info, item.tex || 512);
        p.setMaterial(mat);
      });
      // Deux cas d'export : (a) FBX « figé » (tous les nœuds à l'identité, pivots intégrés aux sommets) : le maillage
      // est déjà à sa place, seul un maillage réutilisé est décalé de l'écart avec sa 1re occurrence ;
      // (b) nœuds FBX transformés : on applique la chaîne Unity du préfabriqué aux sommets locaux.
      // Dans les deux cas, miroir X (Unity main gauche -> glTF main droite).
      const node = out.createNode(nm).setMesh(mesh);
      let M = null;
      if (!frozen) M = chainMatrix(m.chain);
      else if (firstUse.has(nm)) M = chainMatrix(m.chain).multiply(chainMatrix(firstUse.get(nm).chain).invert());
      else firstUse.set(nm, m);
      if (M) {
        const t = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        M.decompose(t, q, sc);
        node.setTranslation(t.toArray()).setRotation(q.toArray()).setScale(sc.toArray());
      }
      content.addChild(node);
    }
  }
  content.setRotation(quatY(part.rotY || 0));
  if (part.scale) content.setScale(Array.isArray(part.scale) ? part.scale : [part.scale, part.scale, part.scale]);
  const b = getBounds(content);
  content.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
  const [px, py, pz] = part.pos || [0, 0, 0];
  const base = part.onTop !== undefined ? built[part.onTop].top : 0;
  holder.setTranslation([px, base + py, pz]);
  const hb = getBounds(holder);
  built.push({ top: hb.max[1] });
}

async function convert(item) {
  const out = new (await import('@gltf-transform/core')).Document();
  out.createBuffer();
  const scene = out.createScene(item.id);
  const root = out.createNode(item.id);
  scene.addChild(root);
  const built = [];
  for (const part of item.parts || [{ prefab: item.prefab, mesh: item.mesh }]) await addPart(out, root, part, item, built);
  for (const s of out.getRoot().listScenes()) if (s !== scene) s.dispose();
  // mergeDocuments ajoute un buffer par fichier source : un GLB n'en accepte qu'un.
  const bufs = out.getRoot().listBuffers();
  for (const a of out.getRoot().listAccessors()) a.setBuffer(bufs[0]);
  for (const b of bufs.slice(1)) b.dispose();
  await out.transform(prune(), dedup());
  // Recentrage : posé au sol, centré sur l'emprise ; orientation et échelle propres au jeu.
  root.setRotation(quatY(item.rotY || 0));
  let b = getBounds(scene);
  const fit = item.fit ? Math.min(...item.fit.map((v, i) => v ? v / (b.max[i] - b.min[i]) : Infinity)) : 1;
  root.setScale([fit, fit, fit]);
  b = getBounds(scene);
  root.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
  b = getBounds(scene);
  await io.write(path.join(OUT, `${item.id}.glb`), out);
  return { size: b.max.map((v, i) => +(v - b.min[i]).toFixed(2)), kb: Math.round(fs.statSync(path.join(OUT, `${item.id}.glb`)).size / 1024) };
}
// Matrice racine -> objet d'une chaîne de transformations Unity, convertie en repère main droite.
function chainMatrix(chain) {
  const M = new THREE.Matrix4();
  for (const T of [...chain].reverse()) M.multiply(new THREE.Matrix4().compose(new THREE.Vector3(-T.pos.x, T.pos.y, T.pos.z), new THREE.Quaternion(T.rot.x, -T.rot.y, -T.rot.z, T.rot.w), new THREE.Vector3(T.scl.x, T.scl.y, T.scl.z)));
  return M;
}
const quatY = deg => { const a = deg * Math.PI / 360; return [0, Math.sin(a), 0, Math.cos(a)]; };

if (process.env.DEBUG_CHAIN) { for (const m of collect(prefabByName.get(process.env.DEBUG_CHAIN), {})) console.log(m.goName, meshName(m.fbx, m.fileID), JSON.stringify(m.chain.map(T => [T.pos, T.rot, T.scl]))); process.exit(0); }
const report = {};
for (const item of LIST) {
  if (only.length && !only.includes(item.id)) continue;
  try { report[item.id] = await convert(item); console.log(item.id.padEnd(22), (item.prefab || item.parts.map(p => p.prefab).join('+')).padEnd(26), JSON.stringify(report[item.id])); }
  catch (e) { console.warn(item.id, 'ÉCHEC', e.message); }
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
fs.rmSync(TMP, { recursive: true, force: true });

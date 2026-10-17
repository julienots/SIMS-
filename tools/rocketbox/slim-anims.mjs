// Allège les bibliothèques d'animations Rocketbox : garde les os du corps, supprime les clés redondantes,
// réduit à 20 images/s et limite la durée des clips (boucles de 12 s max).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup } from '@gltf-transform/functions';
import fs from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const KEEP = /^(Bip01|Bip01 (Pelvis|Spine\d?|Neck|Head|[LR] (Clavicle|UpperArm|Forearm|Hand|Thigh|Calf|Foot|Toe0|Finger\d)))$/;
const FPS = 20, MAXLEN = 12;
for (const g of ['m', 'f']) {
  const file = `game/assets/models/real/anims_${g}.glb`;
  const doc = await io.read(file);
  const buffer = doc.getRoot().listBuffers()[0];
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const name = ch.getTargetNode()?.getName() || '';
      if (!KEEP.test(name) || ch.getTargetPath() === 'scale') { const s = ch.getSampler(); ch.dispose(); s.dispose(); continue; }
      // Seules les translations du bassin et de la racine sont utiles.
      if (ch.getTargetPath() === 'translation' && !/^Bip01( Pelvis)?$/.test(name)) { const s = ch.getSampler(); ch.dispose(); s.dispose(); continue; }
      const s = ch.getSampler();
      const inp = s.getInput().getArray(), out = s.getOutput().getArray();
      const comps = s.getOutput().getElementSize();
      const t0 = inp[0], dur = Math.min(inp[inp.length - 1] - t0, MAXLEN);
      const n = Math.max(2, Math.round(dur * FPS) + 1);
      const ni = new Float32Array(n), no = new Float32Array(n * comps);
      let j = 0;
      for (let i = 0; i < n; i++) {
        const t = t0 + (i / (n - 1)) * dur;
        while (j < inp.length - 2 && inp[j + 1] < t) j++;
        const a = inp[j], b = inp[Math.min(j + 1, inp.length - 1)];
        const k = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
        ni[i] = t - t0;
        for (let c = 0; c < comps; c++) no[i * comps + c] = out[j * comps + c] * (1 - k) + out[Math.min(j + 1, inp.length - 1) * comps + c] * k;
        if (comps === 4) { // renormalise le quaternion
          const q = no.subarray(i * 4, i * 4 + 4); const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; for (let c = 0; c < 4; c++) q[c] /= l;
        }
      }
      s.setInput(doc.createAccessor().setType('SCALAR').setArray(ni).setBuffer(buffer));
      s.setOutput(doc.createAccessor().setType(s.getOutput().getType()).setArray(no).setBuffer(buffer));
    }
  }
  await doc.transform(resample({ tolerance: 0.0005 }), dedup(), prune({ keepLeaves: true }));
  await io.write(file, doc);
  console.log(file, (fs.statSync(file).size / 1024).toFixed(0), 'Ko', doc.getRoot().listAnimations().map(a => a.getName()).join(','));
}

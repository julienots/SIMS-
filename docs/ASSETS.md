# Assets 3D — sources et licences

Tous les modèles sont de **vrais fichiers GLB** (géométrie, squelette et animations pour les personnages), téléchargés depuis
des dépôts officiels puis convertis/optimisés par `tools/process-assets.mjs` (`ASSET_SRC=… node tools/process-assets.mjs`).

| Pack | Auteur | Licence | Contenu utilisé |
|---|---|---|---|
| **Microsoft Rocketbox Avatar Library** | Microsoft (Rocketbox Studios) | **MIT** | **39 humains réalistes** riggés (20 adultes, 1 tenue de soirée, 14 métiers, 4 enfants), **78 animations** de capture de mouvement (idle, marche, course, s'asseoir/se lever, assis à table, discussion gestuelle, écoute, applaudir, saluer, danser, boire, téléphoner, photo, travail…), **10 animaux** riggés (beagle, berger allemand, vache, cheval, mouton, cochon, chèvre, chevreuil, poule, canard) |
| **AI2-THOR** (Allen Institute for AI) | AI2 | **Apache 2.0** | **38 meubles réalistes** à l'échelle réelle : canapés, fauteuils, tables, chaises, lits, commodes, frigos, cuisinière, plans de travail, évier, toilettes, lavabo, TV, bureau, lampes, plantes, micro-ondes, poubelle (convertis depuis les préfabriqués Unity par `tools/ai2thor/convert.mjs`) |
| **ez-tree** (Daniel Greenheck) | D. Greenheck | **MIT** | générateur d'arbres réalistes (chêne, frêne, tremble, pin, buissons) ; écorces Poly Haven / TextureCan (CC0) ; touffes d'herbe 3D et fleurs |
| Herbe photo « dark grass » (via dépôt three.js, `terrain/grasslight-big.jpg`) | OpenGameArt | **CC-BY 3.0** — attribution requise | texture du sol (herbe) |
| Ciel « Spruit Sunrise » (Greg Zaal, Poly Haven, via dépôt three.js) | Poly Haven | **CC0** | ciel panoramique et éclairage d'ambiance |
| Lucide (icônes) | Lucide contributors | **ISC** | icônes vectorielles de tous les menus, bulles et effets (remplacent les emojis) |
| KayKit Character Pack : Adventures 1.0 | Kay Lousberg | CC0 | 5 personnages riggés + 76 animations (marche, course, assis, couché, sorts, coups…) |
| KayKit Character Pack : Skeletons 1.0 | Kay Lousberg | CC0 | 4 squelettes (vilains, créatures fantastiques) |
| KayKit Furniture Bits 1.0 | Kay Lousberg | CC0 | 53 meubles |
| KayKit Restaurant Bits 1.0 | Kay Lousberg | CC0 | cuisine (frigos, fours, plans de travail, tables, chaises, plats) |
| KayKit City Builder Bits 1.0 | Kay Lousberg | CC0 | immeubles, voitures, mobilier urbain |
| KayKit Space Base Bits 1.0 | Kay Lousberg | CC0 | modules spatiaux, atterrisseurs, rover, panneaux solaires |
| Kenney Starter Kit City Builder | Kenney | CC0 (modèles) / MIT (code) | bosquets, fontaine |
| Khronos glTF Sample Assets — Fox | PixelMannen (CC0), @tomkranis (CC BY 4.0), @AsoboStudio & @scurest (CC BY 4.0) | CC0 + CC BY 4.0 | renard animé (Survey/Walk/Run) — **attribution requise**, affichée dans les Crédits |

Dépôts : github.com/microsoft/Microsoft-Rocketbox (commit 0943055, clone git sparse), github.com/KayKit-Game-Assets, github.com/KenneyNL/Starter-Kit-City-Builder, github.com/KhronosGroup/glTF-Sample-Assets.

### Conversion Rocketbox
`tools/rocketbox/fetch.sh` (clone git sparse des fichiers listés dans `avatars.txt`, `animations.txt`, `animals.txt`),
puis `RB=… FBX2GLTF=… node tools/rocketbox/convert.mjs` : FBX → GLB (FBX2glTF, npm `fbx2gltf`), textures TGA → JPEG/PNG
1024 px (Pillow), une bibliothèque d'animations par sexe (`real/anims_m.glb`, `real/anims_f.glb`, allégée par
`tools/rocketbox/slim-anims.mjs` : os du corps, 20 i/s). Les enfants ont un squelette « Bip02 » renommé « Bip01 ».
Les animaux Rocketbox n'ont pas d'animation : pattes, tête et queue sont animées en procédural (`worldview.js`).

### Conversion AI2-THOR
Clone git partiel de github.com/allenai/ai2thor (préfabriqués, matériaux, méta-fichiers ; FBX et textures extraits à la demande),
puis `AI2THOR=…/unity/Assets FBX2GLTF=… node tools/ai2thor/convert.mjs`. Le script lit le YAML Unity (hiérarchie, variantes de
préfabriqués, surcharges de matériaux, GUID des textures), convertit les FBX (FBX2glTF), applique couleurs/textures (sRGB → linéaire,
rugosité = 1 − brillance), assemble les pièces (TV sur meuble, évier encastré, bureau + portable + chaise) et centre chaque meuble.
La liste est dans `tools/ai2thor/furniture.json` ; `tools/ai2thor/contact.mjs` produit une planche de contrôle (flèche = face avant).
Les meubles KayKit d'origine restent disponibles dans la catégorie « Style cartoon ».

## Modèles procéduraux
Aucun asset libre trouvé/accessible pour : douche, baignoire, chaîne hi-fi, chevalet,
guitare, piano, tapis de course, sac de frappe, échecs, borne d’arcade, barbecue, potager, berceau, escalier,
mannequin d’entraînement, portail, cristal, statue. Ils sont générés en primitives Three.js (`game/src/render/procmodels.js`).

## Sites non accessibles depuis l’environnement de développement
Le proxy réseau a bloqué : **sketchfab.com, fab.com, polyhaven.com, quaternius.com, kenney.nl, opengameart.org, poly.pizza,
mixamo.com, ambientcg.com** (seul GitHub en `git clone` est accessible, d'où le choix de Rocketbox et KayKit).
Pour enrichir le jeu (meubles réalistes, monstres géants, planètes), liens à récupérer :
- Quaternius — Ultimate Animated Character Pack / Animated Animals / Ultimate Monsters (CC0) : https://quaternius.com/
- Poly Haven — modèles et textures (CC0) : https://polyhaven.com/models
- Kenney — Furniture Kit (CC0) : https://kenney.nl/assets/furniture-kit
- Poly Pizza (modèles Quaternius en GLB) : https://poly.pizza/
- Sketchfab (filtrer « Downloadable » + licence CC0/CC-BY) : https://sketchfab.com/3d-models?features=downloadable
Déposez les GLB dans `game/assets/models/<dossier>/` puis référencez-les dans `game/src/sim/data/objects.js` ou dans un mod.

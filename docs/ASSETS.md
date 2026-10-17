# Assets 3D — sources et licences

Tous les modèles sont de **vrais fichiers GLB** (géométrie, squelette et animations pour les personnages), téléchargés depuis
des dépôts officiels puis convertis/optimisés par `tools/process-assets.mjs` (`ASSET_SRC=… node tools/process-assets.mjs`).

| Pack | Auteur | Licence | Contenu utilisé |
|---|---|---|---|
| KayKit Character Pack : Adventures 1.0 | Kay Lousberg | CC0 | 5 personnages riggés + 76 animations (marche, course, assis, couché, sorts, coups…) |
| KayKit Character Pack : Skeletons 1.0 | Kay Lousberg | CC0 | 4 squelettes (vilains, créatures fantastiques) |
| KayKit Furniture Bits 1.0 | Kay Lousberg | CC0 | 53 meubles |
| KayKit Restaurant Bits 1.0 | Kay Lousberg | CC0 | cuisine (frigos, fours, plans de travail, tables, chaises, plats) |
| KayKit City Builder Bits 1.0 | Kay Lousberg | CC0 | immeubles, voitures, mobilier urbain |
| KayKit Space Base Bits 1.0 | Kay Lousberg | CC0 | modules spatiaux, atterrisseurs, rover, panneaux solaires |
| Kenney Starter Kit City Builder | Kenney | CC0 (modèles) / MIT (code) | bosquets, fontaine |
| Khronos glTF Sample Assets — Fox | PixelMannen (CC0), @tomkranis (CC BY 4.0), @AsoboStudio & @scurest (CC BY 4.0) | CC0 + CC BY 4.0 | renard animé (Survey/Walk/Run) — **attribution requise**, affichée dans les Crédits |

Dépôts : github.com/KayKit-Game-Assets, github.com/KenneyNL/Starter-Kit-City-Builder, github.com/KhronosGroup/glTF-Sample-Assets.

## Modèles procéduraux
Aucun asset libre trouvé/accessible pour : toilettes, douche, baignoire, lavabo, TV, chaîne hi-fi, ordinateur, chevalet,
guitare, piano, tapis de course, sac de frappe, échecs, borne d’arcade, barbecue, potager, arbres, berceau, escalier,
mannequin d’entraînement, portail, cristal, statue. Ils sont générés en primitives Three.js (`game/src/render/procmodels.js`).

## Sites non accessibles depuis l’environnement de développement
Le proxy réseau a bloqué : **sketchfab.com, fab.com, polyhaven.com, quaternius.com, kenney.nl, opengameart.org, poly.pizza,
mixamo.com, ambientcg.com**. Pour enrichir le jeu (humains plus réalistes, animaux, monstres géants, planètes), liens à récupérer :
- Quaternius — Ultimate Animated Character Pack / Animated Animals / Ultimate Monsters (CC0) : https://quaternius.com/
- Poly Haven — modèles et textures (CC0) : https://polyhaven.com/models
- Kenney — Furniture Kit (CC0) : https://kenney.nl/assets/furniture-kit
- Poly Pizza (modèles Quaternius en GLB) : https://poly.pizza/
- Sketchfab (filtrer « Downloadable » + licence CC0/CC-BY) : https://sketchfab.com/3d-models?features=downloadable
Déposez les GLB dans `game/assets/models/<dossier>/` puis référencez-les dans `game/src/sim/data/objects.js` ou dans un mod.

# Résultats des tests (17/10/2026)

## Tests automatisés Node (`npm test`) — 8/8 réussis
| Test | Résultat |
|---|---|
| Génération d’un monde moderne (96×96, 12 habitants) | ✅ terrains, foyers, lieux publics, >100 objets |
| Simulation autonome 3 jours (12 habitants) | ✅ besoins moyens 69–94 %, aucun habitant immobile sans action ≥ 4 h |
| Sauvegarde / rechargement / reprise | ✅ sims, objets, relations, journal, heure identiques |
| Performances 40 habitants, carte 160×160, 806 objets | ✅ 3,45 ms de calcul par seconde à vitesse ×1 (12,7 ms avant optimisation de l’A*) |
| Mods intégrés valides (5) | ✅ |
| Validation (erreurs lisibles, code refusé) | ✅ |
| Dépendances (mod bloqué sans prérequis, ordre de chargement) | ✅ |
| SUPERPOWERS : 35 pouvoirs, vol réel (mode « fly », altitude), téléportation, 2 jours de simulation, désactivation sans perte, réactivation | ✅ ~13–16 pouvoirs utilisés en autonomie, ~110 entrées de journal |

## Tests dans le jeu réel (Chromium headless, rendu logiciel SwiftShader)
`node tests-browser/shot.mjs <scénario>` — aucune erreur console sur tous les scénarios.
- **menu** : écran SUPERESSENCE STUDIO, menu principal.
- **world** : assistant de création → monde rendu (355 appels de rendu, ~104 k triangles).
- **sims** : habitants animés (idle, assis au restaurant, sieste, peinture).
- **cas** : créateur — 5 morphologies, couleurs peau/cheveux/tenue réellement appliquées au modèle, accessoires.
- **play** : clic sur le frigo → menu radial → action dans la file ; menu social ; boule de feu ; vol ; pièce construite par glisser ; canapé acheté ; contrôle direct au clavier.
- **gamepad** : manette simulée via la passerelle Android (`NativePad`) et via l’API Gamepad standard : navigation des menus (croix, A, B), curseur au stick, vitesse (RB), contrôle direct (Y), déplacement au stick, interaction (A), sortie (B), pause (Menu).
- **panels** : mods, journal, créatif, monde, relations, pouvoirs, nuit tropicale, affichage mobile 844×390.
- **save** : sauvegarde IndexedDB, rechargement de la page, chargement → données identiques.

Remarque : le rendu logiciel tourne à 4–20 images/s ; quelques appuis très brefs peuvent être manqués dans ces tests
(la passerelle Android compte les appuis pour ne jamais en perdre).

## APK
- Compilé avec `tools/build-apk.sh` : `release/MyLifeUniverse.apk`, 32 Mo.
- `apksigner verify` : signatures v2 et v3 valides. `aapt dump badging` : package `com.superessence.mylifeuniverse`, minSdk 24, targetSdk 33.
- Contenu vérifié : `classes.dex` (MainActivity, GamepadBridge), 139 GLB, 5 mods, polices.
- **Non testé sur appareil réel ni émulateur** : aucun émulateur Android n’est disponible dans l’environnement (dl.google.com bloqué).

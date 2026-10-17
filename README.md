# MYLIFE UNIVERSE — SUPERESSENCE STUDIO

Simulation de vie en 3D (Three.js) : univers personnalisables, habitants autonomes avec personnalités, relations et souvenirs,
construction de maisons et de quartiers, mode créatif total, système de mods sans code et mod officiel **SUPERESSENCE SUPERPOWERS**.
Jouable au tactile, au clavier/souris et à la manette (Xbox ou compatible).

## Télécharger l’APK
`release/MyLifeUniverse.apk` (Android 7.0+, OpenGL ES 3 / WebGL 2, ~32 Mo, signé v2/v3).
Installation : copiez l’APK sur le téléphone, autorisez « sources inconnues », ouvrez-le.

## Lancer sur PC
```bash
npm install
npm run build        # construit dist/web
npm run serve        # http://localhost:8080
```

## Compiler l’APK
Prérequis (Ubuntu) : `sudo apt-get install aapt apksigner zipalign dalvik-exchange openjdk-21-jdk`, Node 20+.
```bash
bash tools/build-apk.sh   # → release/MyLifeUniverse.apk
```
Le script télécharge `android.jar` (API 33) si absent, construit la version web, compile l’activité Java (WebView plein écran
+ passerelle manette native), aligne et signe l’APK (clé : `android/keystore/`, mot de passe par défaut `superessence`).

## Tests
```bash
npm test                                  # simulation, sauvegardes, mods, pouvoirs (Node)
node tests-browser/shot.mjs <scénario>    # jeu réel dans Chromium : menu, world, sims, cas, play, gamepad, panels
```
Résultats : voir `docs/TESTS.md`.

## Structure
- `game/src/sim/` — simulation sans rendu (besoins, émotions, autonomie, A*, social, cycle de vie, événements, pouvoirs, génération)
- `game/src/render/` — rendu Three.js (monde, murs fusionnés, personnages animés, effets)
- `game/src/ui/` — interface (HUD, construction/achat, créateur de personnages, mods, créatif)
- `game/src/mods/` — registre, gestionnaire, validation · `game/mods/` — mods intégrés (JSON)
- `game/assets/models/` — 139 modèles GLB (voir `docs/ASSETS.md`)
- `android/` — projet Android (Java) · `tools/` — pipelines d’assets, web et APK

Documentation : `docs/MODDING.md`, `docs/ASSETS.md`, `docs/TESTS.md`, `docs/LIMITATIONS.md`.

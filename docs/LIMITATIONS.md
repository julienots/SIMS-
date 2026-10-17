# Limitations connues et étapes suivantes

## Limitations
- **APK non testé sur un appareil Android réel** (pas d’émulateur disponible). La logique web est testée dans Chromium ;
  la WebView Android utilise le même moteur. À vérifier sur téléphone : performances, manette Bluetooth, import de fichiers.
- **Personnages stylisés** (KayKit, CC0) plutôt que réalistes : les bibliothèques d’humains réalistes (Sketchfab, Fab, Mixamo,
  Quaternius, Poly Haven) étaient bloquées par le réseau. Liens dans `docs/ASSETS.md`.
- Visages peints dans la texture : pas de déformation fine du visage (nez, bouche) ; la morphologie agit sur la taille,
  la corpulence, les épaules, la tête, les bras et les jambes, plus 5 corps de base et des accessoires 3D.
- Pas d’animations de conversation dédiées dans les packs libres : combinaison Interact / Cheer / Idle + bulles.
- Objets sans asset libre (toilettes, douche, TV, instruments…) : modèles procéduraux simples.
- Un étage supplémentaire au maximum (RDC + 1).
- Les vrais rendus « réaliste / cartoon » ne changent que l’exposition et la tonalité, pas les modèles.
- Pas de partage de mods en ligne (fichiers .json à échanger) ; pas d’import de GLB personnels dans les mods.
- Bébés : immobiles dans leur berceau, deviennent enfants au bout de 2 jours.

## Étapes suivantes proposées
1. Tester l’APK sur 2–3 téléphones et une manette Xbox Bluetooth ; ajuster la qualité « auto ».
2. Intégrer des humains réalistes et animaux (Quaternius CC0) dès que les fichiers sont fournis.
3. Instancier les objets identiques (réduire les appels de rendu sur mobile).
4. Ajouter des animations de conversation et de repas.
5. Import de modèles GLB dans les mods (avec validation de taille et de géométrie).

# Limitations connues et étapes suivantes

## Limitations
- **APK non testé sur un appareil Android réel** (pas d’émulateur disponible). La logique web est testée dans Chromium ;
  la WebView Android utilise le même moteur. À vérifier sur téléphone : performances, manette Bluetooth, import de fichiers.
- **Humains réalistes Microsoft Rocketbox** (MIT) : 39 corps, mais leur peau et leurs vêtements viennent des textures
  d'origine (pas de recoloration de tenue ; seule la teinte des cheveux est possible). Le style cartoon KayKit reste
  disponible et entièrement personnalisable en couleurs.
- Pas d'animation « allongé » dans Rocketbox : la pose couchée (lit, bain) est la pose de repos pivotée à l'horizontale.
- Bébés et ados : pas de modèle dédié (ados = adultes réduits, bébés = enfants réduits dans le berceau).
- Visages non déformables (nez, bouche) ; la morphologie agit sur la taille, la corpulence, les épaules, la tête, les bras et
  les jambes. Accessoires 3D (chapeaux, lunettes…) placés approximativement sur les os des corps réalistes.
- **Meubles réalistes AI2-THOR** pour l'essentiel de la maison ; restent procéduraux : douche, baignoire, chaîne hi-fi,
  chevalet, instruments, sport, arcade, barbecue, potager, berceau. Certains meubles plus larges que leur emprise sont
  resserrés en largeur (canapé 2,8 m → 2 m). L'ordinateur portable AI2-THOR est fermé.
- **Sol et nature** : herbe photo + touffes 3D autour de la caméra (rayon 18 à 26 m) ; bitume et dalles sont des textures
  générées (bruit), pas des photos. Les arbres sont générés au chargement (quelques secondes sur mobile).
- Animaux Rocketbox animés en procédural (pas de capture de mouvement animale) ; le renard Khronos garde ses animations.
- Objets sans asset libre (toilettes, douche, TV, instruments…) : modèles procéduraux simples.
- Un étage supplémentaire au maximum (RDC + 1).
- Les vrais rendus « réaliste / cartoon » ne changent que l’exposition et la tonalité, pas les modèles.
- Pas de partage de mods en ligne (fichiers .json à échanger) ; pas d’import de GLB personnels dans les mods.
- Bébés : immobiles dans leur berceau, deviennent enfants au bout de 2 jours.

- **Circulation** : voitures d'ambiance (affichage seulement : elles ne transportent pas les Sims). Modèles de voitures
  KayKit (stylisés), faute de voitures réalistes libres accessibles.

## Étapes suivantes proposées
1. Tester l’APK sur 2–3 téléphones et une manette Xbox Bluetooth ; ajuster la qualité « auto ».
2. Remplacer les meubles stylisés par des meubles réalistes (Poly Haven / Kenney Furniture Kit) dès que les fichiers sont fournis.
3. Instancier les objets identiques (réduire les appels de rendu sur mobile).
4. Ajouter des animations allongées et de repas (Mixamo / capture de mouvement).
5. Import de modèles GLB dans les mods (avec validation de taille et de géométrie).

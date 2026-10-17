# Créer des mods pour MYLIFE UNIVERSE

Un mod est **un fichier JSON**. Il ne contient jamais de code : le jeu refuse `script`, `code` ou `js`.
On peut le créer sans rien écrire grâce au **Créateur de mods** (menu principal → 🛠️), ou à la main.

## Installer / activer
Menu 🧩 Mods → « Importer un mod (.json) ». L’activation se fait **par univers** (une sauvegarde de secours est créée avant
chaque changement). Désactiver un mod ne supprime rien : objets en « fantômes », traits et pouvoirs en sommeil, réactivables.

## Format
```json
{
  "format": 1,
  "id": "auteur.mon-mod",            // minuscules, chiffres, . _ -
  "name": "Mon mod",
  "version": "1.0.0",
  "author": "Moi",
  "icon": "🧩",
  "description": "…",
  "gameVersion": ">=1.0.0",
  "dependencies": [{ "id": "superessence.superpowers", "version": ">=1.0.0" }],
  "conflicts": [],
  "content": { "objects": [], "affordances": [], "traits": [], "events": [], "powers": [],
               "careers": [], "moodlets": [], "socials": [], "skills": [], "rules": [], "aspirations": [] }
}
```
Un élément qui reprend l’identifiant d’un élément du jeu **le remplace** (modification de statistiques).

### Objet
`{ "id", "name", "cat": "salon|cuisine|chambre|sdb|bureau|loisirs|jardin|deco|eclairage|equipement|special|ville", "price",
"model": "furniture/couch" | "proc:tree", "size": [largeur, profondeur], "scale", "aff": ["sit", …], "decor", "tint", "light" }`
Modèles disponibles : ceux de `game/assets/models/manifest.json` (dossier/nom) et les modèles procéduraux `proc:*`.

### Interaction d’objet (affordance)
`{ "id", "name", "pose": "stand|sit|lie", "anim", "needs": { "fun": 0.4 }, "minMin", "maxMin", "skill", "tags", "cost", "moodlet" }`
`needs` = gain par minute de jeu (−10 à 10). Besoins : hunger, thirst, sleep, hygiene, energy, fun, social, comfort, safety, fulfillment.

### Trait
`{ "id", "name", "icon", "desc", "needDecay": {"social": 1.5}, "actionWeights": {"party": 1.8}, "socialWeights": {"funny": 2},
"emotionBias": {"happy": 1.2}, "acceptBonus", "conflicts": [] }`

### Événement
`{ "id", "name", "icon", "trigger": { "type": "hourly|daily|social|power_used", "chance": 0.05, "social": "joke" },
"conditions": { "trait", "emotion", "adult", "needBelow": {...}, "hasPower", "alignment", "career", "skillMin": {...} },
"targetConditions": {...}, "cooldown": 360, "effects": [ … ] }`
Effets : moodlet, need, relationship, skill, money, journal, notify, bubble, trait_add, trait_remove, social, animation,
grant_power, grant_random_power, use_power, alignment, duel, spawn_villain, form_team, spawn_object.
Champ `"on": "target"` pour viser la cible ; `{actor}` / `{target}` dans les textes.

### Pouvoir
`{ "id", "name", "family", "icon", "effect", "color", "element", "intensity", "range", "duration", "cost", "cooldown", "instability", "mutation" }`
Effets du moteur : projectile, beam, shield, pulse, absorb, flight, speed, superjump, teleport, levitate, climb, strength, regen,
resist, telekinesis, perception, illusion, telepathy, mutation (wings|arms|claws|tentacles|shell|monster), timestop, portal,
gravity, shapeshift, clone.

### Métier, humeur, interaction sociale
Voir les exemples dans `game/mods/*.json` (cuisine-du-monde, metiers-insolites, emotions-plus, vilains-extremes, superpowers).

## Validation
Le jeu vérifie identifiants, références, bornes numériques, dépendances (et leurs versions), conflits et format, avec des
messages en clair. Le Créateur de mods affiche la validation en direct et propose une **zone de test**.

## Limites
- Pas de scripts : comportements via effets déclaratifs uniquement.
- Les modèles 3D doivent être ceux intégrés au jeu (pas d’import de GLB personnel dans cette version).
- Pas de plateforme de partage en ligne : échangez les fichiers .json.

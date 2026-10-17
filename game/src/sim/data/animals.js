// Animaux d'ambiance. Modèles 3D réels : Microsoft Rocketbox (MIT) et Khronos glTF Sample Models (renard).
// outdoor : évite d'entrer sur les parcelles ; tailDrop : abaisse la queue (pose de repos du rig horizontale).
// wild : fuit les humains ; graze : baisse la tête pour brouter ; speed : vitesse de marche (cases/s).
export const ANIMALS = {
  fox: { name: 'Renard', model: 'animals/Fox', wild: true, speed: 1.1 },
  skeleton: { name: 'Squelette', model: 'characters/Skeleton_Minion', speed: 1.0 },
  beagle: { name: 'Beagle', model: 'animals/Dog_Beagle_01', speed: 1.3, rig: 'beagle', gait: 2.4 },
  shepherd: { name: 'Berger allemand', model: 'animals/Dog_GermanShepard_01', speed: 1.4, rig: 'shepherd', gait: 2.0 },
  deer: { outdoor: true, name: 'Chevreuil', model: 'animals/Deer_Roe_Tabby_01', wild: true, graze: true, speed: 1.0, gait: 1.6 },
  cow: { outdoor: true, name: 'Vache', model: 'animals/Cow_Brown_01', graze: true, speed: 0.6, gait: 1.0 },
  horse: { outdoor: true, name: 'Cheval', model: 'animals/Horse_Brown_01', tailDrop: -1.1, graze: true, speed: 0.9, gait: 1.1 },
  sheep: { outdoor: true, name: 'Mouton', model: 'animals/Sheep_White_01', graze: true, speed: 0.7, gait: 1.5 },
  pig: { outdoor: true, name: 'Cochon', model: 'animals/Pig_Pink_01', graze: true, speed: 0.7, gait: 1.8 },
  goat: { outdoor: true, name: 'Chèvre', model: 'animals/Goat_White_01', graze: true, speed: 0.8, gait: 1.6 },
  chicken: { name: 'Poule', model: 'animals/Bird_Chicken_White_01', wild: true, graze: true, speed: 0.6, gait: 3.2, biped: true },
  duck: { name: 'Canard', model: 'animals/Bird_Duck_Male_01', wild: true, graze: true, speed: 0.6, gait: 3.0, biped: true },
};
// Faune proposée selon l'ambiance du monde.
export const FAUNA = {
  fantasy: ['skeleton', 'fox', 'deer', 'horse', 'goat'],
  tropical: ['beagle', 'chicken', 'duck', 'goat', 'pig'],
  default: ['fox', 'beagle', 'shepherd', 'deer', 'cow', 'horse', 'sheep', 'pig', 'goat', 'chicken', 'duck'],
};

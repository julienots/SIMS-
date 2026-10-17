// Données de base du jeu : besoins, traits, émotions, compétences, métiers, aspirations.
// Les mods enrichissent ces tables via le registre (voir mods/registry.js), avec le même schéma.

export const NEEDS = [
  { id: 'hunger', name: 'Faim', icon: '🍽️', decay: 0.075 },        // points / minute de jeu (sur 100)
  { id: 'thirst', name: 'Soif', icon: '🥤', decay: 0.075 },
  { id: 'sleep', name: 'Sommeil', icon: '🌙', decay: 0.055 },
  { id: 'hygiene', name: 'Hygiène', icon: '🛁', decay: 0.06 },
  { id: 'energy', name: 'Énergie', icon: '⚡', decay: 0.05 },
  { id: 'fun', name: 'Divertissement', icon: '🎮', decay: 0.07 },
  { id: 'social', name: 'Sociabilité', icon: '💬', decay: 0.055 },
  { id: 'comfort', name: 'Confort', icon: '🛋️', decay: 0.06 },
  { id: 'safety', name: 'Sécurité', icon: '🛡️', decay: 0.01 },
  { id: 'fulfillment', name: 'Épanouissement', icon: '🌟', decay: 0.02 },
];
export const NEED_IDS = NEEDS.map(n => n.id);

// Effets des traits : multiplicateurs de déclin des besoins, poids des activités (par tag),
// poids des interactions sociales (par catégorie), biais émotionnels, probabilités d'événements.
export const TRAITS = [
  { id: 'shy', name: 'Timide', icon: '🙈', desc: 'Évite la foule, gêné face aux inconnus.', conflicts: ['outgoing'],
    needDecay: { social: 0.7 }, actionWeights: { party: 0.4, solo: 1.4 }, socialWeights: { friendly: 0.8, romantic: 0.6, funny: 0.8 },
    acceptBonus: -8, emotionBias: { embarrassed: 1.5 } },
  { id: 'outgoing', name: 'Extraverti', icon: '🎉', desc: 'Adore parler, sortir et rencontrer du monde.', conflicts: ['shy', 'loner'],
    needDecay: { social: 1.5 }, actionWeights: { party: 1.8, social: 1.6, solo: 0.7 }, socialWeights: { friendly: 1.4, funny: 1.2 },
    acceptBonus: 10, emotionBias: { happy: 1.2 } },
  { id: 'funny', name: 'Drôle', icon: '🤡', desc: 'Toujours une blague en réserve.', actionWeights: { fun: 1.3 },
    socialWeights: { funny: 2.2 }, socialSuccess: { funny: 20 }, emotionBias: { playful: 1.6 } },
  { id: 'serious', name: 'Sérieux', icon: '🧐', desc: 'Concentré, peu sensible aux pitreries.', conflicts: ['funny'],
    actionWeights: { skill: 1.4, fun: 0.8 }, socialWeights: { funny: 0.4, deep: 1.5 }, socialSuccess: { funny: -15 }, emotionBias: { focused: 1.5 } },
  { id: 'impulsive', name: 'Impulsif', icon: '💥', desc: 'Agit d’abord, réfléchit ensuite.', randomness: 2.0,
    socialWeights: { mean: 1.3, romantic: 1.2 }, emotionBias: { angry: 1.3, energized: 1.2 } },
  { id: 'smart', name: 'Intelligent', icon: '🧠', desc: 'Apprend vite, aime les sujets profonds.', skillGain: 1.5,
    actionWeights: { skill: 1.5, read: 1.6 }, socialWeights: { deep: 1.5 }, emotionBias: { focused: 1.3, inspired: 1.2 } },
  { id: 'lazy', name: 'Paresseux', icon: '🦥', desc: 'Le canapé est son meilleur ami.', conflicts: ['ambitious'],
    needDecay: { energy: 1.3 }, actionWeights: { rest: 1.8, sport: 0.4, chore: 0.3, skill: 0.6 } },
  { id: 'ambitious', name: 'Ambitieux', icon: '📈', desc: 'Vise le sommet de sa carrière.', conflicts: ['lazy'],
    actionWeights: { skill: 1.6, work: 1.5 }, careerBonus: 1.5, needDecay: { fulfillment: 1.6 }, emotionBias: { confident: 1.3 } },
  { id: 'creative', name: 'Créatif', icon: '🎨', desc: 'Trouve l’inspiration partout.', actionWeights: { creative: 2.0 },
    emotionBias: { inspired: 1.8 }, eventChance: { weird_art: 2 } },
  { id: 'jealous', name: 'Jaloux', icon: '😒', desc: 'Supporte mal de voir son partenaire flirter.', jealousy: 2.0,
    emotionBias: { angry: 1.2, tense: 1.3 } },
  { id: 'kind', name: 'Gentil', icon: '😇', desc: 'Aide les autres sans hésiter.', conflicts: ['selfish'],
    actionWeights: { help: 2.0 }, socialWeights: { friendly: 1.5, mean: 0.1, deep: 1.2 }, acceptBonus: 6, emotionBias: { happy: 1.2 } },
  { id: 'selfish', name: 'Égoïste', icon: '😈', desc: 'Pense d’abord à lui.', conflicts: ['kind'],
    actionWeights: { help: 0.2 }, socialWeights: { mean: 1.8, friendly: 0.8 }, acceptBonus: -4 },
  { id: 'brave', name: 'Courageux', icon: '🦁', desc: 'Affronte le danger sans trembler.', conflicts: ['coward'],
    needDecay: { safety: 0.4 }, emotionBias: { confident: 1.4, scared: 0.3 } },
  { id: 'coward', name: 'Peureux', icon: '🐭', desc: 'Sursaute au moindre bruit.', conflicts: ['brave'],
    needDecay: { safety: 2.0 }, emotionBias: { scared: 2.0, tense: 1.3 } },
  { id: 'romantic', name: 'Romantique', icon: '💘', desc: 'Rêve du grand amour.', socialWeights: { romantic: 2.0 },
    socialSuccess: { romantic: 12 }, emotionBias: { flirty: 2.0 } },
  { id: 'loner', name: 'Solitaire', icon: '🌲', desc: 'Préfère sa propre compagnie.', conflicts: ['outgoing'],
    needDecay: { social: 0.4 }, actionWeights: { solo: 1.6, social: 0.5, party: 0.3 }, acceptBonus: -6 },
  { id: 'curious', name: 'Curieux', icon: '🔍', desc: 'Veut tout essayer, tout savoir.', actionWeights: { explore: 1.8, skill: 1.2, read: 1.3 },
    eventChance: { new_passion: 2 } },
  { id: 'mysterious', name: 'Mystérieux', icon: '🕶️', desc: 'Garde ses secrets… ou pas.', secretKeeper: true,
    socialWeights: { deep: 0.6 }, eventChance: { secret_reveal: 0.4 } },
  { id: 'rebel', name: 'Rebelle', icon: '🤘', desc: 'Les règles sont faites pour être brisées.', actionWeights: { mischief: 2.0, music: 1.3 },
    socialWeights: { mean: 1.2 }, emotionBias: { playful: 1.2, angry: 1.1 } },
  { id: 'protective', name: 'Protecteur', icon: '🛡️', desc: 'Veille sur ses proches.', actionWeights: { help: 1.5 },
    socialWeights: { deep: 1.2, friendly: 1.2 }, needDecay: { safety: 0.8 } },
];

// Émotions dominantes (style simulation de vie) et leurs effets.
export const EMOTIONS = {
  fine: { name: 'Serein', icon: '🙂', color: '#9ad17b' },
  happy: { name: 'Heureux', icon: '😄', color: '#55d16a', socialBonus: 8 },
  sad: { name: 'Triste', icon: '😢', color: '#5d8fe0', socialBonus: -8 },
  angry: { name: 'En colère', icon: '😠', color: '#e0503c', socialBonus: -14, meanBoost: 2 },
  flirty: { name: 'Charmeur', icon: '😍', color: '#ff6fb5', romanticBonus: 15 },
  energized: { name: 'Plein d’énergie', icon: '💪', color: '#ffb02e', sportBoost: 1.5 },
  inspired: { name: 'Inspiré', icon: '💡', color: '#5ad1e8', creativeBoost: 1.6 },
  embarrassed: { name: 'Gêné', icon: '😳', color: '#f08bb0', socialBonus: -6 },
  tense: { name: 'Tendu', icon: '😬', color: '#c9a227', socialBonus: -4 },
  bored: { name: 'Ennuyé', icon: '😑', color: '#9b9b9b', funBoost: 1.5 },
  playful: { name: 'Espiègle', icon: '😜', color: '#b77cff', funnyBonus: 15 },
  confident: { name: 'Confiant', icon: '😎', color: '#2fc28a', socialBonus: 6, workBoost: 1.3 },
  focused: { name: 'Concentré', icon: '🎯', color: '#4f7cff', skillBoost: 1.5 },
  scared: { name: 'Effrayé', icon: '😱', color: '#7a5cd6', socialBonus: -10 },
  uncomfortable: { name: 'Mal à l’aise', icon: '😣', color: '#b58a5a', socialBonus: -6 },
};

export const SKILLS = [
  { id: 'cooking', name: 'Cuisine', icon: '🍳' },
  { id: 'creativity', name: 'Créativité', icon: '🎨' },
  { id: 'logic', name: 'Logique', icon: '♟️' },
  { id: 'fitness', name: 'Sport', icon: '🏋️' },
  { id: 'music', name: 'Musique', icon: '🎸' },
  { id: 'charisma', name: 'Charisme', icon: '🗣️' },
  { id: 'handiness', name: 'Bricolage', icon: '🔧' },
  { id: 'gardening', name: 'Jardinage', icon: '🌱' },
  { id: 'computing', name: 'Informatique', icon: '💻' },
  { id: 'social', name: 'Relations sociales', icon: '🤝' },
];
export const SKILL_MAX = 10;

// Métiers : horaires (heures de début/fin, jours 0=lundi), salaires par niveau, compétences utiles.
export const CAREERS = [
  { id: 'unemployed', name: 'Sans emploi', icon: '🏠', levels: [{ title: 'Sans emploi', pay: 0 }], days: [], start: 0, end: 0 },
  { id: 'artist', name: 'Artiste', icon: '🎨', venue: 'office', start: 10, end: 16, days: [0, 1, 2, 3, 4], skills: ['creativity'],
    levels: [{ title: 'Peintre amateur', pay: 120 }, { title: 'Illustrateur', pay: 190 }, { title: 'Artiste exposé', pay: 300 }, { title: 'Maître des arts', pay: 520 }] },
  { id: 'musician', name: 'Musicien', icon: '🎸', venue: 'cinema', start: 15, end: 21, days: [2, 3, 4, 5], skills: ['music', 'charisma'],
    levels: [{ title: 'Musicien de rue', pay: 110 }, { title: 'Musicien de bar', pay: 180 }, { title: 'Tête d’affiche', pay: 340 }, { title: 'Star internationale', pay: 650 }] },
  { id: 'chef', name: 'Cuisinier', icon: '👨‍🍳', venue: 'restaurant', start: 11, end: 19, days: [1, 2, 3, 4, 5], skills: ['cooking'],
    levels: [{ title: 'Commis', pay: 130 }, { title: 'Cuisinier', pay: 200 }, { title: 'Chef de partie', pay: 310 }, { title: 'Chef étoilé', pay: 560 }] },
  { id: 'scientist', name: 'Scientifique', icon: '🔬', venue: 'office', start: 9, end: 17, days: [0, 1, 2, 3, 4], skills: ['logic', 'computing'],
    levels: [{ title: 'Laborantin', pay: 160 }, { title: 'Chercheur', pay: 260 }, { title: 'Directeur de labo', pay: 420 }, { title: 'Génie reconnu', pay: 700 }] },
  { id: 'teacher', name: 'Enseignant', icon: '📚', venue: 'school', start: 8, end: 15, days: [0, 1, 2, 3, 4], skills: ['charisma', 'logic'],
    levels: [{ title: 'Assistant', pay: 140 }, { title: 'Professeur', pay: 220 }, { title: 'Directeur', pay: 340 }, { title: 'Recteur', pay: 480 }] },
  { id: 'athlete', name: 'Sportif', icon: '🏅', venue: 'gym', start: 7, end: 13, days: [0, 1, 2, 3, 5], skills: ['fitness'],
    levels: [{ title: 'Espoir', pay: 120 }, { title: 'Pro', pay: 240 }, { title: 'Champion', pay: 420 }, { title: 'Légende', pay: 720 }] },
  { id: 'entrepreneur', name: 'Entrepreneur', icon: '💼', venue: 'office', start: 9, end: 18, days: [0, 1, 2, 3, 4], skills: ['charisma', 'logic'],
    levels: [{ title: 'Porteur de projet', pay: 100 }, { title: 'Fondateur', pay: 260 }, { title: 'PDG', pay: 520 }, { title: 'Magnat', pay: 900 }] },
  { id: 'employee', name: 'Employé', icon: '🗂️', venue: 'shop', start: 9, end: 17, days: [0, 1, 2, 3, 4], skills: ['social'],
    levels: [{ title: 'Stagiaire', pay: 110 }, { title: 'Employé', pay: 170 }, { title: 'Responsable', pay: 260 }, { title: 'Directeur régional', pay: 400 }] },
  { id: 'creator', name: 'Créateur de contenu', icon: '📱', venue: null, remote: true, start: 13, end: 18, days: [0, 2, 4, 5, 6], skills: ['computing', 'charisma'],
    levels: [{ title: 'Débutant', pay: 60 }, { title: 'Influent', pay: 200 }, { title: 'Célébrité du web', pay: 450 }, { title: 'Icône', pay: 800 }] },
];

export const ASPIRATIONS = [
  { id: 'family', name: 'Famille unie', icon: '👨‍👩‍👧', goal: 'Fonder une famille et rester proche des siens.' },
  { id: 'popular', name: 'Populaire', icon: '⭐', goal: 'Avoir au moins 6 amis.' },
  { id: 'career', name: 'Réussite pro', icon: '💼', goal: 'Atteindre le plus haut niveau de sa carrière.' },
  { id: 'love', name: 'Âme sœur', icon: '💞', goal: 'Trouver le grand amour.' },
  { id: 'master', name: 'Expert', icon: '🏆', goal: 'Maîtriser une compétence au niveau 10.' },
  { id: 'wealth', name: 'Fortune', icon: '💰', goal: 'Amasser ✦ 50 000.' },
  { id: 'creator', name: 'Grand créateur', icon: '🎭', goal: 'Créer 10 œuvres.' },
];

export const LIFE_STAGES = [
  { id: 'baby', name: 'Bébé', scale: 0.4, days: 2 },
  { id: 'child', name: 'Enfant', scale: 0.62, days: 6 },
  { id: 'teen', name: 'Adolescent', scale: 0.85, days: 6 },
  { id: 'young', name: 'Jeune adulte', scale: 1.0, days: 14 },
  { id: 'adult', name: 'Adulte', scale: 1.0, days: 16 },
  { id: 'elder', name: 'Senior', scale: 0.96, days: 9999 },
];
export const ADULT_STAGES = ['young', 'adult', 'elder'];

export const LIKES = {
  music: ['Pop', 'Rock', 'Électro', 'Jazz', 'Classique', 'Rap'],
  activities: ['Cuisine', 'Sport', 'Lecture', 'Jeux vidéo', 'Peinture', 'Jardinage', 'Danse', 'Cinéma'],
  colors: ['Rouge', 'Bleu', 'Vert', 'Jaune', 'Violet', 'Noir', 'Blanc', 'Rose'],
};
export const FEARS = ['Le noir', 'La solitude', 'L’échec', 'Les araignées', 'Les foules', 'Le vide', 'Être oublié', 'Les super-vilains'];

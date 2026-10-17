// Icônes des interactions et des objets (affichage de la file d'actions et des menus).
const AFF_ICONS = {
  sleep: '😴', nap: '💤', relax_bed: '🛏️', sit: '🪑', watch_tv: '📺', snack: '🍎', drink: '🥤', cook: '🍳', eat_meal: '🍽️', shower: '🚿', bath: '🛁',
  toilet: '🚽', wash_hands: '🧼', use_computer: '💻', play_games: '🎮', work_from_home: '💼', read_book: '📖', paint: '🎨', play_guitar: '🎸', play_piano: '🎹',
  listen_music: '🎵', dance: '💃', workout: '🥊', run_treadmill: '🏃', play_chess: '♟️', play_arcade: '🕹️', grill: '🍖', garden: '🌱', admire: '👀',
  change_outfit: '👕', repair: '🔧', fountain_wish: '🪙', practice_speech: '🎤', bake_meal_restaurant: '🍽️', tend_baby: '🍼', enter_cinema: '🎬', shop: '🛍️',
  study: '🎓', sp_recharge: '💎', sp_train_basic: '🥋', cook_sushi: '🍣', cook_pizza: '🍕',
};
export function affIcon(id, aff) { return AFF_ICONS[id] || aff?.icon || '✨'; }

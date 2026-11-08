// Envies (à la Sims 4) : chaque Sim a jusqu'à 3 envies tirées de sa personnalité, de son humeur, de son aspiration et
// de ses besoins. Les réaliser rapporte des points de satisfaction, à dépenser dans la boutique de récompenses
// (potions et traits permanents). Une envie non réalisée s'efface au bout d'un jour de jeu.
import { uid } from '../core/util.js';
import { registry } from '../mods/registry.js';

// kind : aff (interaction d'objet), social (catégorie ou interaction précise), skill (gagner un niveau), meet (rencontrer
// quelqu'un), emotion (ressentir une émotion), earn (gagner de l'argent). goal : nombre de fois.
export const WANT_POOL = [
  { id: 'watch_tv', kind: 'aff', target: 'watch_tv', label: 'Regarder la télé', icon: '📺', pts: 60, tags: ['lazy', 'bored'] },
  { id: 'cook', kind: 'aff', target: 'cook', label: 'Préparer un bon repas', icon: '🍳', pts: 100, tags: ['family', 'creative', 'hunger'] },
  { id: 'eat', kind: 'aff', target: 'eat_meal', label: 'Manger un vrai repas', icon: '🍽️', pts: 60, tags: ['hunger'] },
  { id: 'bath', kind: 'aff', target: 'bath', label: 'Prendre un bain relaxant', icon: '🛁', pts: 80, tags: ['tense', 'hygiene'] },
  { id: 'shower', kind: 'aff', target: 'shower', label: 'Prendre une douche', icon: '🚿', pts: 50, tags: ['hygiene'] },
  { id: 'nap', kind: 'aff', target: 'nap', label: 'Faire une sieste', icon: '💤', pts: 50, tags: ['lazy', 'sleep'] },
  { id: 'paint', kind: 'aff', target: 'paint', label: 'Peindre un tableau', icon: '🎨', pts: 150, tags: ['creative', 'creator', 'inspired'] },
  { id: 'guitar', kind: 'aff', target: 'play_guitar', label: 'Jouer de la guitare', icon: '🎸', pts: 120, tags: ['creative', 'creator', 'inspired'] },
  { id: 'piano', kind: 'aff', target: 'play_piano', label: 'Jouer du piano', icon: '🎹', pts: 120, tags: ['creative', 'serious'] },
  { id: 'read', kind: 'aff', target: 'read_book', label: 'Lire un livre', icon: '📖', pts: 80, tags: ['smart', 'master', 'focused', 'loner'] },
  { id: 'chess', kind: 'aff', target: 'play_chess', label: 'Jouer aux échecs', icon: '♟️', pts: 100, tags: ['smart', 'serious', 'focused'] },
  { id: 'games', kind: 'aff', target: 'play_games', label: 'Jouer aux jeux vidéo', icon: '🎮', pts: 70, tags: ['lazy', 'playful', 'bored'] },
  { id: 'computer', kind: 'aff', target: 'use_computer', label: 'Surfer sur le web', icon: '💻', pts: 50, tags: ['curious', 'bored'] },
  { id: 'workout', kind: 'aff', target: 'workout', label: 'Faire du sport', icon: '🥊', pts: 100, tags: ['energized', 'angry', 'brave'] },
  { id: 'treadmill', kind: 'aff', target: 'run_treadmill', label: 'Courir sur le tapis', icon: '🏃', pts: 90, tags: ['energized', 'ambitious'] },
  { id: 'dance', kind: 'aff', target: 'dance', label: 'Danser', icon: '💃', pts: 90, tags: ['playful', 'outgoing', 'happy'] },
  { id: 'music', kind: 'aff', target: 'listen_music', label: 'Écouter de la musique', icon: '🎵', pts: 50, tags: ['sad', 'bored', 'loner'] },
  { id: 'garden', kind: 'aff', target: 'garden', label: 'Jardiner', icon: '🌱', pts: 90, tags: ['kind', 'serious'] },
  { id: 'grill', kind: 'aff', target: 'grill', label: 'Faire un barbecue', icon: '🍖', pts: 110, tags: ['outgoing', 'family'] },
  { id: 'admire', kind: 'aff', target: 'admire', label: 'Admirer une œuvre', icon: '🖼️', pts: 50, tags: ['curious', 'inspired'] },
  { id: 'wish', kind: 'aff', target: 'fountain_wish', label: 'Faire un vœu à la fontaine', icon: '🪙', pts: 120, tags: ['romantic', 'curious'] },
  { id: 'speech', kind: 'aff', target: 'practice_speech', label: 'S’entraîner à un discours', icon: '🎤', pts: 100, tags: ['ambitious', 'career', 'confident'] },
  { id: 'arcade', kind: 'aff', target: 'play_arcade', label: 'Jouer à la borne d’arcade', icon: '🕹️', pts: 90, tags: ['playful', 'rebel'] },
  { id: 'chat', kind: 'social', target: 'friendly', label: 'Discuter avec quelqu’un', icon: '💬', pts: 60, tags: ['outgoing', 'social', 'popular', 'happy'] },
  { id: 'joke', kind: 'social', target: 'funny', label: 'Faire rire quelqu’un', icon: '😂', pts: 90, tags: ['funny', 'playful', 'popular'] },
  { id: 'deep', kind: 'social', target: 'deep', label: 'Avoir une conversation profonde', icon: '💭', pts: 100, tags: ['serious', 'kind', 'sad'] },
  { id: 'flirt', kind: 'social', target: 'romantic', label: 'Flirter avec quelqu’un', icon: '💗', pts: 120, tags: ['romantic', 'flirty', 'love'] },
  { id: 'hug', kind: 'social', target: 'hug', label: 'Faire un câlin', icon: '🤗', pts: 80, tags: ['kind', 'family', 'sad'] },
  { id: 'kiss', kind: 'social', target: 'kiss', label: 'Embrasser quelqu’un', icon: '💋', pts: 150, tags: ['romantic', 'love', 'flirty'] },
  { id: 'prank', kind: 'social', target: 'prank', label: 'Faire une farce', icon: '🤡', pts: 100, tags: ['rebel', 'funny', 'playful'] },
  { id: 'argue', kind: 'social', target: 'mean', label: 'Se disputer avec quelqu’un', icon: '😠', pts: 80, tags: ['angry', 'selfish', 'jealous'] },
  { id: 'meet', kind: 'meet', label: 'Rencontrer quelqu’un de nouveau', icon: '🤝', pts: 120, tags: ['outgoing', 'popular', 'curious'] },
  { id: 'skill_any', kind: 'skill', target: null, label: 'Progresser dans une compétence', icon: '⭐', pts: 150, tags: ['master', 'ambitious', 'smart', 'focused'] },
  { id: 'skill_cook', kind: 'skill', target: 'cooking', label: 'Progresser en cuisine', icon: '🍳', pts: 160, tags: ['family'] },
  { id: 'skill_fit', kind: 'skill', target: 'fitness', label: 'Progresser en forme physique', icon: '💪', pts: 160, tags: ['brave', 'energized'] },
  { id: 'be_happy', kind: 'emotion', target: 'happy', label: 'Être heureux', icon: '😊', pts: 80, tags: ['sad', 'kind'] },
  { id: 'be_inspired', kind: 'emotion', target: 'inspired', label: 'Se sentir inspiré', icon: '💡', pts: 100, tags: ['creative', 'creator'] },
  { id: 'be_confident', kind: 'emotion', target: 'confident', label: 'Se sentir confiant', icon: '😎', pts: 100, tags: ['ambitious', 'career', 'shy'] },
  { id: 'earn', kind: 'earn', target: 300, label: 'Gagner ✦300', icon: '💰', pts: 150, tags: ['wealth', 'ambitious', 'career'] },
];
// Besoin bas -> envie liée (« J'ai faim : manger un vrai repas »).
const NEED_WANTS = { hunger: 'eat', hygiene: 'shower', sleep: 'nap', social: 'chat', fun: 'games' };

// Boutique de récompenses : potions (effet immédiat) et traits de récompense (permanents).
export const REWARDS = [
  { id: 'potion_mood', name: 'Potion de bonne humeur', icon: '🧪', cost: 200, kind: 'potion', desc: 'Rend heureux pour la journée.' },
  { id: 'potion_energy', name: 'Potion d’énergie', icon: '⚡', cost: 150, kind: 'potion', desc: 'Remplit l’énergie et le sommeil.' },
  { id: 'potion_needs', name: 'Élixir de bien-être', icon: '💧', cost: 400, kind: 'potion', desc: 'Remplit tous les besoins.' },
  { id: 'money_gift', name: 'Coup de pouce financier', icon: '💰', cost: 500, kind: 'potion', desc: '✦1 000 pour le foyer.' },
  { id: 'never_hungry', name: 'Estomac d’acier', icon: '🍽️', cost: 1500, kind: 'trait', desc: 'La faim baisse deux fois moins vite.', needDecay: { hunger: 0.5, thirst: 0.6 } },
  { id: 'always_clean', name: 'Toujours impeccable', icon: '🛁', cost: 1500, kind: 'trait', desc: 'L’hygiène baisse deux fois moins vite.', needDecay: { hygiene: 0.5 } },
  { id: 'night_owl', name: 'Infatigable', icon: '🌙', cost: 2000, kind: 'trait', desc: 'Sommeil et énergie baissent moins vite.', needDecay: { sleep: 0.6, energy: 0.6 } },
  { id: 'socialite', name: 'Âme sociable', icon: '🤝', cost: 1500, kind: 'trait', desc: 'Le besoin social baisse deux fois moins vite.', needDecay: { social: 0.5 } },
  { id: 'fast_learner', name: 'Apprentissage rapide', icon: '🎓', cost: 2500, kind: 'trait', desc: 'Compétences acquises 50 % plus vite.', skillGain: 1.5 },
  { id: 'lucky', name: 'Chanceux', icon: '🍀', cost: 2000, kind: 'trait', desc: 'Les interactions sociales réussissent plus souvent.', socialBonus: 10 },
];
export const reward = id => REWARDS.find(r => r.id === id);

export class WantsSystem {
  constructor(S) { this.S = S; }
  get w() { return this.S.world; }

  ensure(s) {
    if (!s.wants) s.wants = [];
    if (s.satisfaction === undefined) s.satisfaction = 0;
    if (!s.rewards) s.rewards = [];
  }

  // Une envie tirée au sort, pondérée par ce qui correspond au Sim.
  pick(s) {
    const tags = new Set([...s.traits, s.emotion, s.aspiration]);
    for (const [n, id] of Object.entries(NEED_WANTS)) if ((s.needs[n] ?? 100) < 35) tags.add(n === 'hunger' ? 'hunger' : n);
    const taken = new Set(s.wants.map(x => x.id));
    const pool = WANT_POOL.filter(p => !taken.has(p.id) && this.possible(s, p));
    if (!pool.length) return null;
    const weights = pool.map(p => 1 + p.tags.filter(t => tags.has(t)).length * 3 + (Object.entries(NEED_WANTS).some(([n, id]) => id === p.id && (s.needs[n] ?? 100) < 35) ? 6 : 0));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  // Envie réalisable dans ce monde (l'objet existe quelque part, le Sim a l'âge requis…).
  possible(s, p) {
    if (s.stage === 'baby') return false;
    if (p.kind === 'aff') return this.w.objects.some(o => registry.object(o.def)?.aff?.includes(p.target));
    if (p.kind === 'social' && ['romantic', 'kiss'].includes(p.target)) return ['young', 'adult', 'elder'].includes(s.stage);
    if (p.kind === 'earn') return ['young', 'adult', 'elder'].includes(s.stage);
    return true;
  }

  refill(s) {
    this.ensure(s);
    const now = this.w.time;
    s.wants = s.wants.filter(x => x.locked || x.until > now);
    while (s.wants.length < 3) {
      const p = this.pick(s);
      if (!p) break;
      s.wants.push({ id: p.id, uid: uid('want'), label: p.label, icon: p.icon, pts: p.pts, kind: p.kind, target: p.target, goal: 1, progress: 0, until: now + 1440, start: this.w.funds(s) });
    }
  }

  // Appelé à chaque événement de la simulation.
  event(s, kind, value, extra) {
    if (!s?.wants?.length) return;
    for (const want of [...s.wants]) {
      if (want.kind !== kind) continue;
      let ok = false;
      if (kind === 'aff') ok = want.target === value;
      else if (kind === 'social') ok = want.target === value || want.target === extra;
      else if (kind === 'skill') ok = !want.target || want.target === value;
      else if (kind === 'emotion') ok = want.target === value;
      else if (kind === 'meet') ok = true;
      if (ok) this.complete(s, want);
    }
  }

  complete(s, want) {
    s.wants = s.wants.filter(x => x !== want);
    s.satisfaction += want.pts;
    this.S.bubble(s, want.icon, 6);
    this.S.addMoodlet?.(s, 'want_fulfilled');
    this.w.log('want', `${s.first} a réalisé son envie : ${want.label} (+${want.pts} points de satisfaction).`, [s.id], { icon: '✨' });
    this.S.emit('notify', { text: `${s.first} : envie réalisée — ${want.label} (+${want.pts})`, icon: '✨', sim: s.id });
    this.S.emit('wants', s);
  }

  // Vérifications périodiques (argent gagné, envies expirées, recharge).
  tick(s) {
    this.ensure(s);
    if (s.stage === 'baby') return;
    for (const want of [...s.wants]) if (want.kind === 'earn' && this.w.funds(s) - want.start >= want.target) this.complete(s, want);
    if (s.emotion) this.event(s, 'emotion', s.emotion);
    this.refill(s);
  }

  toggleLock(s, wantUid) { const x = s.wants.find(v => v.uid === wantUid); if (x) x.locked = !x.locked; this.S.emit('wants', s); }
  dismiss(s, wantUid) { s.wants = s.wants.filter(v => v.uid !== wantUid || v.locked); this.refill(s); this.S.emit('wants', s); }

  buy(s, id) {
    const r = reward(id);
    this.ensure(s);
    if (!r) return 'Récompense inconnue';
    if (r.kind === 'trait' && s.rewards.includes(id)) return 'Déjà obtenue';
    if (s.satisfaction < r.cost) return 'Pas assez de points';
    s.satisfaction -= r.cost;
    const S = this.S;
    if (r.kind === 'trait') s.rewards.push(id);
    else if (id === 'potion_mood') S.addMoodlet(s, 'potion_happy');
    else if (id === 'potion_energy') { s.needs.energy = 100; s.needs.sleep = 100; }
    else if (id === 'potion_needs') for (const k of Object.keys(s.needs)) s.needs[k] = 100;
    else if (id === 'money_gift') this.w.earn(s, 1000);
    this.w.log('want', `${s.first} a obtenu « ${r.name} » (${r.cost} points de satisfaction).`, [s.id], { icon: r.icon });
    S.emit('wants', s);
    return null;
  }

  // Multiplicateurs des traits de récompense.
  needMult(s, need) { let m = 1; for (const id of s.rewards || []) m *= reward(id)?.needDecay?.[need] ?? 1; return m; }
  skillMult(s) { let m = 1; for (const id of s.rewards || []) m *= reward(id)?.skillGain ?? 1; return m; }
  socialBonus(s) { let b = 0; for (const id of s.rewards || []) b += reward(id)?.socialBonus ?? 0; return b; }
}

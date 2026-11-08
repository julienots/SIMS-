// Leçons de démarrage (comme le tutoriel des Sims) : une carte discrète en haut de l'écran, une leçon à la fois.
// Chaque leçon se valide d'elle-même quand le joueur fait l'action, ou par « Compris ». La progression est retenue
// dans le navigateur ; « Revoir les leçons » (menu) les relance.
import { h, btn } from './dom.js';

const KEY = 'mlu:lessons';
export const LESSONS = [
  { id: 'welcome', icon: '👋', title: 'Bienvenue dans votre quartier', text: 'Faites glisser pour déplacer la caméra, molette ou pincement pour zoomer. Cliquez sur un membre du foyer en bas à gauche pour le sélectionner.' },
  { id: 'interact', icon: '🪑', title: 'Interagir', text: 'Cliquez sur un objet, un Sim ou le sol : un menu propose les actions. Elles s’ajoutent à la file en haut à gauche.', done: (g, st, seen) => seen.has('pie') },
  { id: 'needs', icon: '❤️', title: 'Les besoins', text: 'Le cœur ouvre les besoins du Sim : faim, énergie, hygiène, social… Un Sim épanoui a de meilleures humeurs.', done: (g, st, seen) => seen.has('tab:needs') },
  { id: 'wants', icon: '✨', title: 'Les envies', text: 'Les bulles à côté du portrait sont les envies du Sim. Réalisez-les pour gagner des points de satisfaction et les dépenser dans la boutique de récompenses.', done: (g, st, seen) => seen.has('tab:wants') },
  { id: 'time', icon: '⏩', title: 'Le temps', text: 'En bas à droite : pause, vitesse normale, rapide et ultra rapide (touches 0 à 3, Espace pour la pause).', done: (g, st, seen) => seen.has('speed') },
  { id: 'build', icon: '🔨', title: 'Acheter et construire', text: 'Les boutons en haut à droite passent en mode Achat (meubles) et Construction (murs, sols, portes, toits).', done: (g, st, seen) => seen.has('mode:buy') || seen.has('mode:build') },
  { id: 'more', icon: '☰', title: 'Tout le reste', text: 'Le menu ☰ contient la carte du monde, le journal, le mode créatif, l’adoption d’un chien, les mods et la sauvegarde. L’œil masque l’interface (touche H).' },
];

function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* navigation privée */ } }

export class Lessons {
  constructor(game) {
    this.game = game; this.st = load(); this.el = null; this.cur = null; this.ctx = {}; this.seen = new Set();
    // Vérification toutes les 0,5 s, indépendante de la cadence d'affichage.
    this.timer = setInterval(() => this.tick(), 500);
  }
  // Actions du joueur retenues à tout moment : une leçon déjà accomplie se valide dès qu'elle apparaît.
  mark(evt) { this.seen.add(evt); }
  get disabled() { return !!this.st.off; }
  reset() { this.st = {}; save(this.st); this.cur = null; this.seen.clear(); this.show(); }
  next() { return LESSONS.find(l => !this.st[l.id]); }
  finish(id) { this.st[id] = 1; save(this.st); this.cur = null; this.el?.remove(); this.el = null; setTimeout(() => this.show(), 900); }
  stop() { this.st.off = 1; save(this.st); this.el?.remove(); this.el = null; }
  show() {
    if (this.disabled || this.el || !this.game.world) return;
    const l = this.next();
    if (!l) return;
    this.cur = l;
    this.ctx = { speed0: this.game.sim?.speedIdx };
    const i = LESSONS.indexOf(l);
    this.el = h('div', { class: 'panel lesson', role: 'status' },
      h('div', { class: 'row', style: { alignItems: 'center', gap: '10px' } }, h('span', { class: 'want-ic' }, l.icon), h('div', { style: { fontWeight: 800, flex: 1 } }, l.title), h('span', { class: 'muted' }, `${i + 1}/${LESSONS.length}`)),
      h('p', { style: { margin: '6px 0 8px' } }, l.text),
      h('div', { class: 'row', style: { gap: '6px', justifyContent: 'flex-end' } },
        btn('Masquer les leçons', () => this.stop(), 'small ghost'),
        btn('Compris', () => this.finish(l.id), 'small primary')));
    document.getElementById('ui')?.appendChild(this.el);
  }
  // Appelé régulièrement par le HUD : valide la leçon en cours si l'action a été faite.
  tick() {
    if (this.disabled) return;
    if (!this.el) { this.show(); return; }
    const l = this.cur;
    if (l?.done && l.done(this.game, this.ctx, this.seen)) this.finish(l.id);
  }
  dispose() { this.el?.remove(); this.el = null; }
  destroy() { this.dispose(); clearInterval(this.timer); }
}

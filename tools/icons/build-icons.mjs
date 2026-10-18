// Génère game/src/ui/iconset.js : uniquement les icônes Lucide utilisées (contenu SVG intérieur), plus la table emoji -> icône.
// Usage : node tools/icons/build-icons.mjs
import fs from 'node:fs';
import { EMOJI_ICONS } from './emoji-map.mjs';

// Icônes de l'interface utilisées directement par leur nom.
const UI = ['house', 'shopping-cart', 'hammer', 'user', 'map', 'scroll-text', 'sparkles', 'puzzle', 'menu', 'pause', 'play', 'fast-forward',
  'skip-forward', 'heart', 'users', 'star', 'briefcase', 'brain', 'x', 'chevron-down', 'chevron-up', 'chevron-left', 'chevron-right', 'eye', 'eye-off',
  'layers', 'camera', 'gamepad-2', 'sun', 'moon', 'cloud', 'cloud-rain', 'snowflake', 'settings', 'save', 'folder-open', 'circle-help', 'info',
  'coins', 'gem', 'clock-3', 'zoom-in', 'zoom-out', 'rotate-ccw', 'rotate-cw', 'move', 'trash-2', 'brick-wall', 'paint-bucket', 'door-open',
  'app-window', 'trees', 'mountain', 'grid-3x3', 'undo-2', 'redo-2', 'copy', 'hand', 'mouse-pointer-2', 'user-plus', 'users-round', 'utensils',
  'bed-double', 'bath', 'shower-head', 'sofa', 'smile', 'frown', 'meh', 'angry', 'laugh', 'zap', 'shield', 'swords', 'flame', 'music', 'phone',
  'message-circle', 'calendar', 'trophy', 'target', 'square-check', 'square', 'plus', 'minus', 'check', 'circle-x', 'triangle-alert', 'droplet',
  'battery-medium', 'toilet', 'party-popper', 'house-plus', 'building-2', 'video', 'person-standing', 'footprints', 'joystick', 'wand-sparkles',
  'circle', 'pencil', 'search', 'download', 'upload', 'list', 'panel-left-close', 'panel-left-open', 'maximize-2', 'minimize-2', 'lightbulb'];

const names = new Set([...UI, ...Object.values(EMOJI_ICONS)]);
const out = {};
const missing = [];
for (const n of [...names].sort()) {
  const f = `node_modules/lucide-static/icons/${n}.svg`;
  if (!fs.existsSync(f)) { missing.push(n); continue; }
  const svg = fs.readFileSync(f, 'utf8');
  out[n] = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).replace(/\s*\n\s*/g, '').trim();
}
if (missing.length) { console.error('Icônes Lucide introuvables :', missing.join(', ')); process.exit(1); }
const emoji = Object.fromEntries(Object.entries(EMOJI_ICONS));
fs.writeFileSync('game/src/ui/iconset.js', `// Généré par tools/icons/build-icons.mjs — icônes Lucide (https://lucide.dev, licence ISC).
export const ICONS = ${JSON.stringify(out)};
export const EMOJI_ICONS = ${JSON.stringify(emoji)};
`);
console.log('icônes', Object.keys(out).length, 'emojis', Object.keys(emoji).length, (fs.statSync('game/src/ui/iconset.js').size / 1024).toFixed(0), 'Ko');

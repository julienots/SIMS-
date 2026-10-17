// Petits utilitaires d'interface : création d'éléments, fenêtres modales, notifications,
// navigation à la manette (focus spatial) et sons d'interface.
import { escapeHtml } from '../core/util.js';
import { sfx } from '../engine/audio.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function btn(label, onclick, cls = '', extra = {}) {
  return h('button', { class: `btn ${cls}`, onclick: e => { sfx('click'); onclick?.(e); }, ...extra }, label);
}

export const ui = () => document.getElementById('ui');

// ------------------------------------------------------------------ modales (pile)
const stack = [];
export function openModal({ title, body, foot, cls = '', onClose, closable = true, icon }) {
  const back = h('div', { class: 'modal-back', dataset: { scope: '1' } });
  const close = () => closeModal(back);
  const head = h('div', { class: 'modal-head' }, icon ? h('span', { style: { fontSize: '26px' } }, icon) : null, h('h2', {}, title), closable ? btn('✕', close, 'icon ghost', { 'aria-label': 'Fermer', dataset: { back: '1' } }) : null);
  const bodyEl = h('div', { class: 'modal-body' });
  const footEl = h('div', { class: 'modal-foot' });
  const box = h('div', { class: `panel modal ${cls}` }, head, bodyEl, footEl);
  back.appendChild(box);
  back._onClose = onClose;
  back._closable = closable;
  back.addEventListener('pointerdown', e => { if (e.target === back && closable) close(); });
  const render = () => {
    bodyEl.innerHTML = ''; footEl.innerHTML = '';
    const b = typeof body === 'function' ? body(render, close) : body;
    if (b) bodyEl.append(...[].concat(b));
    const f = typeof foot === 'function' ? foot(render, close) : foot;
    if (f) footEl.append(...[].concat(f)); else footEl.classList.add('hidden');
    if (f) footEl.classList.remove('hidden');
    focusFirst(back);
  };
  ui().appendChild(back);
  stack.push(back);
  render();
  sfx('open');
  return { el: back, close, render, body: bodyEl };
}
export function closeModal(back) {
  const i = stack.indexOf(back);
  if (i >= 0) stack.splice(i, 1);
  back.remove();
  back._onClose?.();
  sfx('close');
}
export function topModal() { return stack[stack.length - 1]; }
export function closeTop() {
  const t = topModal();
  if (t && t._closable !== false) { closeModal(t); return true; }
  return false;
}
export function modalCount() { return stack.length; }

export function confirmBox(text, { title = 'Confirmation', yes = 'Oui', no = 'Annuler', danger = false } = {}) {
  return new Promise(resolve => {
    let done = false;
    const m = openModal({
      title, cls: 'narrow', body: h('p', {}, text),
      foot: (r, close) => [btn(no, () => { done = true; close(); resolve(false); }, 'ghost'), btn(yes, () => { done = true; close(); resolve(true); }, danger ? 'danger' : 'primary')],
      onClose: () => { if (!done) resolve(false); },
    });
    void m;
  });
}
export function promptBox(text, value = '', { title = 'Saisie' } = {}) {
  return new Promise(resolve => {
    const inp = h('input', { type: 'text', value, maxlength: 60 });
    let done = false;
    openModal({
      title, cls: 'narrow', body: [h('p', {}, text), inp],
      foot: (r, close) => [btn('Annuler', () => { done = true; close(); resolve(null); }, 'ghost'), btn('Valider', () => { done = true; close(); resolve(inp.value.trim()); }, 'primary')],
      onClose: () => { if (!done) resolve(null); },
    });
    setTimeout(() => inp.focus(), 50);
  });
}

// ------------------------------------------------------------------ notifications
export function toast(text, icon = '✨', onclick) {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts' }); ui().appendChild(box); }
  const t = h('div', { class: 'toast', onclick: () => { onclick?.(); t.remove(); } }, `${icon} ${text}`);
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => t.remove(), 4200);
}

export function loading(text = 'Chargement…') {
  const el = h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('div', {}, text));
  document.body.appendChild(el);
  return { set: t => { el.lastChild.textContent = t; }, done: () => el.remove() };
}

// ------------------------------------------------------------------ navigation manette (focus spatial)
const FOCUSABLE = 'button:not([disabled]), [tabindex="0"], input, select, textarea, .card, .item, .swatch, .tab';
export function activeScope() {
  const t = topModal();
  if (t) return t;
  const pie = document.querySelector('.pie');
  if (pie) return pie;
  const cas = document.getElementById('cas');
  if (cas && !cas.classList.contains('hidden')) return cas;
  const menu = document.getElementById('menu');
  if (menu && !menu.classList.contains('hidden')) return menu;
  const hudNav = document.querySelector('[data-hudnav="1"]');
  if (hudNav) return hudNav;
  return null;
}
export function focusables(scope) {
  return [...scope.querySelectorAll(FOCUSABLE)].filter(e => e.offsetParent !== null && !e.closest('.hidden') && getComputedStyle(e).visibility !== 'hidden');
}
export function focusFirst(scope) {
  if (!scope) return;
  setTimeout(() => {
    const els = focusables(scope);
    const pref = els.find(e => e.classList.contains('primary')) || els.find(e => !e.dataset.back) || els[0];
    if (pref && usingPadRef.value) setFocus(pref);
  }, 30);
}
export const usingPadRef = { value: false };
let current = null;
export function setFocus(el) {
  document.querySelectorAll('.gp-focus').forEach(e => e.classList.remove('gp-focus'));
  current = el;
  if (!el) return;
  el.classList.add('gp-focus');
  el.focus?.({ preventScroll: true });
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}
export function moveFocus(dir) {
  const scope = activeScope();
  if (!scope) return false;
  const els = focusables(scope);
  if (!els.length) return false;
  if (!current || !scope.contains(current) || !els.includes(current)) { setFocus(els[0]); return true; }
  // Curseurs : gauche/droite ajustent la valeur.
  if (current.tagName === 'INPUT' && current.type === 'range' && (dir === 'left' || dir === 'right')) {
    const step = parseFloat(current.step || '1') || 1;
    current.value = String(parseFloat(current.value) + (dir === 'right' ? step : -step));
    current.dispatchEvent(new Event('input', { bubbles: true }));
    current.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  const r0 = current.getBoundingClientRect();
  const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
  let best = null, bs = Infinity;
  for (const e of els) {
    if (e === current) continue;
    const r = e.getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const dx = c.x - c0.x, dy = c.y - c0.y;
    let main, cross;
    if (dir === 'up') { main = -dy; cross = Math.abs(dx); }
    else if (dir === 'down') { main = dy; cross = Math.abs(dx); }
    else if (dir === 'left') { main = -dx; cross = Math.abs(dy); }
    else { main = dx; cross = Math.abs(dy); }
    if (main <= 2) continue;
    const score = main + cross * 2.2;
    if (score < bs) { bs = score; best = e; }
  }
  if (best) { setFocus(best); sfx('tick'); return true; }
  return false;
}
export function activateFocus() {
  if (!current || !document.body.contains(current)) return false;
  if (current.tagName === 'INPUT' && current.type === 'checkbox') { current.click(); return true; }
  if (current.tagName === 'SELECT') {
    const s = current; s.selectedIndex = (s.selectedIndex + 1) % s.options.length; s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (current.tagName === 'INPUT' && current.type === 'text') { current.focus(); return true; }
  current.click();
  return true;
}
export function cycleTabs(delta) {
  const scope = activeScope();
  if (!scope) return false;
  const tabs = [...scope.querySelectorAll('.tab')].filter(t => t.offsetParent !== null);
  if (!tabs.length) return false;
  let i = tabs.findIndex(t => t.classList.contains('active'));
  i = (i + delta + tabs.length) % tabs.length;
  tabs[i].click();
  setTimeout(() => focusFirst(activeScope()), 40);
  return true;
}
export function backAction() {
  const scope = activeScope();
  if (!scope) return false;
  const b = scope.querySelector('[data-back="1"]');
  if (b) { b.click(); return true; }
  return closeTop();
}

export { escapeHtml };

// Entrées unifiées : clavier, souris, tactile (pincer, glisser), manette (Gamepad API ou passerelle Android).
// Correspondance Xbox (mapping « standard ») : A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 View=8 Menu=9 LS=10 RS=11 Croix=12..15.
import { Emitter } from '../core/util.js';

export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD = 0.18;

export class Input extends Emitter {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.keys = new Set();
    this.pointers = new Map();
    this.pad = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: new Array(17).fill(false), pressed: new Array(17).fill(false), name: '' };
    this.prevButtons = new Array(17).fill(false);
    this.repeat = {};
    this.lastPadUse = 0;
    this.lastPointerUse = 0;
    this.bind();
  }

  bind() {
    const c = this.canvas;
    window.addEventListener('keydown', e => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      if (!this.keys.has(e.code)) this.emit('key', { code: e.code, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, event: e });
      this.keys.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => { e.preventDefault(); this.emit('zoom', { factor: Math.exp(e.deltaY * 0.0012), x: e.clientX, y: e.clientY }); }, { passive: false });
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      this.lastPointerUse = performance.now();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, type: e.pointerType, moved: false });
      if (this.pointers.size === 2) this.pinch = this.pinchState();
      clearTimeout(this.longPress);
      if (e.pointerType === 'touch' && this.pointers.size === 1) this.longPress = setTimeout(() => { const p = this.pointers.get(e.pointerId); if (p && !p.moved) { p.long = true; this.emit('longpress', { x: p.x, y: p.y }); } }, 550);
    });
    c.addEventListener('pointermove', e => {
      this.mouse = { x: e.clientX, y: e.clientY };
      this.emit('hover', { x: e.clientX, y: e.clientY });
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) p.moved = true;
      if (this.pointers.size === 2) {
        const st = this.pinchState();
        if (this.pinch) {
          this.emit('zoom', { factor: this.pinch.d / st.d });
          this.emit('rotate', { d: (st.a - this.pinch.a) });
          this.emit('pan', { dx: (st.cx - this.pinch.cx), dy: (st.cy - this.pinch.cy), touch: true });
        }
        this.pinch = st;
        return;
      }
      if (!p.moved) return;
      if (p.button === 2 || (p.button === 0 && this.keys.has('AltLeft'))) this.emit('rotateDrag', { dx, dy });
      else if (p.button === 1 || p.type === 'touch' || this.dragPans) this.emit('pan', { dx, dy, touch: p.type === 'touch' });
      else this.emit('drag', { x: p.x, y: p.y, sx: p.sx, sy: p.sy, dx, dy });
    });
    const up = e => {
      const p = this.pointers.get(e.pointerId);
      clearTimeout(this.longPress);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!p) return;
      if (!p.moved && !p.long && performance.now() - p.t < 600) this.emit('tap', { x: e.clientX, y: e.clientY, button: p.button, type: p.type });
      if (p.moved) this.emit('dragEnd', { x: e.clientX, y: e.clientY, sx: p.sx, sy: p.sy, button: p.button });
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    window.addEventListener('gamepadconnected', e => this.emit('padConnected', e.gamepad));
    window.addEventListener('gamepaddisconnected', () => this.emit('padDisconnected'));
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  key(code) { return this.keys.has(code); }

  // Lecture de la manette, à appeler une fois par image.
  pollPad() {
    const p = this.pad;
    let gp = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const g of pads) if (g && g.connected) { gp = g; break; }
    } catch { /* API absente */ }
    let axes = [0, 0, 0, 0], btn = new Array(17).fill(false), lt = 0, rt = 0, name = '';
    if (gp) {
      name = gp.id;
      axes = [gp.axes[0] || 0, gp.axes[1] || 0, gp.axes[2] || 0, gp.axes[3] || 0];
      for (let i = 0; i < Math.min(17, gp.buttons.length); i++) btn[i] = gp.buttons[i].pressed;
      lt = gp.buttons[6]?.value || 0; rt = gp.buttons[7]?.value || 0;
    } else if (window.NativePad) {
      // Passerelle Android : la WebView ne transmet pas toujours la manette à la Gamepad API.
      try {
        const st = JSON.parse(window.NativePad.getState());
        if (st.connected) {
          name = st.name || 'Manette Android';
          axes = [st.lx, st.ly, st.rx, st.ry];
          btn = st.buttons.slice(0, 17).map(Boolean);
          while (btn.length < 17) btn.push(false);
          lt = st.lt; rt = st.rt;
          btn[6] = lt > 0.5; btn[7] = rt > 0.5;
        }
      } catch { /* état illisible */ }
    }
    const dz = v => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
    p.connected = !!name;
    p.name = name;
    p.lx = dz(axes[0]); p.ly = dz(axes[1]); p.rx = dz(axes[2]); p.ry = dz(axes[3]);
    p.lt = lt; p.rt = rt;
    for (let i = 0; i < 17; i++) {
      p.pressed[i] = btn[i] && !this.prevButtons[i];
      p.buttons[i] = btn[i];
      this.prevButtons[i] = btn[i];
    }
    const now = performance.now();
    if (p.pressed.some(Boolean) || Math.abs(p.lx) + Math.abs(p.ly) + Math.abs(p.rx) + Math.abs(p.ry) > 0.1) this.lastPadUse = now;
    // Répétition des directions pour la navigation dans les menus.
    p.nav = null;
    const dirs = [['up', btn[12] || p.ly < -0.6], ['down', btn[13] || p.ly > 0.6], ['left', btn[14] || p.lx < -0.6], ['right', btn[15] || p.lx > 0.6]];
    for (const [d, on] of dirs) {
      if (on) {
        const r = this.repeat[d];
        if (!r) { this.repeat[d] = now + 380; p.nav = d; }
        else if (now > r) { this.repeat[d] = now + 120; p.nav = d; }
      } else delete this.repeat[d];
    }
    return p;
  }

  get usingPad() { return this.pad.connected && this.lastPadUse > this.lastPointerUse; }
}

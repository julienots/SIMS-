// Sons d'interface et ambiance musicale générés avec la Web Audio API (aucun fichier audio requis).
let ctx = null;
let master = null;
let musicGain = null;
let musicTimer = null;
export const audioSettings = { sfx: 0.5, music: 0.25 };

function ensure() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = audioSettings.music; musicGain.connect(master);
  } catch { ctx = null; }
  return ctx;
}
export function unlockAudio() { const c = ensure(); if (c?.state === 'suspended') c.resume(); }

function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, dest) {
  const c = ensure();
  if (!c || audioSettings.sfx <= 0 && !dest) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * (dest ? 1 : audioSettings.sfx), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t); o.stop(t + dur + 0.05);
}

export function sfx(name) {
  if (!ctx) return;
  switch (name) {
    case 'click': tone(660, 0.07, 'triangle', 0.15); break;
    case 'tick': tone(880, 0.03, 'sine', 0.06); break;
    case 'open': tone(520, 0.08, 'sine', 0.12); tone(780, 0.1, 'sine', 0.1, 0.05); break;
    case 'close': tone(600, 0.06, 'sine', 0.1); tone(400, 0.08, 'sine', 0.08, 0.04); break;
    case 'notify': tone(784, 0.12, 'sine', 0.15); tone(1046, 0.18, 'sine', 0.12, 0.1); break;
    case 'place': tone(220, 0.08, 'square', 0.08); tone(330, 0.1, 'triangle', 0.1, 0.03); break;
    case 'error': tone(200, 0.15, 'sawtooth', 0.08); break;
    case 'money': tone(1318, 0.08, 'triangle', 0.12); tone(1760, 0.12, 'triangle', 0.1, 0.06); break;
    case 'power': tone(300, 0.3, 'sawtooth', 0.06); tone(900, 0.25, 'sine', 0.1, 0.05); break;
    case 'love': tone(660, 0.15, 'sine', 0.12); tone(880, 0.2, 'sine', 0.1, 0.12); tone(1100, 0.25, 'sine', 0.08, 0.24); break;
  }
}

// Petite boucle musicale douce (accords pentatoniques), désactivable dans les paramètres.
const CHORDS = [[261.6, 329.6, 392], [293.7, 349.2, 440], [220, 261.6, 329.6], [246.9, 293.7, 392]];
export function startMusic() {
  const c = ensure();
  if (!c || musicTimer) return;
  let i = 0;
  const play = () => {
    if (audioSettings.music <= 0) return;
    musicGain.gain.value = audioSettings.music * 0.35;
    const ch = CHORDS[i++ % CHORDS.length];
    ch.forEach((f, k) => tone(f, 3.6, 'sine', 0.05, k * 0.02, musicGain));
    const mel = [ch[2] * 2, ch[1] * 2, ch[0] * 2, ch[2] * 2];
    mel.forEach((f, k) => { if (Math.random() < 0.7) tone(f, 0.6, 'triangle', 0.035, 0.6 + k * 0.8, musicGain); });
  };
  play();
  musicTimer = setInterval(play, 3600);
}
export function setMusicVolume(v) { audioSettings.music = v; if (musicGain) musicGain.gain.value = v * 0.35; }

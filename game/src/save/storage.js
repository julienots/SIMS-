// Stockage persistant : IndexedDB (sauvegardes volumineuses) avec repli localStorage puis mémoire.
// Les sauvegardes gardent une copie de secours (rotation) pour récupérer un monde en cas d'erreur.
const DB_NAME = 'mylife-universe';
const STORE = 'kv';
let dbPromise = null;
const memory = new Map();

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDB();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const st = tx.objectStore(STORE);
    const r = fn(st);
    tx.oncomplete = () => resolve(r?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const storage = {
  async get(key) {
    try {
      const v = await idb('readonly', st => st.get(key));
      if (v !== undefined) return v;
    } catch (e) { console.warn('IDB get', e); }
    try { const v = localStorage.getItem('mlu:' + key); if (v !== null) return JSON.parse(v); } catch { /* indisponible */ }
    return memory.get(key);
  },
  async set(key, value) {
    memory.set(key, value);
    try { await idb('readwrite', st => st.put(value, key)); return true; } catch (e) { console.warn('IDB set', e); }
    try { localStorage.setItem('mlu:' + key, JSON.stringify(value)); return true; } catch { /* quota */ }
    return false;
  },
  async del(key) {
    memory.delete(key);
    try { await idb('readwrite', st => st.delete(key)); } catch { /* ignore */ }
    try { localStorage.removeItem('mlu:' + key); } catch { /* ignore */ }
  },
};

// ---------------------------------------------------------------------- sauvegardes de mondes
export async function listSaves() { return (await storage.get('saves')) || []; }

export async function saveWorld(world, slotId, label) {
  const id = slotId || world.d.id;
  const json = world.serialize();
  const prev = await storage.get(`world:${id}`);
  if (prev) await storage.set(`backup:${id}`, prev);     // copie de secours
  const ok = await storage.set(`world:${id}`, json);
  if (!ok) throw new Error('Espace de stockage insuffisant');
  const saves = await listSaves();
  const meta = {
    id, name: label || world.d.name, updated: Date.now(), env: world.settings.environment,
    sims: world.sims.length, day: Math.floor(world.time / 1440) + 1, size: json.length, mods: world.d.mods.enabled,
  };
  const i = saves.findIndex(s => s.id === id);
  if (i >= 0) saves[i] = meta; else saves.unshift(meta);
  await storage.set('saves', saves);
  return meta;
}

export async function loadWorldJSON(id) {
  const json = await storage.get(`world:${id}`);
  if (!json) throw new Error('Sauvegarde introuvable');
  try { JSON.parse(json); return json; }
  catch {
    // Sauvegarde corrompue : on tente la copie de secours.
    const backup = await storage.get(`backup:${id}`);
    if (backup) return backup;
    throw new Error('Sauvegarde corrompue et aucune copie de secours');
  }
}
export async function hasBackup(id) { return !!(await storage.get(`backup:${id}`)); }
export async function restoreBackup(id) {
  const b = await storage.get(`backup:${id}`);
  if (!b) throw new Error('Aucune copie de secours');
  await storage.set(`world:${id}`, b);
}

export async function deleteSave(id) {
  await storage.del(`world:${id}`);
  await storage.del(`backup:${id}`);
  const saves = (await listSaves()).filter(s => s.id !== id);
  await storage.set('saves', saves);
}

export async function duplicateSave(id, newName) {
  const json = await loadWorldJSON(id);
  const data = JSON.parse(json);
  const newId = `world_${Date.now().toString(36)}`;
  data.id = newId;
  data.name = newName || `${data.name} (copie)`;
  await storage.set(`world:${newId}`, JSON.stringify(data));
  const saves = await listSaves();
  const src = saves.find(s => s.id === id) || {};
  saves.unshift({ ...src, id: newId, name: data.name, updated: Date.now() });
  await storage.set('saves', saves);
  return newId;
}

// ---------------------------------------------------------------------- galerie (personnages, maisons)
export async function getGallery() { return (await storage.get('gallery')) || { sims: [], houses: [] }; }
export async function setGallery(g) { return storage.set('gallery', g); }

// ---------------------------------------------------------------------- paramètres globaux
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem('mlu:settings') || '{}'); } catch { return {}; }
}
export function saveSettings(s) { try { localStorage.setItem('mlu:settings', JSON.stringify(s)); } catch { /* ignore */ } }

// Export d'un fichier vers l'utilisateur (navigateur ou passerelle Android).
export function downloadFile(name, content, mime = 'application/json') {
  if (window.AndroidBridge?.saveFile) {
    const path = window.AndroidBridge.saveFile(name, content);
    return path;
  }
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return name;
}

export function pickFile(accept = '.json,.mlmod') {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, text: r.result });
      r.onerror = () => resolve(null);
      r.readAsText(f);
    };
    inp.click();
  });
}

// Cache keadaan per pengguna Telegram di perangkat ini, supaya buka app langsung tampil (data lama
// dulu, lalu disegarkan di belakang layar). Hanya dipakai di Telegram; dev/offline sudah lokal.
// Kunci memuat id pengguna: akun lain di perangkat yang sama tidak pernah membaca cache ini.
const PREFIX = 'berkah-cache-v1-';
const MAX_AGE = 7 * 86400000;
const TABLES = ['categories', 'items', 'suppliers', 'priceLog', 'remRecurring', 'remOneoff', 'workerItems', 'receipts'];

export function snapshot(state, now = Date.now()) {
  const out = { savedAt: now, me: state.me, serverTime: state.serverTime, lastAct: state.lastAct };
  for (const t of TABLES) out[t] = [...state[t].values()];
  return out;
}

export function restore(state, snap) {
  state.me = snap.me;
  state.serverTime = snap.serverTime || 0;
  state.lastAct = snap.lastAct ?? null;
  const keyOf = { remRecurring: 'supplierId' };
  for (const t of TABLES) {
    state[t].clear();
    for (const row of snap[t] || []) state[t].set(row[keyOf[t] || 'id'], row);
  }
}

export function loadCache(userId, storage = globalThis.localStorage, now = Date.now()) {
  try {
    const raw = storage?.getItem(PREFIX + userId);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || !snap.me || now - snap.savedAt > MAX_AGE) return null;
    if (snap.me.tgId !== userId) return null;
    return snap;
  } catch { return null; }
}

export function saveCache(userId, state, storage = globalThis.localStorage) {
  try { storage?.setItem(PREFIX + userId, JSON.stringify(snapshot(state))); return true; } catch { return false; }
}

export function clearCache(userId, storage = globalThis.localStorage) {
  try { storage?.removeItem(PREFIX + userId); } catch { /* abaikan */ }
}

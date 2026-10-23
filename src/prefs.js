// Preferensi tampilan per perangkat (kunci sama dengan app lama).
const get = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } };

export const prefs = {
  get oor() { return get('stok-oor', 'dim'); },            // item centang di luar filter: 'dim' | 'hide'
  set oor(v) { set('stok-oor', v); },
  get outputTs() { return get('stok-output-ts', 'show'); }, // header tanggal di teks order: 'show' | 'hide'
  set outputTs(v) { set('stok-output-ts', v); },
};

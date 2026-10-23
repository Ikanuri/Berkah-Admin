// ID string untuk items dan price_log (makeId() app lama berupa string acak).
export function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ID buatan klien (supaya UI instan) hanya diterima bila berbentuk makeId(): huruf kecil/angka, 8-40 karakter.
export function validClientId(v) {
  return typeof v === 'string' && /^[a-z0-9]{8,40}$/.test(v);
}

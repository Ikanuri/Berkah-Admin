// Konfigurasi toko. Diisi pemilik sebelum deploy pertama.

// telegram_user_id Bos. Tidak ditulis di repo: berasal dari GitHub Secret BOSS_IDS
// dan disuntikkan ke boss-ids.js saat deploy (runtime tgcloud tidak punya env/secret
// yang terdokumentasi). Orang lain yang membuka app masuk sebagai 'pending'.
export { BOSS_IDS } from './boss-ids.js';

// Jam jadwal (pengingat, tanggal) selalu zona toko, bukan UTC server.
export const SHOP_TZ = 'Asia/Jakarta';

// Satuan yang dikenali (SK_UNITS di app lama).
export const UNITS = ['dus', 'slp', 'biji', 'kg', 'btl', 'sak', 'lusin', 'pak', 'bal', 'ret', 'rek', 'kas', 'ikt'];

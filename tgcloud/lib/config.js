// Konfigurasi toko. Diisi pemilik sebelum deploy pertama.

// telegram_user_id Bos pertama (angka dari ctx.initData.user.id). Orang lain
// yang membuka app masuk sebagai 'pending' sampai disetujui Bos.
export const BOSS_IDS = [];

// Jam jadwal (pengingat, tanggal) selalu zona toko, bukan UTC server.
export const SHOP_TZ = 'Asia/Jakarta';

// Satuan yang dikenali (SK_UNITS di app lama).
export const UNITS = ['dus', 'slp', 'biji', 'kg', 'btl', 'sak', 'lusin', 'pak', 'bal', 'ret', 'rek', 'kas', 'ikt'];

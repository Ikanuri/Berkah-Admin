// Skema V1: Stok + HPP + Supplier + pengguna. Lihat docs/AUDIT-SKEMA-MINI-APP.md.
// Tanpa foreign key (batasan tgcloud): relasi dijaga di kode endpoint.
// Tabel yang di-polling punya updated_at (ms) dan deleted_at (tombstone), supaya
// penghapusan ikut terkirim ke klien lewat getChanges.
import { table, integer, text, real, boolean, json, index, uniqueIndex } from 'sdk/db';

export const users = table('users', {
  tgId: integer('tg_id').primaryKey(),
  name: text('name').notNull(),
  username: text('username'),
  role: text('role').notNull().default('pending'), // 'boss' | 'worker' | 'pending'
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const categories = table('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  excludeFromOrder: boolean('exclude_from_order').notNull().default(false), // dulu skState.outCatEx
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => ({
  nameIdx: index('idx_categories_updated').on(t.updatedAt),
}));

// id TEXT: mempertahankan makeId() app lama (menjaga tautan price_log & merge restore).
export const items = table('items', {
  id: text('id').primaryKey(),
  categoryId: integer('category_id').notNull(),
  name: text('name').notNull(),
  qty: real('qty').notNull().default(1),
  unit: text('unit').notNull(),
  checked: boolean('checked').notNull().default(false),
  checkedAt: integer('checked_at'),
  sortOrder: integer('sort_order').notNull().default(0), // urutan manual dalam kategori (skReorder)
  // field HPP: HANYA boleh sampai ke boss (lib/shape.js)
  isi: real('isi'),
  satuanHpp: text('satuan_hpp'),
  hargaBeli: real('harga_beli'),
  hargaJual: real('harga_jual'),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => ({
  updatedIdx: index('idx_items_updated').on(t.updatedAt),
  catIdx: index('idx_items_category').on(t.categoryId),
}));

export const suppliers = table('suppliers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'), // soft delete: riwayat harga tetap menunjuk supplier ini
}, (t) => ({
  nameUq: uniqueIndex('uidx_suppliers_name').on(t.name),
}));

// LEDGER, append-only (kecuali hapus entri manual oleh Bos, seperti app lama).
export const priceLog = table('price_log', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  supplierId: integer('supplier_id').notNull(),
  tanggal: text('tanggal').notNull(), // 'YYYY-MM-DD' lokal toko
  hargaBeli: real('harga_beli').notNull(),
  unit: text('unit'), // satuan saat dicatat (snapshot)
  ts: integer('ts').notNull(),
  createdBy: integer('created_by'),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => ({
  itemIdx: index('idx_price_log_item').on(t.itemId),
  updatedIdx: index('idx_price_log_updated').on(t.updatedAt),
}));

// Riwayat barang yang dibatalkan centangnya oleh Bos (dulu skState.log, teks)
// dan jejak aktivitas (dulu lastAct).
export const activityLog = table('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: integer('ts').notNull(),
  tgId: integer('tg_id').notNull(),
  action: text('action').notNull(),
  detail: json('detail'),
}, (t) => ({
  tsIdx: index('idx_activity_ts').on(t.ts),
}));

// Pengingat kedatangan supplier (V2). Satu jadwal mingguan per supplier; jadwal
// sekali-jadwal boleh banyak. Kolom last_* / *_at dipakai sebagai "klaim" agar
// satu kejadian hanya dikirim sekali walau dua tick berjalan bersamaan.
export const remRecurring = table('reminders_recurring', {
  supplierId: integer('supplier_id').primaryKey(),
  days: json('days').notNull(),                 // [0..6], 0 = Minggu
  time: text('time').notNull(),                 // 'HH:MM' jam toko
  preAlertMin: integer('pre_alert_min'),
  lastFiredDate: text('last_fired_date'),
  lastPreFiredDate: text('last_pre_fired_date'),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => ({
  updatedIdx: index('idx_rem_rec_updated').on(t.updatedAt),
}));

export const remOneoff = table('reminders_oneoff', {
  id: text('id').primaryKey(),
  supplierId: integer('supplier_id').notNull(),
  ts: integer('ts').notNull(),
  preAlertMin: integer('pre_alert_min'),
  firedAt: integer('fired_at'),
  preFiredAt: integer('pre_fired_at'),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => ({
  updatedIdx: index('idx_rem_once_updated').on(t.updatedAt),
}));

// Nota Kulakan (V3). Database produk dari CSV (diganti utuh saat impor), kamus
// belajar bersama, riwayat nota (maks 100 terbaru), dan urutan nomor nota.
export const notaProducts = table('nota_products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nama: text('nama').notNull(),
  kode: text('kode'),
  barcode: text('barcode'),
  satuan: text('satuan').notNull(),
  satClass: text('sat_class').notNull(),
  hargaJual: real('harga_jual').notNull().default(0),
  hargaPokok: real('harga_pokok').notNull().default(0), // harga modal: Bos saja
});

export const notaMeta = table('nota_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// kunci = 'tokenNama|kelasSatuan', nilai = nama produk di DB
export const notaLearn = table('nota_learn', {
  kunci: text('kunci').primaryKey(),
  nilai: text('nilai').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => ({
  updatedIdx: index('idx_nota_learn_updated').on(t.updatedAt),
}));

export const notaHist = table('nota_hist', {
  id: text('id').primaryKey(),
  num: text('num').notNull(), // boleh diedit pemakai: sengaja TIDAK unik
  dateStr: text('date_str').notNull(),
  timeStr: text('time_str').notNull(),
  ket: text('ket').notNull(),
  total: real('total').notNull(),
  savedAt: integer('saved_at').notNull(),
  lines: json('lines').notNull(),
  createdBy: integer('created_by'),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => ({
  updatedIdx: index('idx_nota_hist_updated').on(t.updatedAt),
  savedIdx: index('idx_nota_hist_saved').on(t.savedAt),
}));

// Urutan nomor nota yang atomik: setiap simpan menambah satu baris; id-nya = nomor.
export const notaSeq = table('nota_seq', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: integer('ts').notNull(),
});

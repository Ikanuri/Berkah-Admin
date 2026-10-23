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

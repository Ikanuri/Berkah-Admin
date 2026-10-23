// Uji backup/restore murni (parse, rencana merge, penerap). Jalankan: node tests/backup-test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBackup, planRestore, applyPlan, makeBackup, OWN_APP } from '../tgcloud/lib/backup.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };

// DB memori yang meniru tabel server + antarmuka io
class MemDb {
  constructor() { this.categories = []; this.suppliers = []; this.items = []; this.logs = []; this.recs = []; this.ones = []; this.seq = { c: 0, s: 0 }; }
  snapshot() {
    return {
      categories: this.categories.map((c) => ({ ...c })), suppliers: this.suppliers.map((s) => ({ ...s })),
      items: this.items.map((i) => ({ ...i })), priceLogIds: new Set(this.logs.map((l) => l.id)),
      remRecurring: this.recs.map((r) => ({ ...r })), remOneoffIds: this.ones.map((o) => o.id),
    };
  }
  io() {
    return {
      insertCategory: async (c) => { const id = ++this.seq.c; this.categories.push({ id, ...c, deletedAt: null }); return id; },
      reviveCategory: async (id) => { this.categories.find((c) => c.id === id).deletedAt = null; },
      insertSupplier: async (s) => { const id = ++this.seq.s; this.suppliers.push({ id, name: s.name, deletedAt: s.deleted ? 1 : null }); return id; },
      reviveSupplier: async (id) => { this.suppliers.find((s) => s.id === id).deletedAt = null; },
      insertItems: async (rows) => { this.items.push(...rows.map((r) => ({ ...r, deletedAt: null }))); },
      updateItem: async (id, patch) => { Object.assign(this.items.find((i) => i.id === id), patch); },
      insertLogs: async (rows) => { this.logs.push(...rows); },
      upsertRecurring: async (r) => { const i = this.recs.findIndex((x) => x.supplierId === r.supplierId); const row = { ...r, deletedAt: null }; if (i >= 0) this.recs[i] = row; else this.recs.push(row); },
      insertOneOffs: async (rows) => { this.ones.push(...rows); },
    };
  }
}
const restore = async (db, json, opts) => {
  const { incoming } = parseBackup(json);
  const plan = planRestore(db.snapshot(), incoming, opts);
  await applyPlan(plan, db.io());
  return plan.counts;
};

const legacy = () => ({
  app: 'berkah-aio', version: 1, exported: '2026-07-22T10:00:00Z',
  nota: { db: [], hist: [] }, pnl: { days: {}, arsip: {} },
  stok: {
    boss: {
      cats: ['Sembako', 'Minuman', 'Kosong'], activecat: 'Sembako', output: '', reply: '', log: '', mode: 'worker', outCatEx: ['Minuman'],
      items: {
        Sembako: [
          { id: 'a1', name: 'Aqua', qty: 5, unit: 'dus', checked: true, checkedAt: 1700000000000, isi: 24, hargaBeli: 48000, hargaJual: 2500, satuanHpp: 'btl' },
          { id: 'a2', name: 'Gula Pasir', qty: 2, unit: 'kg', checked: false, checkedAt: null },
          { id: 'a2', name: 'Telur', qty: 0, unit: 'tray', checked: false },   // id ganda, qty 0, satuan asing
          { id: 'a4', name: '   ', qty: 1, unit: 'dus', checked: false },       // nama kosong: tidak valid
        ],
        Minuman: [{ id: 'm1', name: 'Teh', qty: 1, unit: 'dus', checked: false }],
      },
    },
    suppliers: ['Agen A'],
    pricelog: [
      { id: 'l1', ts: 1700000000000, tanggal: '2026-07-20', supplier: 'Agen A', itemId: 'a1', nama: 'Aqua', unit: 'dus', hargaBeli: 48000 },
      { id: 'l2', ts: 1700000100000, tanggal: '2026-07-21', supplier: 'Agen Lama', itemId: 'a1', nama: 'Aqua', unit: 'dus', hargaBeli: 47000 },
      { id: 'l3', ts: 1, tanggal: '2026-07-21', supplier: 'Agen A', itemId: 'tidak-ada', nama: 'X', unit: 'dus', hargaBeli: 1 },
      { id: 'l4', ts: 1, tanggal: 'bukan-tanggal', supplier: 'Agen A', itemId: 'a1', nama: 'Aqua', unit: 'dus', hargaBeli: 1 },
      { id: 'l5', ts: 1, tanggal: '2026-07-21', supplier: 'Agen A', itemId: 'a1', nama: 'Aqua', unit: 'dus', hargaBeli: 0 },
    ],
    reminders: { 'Agen A': { recurring: null, oneOff: [] } },
  },
});

await t('parse legacy: kategori berurutan, filter order, sanitasi baris', () => {
  const { format, incoming, warnings } = parseBackup(legacy());
  assert.equal(format, 'berkah-aio');
  assert.deepEqual(incoming.categories.map((c) => [c.name, c.sortOrder, c.excludeFromOrder]), [['Sembako', 1, false], ['Minuman', 2, true], ['Kosong', 3, false]]);
  assert.equal(incoming.items.length, 4, 'satu barang tanpa nama dilewati');
  const aqua = incoming.items.find((i) => i.name === 'Aqua');
  assert.deepEqual([aqua.id, aqua.qty, aqua.unit, aqua.checked, aqua.checkedAt, aqua.isi, aqua.hargaBeli, aqua.hargaJual, aqua.satuanHpp], ['a1', 5, 'dus', true, 1700000000000, 24, 48000, 2500, 'btl']);
  const gula = incoming.items.find((i) => i.name === 'Gula Pasir');
  assert.deepEqual([gula.isi, gula.hargaJual, gula.satuanHpp, gula.checkedAt], [null, null, null, null]);
  const telur = incoming.items.find((i) => i.name === 'Telur');
  assert.deepEqual([telur.qty, telur.unit], [1, 'dus']);
  assert.notEqual(telur.id, 'a2', 'id ganda dibuat ulang');
  assert.ok(warnings.some((w) => /tray/.test(w)) && warnings.some((w) => /1 barang tidak valid/.test(w)));
  assert.deepEqual(incoming.suppliers, [{ name: 'Agen A', deleted: false }, { name: 'Agen Lama', deleted: true }], 'supplier terhapus tetap dibawa');
  assert.equal(incoming.priceLog.length, 3, 'tanggal buruk dan harga 0 dibuang');
});

await t('parse "Backup Stok" lama (tanpa pembungkus app)', () => {
  const l = legacy().stok;
  const flat = { ...l.boss, hppSuppliers: l.suppliers, hppLog: l.pricelog };
  const a = parseBackup(flat), b = parseBackup(legacy());
  assert.equal(a.incoming.items.length, b.incoming.items.length);
  assert.equal(a.incoming.priceLog.length, 3);
});

await t('parse: menolak file yang salah', () => {
  assert.throws(() => parseBackup(null), /bukan backup/);
  assert.throws(() => parseBackup([]), /bukan backup/);
  assert.throws(() => parseBackup({ foo: 1 }), /tidak dikenal/);
  assert.throws(() => parseBackup({ app: 'berkah-aio', nota: {} }), /tidak berisi data Stok/);
  assert.throws(() => parseBackup({ app: OWN_APP, version: 99, tables: {} }), /lebih baru/);
});

await t('restore ke DB kosong: semua masuk, urutan & tautan riwayat benar', async () => {
  const db = new MemDb();
  const c = await restore(db, legacy());
  assert.deepEqual(c.categories, { add: 3, revive: 0 });
  assert.deepEqual(c.items, { add: 4, overwrite: 0, skip: 0 });
  assert.deepEqual(c.priceLog, { add: 2, dup: 0, orphan: 1 }, 'riwayat untuk barang yang tidak ada = yatim');
  assert.deepEqual(db.categories.map((x) => x.name), ['Sembako', 'Minuman', 'Kosong']);
  assert.equal(db.categories[1].excludeFromOrder, true);
  const sembako = db.items.filter((i) => i.categoryId === 1);
  assert.deepEqual(sembako.map((i) => [i.name, i.sortOrder]), [['Aqua', 1], ['Gula Pasir', 2], ['Telur', 3]]);
  assert.equal(db.suppliers.find((s) => s.name === 'Agen Lama').deletedAt != null, true);
  assert.deepEqual(db.logs.map((l) => [l.id, l.itemId, l.supplierId]), [['l1', 'a1', 1], ['l2', 'a1', 2]]);
});

await t('restore dua kali = idempoten (tidak ada yang ganda)', async () => {
  const db = new MemDb();
  await restore(db, legacy());
  const before = JSON.stringify(db);
  const c = await restore(db, legacy());
  assert.equal(c.categories.add + c.suppliers.add + c.items.add + c.priceLog.add, 0);
  assert.equal(c.items.skip, 4);
  assert.equal(c.priceLog.dup, 2);
  assert.equal(db.items.length, 4);
  assert.equal(db.logs.length, 2);
  assert.equal(JSON.stringify(db).length, before.length);
});

await t("onConflict 'keep' mempertahankan data yang ada; 'overwrite' menimpa & menghidupkan lagi", async () => {
  const db = new MemDb();
  await restore(db, legacy());
  db.items.find((i) => i.id === 'a1').qty = 99;
  db.items.find((i) => i.id === 'a2').deletedAt = 5; // sengaja dihapus orang
  let c = await restore(db, legacy(), { onConflict: 'keep' });
  assert.equal(db.items.find((i) => i.id === 'a1').qty, 99);
  assert.notEqual(db.items.find((i) => i.id === 'a2').deletedAt, null, 'yang dihapus tidak muncul lagi');
  assert.equal(c.items.overwrite, 0);
  c = await restore(db, legacy(), { onConflict: 'overwrite' });
  assert.equal(db.items.find((i) => i.id === 'a1').qty, 5);
  assert.equal(db.items.find((i) => i.id === 'a2').deletedAt, null, 'ditimpa = dihidupkan');
  assert.ok(c.items.overwrite >= 2);
  assert.equal(db.items.length, 4, 'tetap tanpa duplikat');
});

await t('barang bernama sama di kategori yang sama dianggap barang yang sama (id berbeda)', async () => {
  const db = new MemDb();
  await db.io().insertCategory({ name: 'sembako', sortOrder: 1, excludeFromOrder: false }); // beda huruf besar
  db.items.push({ id: 'server-1', categoryId: 1, name: 'AQUA', qty: 7, unit: 'dus', sortOrder: 1, deletedAt: null });
  const c = await restore(db, legacy());
  assert.equal(db.items.filter((i) => i.name.toLowerCase() === 'aqua').length, 1, 'Aqua tidak dobel');
  assert.equal(c.items.skip, 1);
  assert.equal(db.items.find((i) => i.id === 'server-1').qty, 7);
  assert.equal(db.categories.filter((x) => x.name.toLowerCase() === 'sembako').length, 1, 'kategori dicocokkan tanpa beda huruf');
  const l1 = db.logs.find((l) => l.id === 'l1');
  assert.equal(l1.itemId, 'server-1', 'riwayat dipindah ke barang yang sudah ada');
});

await t('supplier: cocok tanpa beda huruf, supplier terhapus dihidupkan lagi', async () => {
  const db = new MemDb();
  await db.io().insertSupplier({ name: 'agen a', deleted: true });
  const c = await restore(db, legacy());
  assert.deepEqual(c.suppliers, { add: 1, revive: 1 }); // "Agen Lama" baru, "Agen A" menghidupkan "agen a"
  assert.equal(db.suppliers.filter((s) => s.name.toLowerCase() === 'agen a').length, 1);
  assert.equal(db.suppliers.find((s) => s.name === 'agen a').deletedAt, null);
});

await t('format sendiri: ekspor lalu impor ke DB kosong menghasilkan data yang sama', async () => {
  const src = new MemDb();
  await restore(src, legacy());
  const json = makeBackup({
    categories: src.categories, items: src.items.filter((i) => !i.deletedAt),
    suppliers: src.suppliers, priceLog: src.logs,
  }, 1700000000000);
  assert.equal(json.app, OWN_APP);
  const dst = new MemDb();
  const c = await restore(dst, JSON.parse(JSON.stringify(json)));
  assert.deepEqual(c.items, { add: 4, overwrite: 0, skip: 0 });
  assert.deepEqual(dst.items.map((i) => [i.name, i.qty, i.unit, i.hargaBeli]).sort(), src.items.map((i) => [i.name, i.qty, i.unit, i.hargaBeli]).sort());
  assert.deepEqual(dst.logs.map((l) => l.id).sort(), ['l1', 'l2']);
  assert.equal(dst.suppliers.find((s) => s.name === 'Agen Lama').deletedAt != null, true);
});

await t('rencana tidak mengubah DB (preview murni)', async () => {
  const db = new MemDb();
  await restore(db, legacy());
  const snap = JSON.stringify(db);
  const plan = planRestore(db.snapshot(), parseBackup(legacy()).incoming, { onConflict: 'overwrite' });
  assert.ok(plan.counts.items.overwrite > 0);
  assert.equal(JSON.stringify(db), snap);
});

await t('FILE ASLI dari app lama v1.5.0 (tests/fixtures/legacy-backup.json) bisa direstore utuh', async () => {
  // fixture dihasilkan oleh backupAll() app lama sungguhan, bukan ditulis tangan
  const real = JSON.parse(readFileSync(new URL('./fixtures/legacy-backup.json', import.meta.url), 'utf8'));
  assert.equal(real.app, 'berkah-aio');
  const { format, incoming, warnings } = parseBackup(real);
  assert.equal(format, 'berkah-aio');
  assert.deepEqual(warnings, []);
  assert.deepEqual(incoming.categories.map((c) => [c.name, c.excludeFromOrder]), [['Sembako', false], ['Minuman', false], ['Rokok', true]]);
  assert.equal(incoming.items.length, 6);
  const beras = incoming.items.find((i) => i.name === 'Beras Premium 5kg');
  assert.deepEqual([beras.qty, beras.unit, beras.checked, beras.hargaBeli, beras.hargaJual, beras.satuanHpp], [3, 'sak', true, 68000, 74000, 'sak']);
  assert.equal(incoming.items.find((i) => i.name === 'Gula Pasir').qty, 2.5, 'qty desimal terjaga');
  assert.deepEqual(incoming.suppliers.map((s) => [s.name, s.deleted]), [['Agen Maju', false], ['Toko Sumber', false], ['Supplier Hapus', true]]);
  assert.equal(incoming.priceLog.length, 4);
  assert.deepEqual(incoming.remRecurring.map((r) => [r.supplierName, r.days, r.time, r.preAlertMin]), [['Agen Maju', [1, 4], '08:00', 30]]);
  assert.deepEqual(incoming.remOneoff.map((o) => [o.id, o.supplierName, o.ts, o.preAlertMin]), [['o1', 'Agen Maju', 1893456000000, null]]);
  const db = new MemDb();
  const c = await restore(db, real);
  assert.deepEqual(c.reminders, { recurring: 1, recSkip: 0, oneOff: 1, oneDup: 0, oneExpired: 0 });
  assert.deepEqual(db.recs.map((r) => [r.supplierId, r.days, r.time]), [[db.suppliers.find((x) => x.name === 'Agen Maju').id, [1, 4], '08:00']]);
  assert.deepEqual(c, {
    categories: { add: 3, revive: 0 }, suppliers: { add: 3, revive: 0 },
    items: { add: 6, overwrite: 0, skip: 0 }, priceLog: { add: 4, dup: 0, orphan: 0 },
    reminders: { recurring: 1, recSkip: 0, oneOff: 1, oneDup: 0, oneExpired: 0 },
  });
  assert.equal(db.logs.find((l) => l.id === 'p4').supplierId, db.suppliers.find((s) => s.name === 'Supplier Hapus').id);
  const c2 = await restore(db, real);
  assert.equal(c2.items.add + c2.priceLog.add + c2.suppliers.add + c2.categories.add, 0, 'idempoten pada file asli');
  assert.deepEqual(c2.reminders, { recurring: 0, recSkip: 1, oneOff: 0, oneDup: 1, oneExpired: 0 });
  assert.equal(db.recs.length, 1);
  assert.equal(db.ones.length, 1);
});

await t('pengingat: kebijakan merge app lama (mingguan hanya mengisi yang kosong; sekali-jadwal union; yang lewat dibuang)', async () => {
  const mk = () => ({
    app: 'berkah-aio', version: 1,
    stok: {
      boss: { cats: ['A'], items: { A: [] } }, suppliers: ['S1', 'S2'],
      reminders: {
        S1: { recurring: { days: [1], time: '09:00', preAlertMin: 15 }, oneOff: [
          { id: 'x1', ts: 2000, preAlertMin: null, firedAt: null, preFiredAt: null },   // sudah lewat
          { id: 'x2', ts: 9e12, preAlertMin: 60, firedAt: null, preFiredAt: null },
        ] },
        S2: { recurring: { days: [], time: '09:00' }, oneOff: [{ id: 'x3', ts: 'bukan-angka' }] }, // tidak valid
      },
    },
  });
  const db = new MemDb();
  await db.io().insertSupplier({ name: 'S1', deleted: false });
  db.recs.push({ supplierId: 1, days: [5], time: '07:00', preAlertMin: null, lastFiredDate: null, lastPreFiredDate: null, deletedAt: null });
  const { incoming, warnings } = parseBackup(mk());
  assert.ok(warnings.some((w) => /2 jadwal pengingat tidak valid/.test(w)));
  let plan = planRestore(db.snapshot(), incoming, { now: 100000 });
  assert.deepEqual(plan.counts.reminders, { recurring: 0, recSkip: 1, oneOff: 1, oneDup: 0, oneExpired: 1 }, 'mingguan yang sudah ada tidak ditimpa; x1 kedaluwarsa');
  await applyPlan(plan, db.io());
  assert.deepEqual(db.recs[0].days, [5], 'jadwal lokal dipertahankan');
  assert.deepEqual(db.ones.map((o) => o.id), ['x2']);
  plan = planRestore(db.snapshot(), incoming, { now: 100000, onConflict: 'overwrite' });
  assert.equal(plan.counts.reminders.recurring, 1, "'overwrite' mengganti jadwal mingguan");
  await applyPlan(plan, db.io());
  assert.deepEqual(db.recs[0].days, [1]);
  assert.equal(plan.counts.reminders.oneDup, 1, 'x2 sudah ada: tidak ganda');
});

await t('format sendiri membawa pengingat bolak-balik', async () => {
  const src = new MemDb();
  await restore(src, JSON.parse(readFileSync(new URL('./fixtures/legacy-backup.json', import.meta.url), 'utf8')));
  const json = makeBackup({ categories: src.categories, items: src.items, suppliers: src.suppliers, priceLog: src.logs, remRecurring: src.recs, remOneoff: src.ones });
  const dst = new MemDb();
  const c = await restore(dst, JSON.parse(JSON.stringify(json)));
  assert.deepEqual(c.reminders, { recurring: 1, recSkip: 0, oneOff: 1, oneDup: 0, oneExpired: 0 });
  assert.deepEqual(dst.recs[0].days, [1, 4]);
});

console.log(`\nHASIL: ${n} uji backup lulus`);

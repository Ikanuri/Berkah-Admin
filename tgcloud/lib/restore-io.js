// Penghubung backup.js ke database tgcloud: membaca keadaan sekarang dan menulis
// rencana. Insert di-chunk karena batas variabel SQLite (baris x kolom).
import { db } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { categories, suppliers, items, priceLog, remRecurring, remOneoff, notaProducts, notaMeta, notaLearn, notaHist, pnlDays, pnlArsip } from '../schema.js';
import { upsertDay, writeArsipDate } from './pnl-store.js';

const ITEM_CHUNK = 40;  // 13 kolom
const LOG_CHUNK = 60;   // 9 kolom

export async function loadExisting() {
  const [cats, sups, its, logs, recs, ones, learn, hist, anyProd, pDays, pArs] = await Promise.all([
    db.select().from(categories).all(),
    db.select().from(suppliers).all(),
    db.select().from(items).all(),
    db.select({ id: priceLog.id }).from(priceLog).all(),
    db.select().from(remRecurring).all(),
    db.select({ id: remOneoff.id }).from(remOneoff).all(),
    db.select().from(notaLearn).all(),
    db.select({ id: notaHist.id }).from(notaHist).all(),
    db.select({ id: notaProducts.id }).from(notaProducts).limit(1).all(),
    db.select({ t: pnlDays.tanggal }).from(pnlDays).all(),
    db.select({ t: pnlArsip.tanggal }).from(pnlArsip).all(),
  ]);
  return { categories: cats, suppliers: sups, items: its, priceLogIds: logs.map((l) => l.id), remRecurring: recs, remOneoffIds: ones.map((o) => o.id),
    notaLearn: learn, notaHistIds: hist.map((x) => x.id), notaProductCount: anyProd.length,
    pnlDays: pDays.map((x) => x.t), pnlArsipDates: [...new Set(pArs.map((x) => x.t))] };
}

export function makeIo(now = Date.now()) {
  return {
    async insertCategory(c) {
      await db.insert(categories).values({ name: c.name, sortOrder: c.sortOrder, excludeFromOrder: !!c.excludeFromOrder, updatedAt: now }).run();
      const row = await db.select().from(categories).where(and(eq(categories.name, c.name), isNull(categories.deletedAt))).get();
      return row.id;
    },
    async reviveCategory(id) {
      await db.update(categories).set({ deletedAt: null, updatedAt: now }).where(eq(categories.id, id)).run();
    },
    async insertSupplier(s) {
      await db.insert(suppliers).values({ name: s.name, updatedAt: now, deletedAt: s.deleted ? now : null }).run();
      const row = await db.select().from(suppliers).where(eq(suppliers.name, s.name)).get();
      return row.id;
    },
    async reviveSupplier(id) {
      await db.update(suppliers).set({ deletedAt: null, updatedAt: now }).where(eq(suppliers.id, id)).run();
    },
    async insertItems(rows) {
      for (let i = 0; i < rows.length; i += ITEM_CHUNK) {
        const chunk = rows.slice(i, i + ITEM_CHUNK).map((r) => ({
          id: r.id, categoryId: r.categoryId, name: r.name, qty: r.qty, unit: r.unit, checked: r.checked,
          checkedAt: r.checked ? (r.checkedAt ?? now) : null, sortOrder: r.sortOrder,
          isi: r.isi, satuanHpp: r.satuanHpp, hargaBeli: r.hargaBeli, hargaJual: r.hargaJual, updatedAt: now,
        }));
        await db.insert(items).values(chunk).run();
      }
    },
    async updateItem(id, patch) {
      const p = { ...patch, updatedAt: now };
      if (p.checked && p.checkedAt == null) p.checkedAt = now;
      await db.update(items).set(p).where(eq(items.id, id)).run();
    },
    async upsertRecurring(r) {
      const row = { supplierId: r.supplierId, days: r.days, time: r.time, preAlertMin: r.preAlertMin, lastFiredDate: r.lastFiredDate, lastPreFiredDate: r.lastPreFiredDate, updatedAt: now, deletedAt: null };
      await db.insert(remRecurring).values(row).onConflictDoUpdate({ target: remRecurring.supplierId, set: { ...row } }).run();
    },
    async insertOneOffs(rows) {
      for (let i = 0; i < rows.length; i += 60) {
        await db.insert(remOneoff).values(rows.slice(i, i + 60).map((o) => ({
          id: o.id, supplierId: o.supplierId, ts: o.ts, preAlertMin: o.preAlertMin, firedAt: o.firedAt, preFiredAt: o.preFiredAt, updatedAt: now,
        }))).run();
      }
    },
    async replaceProducts(rows) {
      await db.run('DELETE FROM nota_products');
      for (let i = 0; i < rows.length; i += 80) {
        await db.insert(notaProducts).values(rows.slice(i, i + 80).map((r) => ({
          nama: r.nama, kode: r.kode || null, barcode: r.barcode || null, satuan: r.satuan, satClass: r.satClass, hargaJual: r.hargaJual, hargaPokok: r.hargaPokok,
        }))).run();
      }
      await db.insert(notaMeta).values({ key: 'db_version', value: String(now) }).onConflictDoUpdate({ target: notaMeta.key, set: { value: String(now) } }).run();
    },
    async upsertLearn(rows) {
      for (const r of rows) {
        await db.insert(notaLearn).values({ kunci: r.kunci, nilai: r.nilai, updatedAt: now, deletedAt: null })
          .onConflictDoUpdate({ target: notaLearn.kunci, set: { nilai: r.nilai, updatedAt: now, deletedAt: null } }).run();
      }
    },
    async insertHist(rows) {
      for (let i = 0; i < rows.length; i += 40) {
        await db.insert(notaHist).values(rows.slice(i, i + 40).map((r) => ({
          id: r.id, num: r.num, dateStr: r.dateStr, timeStr: r.timeStr, ket: r.ket, total: r.total, savedAt: r.savedAt,
          lines: r.lines, createdBy: null, updatedAt: now, deletedAt: null,
        }))).run();
      }
    },
    async writePnlDay(ds, data) { await upsertDay(ds, data, now); },
    async writeArsipDate(ds, entries) { await writeArsipDate(ds, entries); },
    async insertLogs(rows) {
      for (let i = 0; i < rows.length; i += LOG_CHUNK) {
        const chunk = rows.slice(i, i + LOG_CHUNK).map((r) => ({
          id: r.id, itemId: r.itemId, supplierId: r.supplierId, tanggal: r.tanggal, hargaBeli: r.hargaBeli,
          unit: r.unit, ts: r.ts, createdBy: null, updatedAt: now,
        }));
        await db.insert(priceLog).values(chunk).run();
      }
    },
  };
}

// Penghubung backup.js ke database tgcloud: membaca keadaan sekarang dan menulis
// rencana. Insert di-chunk karena batas variabel SQLite (baris x kolom).
import { db } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { categories, suppliers, items, priceLog, remRecurring, remOneoff } from '../schema.js';

const ITEM_CHUNK = 40;  // 13 kolom
const LOG_CHUNK = 60;   // 9 kolom

export async function loadExisting() {
  const [cats, sups, its, logs, recs, ones] = await Promise.all([
    db.select().from(categories).all(),
    db.select().from(suppliers).all(),
    db.select().from(items).all(),
    db.select({ id: priceLog.id }).from(priceLog).all(),
    db.select().from(remRecurring).all(),
    db.select({ id: remOneoff.id }).from(remOneoff).all(),
  ]);
  return { categories: cats, suppliers: sups, items: its, priceLogIds: logs.map((l) => l.id), remRecurring: recs, remOneoffIds: ones.map((o) => o.id) };
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

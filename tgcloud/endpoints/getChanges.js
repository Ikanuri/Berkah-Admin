// Polling delta. Klien kirim since (ms) = serverTime terakhir dikurangi sedikit
// overlap; balasan hanya baris yang berubah (termasuk tombstone deletedAt).
import { db } from 'sdk';
import { gt, eq, and, desc } from 'sdk/db';
import { items, categories, suppliers, priceLog, activityLog, users, remRecurring, remOneoff, workerItems, receipts } from '../schema.js';
import { runTick } from '../lib/remind-server.js';
import { latestActivity, visibleActivity } from '../lib/activity.js';
import { requireRole } from '../lib/auth.js';
import { shapeItemFor, canSeeSuppliers } from '../lib/shape.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss', 'worker');
  const since = Number(input?.since) || 0;
  const serverTime = Date.now();

  // Karyawan hanya menerima daftar pribadinya dan setorannya sendiri; daftar Bos tidak pernah dikirim.
  if (u.role === 'worker') {
    const out = {
      serverTime,
      workerItems: await db.select().from(workerItems).where(and(eq(workerItems.ownerId, u.tgId), gt(workerItems.updatedAt, since))).all(),
      receipts: await db.select().from(receipts).where(and(eq(receipts.workerId, u.tgId), gt(receipts.updatedAt, since))).orderBy(desc(receipts.updatedAt)).limit(60).all(),
    };
    if (input?.tick) { try { await runTick(); } catch { /* abaikan */ } }
    return out;
  }

  const cats = await db.select().from(categories).where(gt(categories.updatedAt, since)).all();
  const rows = await db.select().from(items).where(gt(items.updatedAt, since)).all();
  const out = { serverTime, categories: cats, items: rows.map((r) => shapeItemFor(u.role, r)) };

  // Setoran: muat awal = yang menunggu + 30 hari terakhir; sesudahnya hanya yang berubah.
  if (since === 0) {
    const pending = await db.select().from(receipts).where(eq(receipts.status, 'pending')).all();
    const recent = await db.select().from(receipts).where(gt(receipts.updatedAt, serverTime - 30 * 86400000)).all();
    out.receipts = [...new Map([...pending, ...recent].map((r) => [r.id, r])).values()];
  } else {
    out.receipts = await db.select().from(receipts).where(gt(receipts.updatedAt, since)).all();
  }

  // Jejak aktivitas terakhir (skRenderLastAct): 30 baris terbaru cukup untuk
  // menemukan satu yang bisa dideskripsikan.
  const recent = await db.select().from(activityLog).orderBy(desc(activityLog.id)).limit(30).all();
  const last = latestActivity(visibleActivity(u.role, recent));
  if (last) {
    const who = await db.select().from(users).where(eq(users.tgId, last.tgId)).get();
    out.lastAct = { ts: last.ts, desc: last.desc, by: who ? who.name : null };
  }

  // Tick pengingat ikut jalan saat klien (peran apa pun) menandai tick:true,
  // sekitar tiap menit. Gagal tidak boleh merusak sinkronisasi.
  if (input?.tick) {
    try {
      const t = await runTick();
      if (u.role === 'boss' && t.fired.length) out.alerts = t.fired;
    } catch { /* abaikan */ }
  }

  if (canSeeSuppliers(u.role)) {
    out.suppliers = await db.select().from(suppliers).where(gt(suppliers.updatedAt, since)).all();
    out.priceLog = await db.select().from(priceLog).where(gt(priceLog.updatedAt, since)).all();
    out.remRecurring = await db.select().from(remRecurring).where(gt(remRecurring.updatedAt, since)).all();
    out.remOneoff = await db.select().from(remOneoff).where(gt(remOneoff.updatedAt, since)).all();
  }
  return out;
}

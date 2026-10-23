// Polling delta. Klien kirim since (ms) = serverTime terakhir dikurangi sedikit
// overlap; balasan hanya baris yang berubah (termasuk tombstone deletedAt).
import { db } from 'sdk';
import { gt, eq, desc } from 'sdk/db';
import { items, categories, suppliers, priceLog, activityLog, users, remRecurring, remOneoff } from '../schema.js';
import { runTick } from '../lib/remind-server.js';
import { latestActivity, visibleActivity } from '../lib/activity.js';
import { requireRole } from '../lib/auth.js';
import { shapeItemFor, canSeeSuppliers } from '../lib/shape.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss', 'worker');
  const since = Number(input?.since) || 0;
  const serverTime = Date.now();

  const cats = await db.select().from(categories).where(gt(categories.updatedAt, since)).all();
  const rows = await db.select().from(items).where(gt(items.updatedAt, since)).all();
  const out = { serverTime, categories: cats, items: rows.map((r) => shapeItemFor(u.role, r)) };

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

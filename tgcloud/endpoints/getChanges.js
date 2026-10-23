// Polling delta. Klien kirim since (ms) = serverTime terakhir dikurangi sedikit
// overlap; balasan hanya baris yang berubah (termasuk tombstone deletedAt).
import { db } from 'sdk';
import { gt } from 'sdk/db';
import { items, categories, suppliers, priceLog } from '../schema.js';
import { requireRole } from '../lib/auth.js';
import { shapeItemFor, canSeeSuppliers } from '../lib/shape.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss', 'worker');
  const since = Number(input?.since) || 0;
  const serverTime = Date.now();

  const cats = await db.select().from(categories).where(gt(categories.updatedAt, since)).all();
  const rows = await db.select().from(items).where(gt(items.updatedAt, since)).all();
  const out = { serverTime, categories: cats, items: rows.map((r) => shapeItemFor(u.role, r)) };

  if (canSeeSuppliers(u.role)) {
    out.suppliers = await db.select().from(suppliers).where(gt(suppliers.updatedAt, since)).all();
    out.priceLog = await db.select().from(priceLog).where(gt(priceLog.updatedAt, since)).all();
  }
  return out;
}

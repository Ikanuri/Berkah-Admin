import { db, EndpointError } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { priceLog } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const e = await db.select().from(priceLog).where(and(eq(priceLog.id, input?.id), isNull(priceLog.deletedAt))).get();
  if (!e) throw new EndpointError('Entri tidak ditemukan');
  const now = Date.now();
  await db.update(priceLog).set({ deletedAt: now, updatedAt: now }).where(eq(priceLog.id, e.id)).run();
  await logActivity(u.tgId, 'deletePriceEntry', { id: e.id, itemId: e.itemId });
  return { ok: true };
}

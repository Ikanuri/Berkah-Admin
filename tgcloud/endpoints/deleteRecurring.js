import { db } from 'sdk';
import { eq } from 'sdk/db';
import { remRecurring } from '../schema.js';
import { requireRole } from '../lib/auth.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  const now = Date.now();
  await db.update(remRecurring).set({ deletedAt: now, updatedAt: now }).where(eq(remRecurring.supplierId, input?.supplierId)).run();
  return { ok: true };
}

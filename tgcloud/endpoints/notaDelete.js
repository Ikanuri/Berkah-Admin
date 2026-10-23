import { db } from 'sdk';
import { eq } from 'sdk/db';
import { notaHist } from '../schema.js';
import { requireRole } from '../lib/auth.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  const now = Date.now();
  await db.update(notaHist).set({ deletedAt: now, updatedAt: now }).where(eq(notaHist.id, String(input?.id ?? ''))).run();
  return { ok: true };
}

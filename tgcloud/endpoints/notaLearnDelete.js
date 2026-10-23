import { db } from 'sdk';
import { eq } from 'sdk/db';
import { notaLearn } from '../schema.js';
import { requireRole } from '../lib/auth.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  const now = Date.now();
  await db.update(notaLearn).set({ deletedAt: now, updatedAt: now }).where(eq(notaLearn.kunci, String(input?.kunci ?? ''))).run();
  return { ok: true };
}

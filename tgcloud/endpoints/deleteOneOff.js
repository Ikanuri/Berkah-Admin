import { db } from 'sdk';
import { eq } from 'sdk/db';
import { remOneoff } from '../schema.js';
import { requireRole } from '../lib/auth.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  const now = Date.now();
  await db.update(remOneoff).set({ deletedAt: now, updatedAt: now }).where(eq(remOneoff.id, input?.id)).run();
  return { ok: true };
}

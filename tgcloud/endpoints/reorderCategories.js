import { db } from 'sdk';
import { eq } from 'sdk/db';
import { categories } from '../schema.js';
import { requireRole } from '../lib/auth.js';
import { getCategory } from '../lib/store.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  const ids = Array.isArray(input?.ids) ? input.ids : [];
  const now = Date.now();
  for (let i = 0; i < ids.length; i++) {
    const c = await getCategory(ids[i]);
    await db.update(categories).set({ sortOrder: i + 1, updatedAt: now }).where(eq(categories.id, c.id)).run();
  }
  return { ok: true };
}

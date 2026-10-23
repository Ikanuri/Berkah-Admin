// skDeleteCat: minimal 1 kategori tersisa; barang di dalamnya ikut dihapus (tombstone).
import { db, EndpointError } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { categories, items } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { getCategory } from '../lib/store.js';
import { canDeleteCategory } from '../lib/rules.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const cat = await getCategory(input?.id);
  const active = await db.$count(categories, isNull(categories.deletedAt));
  if (!canDeleteCategory(active)) throw new EndpointError('Minimal 1 kategori!');
  const now = Date.now();
  await db.update(items).set({ deletedAt: now, updatedAt: now })
    .where(and(eq(items.categoryId, cat.id), isNull(items.deletedAt))).run();
  await db.update(categories).set({ deletedAt: now, updatedAt: now }).where(eq(categories.id, cat.id)).run();
  await logActivity(u.tgId, 'deleteCategory', { id: cat.id, name: cat.name });
  return { ok: true };
}

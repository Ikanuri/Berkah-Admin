// Hapus semua barang (tombstone), satu kategori atau semuanya. Khusus Bos.
import { db } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { items } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { getCategory } from '../lib/store.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  let cat = null;
  let where = isNull(items.deletedAt);
  if (input?.categoryId != null) {
    cat = await getCategory(input.categoryId);
    where = and(where, eq(items.categoryId, cat.id));
  }
  const now = Date.now();
  const rows = await db.select().from(items).where(where).all();
  for (const it of rows) {
    await db.update(items).set({ deletedAt: now, updatedAt: now }).where(eq(items.id, it.id)).run();
  }
  await logActivity(u.tgId, 'clearItems', { category: cat ? cat.name : null, n: rows.length });
  return { deleted: rows.length };
}

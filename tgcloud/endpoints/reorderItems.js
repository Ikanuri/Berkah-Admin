// skReorder: urutan manual dalam satu kategori. input.ids = urutan baru.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { items } from '../schema.js';
import { requireRole } from '../lib/auth.js';
import { getItem } from '../lib/store.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss', 'worker');
  const ids = Array.isArray(input?.ids) ? input.ids : [];
  const now = Date.now();
  for (let i = 0; i < ids.length; i++) {
    const it = await getItem(ids[i]);
    if (it.categoryId !== input.categoryId) continue; // jangan pindah antar kategori
    await db.update(items).set({ sortOrder: i + 1, updatedAt: now }).where(eq(items.id, it.id)).run();
  }
  return { ok: true };
}

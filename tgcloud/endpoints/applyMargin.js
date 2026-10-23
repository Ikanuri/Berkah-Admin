// Terapkan margin massal ke Harga Jual. categoryId kosong = semua kategori. Khusus Bos.
import { db, EndpointError } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { items } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { getCategory } from '../lib/store.js';
import { bulkMargin } from '../lib/rules.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const mode = input?.mode === 'pct' ? 'pct' : 'rp';
  const value = Number(input?.value);
  if (!isFinite(value)) throw new EndpointError('Nilai margin tidak valid');
  let where = isNull(items.deletedAt);
  if (input.categoryId != null) {
    const cat = await getCategory(input.categoryId);
    where = and(where, eq(items.categoryId, cat.id));
  }
  const rows = await db.select().from(items).where(where).all();
  const { updates, skipped, invalid } = bulkMargin(rows, { mode, value });
  const now = Date.now();
  for (const up of updates) {
    await db.update(items).set({ hargaJual: up.hargaJual, updatedAt: now }).where(eq(items.id, up.id)).run();
  }
  await logActivity(u.tgId, 'applyMargin', { mode, value, categoryId: input.categoryId ?? null, updated: updates.length, skipped, invalid });
  return { updated: updates.length, skipped, invalid };
}

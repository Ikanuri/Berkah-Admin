// Buat (tanpa id) atau ubah (nama / excludeFromOrder) kategori.
import { db, EndpointError } from 'sdk';
import { eq, isNull } from 'sdk/db';
import { categories } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { getCategory } from '../lib/store.js';
import { normName } from '../lib/rules.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const all = await db.select().from(categories).where(isNull(categories.deletedAt)).all();
  const now = Date.now();
  const name = typeof input?.name === 'string' ? input.name.trim() : null;
  if (name != null && !name) throw new EndpointError('Nama kategori kosong');
  if (name != null && all.some((c) => c.id !== input.id && normName(c.name) === normName(name))) {
    throw new EndpointError('Kategori sudah ada', { name });
  }
  if (input.id == null) {
    if (!name) throw new EndpointError('Nama kategori kosong');
    const order = all.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
    await db.insert(categories).values({ name, sortOrder: order, updatedAt: now }).run();
    await logActivity(u.tgId, 'addCategory', { name });
    return { ok: true };
  }
  const cat = await getCategory(input.id);
  const patch = {};
  if (name != null) patch.name = name;
  if (input.excludeFromOrder != null) {
    if (u.role !== 'boss') throw new EndpointError('Hanya Bos yang boleh mengubah filter order');
    patch.excludeFromOrder = !!input.excludeFromOrder;
  }
  await db.update(categories).set({ ...patch, updatedAt: now }).where(eq(categories.id, cat.id)).run();
  await logActivity(u.tgId, 'saveCategory', { id: cat.id, patch });
  return { ok: true };
}

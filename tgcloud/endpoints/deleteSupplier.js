// Soft delete: supplier hilang dari pilihan, riwayat harga TETAP (ledger).
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { suppliers } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { getSupplier } from '../lib/store.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const s = await getSupplier(input?.id);
  const now = Date.now();
  await db.update(suppliers).set({ deletedAt: now, updatedAt: now }).where(eq(suppliers.id, s.id)).run();
  await logActivity(u.tgId, 'deleteSupplier', { id: s.id, name: s.name });
  return { ok: true };
}

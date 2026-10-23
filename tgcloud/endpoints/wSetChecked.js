// Karyawan: "Centang Semua" (tandai semua sudah diambil) atau batalkan semua.
import { db } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { workerItems } from '../schema.js';
import { requireRole } from '../lib/auth.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'worker');
  const checked = !!input?.checked;
  const rows = await db.select().from(workerItems)
    .where(and(eq(workerItems.ownerId, u.tgId), isNull(workerItems.deletedAt))).all();
  const now = Date.now();
  let n = 0;
  for (const it of rows) {
    if (it.checked === checked) continue;
    await db.update(workerItems).set({ checked, checkedAt: checked ? now : null, updatedAt: now }).where(eq(workerItems.id, it.id)).run();
    n++;
  }
  return { changed: n };
}

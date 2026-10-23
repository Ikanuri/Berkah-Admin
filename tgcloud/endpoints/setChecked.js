// Centang / batalkan massal. categoryId kosong = semua kategori.
// Khusus Bos. (Karyawan punya daftar sendiri: wSetChecked.)
import { db, EndpointError } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { items } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { getCategory } from '../lib/store.js';

export default async function (input, ctx) {
  const checked = !!input?.checked;
  const allCats = input?.categoryId == null;
  const u = await requireRole(ctx, 'boss');
  let cat = null;
  let where = isNull(items.deletedAt);
  if (!allCats) {
    cat = await getCategory(input.categoryId);
    where = and(where, eq(items.categoryId, cat.id));
  }
  const rows = await db.select().from(items).where(where).all();
  const now = Date.now();
  let n = 0;
  for (const it of rows) {
    if (it.checked === checked) continue;
    await db.update(items).set({ checked, checkedAt: checked ? now : null, updatedAt: now }).where(eq(items.id, it.id)).run();
    n++;
  }
  if (n) await logActivity(u.tgId, checked ? 'checkAll' : 'uncheckAll', { category: cat ? cat.name : null, n });
  return { changed: n };
}

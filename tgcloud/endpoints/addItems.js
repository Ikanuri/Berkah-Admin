// skAddItems: tempel teks "qty satuan nama" per baris. Nama sama (skNorm) di
// kategori itu = perbarui qty/satuan, bukan dobel.
import { db, EndpointError } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { items } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { getCategory } from '../lib/store.js';
import { parseLine, normName, mergeAddLine } from '../lib/rules.js';
import { makeId, validClientId } from '../lib/id.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const cat = await getCategory(input?.categoryId);
  const lines = String(input?.text ?? '').split('\n').map(parseLine).filter(Boolean);
  if (!lines.length) throw new EndpointError('Tidak ada baris valid');

  const existing = await db.select().from(items)
    .where(and(eq(items.categoryId, cat.id), isNull(items.deletedAt))).all();
  const byName = new Map(existing.map((i) => [normName(i.name), i]));
  let nextOrder = existing.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 1;
  const now = Date.now();
  const clientIds = Array.isArray(input?.ids) ? input.ids : []; // id buatan klien untuk baris BARU (urut), supaya UI instan cocok
  let added = 0, updated = 0, k = 0;

  for (const line of lines) {
    const key = normName(line.name);
    const m = mergeAddLine(byName.get(key), line, true, now);
    if (m.kind === 'new') {
      const cid = clientIds[k++];
      const row = {
        id: validClientId(cid) ? cid : makeId(), categoryId: cat.id, name: line.name, qty: line.qty, unit: line.unit,
        checked: false, checkedAt: null, sortOrder: nextOrder++, updatedAt: now,
      };
      await db.insert(items).values(row).run();
      byName.set(key, row);
      added++;
    } else {
      const cur = byName.get(key);
      await db.update(items).set({ ...m.patch, updatedAt: now }).where(eq(items.id, cur.id)).run();
      updated++;
    }
  }
  await logActivity(u.tgId, 'addItems', { category: cat.name, added, updated });
  return { added, updated };
}

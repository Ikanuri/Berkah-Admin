// Karyawan: tempel baris "qty satuan nama" ke daftar pribadinya (halaman Penerimaan).
// Nama sama = perbarui qty/satuan dan reset centang. ids (opsional): id dari klien untuk baris baru,
// supaya tampilan instan klien cocok dengan baris di server.
import { db, EndpointError } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { workerItems } from '../schema.js';
import { requireRole } from '../lib/auth.js';
import { parseLine, normName } from '../lib/rules.js';
import { mergeWorkerLine } from '../lib/receipts.js';
import { makeId, validClientId } from '../lib/id.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'worker');
  const lines = String(input?.text ?? '').split('\n').map(parseLine).filter(Boolean);
  if (!lines.length) throw new EndpointError('Tidak ada baris valid');
  if (lines.length > 300) throw new EndpointError('Maksimal 300 baris sekali tempel');
  const existing = await db.select().from(workerItems)
    .where(and(eq(workerItems.ownerId, u.tgId), isNull(workerItems.deletedAt))).all();
  const byName = new Map(existing.map((i) => [normName(i.name), i]));
  let nextOrder = existing.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 1;
  const now = Date.now();
  const clientIds = Array.isArray(input?.ids) ? input.ids : [];
  let added = 0, updated = 0, k = 0;
  for (const line of lines) {
    const key = normName(line.name);
    const m = mergeWorkerLine(byName.get(key), line, now);
    if (m.kind === 'new') {
      const cid = clientIds[k++];
      const row = {
        id: validClientId(cid) ? cid : makeId(), ownerId: u.tgId, name: line.name, qty: line.qty, unit: line.unit,
        checked: false, checkedAt: null, sortOrder: nextOrder++, updatedAt: now,
      };
      await db.insert(workerItems).values(row).run();
      byName.set(key, row);
      added++;
    } else {
      const cur = byName.get(key);
      await db.update(workerItems).set({ ...m.patch, updatedAt: now }).where(eq(workerItems.id, cur.id)).run();
      updated++;
    }
  }
  return { added, updated };
}

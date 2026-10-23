// Input Harga: satu sesi untuk satu supplier + tanggal. Hanya nilai > 0 dicatat.
// Tiap harga: tambah baris price_log DAN timpa Harga Beli barang (harga
// terakhir diinput = acuan HPP, tanpa syarat).
import { db, EndpointError } from 'sdk';
import { requireRole, logActivity } from '../lib/auth.js';
import { getItem, getSupplier, touchItem } from '../lib/store.js';
import { applySupplierPrice } from '../lib/rules.js';
import { priceLog } from '../schema.js';
import { makeId } from '../lib/id.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const sup = await getSupplier(input?.supplierId);
  const tanggal = String(input?.tanggal ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new EndpointError('Tanggal tidak valid', { tanggal });
  const list = Array.isArray(input?.prices) ? input.prices : [];
  const now = Date.now();
  let n = 0;
  for (const p of list) {
    const it = await getItem(p.itemId);
    const r = applySupplierPrice(it, p.hargaBeli);
    if (!r) continue;
    await db.insert(priceLog).values({
      id: makeId(), itemId: it.id, supplierId: sup.id, tanggal,
      hargaBeli: Number(p.hargaBeli), unit: r.unit, ts: now, createdBy: u.tgId, updatedAt: now,
    }).run();
    await touchItem(it.id, r.patch, now);
    n++;
  }
  await logActivity(u.tgId, 'savePrices', { supplier: sup.name, tanggal, n });
  return { saved: n };
}

// Karyawan: ubah qty (mutlak atau delta) / satuan barang di daftar pribadinya.
import { EndpointError } from 'sdk';
import { requireRole } from '../lib/auth.js';
import { getOwnItem, touchWorkerItem } from '../lib/worker-store.js';
import { adjustQty, setQty } from '../lib/rules.js';
import { UNITS } from '../lib/units.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'worker');
  const it = await getOwnItem(input?.id, u.tgId);
  const patch = {};
  if (input.qty != null) {
    const q = setQty(input.qty);
    if (q == null) throw new EndpointError('Qty harus lebih dari 0');
    patch.qty = q;
  } else if (input.delta != null) {
    patch.qty = adjustQty(it.qty, Number(input.delta));
  }
  if (input.unit != null) {
    if (!UNITS.includes(input.unit)) throw new EndpointError('Satuan tidak dikenal', { unit: input.unit });
    patch.unit = input.unit;
  }
  if (!Object.keys(patch).length) return { ok: true };
  await touchWorkerItem(it.id, patch, Date.now());
  return { ok: true, ...patch };
}

// Ubah nama / qty (mutlak atau delta) / satuan. Boleh Bos dan Karyawan.
import { EndpointError } from 'sdk';
import { requireRole, logActivity } from '../lib/auth.js';
import { getItem, touchItem } from '../lib/store.js';
import { adjustQty, setQty } from '../lib/rules.js';
import { UNITS } from '../lib/units.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss', 'worker');
  const it = await getItem(input?.id);
  const patch = {};
  if (typeof input.name === 'string') {
    const name = input.name.trim();
    if (!name) throw new EndpointError('Nama kosong');
    patch.name = name;
  }
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
  await touchItem(it.id, patch, Date.now());
  await logActivity(u.tgId, 'updateItem', { id: it.id, name: it.name, patch });
  return { ok: true, ...patch };
}

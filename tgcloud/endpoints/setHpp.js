// Isi/satuan HPP, Harga Beli, Harga Jual per barang. Khusus Bos.
import { EndpointError } from 'sdk';
import { requireRole, logActivity } from '../lib/auth.js';
import { getItem, touchItem } from '../lib/store.js';
import { round } from '../lib/money.js';

const num = (v) => (v == null || v === '' ? null : round(Number(v), 6));

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const it = await getItem(input?.id);
  const patch = {};
  for (const f of ['isi', 'hargaBeli', 'hargaJual']) {
    if (f in input) {
      const v = num(input[f]);
      if (v != null && !(v > 0)) throw new EndpointError('Nilai harus lebih dari 0', { field: f });
      patch[f] = v; // presisi disimpan penuh; pembulatan hanya saat tampil
    }
  }
  if ('satuanHpp' in input) patch.satuanHpp = input.satuanHpp || null;
  await touchItem(it.id, patch, Date.now());
  await logActivity(u.tgId, 'setHpp', { id: it.id, name: it.name, patch });
  return { ok: true };
}

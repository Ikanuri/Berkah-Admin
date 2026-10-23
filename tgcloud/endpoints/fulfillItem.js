// Terima barang (pengganti skProcessReply): pemenuhan sebagian.
import { EndpointError } from 'sdk';
import { requireRole, logActivity } from '../lib/auth.js';
import { getItem, touchItem } from '../lib/store.js';
import { fulfill } from '../lib/rules.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss', 'worker');
  const it = await getItem(input?.id);
  const now = Date.now();
  const r = fulfill(it, input?.received, now);
  if (!r) throw new EndpointError('Jumlah diterima harus lebih dari 0');
  await touchItem(it.id, r.patch, now);
  await logActivity(u.tgId, 'fulfill', { id: it.id, name: it.name, received: Number(input.received), status: r.status });
  return { ok: true, status: r.status, ...r.patch };
}

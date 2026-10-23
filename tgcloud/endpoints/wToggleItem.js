// Karyawan: centang = sudah diambil.
import { requireRole } from '../lib/auth.js';
import { getOwnItem, touchWorkerItem } from '../lib/worker-store.js';
import { toggle } from '../lib/rules.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'worker');
  const it = await getOwnItem(input?.id, u.tgId);
  const now = Date.now();
  const { patch } = toggle(it, now);
  await touchWorkerItem(it.id, patch, now);
  return { ok: true, ...patch };
}

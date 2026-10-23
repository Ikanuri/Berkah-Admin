import { requireRole, logActivity } from '../lib/auth.js';
import { getItem, touchItem } from '../lib/store.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const it = await getItem(input?.id);
  const now = Date.now();
  await touchItem(it.id, { deletedAt: now }, now);
  await logActivity(u.tgId, 'deleteItem', { id: it.id, name: it.name });
  return { ok: true };
}

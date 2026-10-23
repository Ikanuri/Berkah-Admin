// skToggle: centang <-> batal. Dibatalkan oleh Bos dicatat di activity_log
// sebagai 'unchecked' (menggantikan skState.log yang berupa teks).
import { requireRole, logActivity } from '../lib/auth.js';
import { getItem, touchItem } from '../lib/store.js';
import { toggle } from '../lib/rules.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const it = await getItem(input?.id);
  const now = Date.now();
  const { patch, logged } = toggle(it, now);
  await touchItem(it.id, patch, now);
  await logActivity(u.tgId, patch.checked ? 'check' : 'uncheck', {
    id: it.id, name: it.name, qty: it.qty, unit: it.unit, receivedLog: logged && u.role === 'boss',
  });
  return { ok: true, ...patch };
}

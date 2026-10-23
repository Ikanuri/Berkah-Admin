// Atur jadwal mingguan satu supplier (upsert). Khusus Bos.
import { db, EndpointError } from 'sdk';
import { remRecurring } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { getSupplier } from '../lib/store.js';
import { validateRecurring, initialFired } from '../lib/reminders.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const sup = await getSupplier(input?.supplierId);
  let spec;
  try { spec = validateRecurring(input); } catch (e) { throw new EndpointError(e.message); }
  const now = Date.now();
  const row = { supplierId: sup.id, ...spec, ...initialFired(spec, now), updatedAt: now, deletedAt: null };
  await db.insert(remRecurring).values(row)
    .onConflictDoUpdate({ target: remRecurring.supplierId, set: { ...row } }).run();
  await logActivity(u.tgId, 'saveRecurring', { supplier: sup.name, days: spec.days, time: spec.time });
  return { ok: true };
}

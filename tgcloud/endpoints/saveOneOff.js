// Tambah pengingat sekali-jadwal. input.ts = epoch ms (jam toko sudah dikonversi klien).
import { db, EndpointError } from 'sdk';
import { remOneoff } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { getSupplier } from '../lib/store.js';
import { validateOneOff } from '../lib/reminders.js';
import { fmtShopDT } from '../lib/time.js';
import { makeId } from '../lib/id.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const sup = await getSupplier(input?.supplierId);
  let spec;
  try { spec = validateOneOff(input); } catch (e) { throw new EndpointError(e.message); }
  const now = Date.now();
  await db.insert(remOneoff).values({ id: makeId(), supplierId: sup.id, ...spec, firedAt: null, preFiredAt: null, updatedAt: now }).run();
  await logActivity(u.tgId, 'saveOneOff', { supplier: sup.name, when: fmtShopDT(spec.ts) });
  return { ok: true };
}

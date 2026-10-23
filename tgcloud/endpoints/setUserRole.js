// Bos menyetujui / mengubah peran. Peran di BOSS_IDS tidak bisa diturunkan.
import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { BOSS_IDS } from '../lib/config.js';

const ROLES = ['boss', 'worker', 'pending'];

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  if (!ROLES.includes(input?.role)) throw new EndpointError('Peran tidak valid');
  if (BOSS_IDS.includes(input.tgId) && input.role !== 'boss') {
    throw new EndpointError('Bos utama tidak bisa diturunkan');
  }
  await db.update(users).set({ role: input.role, updatedAt: Date.now() }).where(eq(users.tgId, input.tgId)).run();
  await logActivity(u.tgId, 'setUserRole', { target: input.tgId, role: input.role });
  return { ok: true };
}

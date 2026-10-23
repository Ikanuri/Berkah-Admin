// Ingat pilihan manual (berlaku untuk semua pengguna Nota).
import { db, EndpointError } from 'sdk';
import { notaLearn } from '../schema.js';
import { requireRole } from '../lib/auth.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  const kunci = String(input?.kunci ?? '').trim().slice(0, 300);
  const nilai = String(input?.nilai ?? '').trim().slice(0, 300);
  if (!kunci || !nilai) throw new EndpointError('Kunci dan nilai wajib');
  const now = Date.now();
  await db.insert(notaLearn).values({ kunci, nilai, updatedAt: now, deletedAt: null })
    .onConflictDoUpdate({ target: notaLearn.kunci, set: { nilai, updatedAt: now, deletedAt: null } }).run();
  return { ok: true };
}

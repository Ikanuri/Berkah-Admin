// Hapus satu hari dari riwayat analisis. Arsip tanggal itu TIDAK ikut terhapus (sengaja).
import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { pnlDays } from '../schema.js';
import { requireRole } from '../lib/auth.js';
import { canonDate } from '../lib/pnl.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  const ds = canonDate(input?.ds);
  if (!ds) throw new EndpointError('Tanggal tidak valid');
  await db.delete(pnlDays).where(eq(pnlDays.tanggal, ds)).run();
  return { ok: true };
}

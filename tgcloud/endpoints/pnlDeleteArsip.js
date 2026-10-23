// Hapus arsip satu tanggal, atau semuanya bila ds kosong dan all=true.
import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { pnlArsip } from '../schema.js';
import { requireRole } from '../lib/auth.js';
import { canonDate } from '../lib/pnl.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  if (input?.all === true) { await db.run('DELETE FROM pnl_arsip'); return { ok: true }; }
  const ds = canonDate(input?.ds);
  if (!ds) throw new EndpointError('Tanggal tidak valid');
  await db.delete(pnlArsip).where(eq(pnlArsip.tanggal, ds)).run();
  return { ok: true };
}

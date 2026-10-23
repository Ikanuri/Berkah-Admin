// Karyawan menekan "Setor": barang yang dicentang (sudah diambil) menjadi satu setoran
// untuk Bos dan keluar dari daftar karyawan. Klaim per barang bersyarat (UPDATE ... WHERE
// deleted_at IS NULL), jadi ketukan ganda/dua perangkat tidak membuat setoran kembar.
import { db, EndpointError } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { workerItems, receipts } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { cleanReceiptLines } from '../lib/receipts.js';
import { notifyBosses, claimWorkerItem } from '../lib/worker-store.js';
import { makeId } from '../lib/id.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'worker');
  const rows = (await db.select().from(workerItems)
    .where(and(eq(workerItems.ownerId, u.tgId), isNull(workerItems.deletedAt))).orderBy(workerItems.sortOrder).all())
    .filter((r) => r.checked);
  if (!rows.length) throw new EndpointError('Tidak ada barang yang dicentang');
  const now = Date.now();

  const claimed = [];
  for (const r of rows) {
    if (await claimWorkerItem(r.id, u.tgId, now)) claimed.push(r);
  }
  if (!claimed.length) throw new EndpointError('Setoran sudah terkirim');

  let lines;
  try { lines = cleanReceiptLines(claimed.map((r) => ({ name: r.name, qty: r.qty, unit: r.unit }))); } catch (e) {
    for (const r of claimed) await db.update(workerItems).set({ deletedAt: null, updatedAt: Date.now() }).where(eq(workerItems.id, r.id)).run();
    throw new EndpointError(e.message);
  }
  const id = makeId();
  try {
    await db.insert(receipts).values({
      id, workerId: u.tgId, workerName: u.name, status: 'pending', lines, submittedAt: now, updatedAt: now,
    }).run();
  } catch (e) {
    // gagal menyimpan: kembalikan barang ke daftar supaya tidak hilang
    for (const r of claimed) await db.update(workerItems).set({ deletedAt: null, updatedAt: Date.now() }).where(eq(workerItems.id, r.id)).run();
    throw e;
  }
  await logActivity(u.tgId, 'receiptSubmit', { worker: u.name, n: lines.length });
  const sent = await notifyBosses(`📥 Setoran dari ${u.name}: ${lines.length} barang. Buka app → Stok → Penerimaan untuk meninjau dan menyetujui.`);
  return { id, count: lines.length, notified: sent.delivered };
}

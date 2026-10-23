// Dijalankan SAAT DEPLOY lewat `tgcloud run` (disalin sementara ke tgcloud/endpoints/).
// Menguji jalur DB Penerimaan di database tgcloud SUNGGUHAN dengan data berlabel unik yang
// tidak terlihat klien mana pun: pemilik -1, status 'testpending' (bukan 'pending'), updated_at = 1.
// Dibersihkan di akhir. Memakai fungsi klaim YANG SAMA dengan endpoint produksi.
import { db } from 'sdk';
import { eq, like } from 'sdk/db';
import { workerItems, receipts } from '../schema.js';
import { claimWorkerItem, claimReceipt } from '../lib/worker-store.js';
import { planReceipt } from '../lib/receipts.js';

function check(cond, msg) { if (!cond) throw new Error('CLOUD-TEST GAGAL: ' + msg); }

export default async function () {
  const tag = '__cit' + Date.now().toString(36) + '_';
  try {
    // daftar karyawan: simpan, klaim bersyarat (centang saja, sekali saja)
    const base = { ownerId: -1, name: tag + 'A', qty: 2.5, unit: 'dus', checked: true, checkedAt: 5, sortOrder: 1, updatedAt: 1 };
    await db.insert(workerItems).values([{ id: tag + 'i1', ...base }, { id: tag + 'i2', ...base, name: tag + 'B', checked: false }]).run();
    const own = await db.select().from(workerItems).where(like(workerItems.id, tag + '%')).all();
    check(own.length === 2 && own.find((r) => r.id === tag + 'i1').checked === true && own.find((r) => r.id === tag + 'i1').qty === 2.5, 'baris daftar karyawan tersimpan');
    check(await claimWorkerItem(tag + 'i1', -1, 10) === true, 'klaim pertama menang');
    check(await claimWorkerItem(tag + 'i1', -1, 11) === false, 'klaim kedua kalah (sudah terklaim)');
    check(await claimWorkerItem(tag + 'i2', -1, 12) === false, 'barang tak tercentang tidak bisa diklaim');
    check(await claimWorkerItem(tag + 'i1', -2, 13) === false, 'bukan pemilik tidak bisa mengklaim');

    // setoran: lines json, klaim keputusan atomik dengan balapan nyata, hasil json utuh
    const lines = [{ name: 'Zeta', qty: 5, unit: 'dus' }, { name: 'Kopi', qty: 1, unit: 'pak' }];
    await db.insert(receipts).values({ id: tag + 'r', workerId: -1, workerName: 'uji', status: 'testpending', lines, submittedAt: 1, updatedAt: 1 }).run();
    const plan = planReceipt([{ id: 'x', name: 'Zeta', qty: 6, unit: 'dus', checked: true }], lines, 99);
    const result = { effects: plan.effects, unmatched: plan.unmatched, applied: false };
    const racers = await Promise.all([1, 2, 3, 4].map((u) => claimReceipt({ id: tag + 'r', from: 'testpending', to: 'approved', now: 100 + u, by: u, note: 'n' + u, result })));
    const winners = racers.filter(Boolean).length;
    check(winners === 1, 'tepat satu pemenang klaim, dapat: ' + winners);
    const row = await db.select().from(receipts).where(eq(receipts.id, tag + 'r')).get();
    check(row.status === 'approved' && Array.isArray(row.lines) && row.lines[0].name === 'Zeta', 'lines json utuh');
    check(row.result && Array.isArray(row.result.effects) && row.result.effects[0].patch.qty === 1 && row.result.unmatched[0].name === 'Kopi' && row.result.applied === false, 'result json utuh: ' + JSON.stringify(row.result));
    check(await claimReceipt({ id: tag + 'r', from: 'testpending', to: 'rejected', now: 200, by: 9 }) === false, 'setoran yang sudah diputuskan tidak bisa diklaim lagi');
    return { ok: true, claimRaceWinners: winners, receiptJsonRoundtrip: true };
  } finally {
    await db.delete(workerItems).where(like(workerItems.id, tag + '%')).run();
    await db.delete(receipts).where(like(receipts.id, tag + '%')).run();
    const left = await db.select().from(receipts).where(like(receipts.id, tag + '%')).all();
    check(left.length === 0, 'pembersihan tuntas');
  }
}

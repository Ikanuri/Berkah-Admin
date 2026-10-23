// Dijalankan SAAT DEPLOY lewat `tgcloud run` (disalin sementara ke tgcloud/endpoints/).
// Menguji penulisan restore ke database tgcloud SUNGGUHAN dengan data berlabel unik,
// memverifikasi, lalu menghapus bersih (hard delete) supaya DB pelanggan tidak berubah.
import { db } from 'sdk';
import { eq, like } from 'sdk/db';
import { categories, items, suppliers, priceLog } from '../schema.js';
import { parseBackup, planRestore, applyPlan } from '../lib/backup.js';
import { loadExisting, makeIo } from '../lib/restore-io.js';

function check(cond, msg) { if (!cond) throw new Error('CLOUD-TEST GAGAL: ' + msg); }

async function cleanup(tag) {
  await db.delete(priceLog).where(like(priceLog.id, tag + '%')).run();
  await db.delete(items).where(like(items.id, tag + '%')).run();
  await db.delete(suppliers).where(like(suppliers.name, tag + '%')).run();
  await db.delete(categories).where(like(categories.name, tag + '%')).run();
}

export default async function () {
  const tag = '__cit' + Date.now().toString(36) + '_';
  const many = Array.from({ length: 95 }, (_, i) => ({ id: tag + 'i' + i, name: 'Uji ' + i, qty: 1 + (i % 3), unit: 'dus', checked: i % 2 === 0, checkedAt: i % 2 === 0 ? 1792700000000 : null }));
  many[0] = { ...many[0], isi: 10, hargaBeli: 100, hargaJual: 15, satuanHpp: 'btl' };
  const backup = {
    app: 'berkah-aio', version: 1,
    stok: {
      boss: { cats: [tag + 'K', tag + 'K2'], items: { [tag + 'K']: many, [tag + 'K2']: [] }, outCatEx: [tag + 'K2'] },
      suppliers: [tag + 'S'],
      pricelog: Array.from({ length: 130 }, (_, i) => ({ id: tag + 'l' + i, ts: 1792700000000 + i, tanggal: '2026-10-23', supplier: i === 0 ? tag + 'S2' : tag + 'S', itemId: tag + 'i' + (i % 95), unit: 'dus', hargaBeli: 100 + i })),
    },
  };
  try {
    const parsed = parseBackup(backup);
    const plan = planRestore(await loadExisting(), parsed.incoming, { onConflict: 'keep' });
    check(plan.counts.items.add === 95 && plan.counts.priceLog.add === 130, 'rencana: ' + JSON.stringify(plan.counts));
    await applyPlan(plan, makeIo());

    const cats = await db.select().from(categories).where(like(categories.name, tag + '%')).all();
    check(cats.length === 2, 'kategori masuk');
    check(cats.find((c) => c.name === tag + 'K2').excludeFromOrder === true, 'boolean excludeFromOrder tersimpan');
    const rows = await db.select().from(items).where(like(items.id, tag + '%')).all();
    check(rows.length === 95, '95 barang masuk lewat beberapa chunk, dapat ' + rows.length);
    const first = rows.find((r) => r.id === tag + 'i0');
    check(first.checked === true && first.checkedAt === 1792700000000, 'checked/checkedAt benar');
    check(first.isi === 10 && first.hargaBeli === 100 && first.hargaJual === 15 && first.satuanHpp === 'btl', 'kolom HPP benar');
    check(rows.find((r) => r.id === tag + 'i1').checked === false, 'unchecked benar');
    const orders = rows.filter((r) => r.categoryId === cats.find((c) => c.name === tag + 'K').id).map((r) => r.sortOrder).sort((a, b) => a - b);
    check(orders[0] === 1 && orders[94] === 95, 'sortOrder berurutan 1..95');
    const logs = await db.select().from(priceLog).where(like(priceLog.id, tag + '%')).all();
    check(logs.length === 130, '130 riwayat masuk lewat beberapa chunk, dapat ' + logs.length);
    const sups = await db.select().from(suppliers).where(like(suppliers.name, tag + '%')).all();
    check(sups.length === 2, 'supplier masuk (termasuk yang hanya ada di riwayat)');
    check(sups.find((s) => s.name === tag + 'S2').deletedAt != null, 'supplier dari riwayat = terhapus (soft)');
    check(logs.find((l) => l.id === tag + 'l0').supplierId === sups.find((s) => s.name === tag + 'S2').id, 'tautan supplier benar');

    const again = planRestore(await loadExisting(), parseBackup(backup).incoming, { onConflict: 'keep' });
    check(again.counts.items.add === 0 && again.counts.priceLog.add === 0 && again.counts.categories.add === 0, 'idempoten: ' + JSON.stringify(again.counts));
    return { ok: true, inserted: plan.counts, idempotent: true };
  } finally {
    await cleanup(tag);
    const left = await db.select().from(items).where(like(items.id, tag + '%')).all();
    check(left.length === 0, 'pembersihan tuntas');
  }
}

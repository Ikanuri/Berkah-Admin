// Dijalankan SAAT DEPLOY lewat `tgcloud run` (disalin sementara ke tgcloud/endpoints/).
// Menguji jalur DB Nota & PNL di database tgcloud SUNGGUHAN memakai data berlabel unik
// (kunci berawalan __cit, tanggal 2099-12-31), lalu menghapus bersih. TIDAK memanggil
// penimpa database produk dan TIDAK menambah urutan nomor nota, supaya data pelanggan utuh.
import { db } from 'sdk';
import { eq, like } from 'sdk/db';
import { notaLearn, notaHist, notaProducts, pnlDays, pnlArsip } from '../schema.js';
import { processRaw } from '../lib/pnl.js';
import { writeDay, readAll } from '../lib/pnl-store.js';
import { loadExisting, makeIo } from '../lib/restore-io.js';
import { parseBackup, planRestore } from '../lib/backup.js';

function check(cond, msg) { if (!cond) throw new Error('CLOUD-TEST GAGAL: ' + msg); }

export default async function () {
  const tag = '__cit' + Date.now().toString(36) + '_';
  const ds = '2099-12-31';
  const raw = (income) => `#tanggal ${ds}\n#pengeluaran\n10 a\n#prive\n5 b\n#income ${income}\n#kulakan 40\n#cash 70`;
  try {
    // PNL: tulis hari, baca balik, proses ulang = diganti (arsip tidak menumpuk)
    await writeDay(ds, processRaw(raw(100)).days[0].data, Date.now());
    let all = await readAll();
    check(all.days[ds] && all.days[ds].gross === 60 && all.days[ds].rincianPengeluaran[0].ket === 'a', 'hari PNL terbaca: ' + JSON.stringify(all.days[ds]));
    check(all.arsip[ds] && all.arsip[ds].length === 2, 'arsip 2 entri');
    await writeDay(ds, processRaw(raw(200)).days[0].data, Date.now());
    all = await readAll();
    check(all.days[ds].income === 200 && all.arsip[ds].length === 2, 'proses ulang mengganti, bukan menumpuk');
    const rows = await db.select().from(pnlDays).where(eq(pnlDays.tanggal, ds)).all();
    check(rows.length === 1, 'satu baris per tanggal');

    // Nota: kamus (upsert), riwayat (json lines), lewat jalur restore yang sama dengan produksi
    const io = makeIo();
    await io.upsertLearn([{ kunci: tag + 'k', nilai: 'n1' }]);
    await io.upsertLearn([{ kunci: tag + 'k', nilai: 'n2' }]);
    const learn = await db.select().from(notaLearn).where(like(notaLearn.kunci, tag + '%')).all();
    check(learn.length === 1 && learn[0].nilai === 'n2', 'kamus di-upsert');
    await io.insertHist([{ id: tag + 'h', num: 'T-1', dateStr: 'd', timeStr: 't', ket: 'k', total: 10, savedAt: 1, lines: [{ nama: 'A', qty: 2, satuan: 'dus', harga: 5, sub: 10, flag: false }] }]);
    const hist = await db.select().from(notaHist).where(like(notaHist.id, tag + '%')).all();
    check(hist.length === 1 && Array.isArray(hist[0].lines) && hist[0].lines[0].sub === 10, 'riwayat nota, lines json utuh');

    // satu produk sementara (tanpa menyentuh produk lain)
    await db.insert(notaProducts).values({ nama: tag + 'P', satuan: 'dus', satClass: 'dus', hargaJual: 1, hargaPokok: 1 }).run();
    const prod = await db.select().from(notaProducts).where(like(notaProducts.nama, tag + '%')).all();
    check(prod.length === 1, 'produk sementara tersimpan');

    // loadExisting memuat kolom baru dan rencana restore mengenali duplikat
    const ex = await loadExisting();
    check(ex.notaHistIds.includes(tag + 'h') && ex.notaLearn.some((l) => l.kunci === tag + 'k') && ex.pnlDays.includes(ds) && ex.pnlArsipDates.includes(ds) && ex.notaProductCount > 0, 'loadExisting memuat Nota & PNL');
    const parsed = parseBackup({ app: 'berkah-mini', version: 1, tables: { categories: [], items: [], suppliers: [], priceLog: [],
      nota: { learn: [{ kunci: tag + 'k', nilai: 'n2' }], hist: [{ id: tag + 'h', num: 'T-1', lines: [{ nama: 'A', qty: 1, harga: 1 }] }], products: [{ nama: 'X', satuan: 'dus' }] },
      pnl: { days: { [ds]: { income: 1, kulakan: 0, cash: 0 } }, arsip: { [ds]: [{ j: 'p', amt: 1, ket: 'z' }] } } } });
    const plan = planRestore(ex, parsed.incoming, { onConflict: 'keep' });
    check(plan.counts.nota.hist === 0 && plan.counts.nota.histDup === 1 && plan.counts.nota.learn === 0 && plan.counts.nota.products === 0 && plan.counts.nota.productsSkip === 1
      && plan.counts.pnl.days === 0 && plan.counts.pnl.daySkip === 1 && plan.counts.pnl.arsipSkip === 1, 'restore idempoten: ' + JSON.stringify(plan.counts));

    // db.run mengembalikan lastInsertRowid (dipakai penomoran nota) — diuji di tabel arsip sementara
    const r = await db.run('INSERT INTO pnl_arsip (tanggal, jenis, amt, ket) VALUES (:d, :j, :a, :k)', { ':d': ds, ':j': 'p', ':a': 1, ':k': tag });
    check(Number(r.lastInsertRowid) > 0 && r.rowsAffected === 1, 'lastInsertRowid: ' + JSON.stringify(r));
    return { ok: true, pnlArsipReplaced: true, restoreIdempotent: true };
  } finally {
    await db.delete(pnlDays).where(eq(pnlDays.tanggal, ds)).run();
    await db.delete(pnlArsip).where(eq(pnlArsip.tanggal, ds)).run();
    await db.delete(notaLearn).where(like(notaLearn.kunci, tag + '%')).run();
    await db.delete(notaHist).where(like(notaHist.id, tag + '%')).run();
    await db.delete(notaProducts).where(like(notaProducts.nama, tag + '%')).run();
    const left = await db.select().from(pnlDays).where(eq(pnlDays.tanggal, ds)).all();
    check(left.length === 0, 'pembersihan tuntas');
  }
}

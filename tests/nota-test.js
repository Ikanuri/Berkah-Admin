// Uji Nota Kulakan: aturan murni + kontrak LocalStore (peran, impor CSV, simpan, riwayat, kamus).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LocalStore } from '../src/local-store.js';
import { cleanLines, learnKey, notaNumber, packProducts, unpackProducts, HIST_MAX } from '../tgcloud/lib/nota.js';
import { matchProduct, parseKulakanLine } from '../tgcloud/lib/match.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const csv = readFileSync('legacy/data/Products.csv', 'utf8');

await t('cleanLines menghitung ulang total dan menolak data buruk', () => {
  const r = cleanLines([{ nama: ' Gula ', qty: 2, satuan: 'kg', harga: 15000, sub: 1 }, { nama: 'Teh', qty: 1.5, satuan: 'dus', harga: 1000 }]);
  assert.equal(r.total, 31500);
  assert.equal(r.lines[0].sub, 30000);
  assert.throws(() => cleanLines([]), /kosong/);
  assert.throws(() => cleanLines([{ nama: '', qty: 1, harga: 1 }]), /nama kosong/);
  assert.throws(() => cleanLines([{ nama: 'a', qty: 0, harga: 1 }]), /qty/);
  assert.throws(() => cleanLines([{ nama: 'a', qty: 1, harga: -1 }]), /harga/);
  assert.throws(() => cleanLines(new Array(501).fill({ nama: 'a', qty: 1, harga: 1 })), /Maksimal/);
});

await t('nomor nota dan kunci kamus', () => {
  assert.equal(notaNumber(7), 'KLK-007');
  assert.equal(notaNumber(1234), 'KLK-1234');
  assert.equal(learnKey('Gula Pasir', 'kg'), learnKey('gula  pasir', 'KG'));
  assert.match(learnKey('Gula Pasir', 'kg'), /\|/);
});

await t('pack/unpack produk bolak-balik', () => {
  const rows = [{ nama: 'A', satuan: 'pcs', satClass: 'pcs', hargaJual: 10, hargaPokok: 7, kode: 'k', barcode: 'b' }];
  assert.deepEqual(unpackProducts(packProducts(rows, { withCost: true })), rows);
  assert.equal(unpackProducts(packProducts(rows, { withCost: false }))[0].hargaPokok, 0);
});

await t('worker & pending ditolak untuk semua endpoint Nota', async () => {
  for (const role of ['worker', 'pending']) {
    const s = new LocalStore(role, mem());
    for (const [ep, input] of [['notaGetDb', {}], ['notaImportCsv', { csv }], ['notaGetState', {}], ['notaLearnSet', { kunci: 'a', nilai: 'b' }],
      ['notaLearnDelete', { kunci: 'a' }], ['notaSave', { lines: [] }], ['notaDelete', { id: 'x' }]]) {
      await assert.rejects(s.call(ep, input), /Tidak punya akses/, `${role}/${ep}`);
    }
  }
});

await t('impor CSV asli lalu pencocokan baris dari input', async () => {
  const s = new LocalStore('boss', mem());
  assert.deepEqual((await s.call('notaGetDb', {})).rows, []);
  const imp = await s.call('notaImportCsv', { csv });
  assert.ok(imp.count > 2000, 'jumlah produk');
  const db = await s.call('notaGetDb', {});
  assert.equal(db.rows.length, imp.count);
  assert.deepEqual(await s.call('notaGetDb', { version: imp.version }), { unchanged: true, version: imp.version });
  const prods = unpackProducts(db.rows);
  const p = parseKulakanLine('3 kg Kacang Osik');
  assert.ok(p && p.qty === 3);
  const m = matchProduct(prods, p.nama, p.satuan, {});
  assert.ok(['ok', 'ambiguous', 'satuan_missing', 'notfound'].includes(m.status));
  await assert.rejects(s.call('notaImportCsv', { csv: 'bukan,csv\n1,2' }), /tidak valid/);
});

await t('simpan nota: nomor otomatis, total dari server, riwayat, hapus', async () => {
  const s = new LocalStore('boss', mem());
  assert.equal((await s.call('notaGetState', {})).nextNumber, 'KLK-001');
  const a = await s.call('notaSave', { dateStr: '1 Jan 2026', timeStr: '08.00', lines: [{ nama: 'Gula', qty: 2, satuan: 'kg', harga: 15000 }] });
  assert.equal(a.num, 'KLK-001'); assert.equal(a.total, 30000);
  const b = await s.call('notaSave', { num: 'MANUAL-9', lines: [{ nama: 'Teh', qty: 1, satuan: 'dus', harga: 5000 }], ket: '  ' });
  assert.equal(b.num, 'MANUAL-9');
  let st = await s.call('notaGetState', {});
  assert.equal(st.nextNumber, 'KLK-003', 'nomor manual tetap menggeser urutan');
  assert.equal(st.hist.length, 2);
  assert.equal(st.hist.find((x) => x.id === b.id).ket, 'Kulakan Harian');
  await s.call('notaDelete', { id: a.id });
  st = await s.call('notaGetState', { since: 0 });
  assert.equal(st.hist.find((x) => x.id === a.id).deletedAt > 0, true, 'tombstone dikirim ke klien');
  await assert.rejects(s.call('notaSave', { lines: [{ nama: 'x', qty: 0, harga: 1 }] }), /qty/);
});

await t('riwayat dibatasi HIST_MAX terbaru', async () => {
  const s = new LocalStore('boss', mem());
  for (let i = 0; i < HIST_MAX + 3; i++) await s.call('notaSave', { lines: [{ nama: 'x' + i, qty: 1, harga: 1 }] });
  const st = await s.call('notaGetState', {});
  assert.equal(st.hist.filter((x) => !x.deletedAt).length, HIST_MAX);
});

await t('kamus belajar: simpan, timpa, hapus (tombstone), dan delta', async () => {
  const s = new LocalStore('boss', mem());
  await s.call('notaLearnSet', { kunci: 'gula|kg', nilai: 'Gula Pasir 1kg' });
  await s.call('notaLearnSet', { kunci: 'gula|kg', nilai: 'Gula Pasir 50kg' });
  let st = await s.call('notaGetState', {});
  assert.equal(st.learn.length, 1); assert.equal(st.learn[0].nilai, 'Gula Pasir 50kg');
  await s.call('notaLearnDelete', { kunci: 'gula|kg' });
  st = await s.call('notaGetState', {});
  assert.ok(st.learn[0].deletedAt);
  await assert.rejects(s.call('notaLearnSet', { kunci: '', nilai: 'x' }), /wajib/);
});

console.log(`\nHASIL NOTA: ${n} uji lulus`);

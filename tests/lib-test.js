// Uji lib murni (tanpa SDK tgcloud). Jalankan: node tests/lib-test.js
import assert from 'node:assert/strict';
import { parseAngka, round, fmtNum, inpVal, cost, pctOf, roundQty } from '../tgcloud/lib/money.js';
import { rankFromEntries, winners, tierSummary } from '../tgcloud/lib/tier.js';
import { toggle, adjustQty, setQty, fulfill, mergeAddLine, applySupplierPrice, parseLine, normName, canDeleteCategory, orderLine } from '../tgcloud/lib/rules.js';
import { shapeItemFor, canSeeSuppliers, isApproved } from '../tgcloud/lib/shape.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('parseAngka context-aware', () => {
  assert.equal(parseAngka('1.500,75'), 1500.75);
  assert.equal(parseAngka('2.500'), 2500);
  assert.equal(parseAngka('0.5'), 0.5);
  assert.equal(parseAngka('1500.75'), 1500.75);
  assert.equal(parseAngka('Rp 12.000'), 12000);
  assert.equal(parseAngka('-3,5'), -3.5);
  assert.equal(parseAngka(''), 0);
  assert.equal(parseAngka(null), 0);
  assert.equal(parseAngka('abc'), 0);
});

t('round menutup galat biner', () => {
  assert.equal(round(1.005), 1.01);
  assert.equal(round(0.1 + 0.2), 0.3);
  assert.equal(round(-1.005), -1.01);
  assert.equal(round(NaN), 0);
});

t('fmtNum sama dengan toLocaleString id-ID (jika ICU penuh)', () => {
  // app lama menampilkan "-0" untuk negatif sangat kecil; versi baru sengaja "0"
  const ref = (v) => round(v, 2).toLocaleString('id-ID', { maximumFractionDigits: 2 }).replace(/^-0$/, '0');
  if (ref(1234.5) !== '1.234,5') { console.log('  (ICU id-ID tidak tersedia, dilewati)'); return; }
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const vals = [0, 1, -1, 0.5, 999, 1000, 4062.5, 1234567.891, -2500, 0.004, 0.005, 12.3456];
  for (let i = 0; i < 2000; i++) vals.push((rnd() - 0.3) * Math.pow(10, Math.floor(rnd() * 9)));
  for (const v of vals) assert.equal(fmtNum(v), ref(v), 'nilai ' + v);
});

t('inpVal round-trip dengan parseAngka', () => {
  for (const v of [1500.75, 2500, 0.5, 12.34, 100]) assert.equal(parseAngka(inpVal(v)), v);
  assert.equal(inpVal(0), '');
  assert.equal(inpVal(null), '');
});

t('cost / pctOf / roundQty', () => {
  assert.equal(cost({ isi: 10, hargaBeli: 50000 }), 5000);
  assert.equal(cost({ isi: 0, hargaBeli: 50000 }), 0);
  assert.equal(cost({ isi: 10 }), 0);
  assert.equal(pctOf(500, 5000), 10);
  assert.equal(pctOf(500, 0), 0);
  assert.equal(roundQty(1.23456), 1.235);
});

t('tier: harga terbaru per supplier, termurah dulu', () => {
  const e = [
    { supplierId: 1, hargaBeli: 100, ts: 1 },
    { supplierId: 1, hargaBeli: 120, ts: 5 }, // terbaru supplier 1
    { supplierId: 2, hargaBeli: 110, ts: 2 },
  ];
  const r = rankFromEntries(e);
  assert.deepEqual(r.map((x) => [x.supplierId, x.hargaBeli]), [[2, 110], [1, 120]]);
  assert.deepEqual(tierSummary(r), { kind: 'single', supplierId: 2, price: 110 });
});

t('tier: seri menampilkan jumlah supplier, bukan satu nama', () => {
  const r = rankFromEntries([
    { supplierId: 7, hargaBeli: 90, ts: 1 },
    { supplierId: 3, hargaBeli: 90, ts: 2 },
    { supplierId: 4, hargaBeli: 95, ts: 3 },
  ]);
  assert.equal(winners(r).length, 2);
  assert.deepEqual(tierSummary(r), { kind: 'tied', count: 2, price: 90 });
  assert.equal(tierSummary([]), null);
});

t('toggle: batal centang menandai log', () => {
  assert.deepEqual(toggle({ checked: false }, 99), { patch: { checked: true, checkedAt: 99 }, logged: false });
  assert.deepEqual(toggle({ checked: true }, 99), { patch: { checked: false, checkedAt: null }, logged: true });
});

t('adjustQty: minus pada qty <= 1 beku', () => {
  assert.equal(adjustQty(1, -1), 1);
  assert.equal(adjustQty(0.5, -1), 0.5);
  assert.equal(adjustQty(2, -1), 1);
  assert.equal(adjustQty(2, -5), 1);
  assert.equal(adjustQty(2, 1), 3);
  assert.equal(setQty(0), null);
  assert.equal(setQty('2.5'), 2.5);
});

t('fulfill: pemenuhan sebagian', () => {
  const it = { qty: 5, checked: true, checkedAt: 1 };
  assert.deepEqual(fulfill(it, 5, 9), { status: 'resolved', patch: { checked: false, checkedAt: null } });
  assert.deepEqual(fulfill(it, 9, 9).status, 'resolved');
  assert.deepEqual(fulfill(it, 3, 9), { status: 'partial', patch: { checked: true, checkedAt: 9, qty: 2 } });
  assert.equal(fulfill(it, 0, 9), null);
  assert.equal(fulfill({ qty: 1.1 }, 0.4, 9).patch.qty, 0.7);
});

t('parseLine dan nama sama', () => {
  assert.deepEqual(parseLine('5 dus Aqua'), { qty: 5, unit: 'dus', name: 'Aqua' });
  assert.deepEqual(parseLine('2,5 kg Gula Pasir'), { qty: 2.5, unit: 'kg', name: 'Gula Pasir' });
  assert.deepEqual(parseLine('Telur'), { qty: 1, unit: 'dus', name: 'Telur' });
  assert.deepEqual(parseLine('3 xyz Sabun'), { qty: 1, unit: 'dus', name: '3 xyz Sabun' });
  assert.equal(parseLine('── Hari ini ──'), null);
  assert.equal(parseLine('  '), null);
  assert.equal(normName('  AQUA '), 'aqua');
  assert.equal(orderLine({ qty: 5, unit: 'dus', name: 'Aqua' }), '5 dus Aqua');
});

t('mergeAddLine: centang hanya dipertahankan untuk Bos', () => {
  const ex = { checked: true, checkedAt: 7 };
  const line = { qty: 3, unit: 'kg' };
  assert.equal(mergeAddLine(null, line, true, 1).kind, 'new');
  assert.deepEqual(mergeAddLine(ex, line, true, 1).patch, { qty: 3, unit: 'kg', checked: true, checkedAt: 7 });
  assert.deepEqual(mergeAddLine(ex, line, false, 1).patch, { qty: 3, unit: 'kg', checked: false, checkedAt: null });
});

t('applySupplierPrice: hanya > 0, menimpa Harga Beli', () => {
  assert.equal(applySupplierPrice({ unit: 'dus' }, 0), null);
  assert.equal(applySupplierPrice({ unit: 'dus' }, -5), null);
  assert.deepEqual(applySupplierPrice({ unit: 'dus', satuanHpp: 'btl' }, 1500), { patch: { hargaBeli: 1500 }, unit: 'btl' });
  assert.deepEqual(applySupplierPrice({ unit: 'dus' }, '2000'), { patch: { hargaBeli: 2000 }, unit: 'dus' });
});

t('canDeleteCategory: minimal 1', () => {
  assert.equal(canDeleteCategory(1), false);
  assert.equal(canDeleteCategory(2), true);
});

t('permission: worker tidak pernah menerima field modal', () => {
  const item = { id: 'a', name: 'X', qty: 1, isi: 12, satuanHpp: 'btl', hargaBeli: 100, hargaJual: 150 };
  const w = shapeItemFor('worker', item);
  assert.deepEqual(Object.keys(w).sort(), ['id', 'name', 'qty']);
  assert.equal(shapeItemFor('boss', item).hargaBeli, 100);
  assert.equal('hargaBeli' in item, true, 'objek asli tidak diubah');
  assert.equal(canSeeSuppliers('worker'), false);
  assert.equal(canSeeSuppliers('pending'), false);
  assert.equal(canSeeSuppliers('boss'), true);
  assert.equal(isApproved('pending'), false);
});

console.log(`\nHASIL: ${n} kelompok uji lulus`);

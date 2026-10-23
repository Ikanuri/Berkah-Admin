// Uji kontrak LocalStore (peran & bentuk respons). Jalankan: node tests/local-store-test.js
import assert from 'node:assert/strict';
import { LocalStore } from '../src/local-store.js';
import { createState, applyChanges, categoriesOf, itemsOf, tierOf, buildOrderText } from '../src/state.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const rejects = (p, re) => assert.rejects(p, re);

await t('worker ditolak untuk endpoint Bos', async () => {
  const s = new LocalStore('worker', mem());
  for (const [ep, input] of [
    ['setHpp', { id: 'x' }], ['saveSupplier', { name: 'A' }], ['deleteSupplier', { id: 1 }],
    ['savePrices', {}], ['deletePriceEntry', { id: 'x' }], ['listUsers', {}],
    ['setUserRole', { tgId: 2, role: 'boss' }], ['deleteCategory', { id: 1 }], ['reorderCategories', { ids: [] }],
  ]) await rejects(s.call(ep, input), /Tidak punya akses/, ep);
});

await t('pending ditolak untuk semuanya kecuali me', async () => {
  const s = new LocalStore('pending', mem());
  assert.equal((await s.call('me')).role, 'pending');
  await rejects(s.call('getChanges', {}), /Tidak punya akses/);
  await rejects(s.call('addItems', { categoryId: 1, text: 'x' }), /Tidak punya akses/);
});

await t('worker tidak menerima field modal maupun supplier/riwayat', async () => {
  const storage = mem();
  const boss = new LocalStore('boss', storage);
  await boss.call('saveCategory', { name: 'Umum' });
  await boss.call('addItems', { categoryId: 1, text: '2 kg Gula' });
  const id = (await boss.call('getChanges', {})).items[0].id;
  await boss.call('setHpp', { id, isi: 10, hargaBeli: 50000, hargaJual: 6000, satuanHpp: 'kg' });
  await boss.call('saveSupplier', { name: 'A' });
  await boss.call('savePrices', { supplierId: 1, tanggal: '2026-10-23', prices: [{ itemId: id, hargaBeli: 48000 }] });
  assert.equal((await boss.call('getChanges', {})).items[0].hargaBeli, 48000, 'harga terakhir menimpa Harga Beli');

  const worker = new LocalStore('worker', storage);
  const d = await worker.call('getChanges', { since: 0 });
  assert.equal(d.items.length, 1);
  for (const f of ['isi', 'satuanHpp', 'hargaBeli', 'hargaJual']) assert.ok(!(f in d.items[0]), f);
  assert.ok(!('suppliers' in d) && !('priceLog' in d));
  assert.doesNotMatch(JSON.stringify(d), /48000|50000|6000/);
});

await t('delta since + tombstone mengalir ke state klien', async () => {
  const s = new LocalStore('boss', mem());
  const st = createState();
  await s.call('saveCategory', { name: 'Umum' });
  await s.call('addItems', { categoryId: 1, text: '1 dus A\n1 dus B' });
  let d = await s.call('getChanges', { since: 0 });
  applyChanges(st, d);
  assert.equal(itemsOf(st, 1).length, 2);
  const idA = itemsOf(st, 1)[0].id;
  await new Promise((r) => setTimeout(r, 5));
  await s.call('deleteItem', { id: idA });
  d = await s.call('getChanges', { since: st.serverTime });
  assert.equal(d.items.length, 1, 'hanya baris yang berubah');
  applyChanges(st, d);
  assert.equal(itemsOf(st, 1).length, 1);
  assert.equal(st.items.get(idA).deletedAt > 0, true);
});

await t('tier & teks order (filter kategori hanya Bos)', async () => {
  const s = new LocalStore('boss', mem());
  const st = createState();
  await s.call('saveCategory', { name: 'A' });
  await s.call('saveCategory', { name: 'B' });
  await s.call('addItems', { categoryId: 1, text: '3 dus X' });
  await s.call('addItems', { categoryId: 2, text: '2 kg Y' });
  applyChanges(st, await s.call('getChanges', {}));
  for (const it of [...st.items.values()]) await s.call('toggleItem', { id: it.id });
  await s.call('saveCategory', { id: 2, excludeFromOrder: true });
  applyChanges(st, await s.call('getChanges', { since: 0 }));
  assert.equal(buildOrderText(st, { applyExclude: true }), '3 dus X');
  assert.equal(buildOrderText(st, { applyExclude: false }), '3 dus X\n2 kg Y');
  assert.equal(categoriesOf(st).length, 2);

  await s.call('saveSupplier', { name: 'S1' });
  await s.call('saveSupplier', { name: 'S2' });
  const x = itemsOf(st, 1)[0].id;
  await s.call('savePrices', { supplierId: 1, tanggal: '2026-10-23', prices: [{ itemId: x, hargaBeli: 100 }] });
  await s.call('savePrices', { supplierId: 2, tanggal: '2026-10-23', prices: [{ itemId: x, hargaBeli: 100 }] });
  applyChanges(st, await s.call('getChanges', { since: 0 }));
  assert.deepEqual(tierOf(st, x), { kind: 'tied', count: 2, price: 100 });
});

await t('hapus supplier: riwayat tetap, nama tetap terbaca', async () => {
  const s = new LocalStore('boss', mem());
  const st = createState();
  await s.call('saveCategory', { name: 'A' });
  await s.call('addItems', { categoryId: 1, text: '1 dus X' });
  await s.call('saveSupplier', { name: 'Lama' });
  const x = (await s.call('getChanges', {})).items[0].id;
  await s.call('savePrices', { supplierId: 1, tanggal: '2026-10-23', prices: [{ itemId: x, hargaBeli: 5 }] });
  await s.call('deleteSupplier', { id: 1 });
  applyChanges(st, await s.call('getChanges', { since: 0 }));
  assert.equal(tierOf(st, x).price, 5);
  await s.call('saveSupplier', { name: 'Lama' }); // nama sama menghidupkan lagi
  applyChanges(st, await s.call('getChanges', { since: 0 }));
  assert.equal(st.suppliers.get(1).deletedAt, null);
});

console.log(`\nHASIL: ${n} uji LocalStore lulus`);

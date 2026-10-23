// Uji kontrak LocalStore (peran & bentuk respons). Jalankan: node tests/local-store-test.js
import assert from 'node:assert/strict';
import { LocalStore } from '../src/local-store.js';
import { shopMs } from '../tgcloud/lib/time.js';
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
    ['setUserRole', { tgId: 2, role: 'boss' }], ['applyMargin', { mode: 'rp', value: 100 }], ['clearItems', {}], ['saveRecurring', { supplierId: 1, days: [1], time: '08:00' }], ['deleteRecurring', { supplierId: 1 }], ['saveOneOff', { supplierId: 1, ts: 9e12 }], ['deleteOneOff', { id: 'x' }], ['tickReminders', {}], ['testReminder', {}], ['exportBackup', {}], ['restorePreview', { data: {} }], ['restoreApply', { data: {} }], ['setChecked', { categoryId: null, checked: false }], ['setChecked', { categoryId: 1, checked: true }], ['deleteCategory', { id: 1 }], ['reorderCategories', { ids: [] }],
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

await t('applyMargin: dihitung dari modal, lintas/kategori tunggal', async () => {
  const s = new LocalStore('boss', mem());
  await s.call('saveCategory', { name: 'A' });
  await s.call('saveCategory', { name: 'B' });
  await s.call('addItems', { categoryId: 1, text: '1 dus X\n1 dus Y' });
  await s.call('addItems', { categoryId: 2, text: '1 dus Z' });
  const items = (await s.call('getChanges', {})).items;
  const [x, y, z] = ['X', 'Y', 'Z'].map((nm) => items.find((i) => i.name === nm).id);
  await s.call('setHpp', { id: x, isi: 10, hargaBeli: 100000 }); // pokok 10.000
  await s.call('setHpp', { id: z, isi: 1, hargaBeli: 200 });     // pokok 200
  const r1 = await s.call('applyMargin', { categoryId: 1, mode: 'pct', value: 12.5 });
  assert.deepEqual(r1, { updated: 1, skipped: 1, invalid: 0 }); // Y tanpa pokok dilewati
  let d = (await s.call('getChanges', {})).items;
  assert.equal(d.find((i) => i.id === x).hargaJual, 11250);
  assert.equal(d.find((i) => i.id === z).hargaJual ?? null, null, 'kategori lain tidak tersentuh');
  const r2 = await s.call('applyMargin', { categoryId: null, mode: 'rp', value: -300 });
  assert.deepEqual(r2, { updated: 1, skipped: 1, invalid: 1 }); // X tetap > 0; Z jadi <= 0 ditolak
  d = (await s.call('getChanges', {})).items;
  assert.equal(d.find((i) => i.id === x).hargaJual, 9700);
  await rejects(s.call('applyMargin', { categoryId: 99, mode: 'rp', value: 1 }), /Kategori tidak ditemukan/);
  void y;
});

await t('setChecked/clearItems: peran, hitungan, dan jejak aktivitas', async () => {
  const storage = mem();
  const boss = new LocalStore('boss', storage);
  await boss.call('saveCategory', { name: 'A' });
  await boss.call('saveCategory', { name: 'B' });
  await boss.call('addItems', { categoryId: 1, text: '1 dus X\n1 dus Y' });
  await boss.call('addItems', { categoryId: 2, text: '1 dus Z' });
  assert.deepEqual(await boss.call('setChecked', { categoryId: 1, checked: true }), { changed: 2 });
  assert.deepEqual(await boss.call('setChecked', { categoryId: 1, checked: true }), { changed: 0 }, 'idempoten');
  let d = await boss.call('getChanges', {});
  assert.equal(d.lastAct.desc, 'centang semua di kategori "A" (2 item)');
  assert.equal(d.items.filter((i) => i.checked).length, 2);

  const worker = new LocalStore('worker', storage);
  assert.deepEqual(await worker.call('setChecked', { categoryId: null, checked: true }), { changed: 1 }, 'karyawan boleh centang semua');
  await rejects(worker.call('setChecked', { categoryId: null, checked: false }), /Tidak punya akses/);
  await rejects(worker.call('setChecked', { categoryId: 1, checked: true }), /Tidak punya akses/);
  await rejects(worker.call('clearItems', {}), /Tidak punya akses/);

  // tiap LocalStore memuat storage sekali: buat ulang Bos agar melihat perubahan Karyawan
  const boss2 = new LocalStore('boss', storage);
  assert.deepEqual(await boss2.call('setChecked', { categoryId: null, checked: false }), { changed: 3 });
  assert.deepEqual(await boss2.call('clearItems', { categoryId: 2 }), { deleted: 1 });
  d = await boss2.call('getChanges', { since: 0 });
  assert.equal(d.items.filter((i) => !i.deletedAt).length, 2);
  assert.equal(d.lastAct.desc, 'semua item dihapus di kategori "B"');
});

await t('lastAct untuk karyawan tidak membocorkan aksi supplier/harga', async () => {
  const storage = mem();
  const boss = new LocalStore('boss', storage);
  await boss.call('saveCategory', { name: 'A' });
  await boss.call('addItems', { categoryId: 1, text: '1 dus X' });
  const x = (await boss.call('getChanges', {})).items[0].id;
  await boss.call('toggleItem', { id: x });
  await boss.call('saveSupplier', { name: 'RAHASIA' });
  await boss.call('savePrices', { supplierId: 1, tanggal: '2026-10-23', prices: [{ itemId: x, hargaBeli: 100 }] });
  assert.match((await boss.call('getChanges', {})).lastAct.desc, /RAHASIA/);
  const w = await new LocalStore('worker', storage).call('getChanges', {});
  assert.equal(w.lastAct.desc, 'dicentang: X');
  assert.doesNotMatch(JSON.stringify(w), /RAHASIA/);
});

await t('exportBackup + restoreApply lewat LocalStore: bulat-balik antar perangkat', async () => {
  const a = new LocalStore('boss', mem());
  await a.call('saveCategory', { name: 'A' });
  await a.call('addItems', { categoryId: 1, text: '3 dus Aqua\n2 kg Gula' });
  await a.call('saveSupplier', { name: 'S1' });
  const items = (await a.call('getChanges', {})).items;
  await a.call('setHpp', { id: items[0].id, isi: 24, hargaBeli: 48000 });
  await a.call('savePrices', { supplierId: 1, tanggal: '2026-10-23', prices: [{ itemId: items[0].id, hargaBeli: 47000 }] });
  const out = await a.call('exportBackup', {});
  assert.deepEqual(out.counts, { categories: 1, items: 2, suppliers: 1, priceLog: 1, notaHist: 0, pnlDays: 0 });

  const b = new LocalStore('boss', mem());
  const prev = await b.call('restorePreview', { data: out.data });
  assert.deepEqual(prev.counts.items, { add: 2, overwrite: 0, skip: 0 });
  assert.equal((await b.call('getChanges', {})).items.length, 0, 'preview tidak menulis');
  await b.call('restoreApply', { data: out.data });
  const d = await b.call('getChanges', {});
  assert.equal(d.items.length, 2);
  assert.equal(d.items.find((i) => i.name === 'Aqua').hargaBeli, 47000, 'harga terakhir ikut terbawa');
  assert.equal(d.priceLog.length, 1);
  assert.match(d.lastAct.desc, /^restore backup \(pertahankan\): \+2 barang/);
  await rejects(b.call('restorePreview', { data: { foo: 1 } }), /Format backup tidak dikenal/);
});

await t('pengingat: simpan, validasi, tick tanpa ganda, spanduk hanya Bos, supplier terhapus', async () => {
  const storage = mem();
  const boss = new LocalStore('boss', storage);
  await boss.call('saveSupplier', { name: 'Agen A' });
  await boss.call('saveSupplier', { name: 'Agen B' });
  await rejects(boss.call('saveRecurring', { supplierId: 1, days: [], time: '08:00' }), /minimal satu hari/);
  await rejects(boss.call('saveRecurring', { supplierId: 99, days: [1], time: '08:00' }), /Supplier tidak ditemukan/);
  await rejects(boss.call('saveOneOff', { supplierId: 1, ts: 1000 }), /sudah lewat/);
  await boss.call('saveRecurring', { supplierId: 1, days: [4, 1], time: '08:00', preAlertMin: 30 });
  await boss.call('saveRecurring', { supplierId: 1, days: [2], time: '09:30' }); // upsert: satu jadwal per supplier
  assert.equal(boss.db.remRecurring.length, 1);
  assert.deepEqual([boss.db.remRecurring[0].days, boss.db.remRecurring[0].time, boss.db.remRecurring[0].preAlertMin], [[2], '09:30', null]);

  // atur ulang ke jadwal yang pasti jatuh tempo pada "sekarang" tetap: Kamis 22 Okt 2026 08:00 WIB
  const THU_8 = shopMs('2026-10-22', '08:00');
  Object.assign(boss.db.remRecurring[0], { days: [4], time: '08:00', preAlertMin: 30, lastFiredDate: null, lastPreFiredDate: null });
  const soon = { id: 'once1', supplierId: 2, ts: THU_8 + 3600000, preAlertMin: 15, firedAt: null, preFiredAt: null, updatedAt: 1, deletedAt: null };
  boss.db.remOneoff.push(soon);

  let r = boss.runTick(THU_8 - 20 * 60000);
  assert.deepEqual(r.fired, ['⏰ Supplier "Agen A" dijadwalkan datang sebentar lagi (08:00)'], 'pra-alert mingguan');
  assert.deepEqual(boss.runTick(THU_8 - 19 * 60000).fired, [], 'tidak ganda');
  r = boss.runTick(THU_8 + 60000);
  assert.deepEqual(r.fired, ['🚚 Supplier "Agen A" dijadwalkan datang SEKARANG (08:00)']);
  assert.deepEqual(boss.runTick(THU_8 + 2 * 60000).fired, []);
  r = boss.runTick(THU_8 + 3600000 - 10 * 60000);
  assert.match(r.fired[0], /sebentar lagi \(22\/10 09:00\)/);
  r = boss.runTick(THU_8 + 3600000 + 1);
  assert.match(r.fired[0], /SEKARANG \(22\/10 09:00\)/);
  assert.ok(soon.firedAt, 'sekali-jadwal ditandai sudah berbunyi');
  assert.equal(boss.db.sent.length, 4);
  assert.deepEqual(boss.runTick(THU_8 + 86400000 * 7 - 2 * 3600000).fired, [], 'minggu depan, 2 jam sebelumnya: belum waktunya');
  assert.equal(boss.runTick(THU_8 + 86400000 * 7 + 1).fired.length, 1, 'minggu depan berbunyi lagi');

  // getChanges: delta pengingat hanya Bos; alerts hanya Bos
  const d = await boss.call('getChanges', { since: 0 });
  assert.equal(d.remRecurring.length, 1);
  assert.equal(d.remOneoff.length, 1);
  const worker = new LocalStore('worker', storage);
  const dw = await worker.call('getChanges', { since: 0, tick: true });
  assert.ok(!('remRecurring' in dw) && !('remOneoff' in dw) && !('alerts' in dw));

  // supplier dihapus: jadwal ikut lenyap, tick melewatinya
  await boss.call('saveOneOff', { supplierId: 2, ts: Date.now() + 5000 });
  await boss.call('deleteSupplier', { id: 2 });
  assert.ok(boss.db.remOneoff.filter((o) => o.supplierId === 2).every((o) => o.deletedAt));
  await boss.call('deleteSupplier', { id: 1 });
  Object.assign(boss.db.remRecurring[0], { lastFiredDate: null });
  assert.deepEqual(boss.runTick(THU_8 + 86400000 * 14 + 60000).fired, []);
});

await t('pengingat: spanduk muncul lewat getChanges(tick) untuk Bos', async () => {
  const boss = new LocalStore('boss', mem());
  await boss.call('saveSupplier', { name: 'Agen A' });
  boss.db.remOneoff.push({ id: 'due', supplierId: 1, ts: Date.now() - 1000, preAlertMin: null, firedAt: null, preFiredAt: null, updatedAt: 1, deletedAt: null });
  const d = await boss.call('getChanges', { since: 0, tick: true });
  assert.equal(d.alerts.length, 1);
  assert.match(d.alerts[0], /Agen A.*SEKARANG/);
  const again = await boss.call('getChanges', { since: 0, tick: true });
  assert.ok(!again.alerts, 'tidak berbunyi lagi');
  const noTick = await boss.call('getChanges', { since: 0 });
  assert.ok(!noTick.alerts);
});

console.log(`\nHASIL: ${n} uji LocalStore lulus`);

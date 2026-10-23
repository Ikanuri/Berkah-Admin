// Uji Penerimaan: planner murni (logika "balasan" app lama) dan alur LocalStore end-to-end.
import assert from 'node:assert/strict';
import { LocalStore } from '../src/local-store.js';
import { planReceipt, cleanReceiptLines, replyText, mergeWorkerLine } from '../tgcloud/lib/receipts.js';
import { validClientId, makeId } from '../tgcloud/lib/id.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const rejects = (p, re, msg) => assert.rejects(p, re, msg);

const it = (id, name, qty, extra = {}) => ({ id, name, qty, unit: 'dus', checked: true, checkedAt: 1, ...extra });

await t('planReceipt = skProcessReply: terpenuhi, kurang, tidak cocok', () => {
  const items = [it('a', 'Aqua', 5), it('b', 'Gula', 10), it('c', 'Teh', 2)];
  const p = planReceipt(items, [{ name: 'aqua', qty: 5, unit: 'dus' }, { name: 'GULA ', qty: 3, unit: 'kg' }, { name: 'Kopi', qty: 1, unit: 'dus' }], 99);
  assert.deepEqual(p.effects.map((e) => [e.id, e.status]), [['a', 'resolved'], ['b', 'partial']]);
  assert.deepEqual(p.effects[0].patch, { checked: false, checkedAt: null });
  assert.deepEqual(p.effects[1].patch, { checked: true, checkedAt: 99, qty: 7 });
  assert.deepEqual(p.unmatched, [{ name: 'Kopi', qty: 1, unit: 'dus' }]);
  assert.deepEqual(p.counts, { resolved: 1, partial: 1, unmatched: 1 });
  assert.equal(p.effects.find((e) => e.id === 'c'), undefined, 'Teh tidak disentuh');
});

await t('planReceipt: lebih dari dipesan = terpenuhi; satuan diabaikan; nama kembar di daftar semuanya diproses; setoran kembar: terakhir menang', () => {
  const items = [it('a', 'Aqua', 2), it('b', 'Aqua', 4, { categoryId: 2 })];
  const p = planReceipt(items, [{ name: 'Aqua', qty: 1, unit: 'kg' }, { name: 'aqua', qty: 9, unit: 'dus' }], 5);
  assert.deepEqual(p.effects.map((e) => [e.id, e.status, e.taken]), [['a', 'resolved', 9], ['b', 'resolved', 9]]);
  assert.equal(p.unmatched.length, 0);
});

await t('planReceipt: barang yang tidak tercentang pun diproses seperti app lama; desimal dibulatkan', () => {
  const p = planReceipt([it('a', 'Beras', 1.1, { checked: false, checkedAt: null })], [{ name: 'Beras', qty: 0.4, unit: 'kg' }], 7);
  assert.deepEqual(p.effects[0].patch, { checked: true, checkedAt: 7, qty: 0.7 });
});

await t('cleanReceiptLines menolak data buruk', () => {
  assert.deepEqual(cleanReceiptLines([{ name: ' A ', qty: '2', unit: 'dus ' }]), [{ name: 'A', qty: 2, unit: 'dus' }]);
  assert.throws(() => cleanReceiptLines([]), /Tidak ada barang/);
  assert.throws(() => cleanReceiptLines([{ name: '', qty: 1 }]), /nama kosong/);
  assert.throws(() => cleanReceiptLines([{ name: 'a', qty: 0 }]), /qty/);
  assert.throws(() => cleanReceiptLines([{ name: 'a', qty: NaN }]), /qty/);
  assert.throws(() => cleanReceiptLines(new Array(301).fill({ name: 'a', qty: 1 })), /Maksimal/);
});

await t('teks balasan, merge baris, dan id dari klien', () => {
  assert.equal(replyText([it('a', 'Aqua', 5), it('b', 'Gula', 2, { checked: false })]), '5 dus Aqua');
  assert.deepEqual(mergeWorkerLine({ checked: true }, { qty: 3, unit: 'kg' }), { kind: 'update', patch: { qty: 3, unit: 'kg', checked: false, checkedAt: null } });
  assert.deepEqual(mergeWorkerLine(null, {}), { kind: 'new' });
  assert.ok(validClientId(makeId()));
  for (const bad of [undefined, 5, '', 'ABCDEFGH1', 'a b c d e f g h', 'x'.repeat(41), 'short']) assert.equal(validClientId(bad), false, String(bad));
});

await t('Karyawan: daftar pribadi (tempel, centang, qty, satuan) tanpa menyentuh daftar Bos', async () => {
  const storage = mem();
  const boss = new LocalStore('boss', storage);
  await boss.call('saveCategory', { name: 'Umum' });
  await boss.call('addItems', { categoryId: 1, text: '5 dus Aqua' });

  const w = new LocalStore('worker', storage);
  assert.deepEqual(await w.call('wAddItems', { text: '5 dus Aqua\n2 kg Gula\nTelur' }), { added: 3, updated: 0 });
  let d = await w.call('getChanges', { since: 0 });
  assert.equal(d.workerItems.length, 3);
  const aqua = d.workerItems.find((i) => i.name === 'Aqua').id;
  await w.call('wToggleItem', { id: aqua });
  await w.call('wUpdateItem', { id: aqua, delta: -1 });
  await w.call('wUpdateItem', { id: aqua, unit: 'kg' });
  d = await w.call('getChanges', { since: 0 });
  assert.deepEqual(d.workerItems.filter((i) => i.name === 'Aqua').map((i) => [i.checked, i.qty, i.unit]), [[true, 4, 'kg']]);
  // tempel ulang = perbarui dan reset centang (seperti app lama)
  assert.deepEqual(await w.call('wAddItems', { text: '9 dus aqua' }), { added: 0, updated: 1 });
  d = await w.call('getChanges', { since: 0 });
  assert.deepEqual(d.workerItems.filter((i) => i.name === 'Aqua').map((i) => [i.checked, i.qty, i.unit]), [[false, 9, 'dus']]);
  assert.deepEqual(await w.call('wSetChecked', { checked: true }), { changed: 3 });
  assert.deepEqual(await w.call('wSetChecked', { checked: true }), { changed: 0 });
  await rejects(w.call('wUpdateItem', { id: 'tidak-ada', qty: 2 }), /tidak ditemukan/);
  await rejects(w.call('wUpdateItem', { id: aqua, qty: 0 }), /Qty/);
  await rejects(w.call('wUpdateItem', { id: aqua, unit: 'galon' }), /Satuan/);
  // daftar Bos tak berubah
  const b2 = new LocalStore('boss', storage);
  const bd = await b2.call('getChanges', { since: 0 });
  assert.equal(bd.items.length, 1); assert.equal(bd.items[0].qty, 5); assert.equal(bd.items[0].checked, false);
  // Bos tidak bisa memakai endpoint daftar karyawan
  await rejects(b2.call('wAddItems', { text: 'x' }), /Tidak punya akses/);
  await rejects(b2.call('receiptSubmit', {}), /Tidak punya akses/);
});

await t('Setor: hanya yang dicentang, keluar dari daftar, ketukan ganda tidak dobel, Bos mendapat setoran', async () => {
  const storage = mem();
  const w = new LocalStore('worker', storage);
  await w.call('wAddItems', { text: '5 dus Aqua\n2 kg Gula\n3 pak Teh' });
  await rejects(w.call('receiptSubmit', {}), /Tidak ada barang yang dicentang/);
  let d = await w.call('getChanges', { since: 0 });
  for (const name of ['Aqua', 'Gula']) await w.call('wToggleItem', { id: d.workerItems.find((i) => i.name === name).id });
  const out = await w.call('receiptSubmit', {});
  assert.equal(out.count, 2);
  await rejects(w.call('receiptSubmit', {}), /Tidak ada barang yang dicentang/);
  d = await w.call('getChanges', { since: 0 });
  assert.deepEqual(d.workerItems.filter((i) => !i.deletedAt).map((i) => i.name), ['Teh'], 'yang disetor hilang dari daftar');
  assert.equal(d.receipts.length, 1); assert.equal(d.receipts[0].status, 'pending');
  assert.deepEqual(d.receipts[0].lines, [{ name: 'Aqua', qty: 5, unit: 'dus' }, { name: 'Gula', qty: 2, unit: 'kg' }]);

  const boss = new LocalStore('boss', storage);
  const bd = await boss.call('getChanges', { since: 0 });
  assert.equal(bd.receipts.length, 1);
  assert.match(bd.lastAct.desc, /setoran dari .*: 2 barang/);
});

await t('Bos menyetujui: daftar Bos berkurang persis seperti "balasan"; tidak bisa dua kali', async () => {
  const storage = mem();
  const boss = new LocalStore('boss', storage);
  await boss.call('saveCategory', { name: 'Umum' });
  await boss.call('addItems', { categoryId: 1, text: '5 dus Aqua\n10 kg Gula\n2 pak Teh' });
  for (const i of (await boss.call('getChanges', {})).items) await boss.call('toggleItem', { id: i.id });

  const w = new LocalStore('worker', storage);
  await w.call('wAddItems', { text: '5 dus Aqua\n3 kg Gula\n1 dus Kopi' });
  await w.call('wSetChecked', { checked: true });
  await w.call('receiptSubmit', {});

  const b2 = new LocalStore('boss', storage);
  const rid = (await b2.call('getChanges', { since: 0 })).receipts[0].id;
  const out = await b2.call('receiptDecide', { id: rid, approve: true });
  assert.deepEqual(out, { status: 'approved', counts: { resolved: 1, partial: 1, unmatched: 1 } });
  const items = (await b2.call('getChanges', { since: 0 })).items;
  const by = Object.fromEntries(items.map((i) => [i.name, i]));
  assert.equal(by.Aqua.checked, false, 'terpenuhi: centang dilepas');
  assert.deepEqual([by.Gula.checked, by.Gula.qty], [true, 7], 'kurang: tetap tercentang dengan sisa');
  assert.deepEqual([by.Teh.checked, by.Teh.qty], [true, 2], 'tidak ada di setoran: tak berubah');
  const rc = (await b2.call('getChanges', { since: 0 })).receipts[0];
  assert.equal(rc.status, 'approved'); assert.equal(rc.result.unmatched[0].name, 'Kopi');
  await rejects(b2.call('receiptDecide', { id: rid, approve: true }), /sudah diproses/);
  await rejects(b2.call('receiptDecide', { id: rid, approve: false }), /sudah diproses/);
  await rejects(b2.call('receiptDecide', { id: 'x', approve: true }), /tidak ditemukan/);
  await rejects(new LocalStore('worker', storage).call('receiptDecide', { id: rid, approve: true }), /Tidak punya akses/);
  assert.match((await b2.call('getChanges', { since: 0 })).lastAct.desc, /disetujui: 1 terpenuhi, 1 kurang, 1 tidak cocok/);
});

await t('Bos menolak: barang kembali ke daftar karyawan (tercentang) dan setoran bisa disetor ulang', async () => {
  const storage = mem();
  const w = new LocalStore('worker', storage);
  await w.call('wAddItems', { text: '5 dus Aqua\n2 kg Gula' });
  await w.call('wSetChecked', { checked: true });
  const { id } = await w.call('receiptSubmit', {});
  const boss = new LocalStore('boss', storage);
  assert.deepEqual(await boss.call('receiptDecide', { id, approve: false, note: 'Qty salah' }), { status: 'rejected' });
  const w2 = new LocalStore('worker', storage);
  const d = await w2.call('getChanges', { since: 0 });
  const live = d.workerItems.filter((i) => !i.deletedAt);
  assert.deepEqual(live.map((i) => [i.name, i.qty, i.checked]).sort(), [['Aqua', 5, true], ['Gula', 2, true]]);
  const rc = d.receipts.find((r) => r.id === id);
  assert.equal(rc.status, 'rejected'); assert.equal(rc.note, 'Qty salah');
  const again = await w2.call('receiptSubmit', {});
  assert.equal(again.count, 2);
});

await t('id dari klien dipakai untuk barang baru (UI instan), id tak sah diganti', async () => {
  const s = new LocalStore('boss', mem());
  await s.call('saveCategory', { name: 'A' });
  const id1 = makeId();
  await s.call('addItems', { categoryId: 1, text: '1 dus X\n1 dus Y', ids: [id1, 'TIDAK SAH!'] });
  const items = (await s.call('getChanges', {})).items;
  assert.equal(items[0].id, id1);
  assert.notEqual(items[1].id, 'TIDAK SAH!'); assert.ok(validClientId(items[1].id));
});

console.log(`\nHASIL PENERIMAAN: ${n} uji lulus`);

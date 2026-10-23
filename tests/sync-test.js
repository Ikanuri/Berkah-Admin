// Uji sync-core (antrean, optimistic, polling) dan kesamaan hasil optimistic dengan server (LocalStore).
import assert from 'node:assert/strict';
import { LocalStore } from '../src/local-store.js';
import { createSyncCore } from '../src/sync-core.js';
import { createState, applyChanges, itemsOf, workerItemsOf } from '../src/state.js';
import { OPTIMISTIC, planAdd } from '../src/optimistic.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// call palsu: mencatat urutan, jumlah paralel maksimum, dan bisa ditahan/digagalkan
function fakeCall(handlers = {}, latency = 5) {
  const log = [];
  let running = 0, maxRunning = 0;
  const call = async (name, input) => {
    running++; maxRunning = Math.max(maxRunning, running);
    log.push([name, input]);
    try {
      await tick(latency);
      if (handlers[name]) return await handlers[name](input);
      return name === 'getChanges' ? { serverTime: Date.now() } : { ok: true };
    } finally { running--; }
  };
  return { call, log, get maxRunning() { return maxRunning; } };
}

function seeded() {
  const st = createState();
  st.me = { tgId: 1, role: 'boss' };
  st.categories.set(1, { id: 1, name: 'Umum', sortOrder: 1, excludeFromOrder: false, updatedAt: 1, deletedAt: null });
  for (const [id, name, qty, order] of [['a1', 'Aqua', 5, 1], ['b2', 'Gula', 2, 2]]) {
    st.items.set(id, { id, categoryId: 1, name, qty, unit: 'dus', checked: false, checkedAt: null, sortOrder: order, isi: null, satuanHpp: null, hargaBeli: null, hargaJual: null, updatedAt: 1, deletedAt: null });
  }
  return st;
}

await t('act: tampilan berubah SEKETIKA, server menyusul; panggilan berurutan satu per satu', async () => {
  const st = seeded();
  const f = fakeCall();
  let renders = 0;
  const sync = createSyncCore(st, () => renders++, { call: f.call, toast: () => {} });
  const p1 = sync.act('toggleItem', { id: 'a1' });
  const p2 = sync.act('updateItem', { id: 'a1', delta: 1 });
  const p3 = sync.act('updateItem', { id: 'a1', delta: 1 });
  assert.equal(st.items.get('a1').checked, true, 'langsung tercentang');
  assert.equal(st.items.get('a1').qty, 7, 'langsung +2');
  assert.equal(renders, 3);
  assert.equal(f.log.length, 1, 'baru satu panggilan berangkat');
  await Promise.all([p1, p2, p3]);
  await tick(20);
  assert.deepEqual(f.log.map((l) => l[0]), ['toggleItem', 'updateItem', 'updateItem', 'getChanges'], 'urut ketukan, lalu satu tarik delta');
  assert.equal(f.maxRunning, 1, 'tidak pernah paralel');
});

await t('balasan polling yang berangkat sebelum ketukan dibuang (tidak menimpa tampilan terbaru)', async () => {
  const st = seeded();
  let release;
  const gate = new Promise((r) => { release = r; });
  const stale = { serverTime: 100, items: [{ ...st.items.get('a1'), updatedAt: 50 }] }; // keadaan lama: tak tercentang
  const f = fakeCall({ getChanges: async () => { await gate; return stale; } }, 1);
  const sync = createSyncCore(st, () => {}, { call: f.call, toast: () => {} });
  const poll = sync.refresh();
  await tick(5);
  const p = sync.act('toggleItem', { id: 'a1' }); // ketukan saat polling masih jalan
  release();
  await poll;
  assert.equal(st.items.get('a1').checked, true, 'jawaban basi tidak membatalkan centang');
  await p; await tick(20);
});

await t('panggilan gagal: undo lokal, toast, dan muat ulang penuh (since 0)', async () => {
  const st = seeded();
  const toasts = [];
  const f = fakeCall({
    toggleItem: async () => { throw new Error('Jaringan putus'); },
    getChanges: async () => ({ serverTime: 9, items: [{ ...st.items.get('a1'), checked: false, updatedAt: 1 }] }),
  });
  const sync = createSyncCore(st, () => {}, { call: f.call, toast: (m) => toasts.push(m) });
  const out = await sync.act('toggleItem', { id: 'a1' });
  assert.equal(out, null);
  assert.equal(st.items.get('a1').checked, false, 'dipulihkan');
  await tick(20);
  assert.deepEqual(toasts, ['Jaringan putus']);
  const gc = f.log.find((l) => l[0] === 'getChanges');
  assert.equal(gc[1].since, 0, 'muat ulang penuh');
});

await t('addItems optimistic: baris muncul dengan id yang SAMA dikirim ke server; gagal = baris hilang', async () => {
  const st = seeded();
  const f = fakeCall();
  const sync = createSyncCore(st, () => {}, { call: f.call, toast: () => {} });
  const p = sync.act('addItems', { categoryId: 1, text: '3 kg Beras\n9 dus aqua\nGaram' });
  const list = itemsOf(st, 1);
  assert.deepEqual(list.map((i) => [i.name, i.qty, i.unit]), [['Aqua', 9, 'dus'], ['Gula', 2, 'dus'], ['Beras', 3, 'kg'], ['Garam', 1, 'dus']]);
  await p;
  const sent = f.log.find((l) => l[0] === 'addItems')[1];
  assert.equal(sent.ids.length, 2);
  assert.deepEqual(list.filter((i) => ['Beras', 'Garam'].includes(i.name)).map((i) => i.id), sent.ids, 'id lokal = id yang dikirim');
  await tick(20);

  const st2 = seeded();
  const f2 = fakeCall({ addItems: async () => { throw new Error('gagal'); } });
  const sync2 = createSyncCore(st2, () => {}, { call: f2.call, toast: () => {} });
  await sync2.act('addItems', { categoryId: 1, text: '3 kg Beras\n9 dus aqua' });
  assert.deepEqual(itemsOf(st2, 1).map((i) => [i.name, i.qty]), [['Aqua', 5], ['Gula', 2]], 'undo menghapus baris baru dan memulihkan yang diperbarui');
  await tick(20);
});

await t('applyChanges: baris server yang isinya sama dengan tampilan optimistic tidak memicu render ulang', () => {
  const st = seeded();
  OPTIMISTIC.toggleItem(st, { id: 'a1' });
  const local = st.items.get('a1');
  assert.equal(applyChanges(st, { serverTime: 5, items: [{ ...local, updatedAt: 777 }] }), false, 'isi sama');
  assert.equal(st.items.get('a1').updatedAt, 777, 'tetap diperbarui diam-diam');
  assert.equal(applyChanges(st, { serverTime: 6, items: [{ ...local, qty: 99, updatedAt: 778 }] }), true, 'isi beda');
});

await t('hasil optimistic SAMA dengan hasil server (LocalStore) untuk rangkaian aksi Bos', async () => {
  const server = new LocalStore('boss', mem());
  await server.call('saveCategory', { name: 'A' });
  await server.call('saveCategory', { name: 'B' });
  await server.call('addItems', { categoryId: 1, text: '5 dus Aqua\n2 kg Gula\n1 dus Teh' });
  await server.call('addItems', { categoryId: 2, text: '3 dus Roti' });
  const client = createState();
  client.me = { tgId: 1, role: 'boss' };
  applyChanges(client, await server.call('getChanges', { since: 0 }));
  const ids = Object.fromEntries([...client.items.values()].map((i) => [i.name, i.id]));

  const ops = [
    ['toggleItem', { id: ids.Aqua }], ['updateItem', { id: ids.Aqua, delta: -1 }], ['updateItem', { id: ids.Gula, qty: 4.5 }],
    ['updateItem', { id: ids.Teh, unit: 'pak' }], ['updateItem', { id: ids.Teh, delta: -1 }], ['updateItem', { id: ids.Roti, name: '  Roti Tawar ' }],
    ['setChecked', { categoryId: 1, checked: true }], ['toggleItem', { id: ids.Gula }], ['setChecked', { categoryId: null, checked: false }],
    ['setChecked', { categoryId: 2, checked: true }], ['deleteItem', { id: ids.Teh }], ['updateItem', { id: ids.Aqua, delta: 0.25 }],
    ['addItems', { categoryId: 1, text: '2 kg Gula\n7 pak Kopi\n7 pak kopi' }], ['reorderItems', { categoryId: 1, ids: [ids.Gula, ids.Aqua] }],
  ];
  for (const [name, input] of ops) {
    const r = OPTIMISTIC[name](client, input) || {};
    await server.call(name, r.input || input);
  }
  const sv = new LocalStore('boss', server.storage).db.items; // baca keadaan server
  const view = (rows) => rows.map((i) => [i.name, i.qty, i.unit, i.checked, !!i.deletedAt, i.categoryId, i.sortOrder]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  assert.deepEqual(view([...client.items.values()]), view(sv));
});

await t('hasil optimistic SAMA dengan server untuk daftar pribadi Karyawan', async () => {
  const storage = mem();
  const server = new LocalStore('worker', storage);
  await server.call('wAddItems', { text: '5 dus Aqua\n2 kg Gula' });
  const client = createState();
  client.me = { tgId: 1, role: 'worker' };
  applyChanges(client, await server.call('getChanges', { since: 0 }));
  const ids = Object.fromEntries(workerItemsOf(client).map((i) => [i.name, i.id]));
  const ops = [
    ['wToggleItem', { id: ids.Aqua }], ['wUpdateItem', { id: ids.Aqua, delta: -1 }], ['wUpdateItem', { id: ids.Gula, unit: 'pak', qty: 3 }],
    ['wSetChecked', { checked: true }], ['wAddItems', { text: '9 dus aqua\n1 pak Kopi' }], ['wToggleItem', { id: ids.Gula }],
  ];
  for (const [name, input] of ops) {
    const r = OPTIMISTIC[name](client, input) || {};
    await server.call(name, r.input || input);
  }
  const sv = new LocalStore('worker', storage).db.workerItems.filter((i) => !i.deletedAt);
  const view = (rows) => rows.filter((i) => !i.deletedAt).map((i) => [i.name, i.qty, i.unit, i.checked, i.sortOrder]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  assert.deepEqual(view([...client.workerItems.values()]), view(sv));
});

await t('planAdd menghitung baru/diperbarui sama seperti server, termasuk baris kembar', () => {
  const existing = [{ id: 'x', name: 'Aqua', qty: 1, unit: 'dus', sortOrder: 1 }];
  const p = planAdd(existing, '3 kg Beras\n9 dus aqua\n2 kg beras\nxxx');
  assert.deepEqual([p.added, p.updated], [2, 2], 'Beras baru, aqua diperbarui, beras kedua = pembaruan, xxx baru');
});

console.log(`\nHASIL SYNC: ${n} uji lulus`);

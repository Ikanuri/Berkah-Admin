// Uji cache buka-cepat: bolak-balik, per pengguna, kedaluwarsa, dan tahan penyimpanan rusak/penuh.
import assert from 'node:assert/strict';
import { createState, applyChanges } from '../src/state.js';
import { snapshot, restore, loadCache, saveCache, clearCache } from '../src/cache.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

function filled() {
  const st = createState();
  st.me = { tgId: 7, name: 'Bos', role: 'boss' };
  applyChanges(st, {
    serverTime: 1234, lastAct: { ts: 5, desc: 'x', by: 'y' },
    categories: [{ id: 1, name: 'A', sortOrder: 1, updatedAt: 1, deletedAt: null }],
    items: [{ id: 'i1', categoryId: 1, name: 'Aqua', qty: 2, unit: 'dus', checked: true, checkedAt: 9, sortOrder: 1, updatedAt: 2, deletedAt: null }],
    remRecurring: [{ supplierId: 3, days: [1], time: '08:00', updatedAt: 3, deletedAt: null }],
    workerItems: [{ id: 'w1', ownerId: 7, name: 'Gula', qty: 1, unit: 'kg', checked: false, sortOrder: 1, updatedAt: 4, deletedAt: null }],
    receipts: [{ id: 'r1', workerId: 7, status: 'pending', lines: [{ name: 'Gula', qty: 1, unit: 'kg' }], submittedAt: 8, updatedAt: 8 }],
  });
  return st;
}

t('snapshot -> restore mengembalikan seluruh state (termasuk kunci supplierId)', () => {
  const st = filled();
  const back = createState();
  restore(back, JSON.parse(JSON.stringify(snapshot(st))));
  assert.deepEqual(back.me, st.me);
  assert.equal(back.serverTime, 1234);
  assert.deepEqual([...back.items.values()], [...st.items.values()]);
  assert.deepEqual([...back.remRecurring.keys()], [3]);
  assert.deepEqual([...back.workerItems.keys()], ['w1']);
  assert.deepEqual([...back.receipts.keys()], ['r1']);
  assert.deepEqual(back.lastAct, st.lastAct);
});

t('cache terikat ke satu pengguna dan kedaluwarsa', () => {
  const s = mem();
  assert.equal(saveCache(7, filled(), s), true);
  assert.ok(loadCache(7, s));
  assert.equal(loadCache(8, s), null, 'pengguna lain tidak membaca cache ini');
  const snap = JSON.parse(s.getItem('berkah-cache-v1-7'));
  assert.equal(loadCache(7, s, snap.savedAt + 8 * 86400000), null, 'lebih dari 7 hari dibuang');
  s.setItem('berkah-cache-v1-9', JSON.stringify({ ...snap, savedAt: Date.now() })); // isi milik id 7 di kunci id 9
  assert.equal(loadCache(9, s), null, 'isi cache harus milik pemilik kunci');
  clearCache(7, s);
  assert.equal(loadCache(7, s), null);
});

t('penyimpanan rusak atau penuh tidak merusak app', () => {
  const bad = mem(); bad.setItem('berkah-cache-v1-7', '{rusak');
  assert.equal(loadCache(7, bad), null);
  const full = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  assert.equal(saveCache(7, filled(), full), false);
  assert.equal(loadCache(7, null), null);
});

console.log(`\nHASIL CACHE: ${n} uji lulus`);

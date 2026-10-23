// Uji state klien murni. Jalankan: node tests/state-test.js
import assert from 'node:assert/strict';
import { createState, applyChanges, inRange, buildOrderText, relTime, dayStr } from '../src/state.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

const NOW = new Date(2026, 9, 23, 12, 0, 0).getTime(); // 23 Okt 2026 12:00 lokal
const at = (daysAgo, h = 9) => new Date(2026, 9, 23 - daysAgo, h, 0, 0).getTime();

t('inRange: all, today, 7d, custom, tanpa waktu', () => {
  assert.equal(inRange({ preset: 'all' }, null, NOW), true);
  assert.equal(inRange({ preset: 'today' }, at(0), NOW), true);
  assert.equal(inRange({ preset: 'today' }, at(1), NOW), false);
  assert.equal(inRange({ preset: '7d' }, at(6), NOW), true, 'hari ke-7 (6 hari lalu) masih masuk');
  assert.equal(inRange({ preset: '7d' }, at(7), NOW), false);
  assert.equal(inRange({ preset: 'today' }, null, NOW), false, 'tanpa checkedAt tidak masuk filter selain all');
  assert.equal(inRange({ preset: 'custom', from: '2026-10-20', to: '2026-10-22' }, at(1), NOW), true);
  assert.equal(inRange({ preset: 'custom', from: '2026-10-20', to: '2026-10-22' }, at(0), NOW), false);
  assert.equal(inRange({ preset: 'custom', from: null, to: null }, at(0), NOW), true, 'kustom tanpa rentang = tidak menyaring');
});

const build = (items, cats = [{ id: 1, name: 'A', sortOrder: 1, excludeFromOrder: false, updatedAt: 1 }]) => {
  const st = createState();
  applyChanges(st, { serverTime: 1, categories: cats, items: items.map((i, k) => ({ categoryId: 1, sortOrder: k + 1, updatedAt: 1, unit: 'dus', qty: 1, checked: true, ...i })) });
  return st;
};

t('buildOrderText: header tanggal hanya bila > 1 tanggal, terbaru dulu', () => {
  const st = build([
    { id: 'a', name: 'Aqua', qty: 5, checkedAt: at(0) },
    { id: 'b', name: 'Gula', qty: 2, unit: 'kg', checkedAt: at(1) },
    { id: 'c', name: 'Telur', qty: 1, checkedAt: at(5) },
    { id: 'd', name: 'Lama', qty: 1, checkedAt: null },
  ]);
  // urutan mengikuti app lama: kunci tanggal diurut menurun sebagai teks, jadi
  // 'tanpa-tanggal' (huruf) mendahului angka dan grup "Sebelumnya" tampil di atas.
  assert.equal(buildOrderText(st, { now: NOW }), [
    '── Sebelumnya ──', '1 dus Lama', '── Hari ini ──', '5 dus Aqua', '── Kemarin ──', '2 kg Gula', '── 18 Okt ──', '1 dus Telur'].join('\n'));
  assert.equal(buildOrderText(st, { now: NOW, tsHeaders: false }), '1 dus Lama\n5 dus Aqua\n2 kg Gula\n1 dus Telur');
  const one = build([{ id: 'a', name: 'Aqua', qty: 5, checkedAt: at(0) }, { id: 'b', name: 'Gula', checkedAt: at(0) }]);
  assert.equal(buildOrderText(one, { now: NOW }), '5 dus Aqua\n1 dus Gula', 'satu tanggal: tanpa header');
});

t('buildOrderText: filter tanggal & kategori dikecualikan', () => {
  const st = build([
    { id: 'a', name: 'Aqua', qty: 5, checkedAt: at(0) },
    { id: 'b', name: 'Gula', checkedAt: at(3) },
  ]);
  assert.equal(buildOrderText(st, { now: NOW, filter: { preset: 'today' } }), '5 dus Aqua');
  assert.equal(buildOrderText(st, { now: NOW, filter: { preset: 'all' }, tsHeaders: false }), '5 dus Aqua\n1 dus Gula');
  st.categories.set(1, { ...st.categories.get(1), excludeFromOrder: true });
  assert.equal(buildOrderText(st, { now: NOW, applyExclude: true }), '');
  assert.notEqual(buildOrderText(st, { now: NOW, applyExclude: false }), '', 'Karyawan tidak terkena filter kategori');
});

t('relTime', () => {
  assert.equal(relTime(NOW - 10000, NOW), 'baru saja');
  assert.equal(relTime(NOW - 5 * 60000, NOW), '5 menit lalu');
  assert.equal(relTime(NOW - 3 * 3600000, NOW), '3 jam lalu');
  assert.equal(relTime(NOW - 2 * 86400000, NOW), '2 hari lalu');
  assert.match(relTime(NOW - 10 * 86400000, NOW), /^13 Okt \d\d:\d\d$/);
  assert.equal(relTime(null), null);
});

t('applyChanges: lastAct dan baris lebih lama diabaikan', () => {
  const st = createState();
  applyChanges(st, { serverTime: 5, items: [{ id: 'a', categoryId: 1, updatedAt: 10, name: 'baru' }], lastAct: { ts: 1, desc: 'x', by: 'Siti' } });
  applyChanges(st, { serverTime: 6, items: [{ id: 'a', categoryId: 1, updatedAt: 5, name: 'usang' }] });
  assert.equal(st.items.get('a').name, 'baru');
  assert.equal(st.lastAct.desc, 'x');
  assert.equal(dayStr(NOW), '2026-10-23');
});

console.log(`\nHASIL: ${n} uji state lulus`);

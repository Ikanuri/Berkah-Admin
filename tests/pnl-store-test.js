// Kontrak LocalStore untuk PNL: peran, upsert per tanggal, arsip independen.
import assert from 'node:assert/strict';
import { LocalStore } from '../src/local-store.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };

const D1 = '#tanggal 2026-06-01\n#pengeluaran\n350000 Uang Indah\n#prive\n66200 Belanja\n#cash 5628000 + 190000 saldo\n#receh 21000\n#income 7497200\n#kulakan 5808330';
const D2 = '#tanggal 2026-06-02\n#cash 4100000\n#income 5000000\n#kulakan 3900000';

await t('worker & pending ditolak untuk semua endpoint PNL', async () => {
  for (const role of ['worker', 'pending']) {
    const s = new LocalStore(role, mem());
    for (const [ep, input] of [['pnlGetAll', {}], ['pnlProcess', { raw: D1 }], ['pnlDeleteDay', { ds: '2026-06-01' }], ['pnlDeleteArsip', { all: true }]]) {
      await assert.rejects(s.call(ep, input), /Tidak punya akses/, `${role}/${ep}`);
    }
  }
});

await t('proses menambah hari, bukan mengganti; hari yang sama diganti utuh', async () => {
  const s = new LocalStore('boss', mem());
  let r = await s.call('pnlProcess', { raw: D1 });
  assert.equal(r.saved, 1); assert.equal(r.arsipN, 2); assert.equal(r.total, 1);
  r = await s.call('pnlProcess', { raw: D2 });
  assert.equal(r.total, 2);
  assert.equal(r.days['2026-06-01'].income, 7497200, 'hari pertama tetap');
  assert.deepEqual(r.arsip['2026-06-02'], undefined, 'hari tanpa rincian tidak punya arsip');
  // proses ulang 06-01 dengan rincian berbeda: arsip tanggal itu diganti, bukan ditumpuk
  r = await s.call('pnlProcess', { raw: D1.replace('350000 Uang Indah', '1000 Listrik') });
  assert.deepEqual(r.arsip['2026-06-01'], [{ j: 'p', amt: 1000, ket: 'Listrik' }, { j: 'v', amt: 66200, ket: 'Belanja' }]);
  assert.equal(r.total, 2);
});

await t('teks kosong/tanpa blok/tanpa data valid ditolak dengan pesan jelas', async () => {
  const s = new LocalStore('boss', mem());
  await assert.rejects(s.call('pnlProcess', { raw: '  ' }), /Paste raw data/);
  await assert.rejects(s.call('pnlProcess', { raw: '#tanggal ngawur\n#income 5' }), /Tidak ada data valid/);
  await assert.rejects(s.call('pnlProcess', { raw: '#tanggal 2026-06-05\n#receh 5' }), /Tidak ada data valid/);
});

await t('hapus hari tidak menghapus arsipnya; hapus arsip per tanggal dan semua', async () => {
  const s = new LocalStore('boss', mem());
  await s.call('pnlProcess', { raw: D1 + '\n\n' + D2 });
  await s.call('pnlDeleteDay', { ds: '2026-6-1' }); // dikanonisasi
  let all = await s.call('pnlGetAll');
  assert.deepEqual(Object.keys(all.days), ['2026-06-02']);
  assert.equal(all.arsip['2026-06-01'].length, 2, 'arsip bertahan (sengaja)');
  await s.call('pnlDeleteArsip', { ds: '2026-06-01' });
  all = await s.call('pnlGetAll');
  assert.deepEqual(all.arsip, {});
  await s.call('pnlProcess', { raw: D1 });
  await s.call('pnlDeleteArsip', { all: true });
  assert.deepEqual((await s.call('pnlGetAll')).arsip, {});
  await assert.rejects(s.call('pnlDeleteDay', { ds: 'x' }), /tidak valid/);
});

console.log(`\nHASIL PNL-STORE: ${n} uji lulus`);

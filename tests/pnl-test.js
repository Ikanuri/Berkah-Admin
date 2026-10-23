// Uji PNL: parser, rumus, agregat (minggu ISO, bulan), arsip, donut. Jalankan: node tests/pnl-test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../tgcloud/lib/pnl.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

const RAW1 = `#tanggal 2026-06-01
#pengeluaran
350000 Uang Indah
#prive
66200 Belanja
#cash 5628000 + 190000 saldo
#receh 21000
#income 7497200
#kulakan 5808330`;

t('parseAngka integer: titik/koma dibuang (sengaja)', () => {
  assert.equal(P.parseAngka('1.500,75'), 150075);
  assert.equal(P.parseAngka('7.497.200'), 7497200);
  assert.equal(P.parseAngka(''), 0);
  assert.equal(P.parseAngka('abc'), 0);
});

t('tanggal dikanonisasi dan tidak bergantung zona waktu', () => {
  assert.equal(P.canonDate('2026-7-1'), '2026-07-01');
  assert.equal(P.canonDate('2026-07-01'), '2026-07-01');
  assert.equal(P.canonDate('2026-02-31'), '2026-03-03', 'bergulir seperti Date lama');
  assert.equal(P.canonDate('ngawur'), null);
  assert.equal(P.canonDate('2026-06'), null);
  assert.equal(P.hari('2026-06-01'), 'Sen');
  assert.equal(P.fmtTgl('2026-06-01'), '01/06/2026');
});

t('hari lengkap: #cash dijumlah, rumus gross/net/margin', () => {
  const r = P.processRaw(RAW1);
  assert.equal(r.days.length, 1);
  const { ds, data: d } = r.days[0];
  assert.equal(ds, '2026-06-01');
  assert.equal(d.cash, 5818000);
  assert.equal(d.income, 7497200); assert.equal(d.kulakan, 5808330);
  assert.equal(d.gross, 1688870); assert.equal(d.netPos, 9670);
  assert.equal(d.totalPengeluaran, 350000); assert.equal(d.totalPrive, 66200);
  assert.deepEqual(d.rincianPengeluaran, [{ jumlah: 350000, ket: 'Uang Indah' }]);
  assert.ok(Math.abs(d.marginP - (1688870 / 7497200) * 100) < 1e-9);
  assert.ok(Math.abs(d.marginC - (9670 / 7497200) * 100) < 1e-9);
});

t('rincian: semua angka dijumlah, ket dibersihkan, kosong jadi "-"', () => {
  const r = P.processRaw(`#tanggal 2026-06-03\n#income 100\n#pengeluaran\n10.000 + 5.000 (bensin) pagi\n20000\nteks tanpa angka\n#prive\n1.000 ( ) +`);
  const d = r.days[0].data;
  assert.deepEqual(d.rincianPengeluaran, [{ jumlah: 15000, ket: 'bensin pagi' }, { jumlah: 20000, ket: '-' }]);
  assert.deepEqual(d.rincianPrive, [{ jumlah: 1000, ket: '-' }]);
});

t('baris #gross/#net_cash/#margin diabaikan dan memutus rincian', () => {
  const r = P.processRaw(`#tanggal 2026-06-04\n#pengeluaran\n500 a\n#gross 999\n600 b\n#income 1000\n#kulakan 200`);
  const d = r.days[0].data;
  assert.equal(d.rincianPengeluaran.length, 1, 'setelah #gross, "600 b" bukan rincian');
  assert.equal(d.gross, 800);
});

t('blok tanpa tanggal atau tanpa angka utama dilewati; tanggal kembar: terakhir menang', () => {
  const r = P.processRaw(`#tanggal 2026-06-05\n#receh 5000\n\n#tanggal ngawur\n#income 10\n\n#tanggal 2026-6-6\n#income 10\n\n#tanggal 2026-06-06\n#income 20`);
  assert.equal(r.bloks, 4);
  assert.equal(r.skipped, 2);
  assert.deepEqual(r.days.map((x) => [x.ds, x.data.income]), [['2026-06-06', 20]]);
  assert.match(r.preview[0], /DILEWATI/);
  assert.deepEqual(P.processRaw('   ').days, []);
});

t('income 0: margin 0 (tidak NaN)', () => {
  const d = P.processRaw('#tanggal 2026-06-07\n#kulakan 500\n#cash 100').days[0].data;
  assert.equal(d.marginP, 0); assert.equal(d.marginC, 0); assert.equal(d.gross, -500);
});

t('ringkasan: margin tertimbang dari total, bukan rata-rata harian', () => {
  const a = P.processRaw('#tanggal 2026-06-01\n#income 100\n#kulakan 50\n#cash 60').days[0].data; // 50%
  const b = P.processRaw('#tanggal 2026-06-02\n#income 900\n#kulakan 800\n#cash 850').days[0].data; // 11.11%
  const s = P.summarize([a, b]);
  assert.equal(s.income, 1000); assert.equal(s.gross, 150);
  assert.equal(s.marginP, 15, 'bukan (50+11.1)/2 = 30.6');
  assert.equal(s.marginC, ((10 + 50) / 1000) * 100);
  assert.equal(s.hari, 2);
});

t('warna margin: >=15 pos, >=0 warn, <0 neg', () => {
  assert.equal(P.marginCls(15), 'pos'); assert.equal(P.marginCls(14.99), 'warn');
  assert.equal(P.marginCls(0), 'warn'); assert.equal(P.marginCls(-0.1), 'neg');
});

t('minggu ISO & bulan', () => {
  assert.equal(P.weekKey('2026-06-01'), '2026-W23');
  assert.equal(P.weekKey('2026-01-01'), '2026-W01'); // Kamis
  assert.equal(P.weekKey('2027-01-01'), '2026-W53'); // Jumat: ikut tahun 2026
  assert.equal(P.weekKey('2024-12-30'), '2025-W01'); // Senin, Kamis jatuh 2025
  assert.equal(P.weekKey('2026-06-07'), '2026-W23'); // Minggu masih minggu itu
  assert.equal(P.monthKey('2026-06-30'), 'Jun 2026');
  assert.equal(P.monthKey('2026-12-01'), 'Des 2026');
});

t('groupDays menjumlah per periode dengan urutan kemunculan', () => {
  const mk = (ds, inc, kul) => ({ ds, ...P.derive({ income: inc, kulakan: kul, cash: 0, receh: 0, totalPengeluaran: 1, totalPrive: 2 }) });
  const g = P.groupDays([mk('2026-06-01', 100, 40), mk('2026-06-02', 200, 50), mk('2026-06-09', 300, 100)], P.weekKey);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].hari, g[0].income, g[0].gross, g[0].pengeluaran, g[0].prive], [2, 300, 210, 2, 4]);
  assert.equal(g[1].label, '2026-W24');
});

t('arsip diturunkan dari rincian, ganti utuh per tanggal', () => {
  const d = P.processRaw('#tanggal 2026-06-01\n#income 1\n#pengeluaran\n10 a\n#prive\n20 b').days[0].data;
  assert.deepEqual(P.arsipOf(d), [{ j: 'p', amt: 10, ket: 'a' }, { j: 'v', amt: 20, ket: 'b' }]);
});

t('format singkat & normalisasi keterangan', () => {
  assert.equal(P.fmtShort(1500000), '1,5 jt');
  assert.equal(P.fmtShort(2500000000), '2,5 M');
  assert.equal(P.fmtShort(350000), '350 rb');
  assert.equal(P.fmtShort(999), '999');
  assert.equal(P.normKet('  Uang   INDAH '), 'uang indah');
  assert.equal(P.normKet(''), '-');
  assert.equal(P.rp(1234567.6), '1.234.568');
});

const arsip = {
  '2026-06-01': [{ j: 'p', amt: 100, ket: 'Listrik' }, { j: 'v', amt: 50, ket: 'jajan' }],
  '2026-06-05': [{ j: 'p', amt: 300, ket: 'listrik' }, { j: 'p', amt: 10, ket: '-' }],
  '2026-05-20': [{ j: 'p', amt: 70, ket: 'Plastik' }],
};
t('filter rentang arsip dan pencarian', () => {
  const ds = (f, extra = {}) => P.arsipEntries(arsip, { filter: f, today: '2026-06-05', ...extra }).map((e) => e.ds);
  assert.deepEqual(ds('all'), ['2026-06-05', '2026-06-05', '2026-06-01', '2026-06-01', '2026-05-20']);
  assert.deepEqual([...new Set(ds('today'))], ['2026-06-05']);
  assert.deepEqual([...new Set(ds('3d'))], ['2026-06-05'], '3 hari = hari ini dan 2 hari sebelumnya (03..05)');
  assert.deepEqual([...new Set(ds('7d'))], ['2026-06-05', '2026-06-01'], '7 hari = 30 Mei..5 Jun');
  assert.deepEqual([...new Set(ds('month'))], ['2026-06-05', '2026-06-01']);
  assert.deepEqual([...new Set(ds('custom', { from: '2026-05-01', to: '2026-05-31' }))], ['2026-05-20']);
  assert.equal(ds('all', { search: 'LISTRIK' }).length, 2);
  assert.equal(ds('all', { search: 'zzz' }).length, 0);
});

t('donut: warna stabil mengikuti entitas, sisanya "Lainnya", jenis memfilter', () => {
  const all = P.arsipEntries(arsip, { filter: 'all', today: '2026-06-05' });
  const s = P.donutSlices(all, arsip, 'p');
  const listrik = s.find((x) => x.key === 'listrik');
  assert.equal(listrik.total, 400); assert.equal(listrik.n, 2); assert.equal(listrik.slot, 0, 'terbesar = slot 0');
  const filtered = P.arsipEntries(arsip, { filter: 'today', today: '2026-06-05' });
  const s2 = P.donutSlices(filtered, arsip, 'p');
  assert.equal(s2.find((x) => x.key === 'listrik').slot, 0, 'filter tanggal tidak mengubah warna');
  assert.equal(s.some((x) => x.key.startsWith('v|')), false);
  const g = P.donutSlices(all, arsip, 'all');
  assert.ok(g.find((x) => x.key === 'v|jajan'));
  assert.equal(g.find((x) => x.key === 'p|listrik').label, 'listrik · P');
  // > 8 entitas: sisanya masuk Lainnya
  const many = { '2026-06-01': Array.from({ length: 10 }, (_, i) => ({ j: 'p', amt: 100 - i, ket: 'k' + i })) };
  const ms = P.donutSlices(P.arsipEntries(many, { filter: 'all', today: '2026-06-01' }), many, 'p');
  assert.equal(ms.length, 9);
  assert.deepEqual(ms.at(-1), { key: '__other', label: 'Lainnya', total: 92 + 91, n: 2, slot: -1 });
});

t('arcPath menghasilkan busur sah', () => {
  assert.match(P.arcPath(110, 110, 82, 0, Math.PI / 2), /^M 192\.00 110\.00 A 82 82 0 0 1 110\.00 192\.00$/);
  assert.match(P.arcPath(110, 110, 82, 0, 4), / 0 1 1 /);
});

t('data backup app lama konsisten dengan rumus baru', () => {
  const fx = JSON.parse(readFileSync('tests/fixtures/legacy-backup.json', 'utf8')).pnl;
  for (const [ds, d] of Object.entries(fx.days)) {
    assert.deepEqual(P.derive({ ...d, gross: 0, netPos: 0, marginP: 0, marginC: 0 }), d, ds);
    assert.deepEqual(P.arsipOf(d), fx.arsip[ds]);
  }
});

console.log(`\nHASIL PNL: ${n} uji lulus`);

// PNL Analyzer: parser teks harian, rumus, agregat, arsip. Murni (tanpa DB/DOM).
// Port persis pn*/ars* di legacy/berkah-admin-1.5.0.html (baris 2791-3540).
// Tanggal = string 'YYYY-MM-DD' (bukan Date), dihitung lewat UTC supaya tidak terkena zona waktu.

// Parser angka PNL SENGAJA integer: buang titik/koma/spasi lalu parseInt ("1.500,75" -> 150075).
export function parseAngka(str) {
  if (!str) return 0;
  return parseInt(String(str).replace(/[.,\s]/g, ''), 10) || 0;
}

const p2 = (n) => String(n).padStart(2, '0');

// "2026-7-1" dan "2026-07-01" -> "2026-07-01". Tanggal mustahil (02-31) bergulir seperti Date lama.
export function canonDate(str) {
  if (!str) return null;
  const p = String(str).trim().split('-');
  if (p.length !== 3) return null;
  const y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(t.getTime())) return null;
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}

const ymd = (ds) => ds.split('-').map(Number);
const utc = (ds) => { const [y, m, d] = ymd(ds); return new Date(Date.UTC(y, m - 1, d)); };

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const hari = (ds) => HARI[utc(ds).getUTCDay()];
export const fmtTgl = (ds) => { const [y, m, d] = ymd(ds); return `${p2(d)}/${p2(m)}/${y}`; };
export const dateLabel = (ds) => { const [y, m, d] = ymd(ds); return `${hari(ds)}, ${d} ${BULAN[m - 1]} ${y}`; };

export function splitBloks(raw) {
  const lines = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const bloks = [];
  let cur = [];
  for (const line of lines) {
    if (/^#tanggal\s+/i.test(line.trim()) && cur.length) { bloks.push(cur.join('\n').trim()); cur = []; }
    cur.push(line);
  }
  if (cur.length) bloks.push(cur.join('\n').trim());
  return bloks.filter((b) => b.length);
}

export function derive(d) {
  d.gross = d.income - d.kulakan;
  d.netPos = d.cash - d.kulakan;
  d.marginP = d.income > 0 ? (d.gross / d.income) * 100 : 0;
  d.marginC = d.income > 0 ? (d.netPos / d.income) * 100 : 0;
  return d;
}

export function parseBlok(lines) {
  const data = { income: 0, kulakan: 0, cash: 0, receh: 0, totalPengeluaran: 0, totalPrive: 0, rincianPengeluaran: [], rincianPrive: [], tanggal: null };
  let mode = null;
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (/^#tanggal\s+/i.test(line)) {
      const m = line.match(/^#tanggal\s+(\S+)/i);
      if (m) data.tanggal = canonDate(m[1]);
      mode = null; continue;
    }
    if (/^#pengeluaran\s*$/i.test(line)) { mode = 'pengeluaran'; continue; }
    if (/^#prive\s*$/i.test(line)) { mode = 'prive'; continue; }

    const mIncome = line.match(/^#income\s+([\d.,]+)/i);
    const mKulakan = line.match(/^#kulakan\s+([\d.,]+)/i);
    const mCash = /^#cash\s+/i.test(line);
    const mReceh = line.match(/^#receh\s+([\d.,]+)/i);
    if (mIncome || mKulakan || mCash || mReceh || /^#(gross|net_cash|margin)/i.test(line)) mode = null;

    if (mIncome) { data.income = parseAngka(mIncome[1]); continue; }
    if (mKulakan) { data.kulakan = parseAngka(mKulakan[1]); continue; }
    if (mCash) {
      // "#cash 5628000 + 190000 saldo": SEMUA angka dijumlah (sengaja)
      const nums = line.replace(/^#cash\s+/i, '').match(/[\d.,]+/g);
      data.cash = nums ? nums.reduce((s, n) => s + parseAngka(n), 0) : 0;
      continue;
    }
    if (mReceh) { data.receh = parseAngka(mReceh[1]); continue; }
    if (/^#(gross|net_cash|margin)/i.test(line)) continue;

    if (mode === 'pengeluaran' || mode === 'prive') {
      if (line.startsWith('#')) { mode = null; continue; }
      const nums = line.match(/[\d.,]+/g);
      if (!nums) continue;
      const jumlah = nums.reduce((s, n) => s + parseAngka(n), 0);
      const ket = line.replace(/[\d.,]+/g, '').replace(/[+()]/g, '').replace(/\s+/g, ' ').trim() || '-';
      if (mode === 'pengeluaran') { data.totalPengeluaran += jumlah; data.rincianPengeluaran.push({ jumlah, ket }); }
      else { data.totalPrive += jumlah; data.rincianPrive.push({ jumlah, ket }); }
    }
  }
  return derive(data);
}

// raw -> { days: [{ds, data}], skipped, preview[] }. Hari kembar dalam satu teks: yang terakhir menang.
export function processRaw(raw) {
  const bloks = splitBloks(raw);
  const days = new Map();
  const preview = [];
  let skipped = 0;
  bloks.forEach((blok, i) => {
    const parsed = parseBlok(blok.split('\n'));
    const first = blok.split('\n')[0].slice(0, 38);
    if (!parsed.tanggal || (!parsed.income && !parsed.kulakan && !parsed.cash)) {
      skipped++;
      preview.push(`⚠ blok ${i + 1} DILEWATI — "${first}"`);
      return;
    }
    const { tanggal, ...data } = parsed;
    days.set(tanggal, data);
    preview.push(`blok ${i + 1} → ${hari(tanggal)} ${fmtTgl(tanggal)} · income ${rp(data.income)} (tersimpan)`);
  });
  return { days: [...days].map(([ds, data]) => ({ ds, data })), skipped, preview, bloks: bloks.length };
}

// Arsip per tanggal diturunkan dari rincian hari itu. j: 'p' pengeluaran, 'v' prive.
export function arsipOf(data) {
  return [
    ...data.rincianPengeluaran.map((it) => ({ j: 'p', amt: it.jumlah, ket: it.ket })),
    ...data.rincianPrive.map((it) => ({ j: 'v', amt: it.jumlah, ket: it.ket })),
  ];
}

export const rp = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const marginCls = (mp) => (mp >= 15 ? 'pos' : mp >= 0 ? 'warn' : 'neg');

const sum = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0);

// Ringkasan: margin TERTIMBANG dari total (bukan rata-rata persen harian).
export function summarize(days) {
  const ti = sum(days, 'income'), tk = sum(days, 'kulakan'), tg = sum(days, 'gross'), tn = sum(days, 'netPos');
  return {
    hari: days.length, income: ti, kulakan: tk, gross: tg, netPos: tn,
    pengeluaran: sum(days, 'totalPengeluaran'), prive: sum(days, 'totalPrive'), cash: sum(days, 'cash'), receh: sum(days, 'receh'),
    marginP: ti > 0 ? (tg / ti) * 100 : 0, marginC: ti > 0 ? (tn / ti) * 100 : 0,
  };
}

// Minggu ISO (Kamis menentukan tahun) dari tanggal 'YYYY-MM-DD'.
export function weekKey(ds) {
  const t = utc(ds);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - ys) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${p2(wk)}`;
}
export const monthKey = (ds) => { const [y, m] = ymd(ds); return `${BULAN[m - 1]} ${y}`; };

// days: [{ds, ...data}] terurut menaik. Kembalikan grup berurutan kemunculan.
export function groupDays(days, keyFn) {
  const map = new Map();
  for (const d of days) {
    const k = keyFn(d.ds);
    if (!map.has(k)) map.set(k, { label: k, income: 0, kulakan: 0, pengeluaran: 0, prive: 0, gross: 0, netPos: 0, hari: 0, days: [] });
    const g = map.get(k);
    g.income += d.income; g.kulakan += d.kulakan; g.pengeluaran += d.totalPengeluaran; g.prive += d.totalPrive;
    g.gross += d.gross; g.netPos += d.netPos; g.hari++; g.days.push(d);
  }
  return [...map.values()];
}

// Rentang tanggal [from, to] inklusif (string YYYY-MM-DD, perbandingan leksikal).
export const inRangeDs = (ds, from, to) => !from || !to || (ds >= from && ds <= to);

// ── Arsip ──
export const normKet = (k) => String(k).toLowerCase().replace(/\s+/g, ' ').trim() || '-';

export function fmtShort(n) {
  const a = Math.abs(n);
  const f = (v, max) => { const r = Math.round(v * 10 ** max) / 10 ** max; return String(r).replace('.', ','); };
  if (a >= 1e9) return f(n / 1e9, 2) + ' M';
  if (a >= 1e6) return f(n / 1e6, 2) + ' jt';
  if (a >= 1e3) return rp(Math.round(n / 1e3)) + ' rb';
  return rp(n);
}

// Filter rentang arsip: all | today | 3d | 7d | month | custom
export function arsipInRange(ds, filter, today, from, to) {
  if (filter === 'all') return true;
  if (filter === 'today') return ds === today;
  if (filter === '3d' || filter === '7d') {
    const t = utc(today);
    t.setUTCDate(t.getUTCDate() - (filter === '3d' ? 2 : 6));
    const fs = `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
    return ds >= fs && ds <= today;
  }
  if (filter === 'month') return ds.slice(0, 7) === today.slice(0, 7);
  if (filter === 'custom' && from && to) return ds >= from && ds <= to;
  return true;
}

// Entri arsip terfilter -> [{ds, j, amt, ket}] terurut tanggal turun
export function arsipEntries(arsip, { filter = 'all', today, from, to, search = '' } = {}) {
  const out = [];
  const q = normKet(search);
  for (const ds of Object.keys(arsip).sort((a, b) => b.localeCompare(a))) {
    if (!arsipInRange(ds, filter, today, from, to)) continue;
    for (const e of arsip[ds] || []) {
      if (q !== '-' && q && !normKet(e.ket).includes(q)) continue;
      out.push({ ds, j: e.j, amt: e.amt, ket: e.ket });
    }
  }
  return out;
}

// Irisan donut: warna mengikuti ENTITAS (peringkat dari SEMUA data), bukan peringkat terfilter.
export const MAX_SLICES = 8;
export function donutSlices(entries, arsip, jenis) {
  const keyOf = (e) => (jenis === 'all' ? e.j + '|' : '') + normKet(e.ket);
  const labelOf = (e) => { const base = e.ket === '-' ? '(tanpa keterangan)' : e.ket; return jenis === 'all' ? base + (e.j === 'p' ? ' · P' : ' · Pr') : base; };
  const tot = {};
  for (const list of Object.values(arsip)) for (const e of list || []) {
    if (jenis !== 'all' && e.j !== jenis) continue;
    const k = keyOf(e); tot[k] = (tot[k] || 0) + e.amt;
  }
  const slot = {};
  Object.keys(tot).sort((a, b) => tot[b] - tot[a]).slice(0, MAX_SLICES).forEach((k, i) => { slot[k] = i; });
  const groups = {};
  for (const e of entries) {
    if (jenis !== 'all' && e.j !== jenis) continue;
    const k = keyOf(e);
    (groups[k] ??= { key: k, label: labelOf(e), total: 0, n: 0 });
    groups[k].total += e.amt; groups[k].n++;
  }
  const slices = [];
  const other = { key: '__other', label: 'Lainnya', total: 0, n: 0, slot: -1 };
  for (const g of Object.values(groups).sort((a, b) => b.total - a.total)) {
    if (slot[g.key] != null) slices.push({ ...g, slot: slot[g.key] }); else { other.total += g.total; other.n += g.n; }
  }
  if (other.total > 0) slices.push(other);
  return slices;
}

export function arcPath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

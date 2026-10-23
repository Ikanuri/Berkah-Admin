// Modul PNL Analyzer (khusus Bos). Port pn*/ars* dari legacy/berkah-admin-1.5.0.html.
// Semua perhitungan ada di tgcloud/lib/pnl.js (diuji); file ini hanya tampilan.
import '../pnl.css';
import { h, confirmBox, toast } from '../dom.js';
import { call } from '../api.js';
import * as L from '../../tgcloud/lib/pnl.js';

const RAW_KEY = 'berkah-pnl-raw';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* abaikan */ } };
const p2 = (n) => String(n).padStart(2, '0');
const todayInput = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

const P = {
  loaded: false, loading: false, error: null,
  days: {}, arsip: {},
  view: 'analisis', tab: 'harian',
  raw: lsGet(RAW_KEY) || '', status: null, preview: null,
  from: '', to: '',
  arsFilter: 'all', arsFrom: '', arsTo: '', arsSearch: '', arsJenis: 'all', arsSel: null,
};

async function load(ctx) {
  if (P.loading) return;
  P.loading = true; P.error = null;
  try {
    const all = await call('pnlGetAll');
    P.days = all.days; P.arsip = all.arsip;
    resetRange();
    P.loaded = true;
  } catch (e) { P.error = e.message; }
  P.loading = false;
  ctx.render();
}

const dayList = () => Object.keys(P.days).sort().map((ds) => ({ ds, ...P.days[ds] }));
function resetRange() {
  const ds = Object.keys(P.days).sort();
  P.from = ds[0] || ''; P.to = ds.at(-1) || '';
}
const filtered = () => dayList().filter((d) => L.inRangeDs(d.ds, P.from, P.to));

async function process(ctx) {
  if (!P.raw.trim()) { P.status = { msg: 'Paste raw data dulu.', type: 'err' }; ctx.render(); return; }
  try {
    const r = await call('pnlProcess', { raw: P.raw });
    P.days = r.days; P.arsip = r.arsip; P.preview = r.preview;
    P.status = { msg: `✓ ${r.saved} hari disimpan${r.skipped ? ` · ${r.skipped} blok dilewati` : ''}${r.arsipN ? ` · ${r.arsipN} entri masuk arsip` : ''} · total ${r.total} hari di riwayat.`, type: 'ok' };
    resetRange();
  } catch (e) { P.status = { msg: e.message, type: 'err' }; P.preview = null; }
  ctx.render();
}

async function deleteDay(ctx, ds) {
  if (!(await confirmBox(`Hapus data tanggal ${ds} dari riwayat Analisis? (arsip Pengeluaran/Prive tanggal ini tidak ikut terhapus)`, 'Hapus', true))) return;
  try {
    await call('pnlDeleteDay', { ds });
    delete P.days[ds];
    if (!Object.keys(P.days).length) { P.status = null; P.preview = null; }
    if (P.from > ds || P.to < ds || !Object.keys(P.days).length) resetRange();
    toast(`Data tanggal ${ds} dihapus dari riwayat`);
  } catch (e) { toast(e.message); }
  ctx.render();
}

// ── Tabel ──
const num = (v, cls) => h('td', { class: 'num' + (cls ? ' ' + cls : '') }, v);
const mono = (v) => h('td', { style: 'font-family:var(--mono);font-size:11.5px;' }, v);
const sgn = (v) => (v >= 0 ? 'pos' : 'neg');
const pct = (v) => v.toFixed(1) + '%';
const headRow = (cols, numFrom = 0) => h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: i >= numFrom && c ? 'num' : '' }, c))));

function harianTable(ctx, data) {
  const s = L.summarize(data);
  return h('table', { id: 'pn-tbl-harian' },
    headRow(['TGL', 'HARI', 'INCOME', 'KULAKAN', 'PENGELUARAN', 'PRIVE', 'CASH', 'RECEH', 'GROSS', 'NET POS', 'MARGIN%', 'CASH%', ''], 2),
    h('tbody', {},
      data.map((d) => h('tr', {},
        mono(L.fmtTgl(d.ds)), h('td', { style: 'color:var(--ink3);' }, L.hari(d.ds)),
        num(L.rp(d.income)), num(L.rp(d.kulakan)), num(L.rp(d.totalPengeluaran)), num(L.rp(d.totalPrive)), num(L.rp(d.cash)), num(L.rp(d.receh)),
        num(L.rp(d.gross), sgn(d.gross)), num(L.rp(d.netPos), sgn(d.netPos)),
        num(pct(d.marginP), L.marginCls(d.marginP)), num(pct(d.marginC), sgn(d.marginC)),
        h('td', { style: 'text-align:center;' }, h('button', { class: 'ar-del-date', style: 'float:none;', title: 'Hapus data tanggal ini dari riwayat', onclick: () => deleteDay(ctx, d.ds) }, '✕')))),
      h('tr', { class: 'total-row' }, h('td', { colspan: 2 }, 'TOTAL'),
        num(L.rp(s.income)), num(L.rp(s.kulakan)), num(L.rp(s.pengeluaran)), num(L.rp(s.prive)), num(L.rp(s.cash)), num(L.rp(s.receh)),
        num(L.rp(s.gross), sgn(s.gross)), num(L.rp(s.netPos), sgn(s.netPos)), num(pct(s.marginP)), num(pct(s.marginC)), h('td'))));
}

function agregatTable(id, groups) {
  let TI = 0, TK = 0, TP = 0, TPR = 0, TG = 0, TN = 0, TH = 0;
  const rows = groups.map((g) => {
    TI += g.income; TK += g.kulakan; TP += g.pengeluaran; TPR += g.prive; TG += g.gross; TN += g.netPos; TH += g.hari;
    const mp = g.income > 0 ? (g.gross / g.income) * 100 : 0;
    const mc = g.income > 0 ? (g.netPos / g.income) * 100 : 0;
    return h('tr', {}, mono(g.label), num(g.hari), num(L.rp(g.income)), num(L.rp(g.kulakan)), num(L.rp(g.pengeluaran)), num(L.rp(g.prive)),
      num(L.rp(g.gross), sgn(g.gross)), num(L.rp(g.netPos), sgn(g.netPos)), num(pct(mp), L.marginCls(mp)), num(pct(mc), sgn(mc)));
  });
  const mp2 = TI > 0 ? (TG / TI) * 100 : 0, mc2 = TI > 0 ? (TN / TI) * 100 : 0;
  return h('table', { id },
    headRow(['PERIODE', 'HARI', 'INCOME', 'KULAKAN', 'PENGELUARAN', 'PRIVE', 'GROSS', 'NET POS', 'MARGIN%', 'CASH%'], 1),
    h('tbody', {}, rows, h('tr', { class: 'total-row' }, h('td', {}, 'TOTAL'), num(TH), num(L.rp(TI)), num(L.rp(TK)), num(L.rp(TP)), num(L.rp(TPR)),
      num(L.rp(TG), sgn(TG)), num(L.rp(TN), sgn(TN)), num(pct(mp2)), num(pct(mc2)))));
}

function mingguanTable(data) {
  const groups = L.groupDays(data, L.weekKey);
  for (const g of groups) {
    const ds = g.days.map((d) => d.ds).sort();
    g.label = `${g.label} (${L.fmtTgl(ds[0])} – ${L.fmtTgl(ds.at(-1))})`;
  }
  return agregatTable('pn-tbl-mingguan', groups);
}

function rincianTable(data) {
  const rows = [];
  for (const d of data) {
    for (const it of d.rincianPengeluaran) rows.push(h('tr', {}, mono(L.fmtTgl(d.ds)), h('td', {}, 'Pengeluaran'), num(L.rp(it.jumlah)), h('td', {}, it.ket)));
    for (const it of d.rincianPrive) rows.push(h('tr', {}, mono(L.fmtTgl(d.ds)), h('td', {}, 'Prive'), num(L.rp(it.jumlah)), h('td', {}, it.ket)));
  }
  if (!rows.length) rows.push(h('tr', {}, h('td', { colspan: 4, style: 'text-align:center;color:var(--ink4);padding:20px;' }, 'Tidak ada rincian pengeluaran/prive')));
  return h('table', { id: 'pn-tbl-rincian' },
    h('thead', {}, h('tr', {}, h('th', {}, 'TGL'), h('th', {}, 'KATEGORI'), h('th', { class: 'num' }, 'JUMLAH'), h('th', {}, 'KETERANGAN'))), h('tbody', {}, rows));
}

function summaryCards(data) {
  const s = L.summarize(data);
  const cards = [
    { l: 'Total Income', v: L.rp(s.income), s: s.hari + ' hari', dark: true },
    { l: 'Total Kulakan', v: L.rp(s.kulakan), s: 'HPP total', dark: true },
    { l: 'Total Gross', v: L.rp(s.gross), s: 'Income − Kulakan', cls: sgn(s.gross) },
    { l: 'Net Position', v: L.rp(s.netPos), s: 'Cash − Kulakan', cls: sgn(s.netPos) },
    { l: 'Pengeluaran', v: L.rp(s.pengeluaran), s: 'Operasional' },
    { l: 'Prive', v: L.rp(s.prive), s: 'Ambil pribadi' },
    { l: 'Margin Performa', v: s.marginP.toFixed(1) + '%', s: 'tertimbang · target ≥15%', cls: L.marginCls(s.marginP) },
    { l: 'Margin Cash', v: s.marginC.toFixed(1) + '%', s: 'tertimbang · target ≥0%', cls: sgn(s.marginC) },
  ];
  return h('div', { class: 'sum-cards', id: 'pn-sum-cards' }, cards.map((c) => h('div', { class: 'sum-card' + (c.dark ? ' dark' : '') },
    h('div', { class: 'sum-label' }, c.l), h('div', { class: 'sum-val' + (c.cls ? ' ' + c.cls : '') }, c.v), h('div', { class: 'sum-sub' }, c.s))));
}

// ── Ekspor ──
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  const tbl = document.getElementById('pn-tbl-' + P.tab);
  if (!tbl || !tbl.rows.length) { toast('Belum ada data'); return; }
  const csv = [...tbl.rows].map((r) => [...r.cells].map((c) => '"' + c.textContent.replace(/"/g, '""') + '"').join(',')).join('\n');
  download(`PNL_Berkah_${P.tab}_${todayInput()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8;');
}

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Laporan cetak sederhana (ringkasan + harian + mingguan + bulanan). Dibuka sebagai halaman
// terpisah dengan tombol cetak/simpan PDF; bila popup diblokir, diunduh sebagai .html.
function openReport(data, title) {
  if (!data.length) { toast('Proses data dulu'); return; }
  const s = L.summarize(data);
  const R = L.rp;
  const tr = (cells, cls = '') => `<tr class="${cls}">${cells.map((c, i) => `<${i ? 'td class="r"' : 'td'}>${esc(c)}</${i ? 'td' : 'td'}>`).join('')}</tr>`;
  const table = (head, rows) => `<table><thead><tr>${head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  const agg = (groups) => {
    const t = L.summarize(groups.flatMap((g) => g.days));
    return table(['Periode', 'Hari', 'Income', 'Kulakan', 'Gross', 'Net Pos', 'Margin%'], [
      ...groups.map((g) => tr([g.label, g.hari, R(g.income), R(g.kulakan), R(g.gross), R(g.netPos), (g.income > 0 ? (g.gross / g.income) * 100 : 0).toFixed(1) + '%'])),
      tr(['TOTAL', t.hari, R(t.income), R(t.kulakan), R(t.gross), R(t.netPos), t.marginP.toFixed(1) + '%'], 'tot')]);
  };
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — Toko Berkah</title>
<style>body{font-family:Georgia,serif;color:#1a1a1a;margin:0;padding:24px;max-width:960px;margin:auto}h1{font-size:22px;margin:0}h2{font-size:15px;margin:26px 0 8px}
.sub{color:#666;font-size:12px;margin:2px 0 14px}.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.kpi div{border:1px solid #ddd;padding:8px 10px;border-radius:6px}.kpi b{display:block;font-size:16px}.kpi span{font-size:10px;color:#777;text-transform:uppercase}
table{border-collapse:collapse;width:100%;font-size:11.5px}th,td{padding:4px 7px;border-bottom:1px solid #e3e3e3;text-align:left}th{background:#f4f4f4;font-size:10px}.r{text-align:right;font-variant-numeric:tabular-nums}.tot td{font-weight:700;background:#f4f4f4}
button{position:fixed;top:12px;right:12px;padding:8px 14px}@media print{button{display:none}}@media(max-width:640px){.kpi{grid-template-columns:repeat(2,1fr)}}</style></head><body>
<button onclick="window.print()">⇩ Cetak / Simpan PDF</button><h1>Toko <i>Berkah</i> — ${esc(title)}</h1>
<div class="sub">${esc(L.fmtTgl(data[0].ds))} – ${esc(L.fmtTgl(data.at(-1).ds))} · ${data.length} hari</div>
<div class="kpi"><div><span>Income</span><b>${R(s.income)}</b></div><div><span>Kulakan</span><b>${R(s.kulakan)}</b></div><div><span>Gross</span><b>${R(s.gross)}</b></div><div><span>Net Position</span><b>${R(s.netPos)}</b></div>
<div><span>Pengeluaran</span><b>${R(s.pengeluaran)}</b></div><div><span>Prive</span><b>${R(s.prive)}</b></div><div><span>Margin Performa</span><b>${s.marginP.toFixed(1)}%</b></div><div><span>Margin Cash</span><b>${s.marginC.toFixed(1)}%</b></div></div>
<h2>Harian</h2>${table(['Tgl', 'Hari', 'Income', 'Kulakan', 'Pengeluaran', 'Prive', 'Gross', 'Net Pos', 'Margin%'], [
    ...data.map((d) => tr([L.fmtTgl(d.ds), L.hari(d.ds), R(d.income), R(d.kulakan), R(d.totalPengeluaran), R(d.totalPrive), R(d.gross), R(d.netPos), d.marginP.toFixed(1) + '%'])),
    tr(['TOTAL', '', R(s.income), R(s.kulakan), R(s.pengeluaran), R(s.prive), R(s.gross), R(s.netPos), s.marginP.toFixed(1) + '%'], 'tot')])}
<h2>Mingguan</h2>${agg(L.groupDays(data, L.weekKey))}<h2>Bulanan</h2>${agg(L.groupDays(data, L.monthKey))}</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) { download('Laporan-PNL-Berkah.html', html, 'text/html'); toast('Popup diblokir — laporan diunduh sebagai file'); }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ── Tampilan Analisis ──
function analisisView(ctx) {
  const data = filtered();
  const has = Object.keys(P.days).length > 0;
  const tabs = [['harian', 'Harian'], ['mingguan', 'Mingguan'], ['bulanan', 'Bulanan'], ['rincian', 'Rincian']];
  const tables = {
    harian: () => harianTable(ctx, data),
    mingguan: () => mingguanTable(data),
    bulanan: () => agregatTable('pn-tbl-bulanan', L.groupDays(data, L.monthKey)),
    rincian: () => rincianTable(data),
  };
  return h('div', { id: 'pn-view-analisis' },
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Input Data Harian'), h('div', { class: 'panel-chip' }, 'draft di perangkat ini')),
      h('div', { class: 'panel-body' },
        h('div', { class: 'hint', style: 'margin:0 0 8px;' }, 'Setiap hari diawali ', h('span', { class: 'hl' }, '#tanggal YYYY-MM-DD'), ' (mis. 2026-07-22). Baris kosong bebas. Tiap kali diproses, data hari itu ',
          h('b', {}, 'otomatis tersimpan & ditambahkan'), ' ke riwayat di bawah (bukan menggantikan hari lain) — proses ulang tanggal yang sama untuk mengoreksi.'),
        h('textarea', { class: 'inp', id: 'pn-raw', style: 'width:100%;height:260px;', value: P.raw,
          placeholder: '#tanggal 2026-07-22\n#pengeluaran\n350000 Uang Indah\n#prive\n66200 Belanja Indomaret\n#cash 5628000 + 190000 saldo\n#receh 21000\n#income 7497200\n#kulakan 5808330',
          oninput: (e) => { P.raw = e.target.value; lsSet(RAW_KEY, P.raw); } }),
        h('div', { style: 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;' },
          h('button', { class: 'btn primary', id: 'pn-process-btn', style: 'flex:1;min-width:160px;', onclick: () => process(ctx) }, '▶ Proses & Simpan'),
          h('button', { class: 'btn', onclick: async () => {
            if (!(await confirmBox('Kosongkan kotak input? (riwayat yang sudah tersimpan tidak ikut terhapus — hapus per tanggal di tabel Harian kalau perlu)', 'Kosongkan', true))) return;
            P.raw = ''; lsSet(RAW_KEY, null); P.preview = null; P.status = null; ctx.render();
          } }, '✕ Kosongkan Input')),
        P.status ? h('div', { id: 'pn-status', style: `margin-top:10px;font-size:12.5px;font-family:var(--mono);color:${P.status.type === 'err' ? 'var(--red)' : 'var(--green)'};` }, P.status.msg) : null,
        P.preview ? h('div', { class: 'blok-preview' }, P.preview.map((l) => h('div', {}, l))) : null)),
    has ? h('div', { id: 'pn-result' },
      h('div', { class: 'panel' }, h('div', { class: 'panel-body', style: 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;' },
        h('div', { class: 'field', style: 'max-width:170px;' }, h('span', { class: 'field-label' }, 'Dari'), h('input', { type: 'date', class: 'inp', value: P.from, onchange: (e) => { P.from = e.target.value; ctx.render(); } })),
        h('div', { class: 'field', style: 'max-width:170px;' }, h('span', { class: 'field-label' }, 'Sampai'), h('input', { type: 'date', class: 'inp', value: P.to, onchange: (e) => { P.to = e.target.value; ctx.render(); } })),
        h('button', { class: 'btn sm ghost', onclick: () => { resetRange(); ctx.render(); } }, 'Reset'),
        h('span', { class: 'hint', style: 'margin:0 0 8px auto;' }, `${data.length} hari dalam rentang`))),
      summaryCards(data),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' },
          h('div', { class: 'tab-bar', style: 'margin:0;' }, tabs.map(([k, l]) => h('button', { class: 'tab-btn' + (P.tab === k ? ' active' : ''), onclick: () => { P.tab = k; ctx.render(); } }, l))),
          h('div', { style: 'margin-left:auto;display:flex;gap:6px;' },
            h('button', { class: 'btn sm', id: 'pn-csv-btn', onclick: exportCsv }, '⬇ CSV'),
            h('button', { class: 'btn sm primary', onclick: () => openReport(data, 'Laporan PNL') }, '📄 Laporan PDF'))),
        h('div', { class: 'panel-body' }, h('div', { class: 'tab-panel active' }, h('div', { class: 'tbl-wrap' }, tables[P.tab]()))))) : null);
}

// ── Tampilan Arsip ──
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
const colorOf = (s) => (s.slot < 0 ? 'var(--cx)' : `var(--c${s.slot + 1})`);

function donut(ctx, slices, total) {
  const svgEl = sv('svg', { id: 'ar-donut', viewBox: '0 0 220 220', role: 'img', 'aria-label': 'Donut porsi pengeluaran dan prive' });
  if (!total) { svgEl.append(sv('circle', { cx: 110, cy: 110, r: 82, fill: 'none', stroke: 'var(--bg2)', 'stroke-width': 30 })); return svgEl; }
  const cx = 110, cy = 110, r = 82, W = 30, gap = 2.5 / r;
  const toggle = (key) => { P.arsSel = P.arsSel === key ? null : key; ctx.render(); };
  let a = -Math.PI / 2;
  if (slices.length === 1) {
    const c = sv('circle', { cx, cy, r, fill: 'none', stroke: colorOf(slices[0]), 'stroke-width': W, 'data-key': slices[0].key });
    c.addEventListener('click', () => toggle(slices[0].key));
    svgEl.append(c);
  } else {
    for (const s of slices) {
      const span = (s.total / total) * Math.PI * 2;
      const a0 = a + gap / 2, a1 = a + span - gap / 2;
      if (a1 > a0) {
        const p = sv('path', { d: L.arcPath(cx, cy, r, a0, a1), fill: 'none', stroke: colorOf(s), 'stroke-width': W, 'stroke-linecap': 'butt', 'data-key': s.key });
        if (P.arsSel && P.arsSel !== s.key) p.style.opacity = '.3';
        p.addEventListener('click', () => toggle(s.key));
        svgEl.append(p);
      }
      a += span;
    }
  }
  return svgEl;
}

function arsipView(ctx) {
  const today = todayInput();
  const entries = L.arsipEntries(P.arsip, { filter: P.arsFilter, today, from: P.arsFrom, to: P.arsTo, search: P.arsSearch });
  const slices = L.donutSlices(entries, P.arsip, P.arsJenis);
  const total = slices.reduce((s, x) => s + x.total, 0);
  if (P.arsSel && !slices.some((s) => s.key === P.arsSel)) P.arsSel = null;
  const sel = P.arsSel ? slices.find((s) => s.key === P.arsSel) : null;
  const tp = entries.filter((e) => e.j === 'p').reduce((s, e) => s + e.amt, 0);
  const tv = entries.filter((e) => e.j === 'v').reduce((s, e) => s + e.amt, 0);
  const nDays = new Set(entries.map((e) => e.ds)).size;
  const totalAll = Object.values(P.arsip).reduce((s, l) => s + l.length, 0);
  const flt = [['all', 'Semua'], ['today', 'Hari ini'], ['3d', '3 Hari'], ['7d', '7 Hari'], ['month', 'Bulan ini'], ['custom', 'Kustom']];

  const rows = [];
  let cur = null, grand = 0;
  for (const e of entries) {
    if (e.ds !== cur) {
      cur = e.ds;
      const sub = entries.filter((x) => x.ds === e.ds).reduce((s, x) => s + x.amt, 0);
      rows.push(h('tr', { class: 'ar-date-row' }, h('td', { colspan: 3 }, L.dateLabel(e.ds),
        h('span', { style: 'float:right;' }, L.rp(sub) + ' ', h('button', { class: 'ar-del-date', title: 'Hapus arsip tanggal ini', onclick: async () => {
          if (!(await confirmBox(`Hapus semua entri arsip tanggal ${L.dateLabel(e.ds)}?`, 'Hapus', true))) return;
          try { await call('pnlDeleteArsip', { ds: e.ds }); delete P.arsip[e.ds]; toast(`Arsip ${e.ds} dihapus`); } catch (er) { toast(er.message); }
          ctx.render();
        } }, '✕')))));
    }
    grand += e.amt;
    rows.push(h('tr', {}, h('td', {}, h('span', { class: 'ar-jchip ' + e.j }, e.j === 'p' ? 'PENGELUARAN' : 'PRIVE')), h('td', { style: 'font-size:12.5px;' }, e.ket), num(L.rp(e.amt))));
  }
  const table = entries.length
    ? h('table', { id: 'ar-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Jenis'), h('th', {}, 'Keterangan'), h('th', { class: 'num' }, 'Jumlah'))),
      h('tbody', {}, rows, h('tr', { class: 'total-row' }, h('td', { colspan: 2, style: 'text-align:right;' }, 'TOTAL TERFILTER'), num(L.rp(grand)))))
    : h('table', { id: 'ar-table' }, h('tbody', {}, h('tr', {}, h('td', { style: 'text-align:center;color:var(--ink4);padding:26px;' },
      'Tidak ada entri' + (Object.keys(P.arsip).length ? ' pada filter ini' : ' — proses data di tab Analisis dulu')))));

  return h('div', { id: 'pn-view-arsip' },
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Arsip Pengeluaran & Prive'), h('div', { class: 'panel-chip' }, `${entries.length} / ${totalAll} entri`)),
      h('div', { class: 'panel-body' },
        h('div', { class: 'ar-fltbar', style: 'margin-bottom:10px;' },
          flt.map(([k, l]) => h('button', { class: 'ar-flt' + (P.arsFilter === k ? ' active' : ''), onclick: () => { P.arsFilter = k; ctx.render(); } }, l)),
          P.arsFilter === 'custom' ? h('span', { style: 'display:inline-flex;gap:6px;align-items:center;' },
            h('input', { type: 'date', class: 'inp', value: P.arsFrom, style: 'padding:4px 8px;font-size:12px;', onchange: (e) => { P.arsFrom = e.target.value; ctx.render(); } }),
            h('span', { style: 'color:var(--ink3);' }, '–'),
            h('input', { type: 'date', class: 'inp', value: P.arsTo, style: 'padding:4px 8px;font-size:12px;', onchange: (e) => { P.arsTo = e.target.value; ctx.render(); } })) : null),
        h('div', { style: 'position:relative;' },
          h('input', { type: 'text', class: 'inp', id: 'ar-search', 'data-keep': 'ar-search', style: 'width:100%;padding-left:34px;', placeholder: 'Cari keterangan… (mis. indomaret, uang, nasgor)', value: P.arsSearch,
            oninput: (e) => { P.arsSearch = e.target.value; ctx.render(); } }),
          h('span', { style: 'position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--ink4);' }, '⌕')))),
    h('div', { class: 'ar-stats' },
      h('div', { class: 'sum-card dark' }, h('div', { class: 'sum-label' }, 'Pengeluaran'), h('div', { class: 'sum-val' }, L.rp(tp)), h('div', { class: 'sum-sub' }, 'operasional')),
      h('div', { class: 'sum-card dark' }, h('div', { class: 'sum-label' }, 'Prive'), h('div', { class: 'sum-val' }, L.rp(tv)), h('div', { class: 'sum-sub' }, 'ambil pribadi')),
      h('div', { class: 'sum-card' }, h('div', { class: 'sum-label' }, 'Cakupan'), h('div', { class: 'sum-val' }, nDays + ' hari'), h('div', { class: 'sum-sub' }, entries.length + ' entri terfilter'))),
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title', style: 'font-size:14px;' }, 'Porsi per Keterangan'),
        h('div', { class: 'seg', style: 'margin-left:auto;' }, [['all', 'Gabungan'], ['p', 'Pengeluaran'], ['v', 'Prive']].map(([k, l]) =>
          h('button', { class: 'seg-opt' + (P.arsJenis === k ? ' active' : ''), onclick: () => { P.arsJenis = k; P.arsSel = null; ctx.render(); } }, l)))),
      h('div', { class: 'panel-body' },
        h('div', { class: 'ar-donut-flex' },
          h('div', { class: 'ar-donut-wrap' }, donut(ctx, slices, total),
            h('div', { class: 'ar-center' },
              h('div', { class: 'ar-center-val', id: 'ar-center-val' }, !total ? '—' : L.fmtShort(sel ? sel.total : total)),
              h('div', { class: 'ar-center-lbl' }, !total ? 'belum ada data' : sel ? ((sel.total / total) * 100).toFixed(1) + '% dari total' : 'total ' + (P.arsJenis === 'p' ? 'pengeluaran' : P.arsJenis === 'v' ? 'prive' : 'gabungan')))),
          h('div', { class: 'ar-legend', id: 'ar-legend' }, !total
            ? h('div', { class: 'empty', style: 'padding:16px;' }, h('div', { class: 'empty-sub' }, 'Proses data di tab Analisis —', h('br'), 'entri otomatis masuk arsip'))
            : slices.map((s) => h('button', { class: 'ar-leg-row' + (P.arsSel === s.key ? ' sel' : ''), style: P.arsSel && P.arsSel !== s.key ? 'opacity:.45;' : null, onclick: () => { P.arsSel = P.arsSel === s.key ? null : s.key; ctx.render(); } },
              h('span', { class: 'ar-leg-dot', style: `background:${colorOf(s)};` }), h('span', { class: 'ar-leg-name' }, s.label),
              h('span', { class: 'ar-leg-val' }, L.fmtShort(s.total)), h('span', { class: 'ar-leg-pct' }, ((s.total / total) * 100).toFixed(1) + '%'))))),
        sel ? h('div', { class: 'ar-detail show' }, h('b', {}, sel.label), ` — Rp ${L.rp(sel.total)} · ${((sel.total / total) * 100).toFixed(1)}% · ${sel.n} entri`,
          sel.key === '__other' ? h('span', { style: 'color:var(--ink3);' }, ' (gabungan di luar 8 teratas)') : null) : null)),
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title', style: 'font-size:14px;' }, 'Riwayat Entri'),
        h('div', { style: 'margin-left:auto;display:flex;gap:6px;' },
          h('button', { class: 'btn sm primary', onclick: () => openArsipReport(entries) }, '📄 Laporan PDF'),
          h('button', { class: 'btn sm danger', onclick: async () => {
            if (!(await confirmBox('Hapus SELURUH arsip pengeluaran & prive? Tidak bisa dibatalkan.', 'Hapus Semua', true))) return;
            try { await call('pnlDeleteArsip', { all: true }); P.arsip = {}; toast('Arsip dikosongkan'); } catch (e) { toast(e.message); }
            ctx.render();
          } }, '🗑 Hapus Arsip'))),
      h('div', { class: 'panel-body' }, h('div', { class: 'tbl-wrap' }, table))));
}

function openArsipReport(entries) {
  if (!entries.length) { toast('Tidak ada entri'); return; }
  const rows = entries.map((e) => `<tr><td>${esc(L.dateLabel(e.ds))}</td><td>${e.j === 'p' ? 'Pengeluaran' : 'Prive'}</td><td>${esc(e.ket)}</td><td class="r">${L.rp(e.amt)}</td></tr>`).join('');
  const tot = entries.reduce((s, e) => s + e.amt, 0);
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Laporan Arsip — Toko Berkah</title>
<style>body{font-family:Georgia,serif;margin:0;padding:24px;max-width:900px;margin:auto}h1{font-size:22px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:4px 7px;border-bottom:1px solid #e3e3e3;text-align:left}th{background:#f4f4f4}.r{text-align:right}.tot td{font-weight:700;background:#f4f4f4}button{position:fixed;top:12px;right:12px;padding:8px 14px}@media print{button{display:none}}</style></head><body>
<button onclick="window.print()">⇩ Cetak / Simpan PDF</button><h1>Toko <i>Berkah</i> — Laporan Arsip</h1><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th class="r">Jumlah</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="3">TOTAL</td><td class="r">${L.rp(tot)}</td></tr></tbody></table></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) { download('Laporan-Arsip-Berkah.html', html, 'text/html'); toast('Popup diblokir — laporan diunduh sebagai file'); }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function renderPnl(ctx) {
  if (!P.loaded) {
    if (!P.loading) load(ctx);
    return h('div', { class: 'panel' }, h('div', { class: 'panel-body' }, P.error
      ? [h('div', { class: 'alert alert-err' }, P.error), h('button', { class: 'btn primary', onclick: () => load(ctx) }, 'Coba lagi')]
      : h('div', { class: 'hint' }, 'Memuat PNL…')));
  }
  return h('div', {},
    h('div', { class: 'pn-subnav' }, [['analisis', '📊 Analisis'], ['arsip', '🗄 Arsip']].map(([k, l]) =>
      h('button', { class: 'sub-btn' + (P.view === k ? ' active' : ''), 'data-view': k, onclick: () => { P.view = k; ctx.render(); } }, l))),
    P.view === 'analisis' ? analisisView(ctx) : arsipView(ctx));
}

// Modul Nota Kulakan (khusus Bos). Port nk* dari legacy/berkah-admin-1.5.0.html.
// Mesin pencocokan = tgcloud/lib/match.js (salinan persis). Data produk, kamus belajar
// dan riwayat disimpan di server; draft ketikan hanya di perangkat ini.
import '../nota.css';
import { h, openModal, confirmBox, openCalc, toast } from '../dom.js';
import { call } from '../api.js';
import { fmtNum } from '../../tgcloud/lib/money.js';
import { matchProduct, parseKulakanLine, satClassOf, tokenizeName } from '../../tgcloud/lib/match.js';
import { learnKey, unpackProducts } from '../../tgcloud/lib/nota.js';
import { panel } from './shared.js';

const DB_KEY = 'berkah-nota-db';
const DRAFT_KEY = 'berkah-nota-draft';

const fmtRp = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* abaikan */ } };

const p2 = (n) => String(n).padStart(2, '0');
const todayInput = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

// Keadaan modul; dipertahankan antar render.
const N = {
  loaded: false, loading: false, error: null,
  db: [], version: 0,
  learn: new Map(), // kunci -> nilai (hanya yang hidup)
  hist: [], since: 0, nextNumber: '',
  input: '', date: todayInput(), num: '', ket: 'Kulakan Harian',
  items: [], showReview: false, generated: null, savedId: null,
  floatEl: null, openRow: -1,
};

function loadDraft() {
  const d = lsGet(DRAFT_KEY);
  if (d) { N.input = d.input || ''; N.ket = d.ket || N.ket; N.num = d.num || ''; }
}
function saveDraft() { lsSet(DRAFT_KEY, { input: N.input, ket: N.ket, num: N.num }); }

async function loadAll(ctx) {
  if (N.loading) return;
  N.loading = true; N.error = null;
  try {
    const cache = lsGet(DB_KEY);
    const dbRes = await call('notaGetDb', { version: cache?.version ?? null });
    if (dbRes.unchanged && cache) { N.db = unpackProducts(cache.rows); N.version = cache.version; }
    else { N.db = unpackProducts(dbRes.rows); N.version = dbRes.version; lsSet(DB_KEY, { version: dbRes.version, rows: dbRes.rows }); }
    await refreshState();
    loadDraft();
    N.loaded = true;
  } catch (e) { N.error = e.message; }
  N.loading = false;
  ctx.render();
}

async function refreshState() {
  const st = await call('notaGetState', { since: N.since });
  N.since = st.serverTime - 2000;
  for (const r of st.learn) { if (r.deletedAt) N.learn.delete(r.kunci); else N.learn.set(r.kunci, r.nilai); }
  const byId = new Map(N.hist.map((x) => [x.id, x]));
  for (const r of st.hist) { if (r.deletedAt) byId.delete(r.id); else byId.set(r.id, r); }
  N.hist = [...byId.values()].sort((a, b) => b.savedAt - a.savedAt);
  N.nextNumber = st.nextNumber;
  if (!N.num) N.num = N.nextNumber;
}

const learnObj = () => Object.fromEntries(N.learn);

// ── Parse & cocok ──
function parseInput(ctx) {
  if (!N.db.length) { toast('Upload database CSV dulu'); return; }
  const lines = N.input.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) { toast('Isi daftar item dulu'); return; }
  const learn = learnObj();
  N.items = lines.map((raw, idx) => {
    const p = parseKulakanLine(raw);
    if (!p) return { id: idx, raw, qty: 0, satuan: '', namaInput: raw, sel: null, status: 'error', score: 0, options: [], confirmed: false, harga: 0 };
    const m = matchProduct(N.db, p.nama, p.satuan, learn);
    const options = m.rows.map((r) => ({ row: r, group: 'varian' }));
    for (const s of m.sugg) if (!options.some((o) => o.row === s.row)) options.push({ row: s.row, group: 'saran' });
    const sel = m.best || null;
    return { id: idx, raw, qty: p.qty, satuan: p.satuan, namaInput: p.nama, sel, harga: sel ? sel.hargaJual : 0, status: m.status, score: m.score, options, confirmed: false };
  });
  N.generated = null; N.savedId = null; N.showReview = true;
  ctx.render();
}

// ── Dropdown produk (melayang, di luar tabel supaya tidak terpotong scroll) ──
function closeFloat() {
  N.floatEl?.remove(); N.floatEl = null; N.openRow = -1;
  document.querySelectorAll('.cd-trigger.open').forEach((el) => el.classList.remove('open'));
}
document.addEventListener('click', (e) => { if (N.floatEl && !N.floatEl.contains(e.target)) closeFloat(); });

function optionRow(item, row, onPick) {
  const satHit = item.satuan && row.satClass === satClassOf(item.satuan);
  return h('div', { class: 'cd-item' + (item.sel === row ? ' selected' : ''), onclick: () => onPick(row) },
    h('div', { class: 'cd-item-name' }, row.nama),
    h('div', { class: 'cd-item-meta' }, h('span', { class: satHit ? 'sat-hit' : '' }, row.satuan), ` · Rp ${fmtRp(row.hargaJual)}`));
}

function searchDb(q) {
  const toks = tokenizeName(q);
  if (!toks.length) return [];
  const out = [];
  for (const r of N.db) {
    r._nn ??= ' ' + tokenizeName(r.nama).join(' ') + ' ';
    if (!toks.every((t) => r._nn.includes(t))) continue;
    out.push({ r, rank: r._nn.startsWith(' ' + toks[0]) ? 0 : 1 });
    if (out.length >= 200) break;
  }
  out.sort((a, b) => a.rank - b.rank || a.r.nama.localeCompare(b.r.nama));
  return out.slice(0, 20).map((x) => x.r);
}

function openDropdown(ctx, i, trigger) {
  closeFloat();
  const item = N.items[i];
  trigger.classList.add('open');
  N.openRow = i;
  const results = h('div', {});
  const pick = (row) => pickRow(ctx, i, row);
  const paint = (q) => {
    results.replaceChildren();
    if (!q.trim()) {
      let last = '';
      for (const o of item.options) {
        if (o.group !== last) { results.append(h('div', { class: 'cd-group-label' }, o.group === 'varian' ? 'Varian' : 'Saran lain')); last = o.group; }
        results.append(optionRow(item, o.row, pick));
      }
      if (!item.options.length) results.append(h('div', { class: 'cd-empty' }, 'Tidak ada kandidat — ketik di kotak cari ↑'));
      return;
    }
    const res = searchDb(q);
    if (!res.length) { results.append(h('div', { class: 'cd-empty' }, `Tidak ketemu "${q}" di database`)); return; }
    results.append(h('div', { class: 'cd-group-label' }, 'Hasil cari'));
    res.forEach((r) => results.append(optionRow(item, r, pick)));
  };
  const input = h('input', { type: 'text', placeholder: 'cari produk…', oninput: (e) => paint(e.target.value) });
  const float = h('div', { class: 'cd-list open', id: 'nk-cdfloat', onclick: (e) => e.stopPropagation() },
    h('div', { class: 'cd-search' }, input), results);
  document.body.append(float);
  N.floatEl = float;
  paint('');
  trigger.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); // pemicu bisa di luar layar pada tabel lebar
  const rect = trigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - 10;
  const above = rect.top - 10;
  const maxH = Math.max(160, Math.min(320, below >= 200 || below >= above ? below : above));
  float.style.cssText = `position:fixed;left:${Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 260) - 8))}px;width:${Math.max(rect.width, 260)}px;max-height:${maxH}px;`
    + (below >= 200 || below >= above ? `top:${rect.bottom}px;` : `top:auto;bottom:${window.innerHeight - rect.top}px;`);
  input.focus();
}

async function pickRow(ctx, i, row) {
  const item = N.items[i];
  item.sel = row; item.harga = row.hargaJual; item.confirmed = true;
  const kunci = learnKey(item.namaInput, item.satuan);
  N.learn.set(kunci, row.nama);
  closeFloat();
  ctx.render();
  try { await call('notaLearnSet', { kunci, nilai: row.nama }); } catch (e) { toast(e.message); }
}

// ── Generate nota ──
function buildReceipt() {
  let d;
  if (N.date) { const [y, m, dd] = N.date.split('-').map(Number); d = new Date(y, m - 1, dd); } else d = new Date();
  const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const lines = [];
  let total = 0;
  for (const it of N.items) {
    if (!it.qty) continue;
    const sub = it.qty * it.harga;
    total += sub;
    lines.push({ nama: it.sel ? it.sel.nama : it.namaInput, qty: it.qty, satuan: it.satuan, harga: it.harga, sub, flag: it.status !== 'ok' && !it.confirmed });
  }
  N.generated = { num: N.num.trim() || 'KLK-001', dateStr, timeStr, ket: N.ket.trim() || 'Kulakan Harian', lines, total, savedAt: Date.now() };
  N.savedId = null;
}

async function generate(ctx) {
  const unresolved = N.items.filter((i) => i.status !== 'ok' && !i.confirmed).length;
  if (unresolved && !(await confirmBox(`${unresolved} item belum dikonfirmasi (kuning/merah). Item itu akan ditandai "?" di nota. Tetap generate?`, 'Generate'))) return;
  buildReceipt();
  ctx.render();
}

function receiptEl(n) {
  return h('div', { class: 'receipt' },
    h('div', { class: 'rc-head' }, h('div', { class: 'rc-title' }, 'TOKO BERKAH'), h('div', { class: 'rc-sub' }, 'Pasar Klenang Kidul'), h('div', { class: 'rc-sub' }, 'WA: 0895 1765 6787 · @Barokah3')),
    h('hr', { class: 'rc-dash' }),
    h('div', { class: 'rc-meta' }, h('span', {}, `${n.dateStr} ${n.timeStr}`), h('span', {}, '#' + n.num)),
    h('div', { class: 'rc-meta' }, h('span', {}, 'Nota Kulakan'), h('span', {}, n.ket)),
    h('hr', { class: 'rc-dash' }),
    n.lines.map((l) => [
      h('div', { class: 'rc-item-name' }, l.nama, l.flag ? h('span', { class: 'rc-flag' }, ' ?') : null),
      h('div', { class: 'rc-item-detail' }, h('span', {}, `${fmtNum(l.qty)} ${l.satuan} × ${fmtRp(l.harga)}`), h('span', {}, fmtRp(l.sub))),
    ]),
    h('hr', { class: 'rc-dash' }),
    h('div', { class: 'rc-row' }, h('span', {}, 'Produk'), h('span', {}, n.lines.length)),
    h('div', { class: 'rc-total' }, h('span', {}, 'Total'), h('span', {}, 'Rp ' + fmtRp(n.total))),
    h('hr', { class: 'rc-dash' }),
    h('div', { class: 'rc-foot' }, 'Terima kasih', h('br'), 'Dokumen bukti pengambilan barang', h('br'), '✳ Toko Berkah App'));
}

function printNota() {
  if (!N.generated) { toast('Generate nota dulu'); return; }
  let pa = document.getElementById('nk-print-area');
  if (!pa) { pa = h('div', { id: 'nk-print-area', style: 'display:none' }); document.body.append(pa); }
  pa.replaceChildren(receiptEl(N.generated));
  pa.style.display = 'block';
  window.print();
  setTimeout(() => { pa.style.display = 'none'; }, 400);
}

function shareText() {
  if (!N.generated) { toast('Generate nota dulu'); return; }
  const n = N.generated;
  const lines = n.lines.map((l) => `${fmtNum(l.qty)} ${l.satuan} ${l.nama}${l.flag ? ' (?)' : ''} = Rp ${fmtRp(l.sub)}`);
  const msg = `*Nota Kulakan Toko Berkah*\nNo: ${n.num} · ${n.dateStr}\n\n${lines.join('\n')}\n\n*Total: Rp ${fmtRp(n.total)}*`;
  const tg = window.Telegram?.WebApp;
  const url = 'https://wa.me/?text=' + encodeURIComponent(msg);
  if (tg?.openLink) tg.openLink(url); else window.open(url, '_blank');
}

// Nota sebagai gambar (canvas, tanpa pustaka).
function shareImage() {
  if (!N.generated) { toast('Generate nota dulu'); return; }
  const n = N.generated;
  const W = 576, pad = 34, lh = 30;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = (n.lines.length * 2 + 16) * lh + pad * 2 + 60;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
  cx.fillStyle = '#111111'; cx.textBaseline = 'top';
  let y = pad;
  const C = (txt, font, dy) => { cx.font = font; cx.textAlign = 'center'; cx.fillText(txt, W / 2, y); y += dy; };
  const LR = (l, r, font) => { cx.font = font; cx.textAlign = 'left'; cx.fillText(l, pad, y); cx.textAlign = 'right'; cx.fillText(r, W - pad, y); y += lh; };
  const dash = () => { cx.save(); cx.strokeStyle = '#999'; cx.setLineDash([6, 5]); cx.beginPath(); cx.moveTo(pad, y + 8); cx.lineTo(W - pad, y + 8); cx.stroke(); cx.restore(); y += 24; };
  C('TOKO BERKAH', 'bold 34px sans-serif', 40);
  C('Pasar Klenang Kidul', '20px sans-serif', 26);
  C('WA: 0895 1765 6787 · @Barokah3', '20px sans-serif', 26);
  dash();
  LR(`${n.dateStr} ${n.timeStr}`, '#' + n.num, '20px monospace');
  LR('Nota Kulakan', n.ket, '20px monospace');
  dash();
  for (const l of n.lines) {
    cx.font = 'bold 22px sans-serif'; cx.textAlign = 'left';
    cx.fillText(l.nama + (l.flag ? ' (?)' : ''), pad, y); y += lh;
    LR(`  ${fmtNum(l.qty)} ${l.satuan} × ${fmtRp(l.harga)}`, fmtRp(l.sub), '20px monospace');
  }
  dash();
  LR('Produk', String(n.lines.length), '20px monospace');
  cx.font = 'bold 28px sans-serif'; cx.textAlign = 'left'; cx.fillText('Total', pad, y);
  cx.textAlign = 'right'; cx.fillText('Rp ' + fmtRp(n.total), W - pad, y); y += 40;
  dash();
  C('Terima kasih · ✳ Toko Berkah App', '18px sans-serif', 24);
  cv.toBlob(async (blob) => {
    if (!blob) { toast('Gagal membuat gambar'); return; }
    const file = new File([blob], `nota-${n.num}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Nota ' + n.num }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `nota-${n.num}.png` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    toast('Gambar nota diunduh');
  }, 'image/png');
}

async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return; } catch { /* lanjut ke cadangan */ }
  const el = h('textarea', { style: 'position:fixed;top:-999px;opacity:0;', value: text });
  document.body.append(el); el.focus(); el.select();
  try { toast(document.execCommand('copy') ? okMsg : 'Gagal menyalin'); } catch { toast('Gagal menyalin'); }
  el.remove();
}

async function saveHistory(ctx) {
  const n = N.generated;
  if (!n) { toast('Generate nota dulu'); return; }
  try {
    const out = await call('notaSave', { num: n.num, dateStr: n.dateStr, timeStr: n.timeStr, ket: n.ket, lines: n.lines });
    N.savedId = out.id;
    N.num = ''; saveDraft();
    await refreshState();
    toast('✓ Nota tersimpan di riwayat');
  } catch (e) { toast(e.message); }
  ctx.render();
}

// ── Modal riwayat & kamus ──
function openHistory(ctx) {
  const list = h('div', {});
  const m = openModal({ title: '🗂 Riwayat Nota', maxWidth: 420, body: list });
  const paint = () => {
    list.replaceChildren();
    if (!N.hist.length) { list.append(h('div', { class: 'empty', style: 'padding:24px;' }, h('div', { class: 'empty-title' }, 'Belum ada riwayat'))); return; }
    for (const x of N.hist) {
      list.append(h('div', { class: 'hist-item' },
        h('div', { class: 'hist-info' },
          h('div', { class: 'hist-title' }, `#${x.num} · Rp ${fmtRp(x.total)}`),
          h('div', { class: 'hist-sub' }, `${x.dateStr} · ${x.lines.length} item · ${x.ket}`)),
        h('button', { class: 'mini-btn', onclick: () => { N.generated = { ...x }; N.savedId = x.id; m.close(); toast('Nota dari riwayat dimuat'); ctx.render(); } }, 'Buka'),
        h('button', { class: 'mini-btn', style: 'color:var(--red);', onclick: async () => {
          if (!(await confirmBox(`Hapus nota #${x.num} dari riwayat?`, 'Hapus', true))) return;
          try { await call('notaDelete', { id: x.id }); await refreshState(); paint(); } catch (e) { toast(e.message); }
        } }, '✕')));
    }
  };
  paint();
}

function openLearn(ctx) {
  const list = h('div', {});
  const m = openModal({ title: '📖 Kamus Belajar', maxWidth: 420, body: [
    h('div', { class: 'hint', style: 'margin:0 0 10px;' }, 'Setiap koreksi manual di dropdown produk tersimpan di sini. Input yang sama berikutnya langsung cocok.'), list] });
  void m;
  const paint = () => {
    list.replaceChildren();
    if (!N.learn.size) { list.append(h('div', { class: 'empty', style: 'padding:20px;' }, h('div', { class: 'empty-title' }, 'Kamus masih kosong'), h('div', { class: 'empty-sub' }, 'pilih produk manual di dropdown → otomatis tercatat'))); return; }
    for (const [k, v] of N.learn) {
      const [q, sat] = k.split('|');
      list.append(h('div', { class: 'hist-item' },
        h('div', { class: 'hist-info' }, h('div', { class: 'hist-title' }, q, sat ? h('span', { style: 'color:var(--ink3);font-weight:400;' }, ` [${sat}]`) : null), h('div', { class: 'hist-sub' }, '→ ' + v)),
        h('button', { class: 'mini-btn', style: 'color:var(--red);', onclick: async () => {
          try { await call('notaLearnDelete', { kunci: k }); N.learn.delete(k); paint(); ctx.render(); } catch (e) { toast(e.message); }
        } }, '✕')));
    }
  };
  paint();
}

// ── Impor CSV ──
async function importCsv(ctx, file) {
  if (!file) return;
  let text;
  try { text = await file.text(); } catch { toast('Gagal membaca file'); return; }
  if (N.db.length && !(await confirmBox('Database produk lama akan ditimpa seluruhnya. Lanjut?', 'Timpa', true))) return;
  try {
    toast('Mengunggah database…');
    const out = await call('notaImportCsv', { csv: text });
    N.db = []; N.loaded = false; N.version = out.version; lsSet(DB_KEY, null);
    toast(`✓ ${out.count.toLocaleString('id-ID')} produk dimuat`);
    loadAll(ctx);
  } catch (e) { toast(e.message); }
}

// ── Render ──
const CHIP = {
  ok: () => h('span', { class: 'chip ok' }, '✓ OK'),
  ambiguous: (it, tog) => h('span', { class: 'chip warn', title: 'Klik untuk konfirmasi', onclick: tog }, '? periksa'),
  satuan_missing: (it, tog) => h('span', { class: 'chip warn', title: 'Satuan tidak ada — pilih varian, atau klik untuk pakai apa adanya', onclick: tog }, 'satuan?'),
  notfound: () => h('span', { class: 'chip err' }, '✗ tidak ada'),
  error: () => h('span', { class: 'chip err' }, '✗ format?'),
};
const stripColor = (it) => (it.status === 'ok' || it.confirmed ? 'var(--green)' : it.status === 'ambiguous' || it.status === 'satuan_missing' ? 'var(--amber)' : 'var(--red)');

function reviewTable(ctx) {
  const nErr = N.items.filter((i) => (i.status === 'notfound' || i.status === 'error') && !i.confirmed).length;
  const nWarn = N.items.filter((i) => (i.status === 'ambiguous' || i.status === 'satuan_missing') && !i.confirmed).length;
  const total = N.items.reduce((s, i) => s + i.qty * i.harga, 0);
  const alerts = [];
  if (nErr) alerts.push(h('div', { class: 'alert alert-err' }, `✗ ${nErr} item tidak ditemukan — pilih produk dari saran atau isi harga manual`));
  if (nWarn) alerts.push(h('div', { class: 'alert alert-warn' }, `? ${nWarn} item perlu dicek — pilih dari dropdown atau klik chip untuk konfirmasi`));
  if (!nErr && !nWarn && N.items.length) alerts.push(h('div', { class: 'alert alert-ok' }, '✓ Semua item cocok — siap generate'));

  const rows = N.items.map((it, i) => {
    const toggle = () => { it.confirmed = !it.confirmed; ctx.render(); };
    const chip = it.confirmed ? h('span', { class: 'chip confirmed', onclick: toggle }, '✓ dikonfirmasi') : CHIP[it.status](it, toggle);
    const selName = it.sel ? it.sel.nama : '⌕ cari produk…';
    const selMeta = it.sel ? `${it.sel.satuan} · Rp ${fmtRp(it.sel.hargaJual)}` : (it.options.length ? `${it.options.length} kandidat` : 'ketik untuk mencari di database');
    const trig = h('div', { class: 'cd-trigger', 'data-row': i, onclick: (e) => { e.stopPropagation(); const same = N.openRow === i; closeFloat(); if (!same) openDropdown(ctx, i, e.currentTarget); } },
      h('span', { class: 'cd-label', style: it.sel ? null : 'color:var(--ink4);' }, selName), h('span', { class: 'cd-meta' }, selMeta), h('span', { class: 'cd-arrow' }, '▾'));
    return h('tr', {},
      h('td', { class: 'strip', style: `background:${stripColor(it)};` }),
      h('td', { style: 'color:var(--ink4);font-family:var(--mono);font-size:11px;' }, i + 1),
      h('td', { style: 'font-size:12px;color:var(--ink3);min-width:96px;max-width:150px;overflow-wrap:break-word;' }, it.namaInput),
      h('td', {}, h('div', { class: 'cd-wrap' }, trig)),
      h('td', { class: 'num' }, h('span', { class: 'qty-disp', style: 'display:inline-flex;', onclick: async () => {
        const v = await openCalc(it.sel ? it.sel.nama : it.namaInput, it.satuan, it.qty);
        if (v != null) { it.qty = v; ctx.render(); }
      } }, fmtNum(it.qty))),
      h('td', { style: 'font-size:11px;color:var(--ink3);font-family:var(--mono);' }, it.satuan || '—'),
      h('td', { class: 'num', style: 'width:100px;' }, h('input', { type: 'number', class: 'cell-inp', value: it.harga, min: 0, onchange: (e) => {
        it.harga = parseFloat(e.target.value) || 0;
        if (it.status === 'notfound' || it.status === 'error') it.confirmed = true;
        ctx.render();
      } })),
      h('td', { class: 'num' }, fmtRp(it.qty * it.harga)),
      h('td', {}, chip));
  });

  return panel('Review & Koreksi', h('div', { class: 'panel-body' },
    alerts,
    h('div', { class: 'tbl-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', { style: 'width:4px;padding:0;' }), h('th', {}, '#'), h('th', {}, 'Input'), h('th', {}, 'Produk (DB)'), h('th', { class: 'num' }, 'Qty'), h('th', {}, 'Sat'), h('th', { class: 'num' }, 'Harga'), h('th', { class: 'num' }, 'Subtotal'), h('th', {}, ''))),
      h('tbody', {}, rows, h('tr', { class: 'total-row' }, h('td'), h('td', { colspan: 6, style: 'text-align:right;' }, 'TOTAL'), h('td', { class: 'num' }, fmtRp(total)), h('td'))))),
    h('div', { style: 'display:flex;gap:8px;margin-top:12px;justify-content:flex-end;' },
      h('button', { class: 'btn', onclick: () => { N.items = []; N.generated = null; N.showReview = false; ctx.render(); } }, '✕ Reset'),
      h('button', { class: 'btn primary', onclick: () => generate(ctx) }, '✓ Generate Nota'))), { chip: `${N.items.length} item` });
}

function dbPanel(ctx) {
  const fileInp = h('input', { type: 'file', accept: '.csv,text/csv', onchange: (e) => { importCsv(ctx, e.target.files[0]); e.target.value = ''; } });
  const zone = h('div', { class: 'upload-zone', onclick: () => fileInp.click() }, fileInp,
    h('div', { class: 'uz-icon' }, '📂'),
    h('div', { class: 'uz-label' }, N.db.length ? 'Upload ulang Products.csv' : 'Upload Products.csv'),
    h('div', { class: 'uz-sub' }, N.db.length ? 'database lama akan ditimpa seluruhnya' : 'kolom: Produk, Satuan, Harga Jual, Harga Pokok, Kode, Barcode'));
  return panel('Database Produk', h('div', { class: 'panel-body' }, zone,
    N.db.length ? h('div', { class: 'db-status-box' }, '✓ ', h('b', {}, `${N.db.length.toLocaleString('id-ID')} produk`), ' · tersimpan di server (dipakai bersama)') : null),
  { chip: N.db.length ? `${N.db.length.toLocaleString('id-ID')} produk` : 'belum dimuat' });
}

export function renderNota(ctx) {
  if (!N.loaded) {
    if (!N.loading) loadAll(ctx);
    return h('div', { class: 'panel' }, h('div', { class: 'panel-body' }, N.error
      ? [h('div', { class: 'alert alert-err' }, N.error), h('button', { class: 'btn primary', onclick: () => loadAll(ctx) }, 'Coba lagi')]
      : h('div', { class: 'hint' }, 'Memuat Nota…')));
  }
  const n = N.generated;
  return h('div', { class: 'cols' },
    h('div', {},
      dbPanel(ctx),
      panel('Input Item Kulakan', h('div', { class: 'panel-body' },
        h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:10px;' },
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tanggal'), h('input', { type: 'date', class: 'inp', value: N.date, onchange: (e) => { N.date = e.target.value; } })),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'No. Nota'), h('input', { type: 'text', class: 'inp', value: N.num || N.nextNumber, oninput: (e) => { N.num = e.target.value; saveDraft(); } })),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Keterangan'), h('input', { type: 'text', class: 'inp', value: N.ket, oninput: (e) => { N.ket = e.target.value; saveDraft(); } }))),
        h('textarea', { class: 'inp', style: 'width:100%;height:230px;', placeholder: '1 dus Glukol\n4 sak Tinta 10kg\n1 slp 76 12\n3 kg Kacang Osik\n21 LPG', value: N.input, oninput: (e) => { N.input = e.target.value; saveDraft(); } }),
        h('div', { style: 'display:flex;gap:8px;margin-top:10px;' },
          h('button', { class: 'btn primary', style: 'flex:1;', onclick: () => parseInput(ctx) }, '▶ Proses & Cari Harga'),
          h('button', { class: 'btn', onclick: async () => { if (await confirmBox('Bersihkan input item?', 'Bersihkan')) { N.input = ''; saveDraft(); ctx.render(); } } }, '✕'))),
      { headExtra: h('div', { style: 'flex:1' }), chip: `kamus: ${N.learn.size}`, }),
      N.showReview ? reviewTable(ctx) : null,
      h('div', { style: 'margin-top:8px;' }, h('button', { class: 'mini-btn', onclick: () => openLearn(ctx) }, `📖 Kamus Belajar (${N.learn.size})`))),
    h('div', { class: 'nota-side' }, h('div', { class: 'panel', style: 'margin-bottom:0;' },
      h('div', { class: 'panel-head', style: 'gap:6px;' },
        h('div', { class: 'panel-title', style: 'font-size:14px;flex:1;' }, n ? `Nota #${n.num} · Rp ${fmtRp(n.total)}` : 'Preview Nota'),
        h('button', { class: 'btn sm', title: 'Riwayat nota', onclick: () => openHistory(ctx) }, '🗂'),
        h('button', { class: 'btn sm', onclick: printNota }, '🖨'),
        h('button', { class: 'btn sm', title: 'Kirim sbg gambar', onclick: shareImage }, '🖼'),
        h('button', { class: 'btn sm primary', onclick: shareText }, '📤 WA')),
      h('div', { class: 'panel-body', style: 'padding:0;' },
        h('div', { class: 'nota-scroll' }, n ? receiptEl(n)
          : h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, '🧾'), h('div', { class: 'empty-title' }, 'Preview nota'), h('div', { class: 'empty-sub' }, 'akan muncul di sini'))),
        h('div', { style: 'padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;' },
          h('button', { class: 'btn sm', disabled: !n || !!N.savedId, onclick: () => saveHistory(ctx) }, '💾 Simpan ke Riwayat'),
          h('button', { class: 'btn sm', disabled: !n, title: 'Salin total sebagai #kulakan untuk PNL', onclick: () => copyText('#kulakan ' + Math.round(n.total), `✓ Disalin: "#kulakan ${Math.round(n.total)}" — paste di template PNL`) }, '→ PNL #kulakan'))))));
}

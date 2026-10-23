import { h, toast, unitPopup, confirmBox } from '../dom.js';
import { UNITS } from '../../tgcloud/lib/units.js';
import { parseAngka, round, fmtNum, inpVal, cost, pctOf } from '../../tgcloud/lib/money.js';
import { itemsOf } from '../state.js';
import { catBar, searchBox, panel, ensureActiveCat } from './shared.js';

const BULK_KEY = 'berkah-hpp-bulk';
function readBulk() {
  try { return { val: '', mode: 'rp', ...JSON.parse(localStorage.getItem(BULK_KEY) || '{}') }; } catch { return { val: '', mode: 'rp' }; }
}
const draft = { search: '', bulk: readBulk() };
const saveBulk = () => { try { localStorage.setItem(BULK_KEY, JSON.stringify(draft.bulk)); } catch { /* abaikan */ } };
const MODE_KEY = 'berkah-hpp-margin-mode';
const readMode = () => { try { return localStorage.getItem(MODE_KEY) === 'pct' ? 'pct' : 'rp'; } catch { return 'rp'; } };
let marginMode = readMode();

// Sel angka. data-prev = string PERSIS yang dirender: kalau tidak berubah, tidak
// ada yang dihitung ulang (angka tampil dibulatkan; menghitung balik dari
// angka tampil menggeser harga — bug N10 app lama).
function cell(field, value, extraCls = '') {
  return h('td', { class: 'num' },
    h('input', {
      type: 'text', inputmode: 'decimal', class: 'cell-inp' + (extraCls ? ' ' + extraCls : ''),
      'data-f': field, value, 'data-prev': value, placeholder: field === 'margin' && marginMode === 'pct' ? '—%' : '—',
    }));
}

async function onChange(ctx, e) {
  const inp = e.target.closest('.cell-inp');
  if (!inp) return;
  const id = inp.closest('tr').dataset.id;
  const it = ctx.state.items.get(id);
  if (!it) return;
  if (inp.value.trim() === (inp.dataset.prev || '').trim()) return;
  const f = inp.dataset.f;
  const pos = (v) => (v > 0 ? v : null);
  if (f === 'isi') return ctx.act('setHpp', { id, isi: pos(round(parseAngka(inp.value), 3)) });
  if (f === 'hargaBeli') return ctx.act('setHpp', { id, hargaBeli: pos(round(parseAngka(inp.value))) });
  if (f === 'hargaJual') return ctx.act('setHpp', { id, hargaJual: pos(round(parseAngka(inp.value))) });
  // margin -> Harga Jual (rupiah bulat)
  const pokok = cost(it);
  if (!pokok) { toast('Isi Isi & Harga Beli dulu sebelum atur Margin'); ctx.render(); return; }
  const raw = inp.value.trim();
  if (!raw) return ctx.act('setHpp', { id, hargaJual: null });
  const v = parseAngka(raw);
  const jual = Math.round(pokok + (marginMode === 'pct' ? pokok * (v / 100) : v));
  if (jual <= 0) { toast('Margin itu membuat Harga Jual jadi ≤ 0 — dibatalkan'); ctx.render(); return; }
  return ctx.act('setHpp', { id, hargaJual: jual });
}

function row(ctx, it) {
  const pokok = cost(it);
  const margin = it.hargaJual > 0 && pokok ? it.hargaJual - pokok : null;
  const cls = margin == null ? '' : margin > 0 ? 'pos' : margin < 0 ? 'neg' : '';
  const shown = margin == null ? '' : inpVal(marginMode === 'pct' ? pctOf(margin, pokok) : margin);
  const sat = it.satuanHpp || '';
  return h('tr', { 'data-id': it.id },
    h('td', {}, it.name),
    h('td', {}, h('span', { class: 'unit-wrap' }, h('button', {
      type: 'button', class: 'unit-btn hpp-unit-btn' + (sat ? '' : ' empty'),
      onclick: (e) => {
        e.stopPropagation();
        unitPopup(e.currentTarget, UNITS, sat, (u) => ctx.act('setHpp', { id: it.id, satuanHpp: u === sat ? null : u }), { fixed: true });
      },
    }, (sat || '—') + ' ▾'))),
    cell('isi', inpVal(it.isi)),
    cell('hargaBeli', inpVal(it.hargaBeli)),
    h('td', { class: 'num', style: 'color:var(--ink3);' }, pokok ? fmtNum(pokok) : '—'),
    cell('hargaJual', inpVal(it.hargaJual)),
    cell('margin', shown, cls));
}

async function applyBulk(ctx, scope, catId) {
  const val = parseAngka(draft.bulk.val);
  if (!draft.bulk.val.trim() || !isFinite(val)) { toast('Isi nilai margin dulu'); return; }
  const label = draft.bulk.mode === 'pct' ? `${fmtNum(val)}%` : `Rp${fmtNum(val)}`;
  if (scope === 'all' && !(await confirmBox(`Timpa Harga Jual SEMUA barang yang lengkap datanya dengan margin ${label}?`, 'Terapkan', true))) return;
  const out = await ctx.act('applyMargin', { categoryId: scope === 'all' ? null : catId, mode: draft.bulk.mode, value: val });
  if (!out) return;
  if (!out.updated) { toast('Tidak ada barang dengan Isi & Harga Beli terisi di jangkauan ini'); return; }
  toast(`✓ ${out.updated} Harga Jual diperbarui`
    + (out.skipped ? ` · ${out.skipped} dilewati (Isi/Harga Beli kosong)` : '')
    + (out.invalid ? ` · ${out.invalid} dilewati (harga jual jadi ≤ 0)` : ''));
}

function bulkPanel(ctx, catId) {
  const seg = h('div', { class: 'seg' }, ['rp', 'pct'].map((m) => h('button', {
    class: 'seg-opt' + (draft.bulk.mode === m ? ' active' : ''),
    onclick: () => { draft.bulk.mode = m; saveBulk(); ctx.render(); },
  }, m === 'rp' ? 'Rp' : '%')));
  return panel('Terapkan Margin Massal', h('div', {},
    h('div', { class: 'panel-body', style: 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;' },
      h('div', { class: 'field', style: 'max-width:140px;' }, h('span', { class: 'field-label' }, 'Nilai'),
        h('input', {
          type: 'text', class: 'inp', inputmode: 'decimal', placeholder: 'mis. 250', value: draft.bulk.val, 'data-keep': 'hpp-bulk',
          oninput: (e) => { draft.bulk.val = e.target.value; saveBulk(); },
        })),
      seg,
      h('button', { class: 'btn sm', disabled: catId == null, onclick: () => applyBulk(ctx, 'cat', catId) }, 'Terapkan ke kategori ini'),
      h('button', { class: 'btn sm primary', onclick: () => applyBulk(ctx, 'all', catId) }, 'Terapkan ke SEMUA kategori')),
    h('div', { class: 'hint', style: 'padding:0 14px 12px;' },
      'Menimpa Harga Jual semua barang yang sudah punya Isi & Harga Beli di jangkauan yang dipilih. Barang yang belum lengkap datanya dilewati. Mode ',
      h('b', {}, '%'), ' dihitung dari ', h('b', {}, 'modal'), ' (mis. pokok 10.000 + 12,5% = 11.250). Desimal boleh pakai koma: ',
      h('span', { class: 'hl' }, '12,5'), '. Nilai yang diketik di sini tersimpan, tidak hilang saat ditutup.')));
}

export function renderHpp(ctx) {
  const { state } = ctx;
  const catId = ensureActiveCat(state);
  const q = draft.search.trim().toLowerCase();
  const items = catId == null ? [] : itemsOf(state, catId).filter((i) => !q || i.name.toLowerCase().includes(q));

  let table;
  if (!items.length) {
    table = h('table', {}, h('tbody', {}, h('tr', {}, h('td', { style: 'text-align:center;color:var(--ink4);padding:26px;' },
      q ? `Tidak ketemu "${draft.search}"` : state.categories.size ? 'Belum ada barang di kategori ini — tambah lewat tab Checklist' : 'Belum ada kategori'))));
  } else {
    table = h('table', { id: 'hpp-table', onchange: (e) => onChange(ctx, e) },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Nama'), h('th', {}, 'Satuan'), h('th', { class: 'num' }, 'Isi'), h('th', { class: 'num' }, 'Harga Beli'),
        h('th', { class: 'num' }, 'Pokok/Ecer'), h('th', { class: 'num' }, 'Harga Jual'),
        h('th', { class: 'num' }, h('span', { class: 'th-toggle-wrap' }, 'Margin ',
          h('button', {
            type: 'button', class: 'th-toggle', title: 'Ganti tampilan kolom Margin: Rupiah ⇄ persen dari modal',
            onclick: () => {
              marginMode = marginMode === 'pct' ? 'rp' : 'pct';
              try { localStorage.setItem(MODE_KEY, marginMode); } catch { /* abaikan */ }
              ctx.render();
            },
          }, (marginMode === 'pct' ? '%' : 'Rp') + ' ⇄'))))),
      h('tbody', {}, items.map((it) => row(ctx, it))));
  }

  return h('div', {},
    bulkPanel(ctx, catId),
    catBar(ctx),
    searchBox({
      id: 'hpp-search', value: draft.search, placeholder: 'Cari barang…',
      oninput: (e) => { draft.search = e.target.value; ctx.render(); },
    }),
    panel('Daftar HPP', h('div', { class: 'panel-body' }, h('div', { class: 'tbl-wrap' }, table))),
    h('div', { class: 'hint', style: 'text-align:center;' },
      'Harga Beli terisi otomatis dari harga terakhir di tab Supplier · Pokok = Harga Beli ÷ Isi'));
}

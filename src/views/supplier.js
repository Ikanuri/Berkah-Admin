import { h, ask, confirmBox, toast } from '../dom.js';
import { parseAngka, round, fmtNum } from '../../tgcloud/lib/money.js';
import {
  itemsOf, suppliersOf, supplierName, logOf, rankedOf, tierOf,
} from '../state.js';
import { catBar, searchBox, panel, ensureActiveCat, today } from './shared.js';
import { renderReminders } from './reminders.js';

// Draft: selamat dari render ulang (polling).
const draft = { view: 'input', supplierId: null, tanggal: today(), prices: {}, search: '', open: new Set() };

async function supplierModal(ctx, sup) {
  const dismiss = () => document.querySelector('.overlay.open')?.dispatchEvent(new CustomEvent('dismiss'));
  const extraFoot = sup ? h('button', {
    class: 'btn sm danger', style: 'margin-right:auto',
    onclick: async () => {
      if (!(await confirmBox(`Hapus supplier "${sup.name}"?\nRiwayat harganya tetap tersimpan.`, 'Hapus', true))) return;
      dismiss();
      ctx.act('deleteSupplier', { id: sup.id }, `"${sup.name}" dihapus dari daftar`);
    },
  }, 'Hapus') : null;
  const v = await ask({ title: sup ? 'Ganti Nama Supplier' : 'Supplier Baru', label: sup ? '' : 'Nama supplier', value: sup ? sup.name : '', extraFoot });
  if (v == null || !v.trim()) return;
  if (sup) { if (v.trim() !== sup.name) ctx.act('saveSupplier', { id: sup.id, name: v }, 'Nama diperbarui'); }
  else ctx.act('saveSupplier', { name: v }, 'Supplier ditambah');
}

function inputView(ctx) {
  const { state, act } = ctx;
  const sups = suppliersOf(state);
  if (!sups.some((s) => s.id === draft.supplierId)) draft.supplierId = sups[0]?.id ?? null;
  const sup = sups.find((s) => s.id === draft.supplierId);
  const catId = ensureActiveCat(state);
  const q = draft.search.trim().toLowerCase();
  const items = catId == null ? [] : itemsOf(state, catId).filter((i) => !q || i.name.toLowerCase().includes(q));

  const picker = h('select', {
    class: 'inp', onchange: (e) => { draft.supplierId = Number(e.target.value); ctx.render(); },
  }, sups.length ? sups.map((s) => h('option', { value: s.id, selected: s.id === draft.supplierId }, s.name))
    : h('option', { value: '' }, '— belum ada supplier —'));

  let table;
  if (!items.length) {
    table = h('table', {}, h('tbody', {}, h('tr', {}, h('td', { style: 'text-align:center;color:var(--ink4);padding:26px;' },
      q ? 'Tidak ketemu' : 'Belum ada barang di kategori ini'))));
  } else {
    table = h('table', { id: 'sup-input-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nama'), h('th', {}, 'Satuan'), h('th', { class: 'num' }, 'Harga Sebelumnya'), h('th', { class: 'num' }, 'Harga Baru'))),
      h('tbody', {}, items.map((it) => h('tr', { 'data-id': it.id },
        h('td', {}, it.name),
        h('td', { style: 'color:var(--ink3);' }, it.satuanHpp || it.unit || '—'),
        h('td', { class: 'num', style: 'color:var(--ink3);' }, it.hargaBeli ? fmtNum(it.hargaBeli) : '—'),
        h('td', { class: 'num' }, h('input', {
          type: 'text', inputmode: 'decimal', class: 'cell-inp sup-price-inp', placeholder: '—', value: draft.prices[it.id] ?? '',
          oninput: (e) => { draft.prices[it.id] = e.target.value; },
        }))))));
  }

  return h('div', {},
    panel('Sesi Input Harga', h('div', { class: 'panel-body', style: 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;' },
      h('div', { class: 'field', style: 'min-width:160px;' }, h('span', { class: 'field-label' }, 'Supplier'), picker),
      h('button', { class: 'mini-btn', onclick: () => supplierModal(ctx, null) }, '+ Supplier'),
      sup ? h('button', { class: 'mini-btn', title: 'Ganti nama / hapus supplier', onclick: () => supplierModal(ctx, sup) }, '✎') : null,
      h('div', { class: 'field', style: 'max-width:170px;' }, h('span', { class: 'field-label' }, 'Tanggal'),
        h('input', { type: 'date', class: 'inp', value: draft.tanggal, onchange: (e) => { draft.tanggal = e.target.value; } })))),
    catBar(ctx),
    searchBox({ id: 'sup-search', value: draft.search, placeholder: 'Cari barang…', oninput: (e) => { draft.search = e.target.value; ctx.render(); } }),
    panel(`Input Harga Beli — ${sup ? sup.name : 'pilih supplier'}`, h('div', { class: 'panel-body' }, h('div', { class: 'tbl-wrap' }, table))),
    h('div', { style: 'display:flex;justify-content:center;margin:14px 0 4px;' },
      h('button', {
        class: 'btn primary wide',
        onclick: async () => {
          if (!sup) { toast('Pilih atau tambah supplier dulu'); return; }
          const prices = Object.entries(draft.prices)
            .map(([itemId, v]) => ({ itemId, hargaBeli: round(parseAngka(v)) }))
            .filter((p) => p.hargaBeli > 0);
          if (!prices.length) { toast('Belum ada harga yang diisi'); return; }
          const out = await act('savePrices', { supplierId: sup.id, tanggal: draft.tanggal || today(), prices });
          if (out) { draft.prices = {}; toast(`${out.saved} harga disimpan dari "${sup.name}"`); ctx.render(); }
        },
      }, '💾 Simpan Sesi')));
}

function analysisView(ctx) {
  const { state, act } = ctx;
  const q = draft.search.trim().toLowerCase();
  const catId = ensureActiveCat(state);
  const rows = [];
  const scope = catId == null ? [] : itemsOf(state, catId).slice().sort((a, b) => a.name.localeCompare(b.name, 'id'));
  for (const it of scope) {
    if (q && !it.name.toLowerCase().includes(q)) continue;
    const t = tierOf(state, it.id);
    const open = draft.open.has(it.id) && t;
    const label = !t ? h('span', { class: 'tier-empty' }, 'belum ada data') : [
      '🏆 ',
      t.kind === 'tied' ? h('span', { class: 'tier-supplier tier-tied' }, `${t.count} supplier`) : h('span', { class: 'tier-supplier' }, supplierName(state, t.supplierId)),
      ' ', h('span', { class: 'tier-price' }, fmtNum(t.price)),
    ];
    const detail = open ? (() => {
      const ranked = rankedOf(state, it.id);
      const max = Math.max(...ranked.map((e) => e.hargaBeli));
      const min = ranked[0].hargaBeli;
      return h('div', { class: 'sup-item-expand-panel', style: 'display:block' },
        ranked.map((e) => h('div', { class: 'hbar-row' + (e.hargaBeli === min ? ' cheapest' : '') },
          h('div', { class: 'hbar-lbl' }, supplierName(state, e.supplierId) + (e.hargaBeli === min ? ' 🏆' : '')),
          h('div', { class: 'hbar-track' }, h('div', { class: 'hbar-fill', style: `width:${(e.hargaBeli / max * 100).toFixed(1)}%` })),
          h('div', { class: 'hbar-val' }, fmtNum(e.hargaBeli)))),
        h('div', { class: 'hbar-meta' }, 'Harga terbaru tiap supplier · diurutkan termurah dulu'),
        h('div', { class: 'tbl-wrap', style: 'margin-top:14px;' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Tanggal'), h('th', {}, 'Supplier'), h('th', { class: 'num' }, 'Harga'), h('th', {}))),
          h('tbody', {}, logOf(state, it.id).map((e) => h('tr', {},
            h('td', { style: 'font-family:var(--mono);font-size:11.5px;' }, e.tanggal),
            h('td', {}, supplierName(state, e.supplierId)),
            h('td', { class: 'num' }, fmtNum(e.hargaBeli)),
            h('td', { style: 'text-align:center;' }, h('button', {
              class: 'ar-del-date', style: 'float:none;', title: 'Hapus entri ini',
              onclick: async () => { if (await confirmBox('Hapus entri harga ini?', 'Hapus', true)) act('deletePriceEntry', { id: e.id }); },
            }, '✕'))))))));
    })() : null;
    rows.push(h('div', { class: 'sup-item-row' + (open ? ' open' : ''), 'data-id': it.id },
      h('div', {
        class: 'sup-item-row-main',
        onclick: t ? () => { draft.open.has(it.id) ? draft.open.delete(it.id) : draft.open.add(it.id); ctx.render(); } : null,
      }, h('div', { class: 'sup-item-name' }, it.name),
      h('div', { class: 'sup-item-tier' }, label),
      t ? h('button', { class: 'sup-item-expand-btn', 'aria-label': 'Rincian' }, '▼') : null),
      detail));
  }
  return h('div', {},
    catBar(ctx),
    searchBox({ id: 'sup-search', value: draft.search, placeholder: 'Cari nama barang di kategori ini…', oninput: (e) => { draft.search = e.target.value; ctx.render(); } }),
    h('div', { class: 'hint', style: 'margin:-4px 0 8px;' },
      'Pilih kategori di atas, lalu ketuk baris untuk lihat rincian harga tiap supplier. Supplier termurah saat ini langsung tampil tanpa perlu buka satu-satu.'),
    panel('Tier Termurah per Barang', h('div', { class: 'panel-body' },
      rows.length ? rows : h('div', { class: 'empty' }, h('div', { class: 'empty-title' }, 'Belum ada barang')))));
}

export function renderSupplier(ctx) {
  return h('div', {},
    h('div', { class: 'pn-subnav' },
      h('button', { class: 'sub-btn' + (draft.view === 'input' ? ' active' : ''), onclick: () => { draft.view = 'input'; ctx.render(); } }, '📥 Input Harga'),
      h('button', { class: 'sub-btn' + (draft.view === 'analisis' ? ' active' : ''), onclick: () => { draft.view = 'analisis'; ctx.render(); } }, '📊 Analisis'),
      h('button', { class: 'sub-btn' + (draft.view === 'pengingat' ? ' active' : ''), onclick: () => { draft.view = 'pengingat'; ctx.render(); } }, '🔔 Pengingat')),
    draft.view === 'input' ? inputView(ctx) : draft.view === 'analisis' ? analysisView(ctx) : renderReminders(ctx));
}

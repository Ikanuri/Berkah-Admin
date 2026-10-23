import { h, ask, confirmBox, toast } from '../dom.js';
import { parseAngka, fmtNum } from '../../tgcloud/lib/money.js';
import {
  categoriesOf, itemsOf, suppliersOf, supplierName, logOf, rankedOf, tierOf,
} from '../state.js';
import { today } from './shared.js';

// Draft input harga: selamat dari render ulang (polling).
const draft = { supplierId: null, tanggal: today(), prices: {}, open: new Set() };

function supplierList(ctx) {
  const { state, act } = ctx;
  const list = suppliersOf(state);
  return h('section', {},
    h('h3', {}, 'Supplier'),
    h('div', { class: 'row wrap' },
      list.map((s) => h('span', { class: 'pill' }, s.name,
        h('button', {
          class: 'link', 'aria-label': 'Ganti nama ' + s.name,
          onclick: async () => {
            const v = await ask({ title: 'Ganti nama supplier', value: s.name });
            if (v != null && v.trim() && v.trim() !== s.name) act('saveSupplier', { id: s.id, name: v }, 'Nama diperbarui');
          },
        }, '✎'),
        h('button', {
          class: 'link danger-text', 'aria-label': 'Hapus ' + s.name,
          onclick: async () => {
            if (await confirmBox(`Hapus supplier "${s.name}"? Riwayat harganya tetap tersimpan.`, 'Hapus', true)) {
              act('deleteSupplier', { id: s.id });
            }
          },
        }, '✕'))),
      h('button', {
        class: 'btn small',
        onclick: async () => {
          const v = await ask({ title: 'Supplier baru', label: 'Nama supplier' });
          if (v != null && v.trim()) act('saveSupplier', { name: v }, 'Supplier ditambah');
        },
      }, '＋ Supplier')));
}

function priceEntry(ctx) {
  const { state, act } = ctx;
  const sups = suppliersOf(state);
  if (!sups.some((s) => s.id === draft.supplierId)) draft.supplierId = sups[0]?.id ?? null;
  if (draft.supplierId == null) {
    return h('section', {}, h('h3', {}, 'Input Harga'), h('p', { class: 'muted' }, 'Tambah supplier dulu.'));
  }

  const lastFor = (itemId) => logOf(state, itemId).find((e) => e.supplierId === draft.supplierId);
  const body = [];
  for (const cat of categoriesOf(state)) {
    const items = itemsOf(state, cat.id);
    if (!items.length) continue;
    body.push(h('div', { class: 'group' }, cat.name));
    for (const it of items) {
      const last = lastFor(it.id);
      body.push(h('div', { class: 'price-row' },
        h('div', { class: 'grow' }, it.name,
          h('div', { class: 'muted small' }, last ? `terakhir ${fmtNum(last.hargaBeli)} (${last.tanggal})` : 'belum ada harga')),
        h('input', {
          class: 'num', inputmode: 'decimal', placeholder: 'Rp', value: draft.prices[it.id] ?? '',
          oninput: (e) => { draft.prices[it.id] = e.target.value; },
        })));
    }
  }

  return h('section', {},
    h('h3', {}, 'Input Harga'),
    h('div', { class: 'row wrap' },
      h('select', {
        onchange: (e) => { draft.supplierId = Number(e.target.value); draft.prices = {}; ctx.render(); },
      }, sups.map((s) => h('option', { value: s.id, selected: s.id === draft.supplierId }, s.name))),
      h('input', { type: 'date', value: draft.tanggal, onchange: (e) => { draft.tanggal = e.target.value; } })),
    h('div', { class: 'list' }, body),
    h('button', {
      class: 'btn primary wide',
      onclick: async () => {
        const prices = Object.entries(draft.prices)
          .map(([itemId, v]) => ({ itemId, hargaBeli: parseAngka(v) }))
          .filter((p) => p.hargaBeli > 0);
        if (!prices.length) { toast('Belum ada harga yang diisi'); return; }
        const out = await act('savePrices', { supplierId: draft.supplierId, tanggal: draft.tanggal, prices });
        if (out) { draft.prices = {}; toast(`${out.saved} harga disimpan`); ctx.render(); }
      },
    }, 'Simpan harga'));
}

function analysis(ctx) {
  const { state, act } = ctx;
  const rows = [];
  for (const cat of categoriesOf(state)) {
    for (const it of itemsOf(state, cat.id)) {
      const t = tierOf(state, it.id);
      if (!t) continue;
      const who = t.kind === 'tied' ? `${t.count} supplier` : supplierName(state, t.supplierId);
      const open = draft.open.has(it.id);
      rows.push(h('div', { class: 'tier-row' },
        h('button', {
          class: 'tier-head',
          onclick: () => { open ? draft.open.delete(it.id) : draft.open.add(it.id); ctx.render(); },
        }, h('span', { class: 'grow' }, it.name), h('span', { class: 'tier' }, `🏆 ${who} · ${fmtNum(t.price)}`)),
        open ? h('div', { class: 'tier-detail' },
          h('div', { class: 'muted small' }, 'Harga terbaru tiap supplier, termurah dulu'),
          rankedOf(state, it.id).map((e) => h('div', { class: 'row' },
            h('span', { class: 'grow' }, supplierName(state, e.supplierId)), h('b', {}, fmtNum(e.hargaBeli)))),
          h('div', { class: 'muted small' }, 'Riwayat'),
          logOf(state, it.id).map((e) => h('div', { class: 'row' },
            h('span', { class: 'mono small' }, e.tanggal),
            h('span', { class: 'grow' }, supplierName(state, e.supplierId)),
            h('span', {}, fmtNum(e.hargaBeli)),
            h('button', {
              class: 'link danger-text', 'aria-label': 'Hapus entri',
              onclick: async () => { if (await confirmBox('Hapus entri harga ini?', 'Hapus', true)) act('deletePriceEntry', { id: e.id }); },
            }, '✕')))) : null));
    }
  }
  return h('section', {}, h('h3', {}, 'Tier Termurah'),
    rows.length ? h('div', { class: 'list' }, rows) : h('p', { class: 'muted' }, 'Belum ada riwayat harga.'));
}

export function renderSupplier(ctx) {
  return h('div', { class: 'view' }, supplierList(ctx), priceEntry(ctx), analysis(ctx));
}

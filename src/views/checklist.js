import { h, svg, ask, confirmBox, toast, openCalc, unitPopup } from '../dom.js';
import { UNITS } from '../../tgcloud/lib/units.js';
import { fmtNum } from '../../tgcloud/lib/money.js';
import {
  categoriesOf, itemsOf, tierOf, supplierName, buildOrderText, allLiveItems, inRange,
} from '../state.js';
import { prefs } from '../prefs.js';
import { catBar, searchBox, panel, ensureActiveCat, dateBadge } from './shared.js';

// Draft yang harus selamat dari render ulang (polling).
const draft = { add: '', search: '' };
let dragSrc = null;

const CHK_SVG = '<svg width="13" height="10" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* lanjut ke fallback */ }
  const ta = h('textarea', { value: text });
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* abaikan */ }
  ta.remove();
  return ok;
}

function tierBadge(ctx, itemId) {
  const t = tierOf(ctx.state, itemId);
  if (!t) return null;
  const who = t.kind === 'tied'
    ? h('span', { class: 'tier-supplier tier-tied' }, `${t.count} supplier`)
    : h('span', { class: 'tier-supplier' }, supplierName(ctx.state, t.supplierId));
  return h('div', { class: 'item-tier-badge sup-item-tier' }, '🏆 ', who, ' ', h('span', { class: 'tier-price' }, fmtNum(t.price)));
}

function itemCard(ctx, it, siblings) {
  const { act, isBoss } = ctx;
  const badge = it.checked ? dateBadge(it.checkedAt) : null;
  const outOfRange = it.checked && !inRange(ctx.state.filter, it.checkedAt);
  const fCls = outOfRange ? (prefs.oor === 'hide' ? ' hidden-by-filter' : ' dimmed') : '';
  const card = h('div', { class: 'item-card' + (it.checked ? ' checked' : '') + fCls, 'data-id': it.id });

  if (isBoss) {
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      dragSrc = it.id; e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', (e) => { e.preventDefault(); if (dragSrc !== it.id) card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault(); card.classList.remove('drag-over');
      const src = siblings.find((x) => x.id === dragSrc);
      dragSrc = null;
      if (!src || src.id === it.id || src.categoryId !== it.categoryId) return;
      const ids = siblings.filter((x) => x.categoryId === it.categoryId).map((x) => x.id);
      ids.splice(ids.indexOf(src.id), 1);
      ids.splice(ids.indexOf(it.id), 0, src.id);
      act('reorderItems', { categoryId: it.categoryId, ids });
    });
    card.append(h('span', { class: 'drag-handle' }, '⠿'));
  }

  card.append(
    h('div', {
      class: 'chk' + (it.checked ? ' on' : ''), role: 'checkbox', 'aria-checked': String(it.checked), tabindex: '0',
      onclick: (e) => { e.stopPropagation(); act('toggleItem', { id: it.id }); },
    }, it.checked ? svg(CHK_SVG) : null),
    h('div', { style: 'flex:1;min-width:0;' },
      h('div', { style: 'display:flex;align-items:center;min-width:0;overflow:hidden;' },
        h('span', {
          class: 'item-name', title: it.name,
          ondblclick: isBoss ? async () => {
            const v = await ask({ title: 'Ganti nama barang', value: it.name });
            if (v != null && v.trim() && v.trim() !== it.name) act('updateItem', { id: it.id, name: v }, 'Nama diperbarui');
          } : null,
        }, it.name),
        badge ? h('span', { class: 'date-badge ' + badge.cls }, badge.label) : null),
      isBoss ? tierBadge(ctx, it.id) : null,
      h('div', { class: 'qty-row' },
        h('button', { class: 'qty-btn', 'aria-label': 'Kurangi', onclick: () => act('updateItem', { id: it.id, delta: -1 }) }, '−'),
        h('span', {
          class: 'qty-disp',
          onclick: async () => {
            const v = await openCalc(it.name, it.unit, it.qty);
            if (v != null) act('updateItem', { id: it.id, qty: v });
          },
        }, String(it.qty)),
        h('button', { class: 'qty-btn', 'aria-label': 'Tambah', onclick: () => act('updateItem', { id: it.id, delta: 1 }) }, '+'),
        h('div', { class: 'unit-wrap' },
          h('button', {
            class: 'unit-btn',
            onclick: (e) => {
              e.stopPropagation();
              const open = e.currentTarget.parentElement.querySelector('.unit-pop');
              if (open) { open.remove(); return; }
              unitPopup(e.currentTarget, UNITS, it.unit, (u) => act('updateItem', { id: it.id, unit: u }));
            },
          }, it.unit + ' ▾')),
        it.checked ? h('button', {
          class: 'mini-btn', style: 'margin-left:auto',
          onclick: async () => {
            const v = await openCalc('Terima: ' + it.name, `dipesan ${it.qty} ${it.unit}`, it.qty);
            if (v == null) return;
            const out = await act('fulfillItem', { id: it.id, received: v });
            if (out) toast(out.status === 'resolved' ? 'Terpenuhi ✓' : `Kurang, sisa ${out.qty} ${it.unit}`);
          },
        }, 'Terima') : null)),
    isBoss ? h('button', {
      class: 'del-btn', 'aria-label': 'Hapus',
      onclick: async (e) => {
        e.stopPropagation();
        if (await confirmBox(`Hapus "${it.name}"?`, 'Hapus', true)) act('deleteItem', { id: it.id });
      },
    }, '×') : null);
  return card;
}

async function openCatModal(ctx, cat) {
  const { act, isBoss, state } = ctx;
  const cats = categoriesOf(state);
  const idx = cat ? cats.findIndex((c) => c.id === cat.id) : -1;
  const dismiss = () => document.querySelector('.overlay.open')?.dispatchEvent(new CustomEvent('dismiss'));
  const move = (d) => {
    const ids = cats.map((c) => c.id);
    const j = idx + d;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    dismiss();
    act('reorderCategories', { ids });
  };
  const extraBody = cat && isBoss ? h('div', { class: 'cat-reorder-row' },
    h('span', { class: 'cat-reorder-lbl' }, 'Urutan'),
    h('button', { class: 'btn sm', title: 'Geser ke kiri', disabled: idx <= 0, onclick: () => move(-1) }, '◀'),
    h('button', { class: 'btn sm', title: 'Geser ke kanan', disabled: idx >= cats.length - 1, onclick: () => move(1) }, '▶')) : null;
  const extraFoot = cat && isBoss ? h('button', {
    class: 'btn sm danger', style: 'margin-right:auto',
    onclick: async () => {
      if (!(await confirmBox(`Hapus kategori "${cat.name}" beserta semua barangnya?`, 'Hapus', true))) return;
      dismiss();
      act('deleteCategory', { id: cat.id }, `"${cat.name}" dihapus`);
    },
  }, 'Hapus') : null;
  const v = await ask({
    title: cat ? 'Ganti Nama Kategori' : 'Kategori Baru', label: cat ? '' : 'Nama kategori',
    value: cat ? cat.name : '', extraFoot, extraBody,
  });
  if (v == null || !v.trim()) return;
  if (cat) { if (v.trim() !== cat.name) act('saveCategory', { id: cat.id, name: v }, 'Nama diperbarui'); }
  else act('saveCategory', { name: v }, 'Kategori dibuat');
}

// Chip filter kategori order (Bos): kategori yang dimatikan tidak ikut "Salin order".
function outCatBar(ctx) {
  const cats = categoriesOf(ctx.state);
  if (!ctx.isBoss || cats.length < 2) return null;
  const nEx = cats.filter((c) => c.excludeFromOrder).length;
  return h('div', { style: 'display:flex;margin-left:auto;gap:5px;flex-wrap:wrap;align-items:center;' },
    cats.map((c) => h('button', {
      class: 'oc-chip' + (c.excludeFromOrder ? ' off' : ''),
      title: c.excludeFromOrder ? 'Dikecualikan dari order — ketuk untuk sertakan' : 'Ikut di order — ketuk untuk kecualikan',
      onclick: () => ctx.act('saveCategory', { id: c.id, excludeFromOrder: !c.excludeFromOrder }),
    }, h('span', { class: 'oc-mark' }, c.excludeFromOrder ? '✕' : '✓'), c.name)),
    nEx ? h('span', { class: 'oc-hint' }, `⚠ ${nEx} kategori dikecualikan dari order (centangnya tetap aman)`) : null);
}

const FILTERS = [['all', 'Semua'], ['today', 'Hari ini'], ['7d', '7 Hari'], ['custom', 'Kustom']];

function filterBar(ctx) {
  const f = ctx.state.filter;
  const set = (patch) => { Object.assign(f, patch); ctx.render(); };
  return h('div', { class: 'sk-filterbar' },
    h('span', { class: 'field-label', style: 'margin-right:2px;' }, 'Filter:'),
    FILTERS.map(([key, label]) => h('button', { class: 'sk-flt' + (f.preset === key ? ' active' : ''), onclick: () => set({ preset: key }) }, label)),
    f.preset === 'custom' ? h('span', { style: 'display:inline-flex;gap:6px;align-items:center;' },
      h('input', { type: 'date', class: 'inp', style: 'padding:4px 8px;font-size:12px;', value: f.from || '', onchange: (e) => set({ from: e.target.value || null }) }),
      h('span', { style: 'color:var(--ink3);' }, '–'),
      h('input', { type: 'date', class: 'inp', style: 'padding:4px 8px;font-size:12px;', value: f.to || '', onchange: (e) => set({ to: e.target.value || null }) })) : null);
}

function bulkActions(ctx) {
  const { state, act, isBoss } = ctx;
  const live = allLiveItems(state);
  return h('div', { style: 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:18px 0 4px;' },
    h('button', {
      class: 'btn',
      onclick: async () => {
        if (!live.length) { toast('Belum ada item'); return; }
        if (!(await confirmBox('Centang semua item di semua kategori?', 'Centang Semua'))) return;
        const out = await act('setChecked', { categoryId: null, checked: true });
        if (out) toast(out.changed ? `☑ Semua item dicentang (${out.changed} baru)` : 'Semua item sudah tercentang');
      },
    }, '☑ Centang Semua'),
    isBoss ? h('button', {
      class: 'btn danger',
      onclick: async () => {
        if (!(await confirmBox('Reset semua centang?', 'Reset'))) return;
        const out = await act('setChecked', { categoryId: null, checked: false });
        if (out) toast('Semua centang direset');
      },
    }, '↺ Reset Semua Centang') : null,
    isBoss ? h('button', {
      class: 'btn danger',
      onclick: async () => {
        if (!live.length) { toast('Belum ada item'); return; }
        if (!(await confirmBox('Hapus semua item dari daftar? Tidak bisa dibatalkan.', 'Hapus', true))) return;
        const out = await act('clearItems', {});
        if (out) toast('Semua item dihapus');
      },
    }, '🗑 Hapus Semua Item') : null);
}

export function renderChecklist(ctx) {
  const { state, act, isBoss } = ctx;
  const catId = ensureActiveCat(state);
  const q = draft.search.trim().toLowerCase();
  const cats = categoriesOf(state);

  const addInput = h('textarea', {
    class: 'inp', 'data-keep': 'add', rows: 1, style: 'flex:1;min-height:42px;',
    placeholder: 'qty satuan nama — atau paste banyak baris', value: draft.add,
    oninput: (e) => { draft.add = e.target.value; },
  });
  const catName = catId != null ? state.categories.get(catId)?.name : null;
  const inputPanel = panel(isBoss && catName ? `Tambah Barang — ${catName}` : 'Input Barang', h('div', { class: 'panel-body' },
    h('div', { style: 'display:flex;gap:8px;' }, addInput,
      h('button', {
        class: 'btn primary',
        onclick: async () => {
          if (catId == null) { toast('Buat kategori dulu'); return; }
          if (!draft.add.trim()) return;
          const out = await act('addItems', { categoryId: catId, text: draft.add });
          if (out) {
            draft.add = '';
            toast([out.added && `+${out.added} baru`, out.updated && `${out.updated} diperbarui`].filter(Boolean).join(' · '));
            ctx.render();
          }
        },
      }, '+ Tambah')),
    h('div', { class: 'hint' }, 'Format opsional: ', h('span', { class: 'hl' }, 'qty satuan nama'), '. Item baru masuk tanpa centang — centang = perlu diorder.')));

  const grid = h('div', { class: 'sk-grid' });
  if (q) {
    let total = 0;
    for (const c of cats) {
      const matched = itemsOf(state, c.id).filter((i) => i.name.toLowerCase().includes(q));
      if (!matched.length) continue;
      grid.append(h('div', { class: 'sk-cat-label' }, c.name));
      matched.forEach((i) => grid.append(itemCard(ctx, i, allLiveItems(state))));
      total += matched.length;
    }
    if (!total) grid.append(h('div', { class: 'empty', style: 'grid-column:1/-1' }, h('div', { class: 'empty-title' }, 'Tidak ketemu'), h('div', { class: 'empty-sub' }, `"${draft.search}" tidak ada di kategori manapun`)));
  } else if (catId != null) {
    const list = itemsOf(state, catId);
    if (!list.length) grid.append(h('div', { class: 'empty', style: 'grid-column:1/-1' }, h('div', { class: 'empty-icon' }, '📦'), h('div', { class: 'empty-title' }, 'Belum ada barang'), h('div', { class: 'empty-sub' }, 'Tambahkan lewat kotak Input Barang di atas')));
    list.forEach((i) => grid.append(itemCard(ctx, i, list)));
  } else {
    grid.append(h('div', { class: 'empty', style: 'grid-column:1/-1' }, h('div', { class: 'empty-icon' }, '🗂'), h('div', { class: 'empty-title' }, 'Belum ada kategori'), h('div', { class: 'empty-sub' }, 'Ketuk "+ Kategori" untuk membuat yang pertama')));
  }

  const activeItems = catId != null ? itemsOf(state, catId) : [];
  const nActive = activeItems.filter((i) => i.checked).length;
  const orderText = buildOrderText(state, { applyExclude: isBoss, filter: isBoss ? state.filter : null, tsHeaders: prefs.outputTs === 'show' });

  return h('div', {},
    inputPanel,
    catBar(ctx, { onAdd: () => openCatModal(ctx, null), onEdit: (c) => openCatModal(ctx, c) }),
    isBoss ? filterBar(ctx) : null,
    searchBox({
      id: 'search', value: draft.search, placeholder: 'Cari barang (semua kategori)…',
      oninput: (e) => { draft.search = e.target.value; ctx.render(); },
      onclear: () => { draft.search = ''; ctx.render(); },
    }),
    grid,
    activeItems.length && !q ? h('div', { class: 'counter-line' },
      h('span', {}, h('span', { class: 'hl' }, nActive), ' dari ', h('span', { class: 'hl' }, activeItems.length), ' dicentang'),
      isBoss ? [
        h('button', {
          class: 'mini-btn', disabled: nActive === activeItems.length,
          onclick: async () => { const o = await act('setChecked', { categoryId: catId, checked: true }); if (o) toast(`☑ Dicentang semua: ${o.changed} item`); },
        }, '☑ Semua'),
        h('button', {
          class: 'mini-btn', disabled: nActive === 0,
          onclick: async () => { const o = await act('setChecked', { categoryId: catId, checked: false }); if (o) toast(`✕ Dibatalkan semua: ${o.changed} item`); },
        }, '✕ Semua'),
      ] : null) : null,
    h('div', { class: 'panel', style: 'margin-top:16px;' },
      h('div', { class: 'panel-head', style: 'flex-wrap:wrap;row-gap:8px;' },
        h('div', { class: 'panel-title', style: 'font-size:14px;' }, 'Order'),
        outCatBar(ctx)),
      h('div', { class: 'panel-body' },
        h('div', { class: 'out-wrap' },
          h('div', { class: 'out-actions' },
            h('button', {
              class: 'mini-btn', disabled: !orderText,
              onclick: async () => toast((await copyText(orderText)) ? 'Teks order disalin' : 'Gagal menyalin'),
            }, 'Salin')),
          h('textarea', {
            class: 'inp', readonly: true, style: 'width:100%;min-height:130px;',
            placeholder: 'Item tercentang muncul di sini — siap disalin ke WhatsApp', value: orderText,
          })))),
    bulkActions(ctx));
}

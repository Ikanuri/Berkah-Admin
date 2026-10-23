import { h, ask, confirmBox, toast } from '../dom.js';
import { UNITS } from '../../tgcloud/lib/units.js';
import { fmtNum } from '../../tgcloud/lib/money.js';
import {
  categoriesOf, itemsOf, tierOf, supplierName, buildOrderText, checkedCount,
} from '../state.js';
import { categoryChips, ensureActiveCat } from './shared.js';

// Draft yang harus selamat dari render ulang (polling).
const draft = { add: '', search: '' };

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { value: text });
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* abaikan */ }
    ta.remove();
    return ok;
  }
}

function tierLabel(ctx, itemId) {
  const t = tierOf(ctx.state, itemId);
  if (!t) return null;
  const who = t.kind === 'tied' ? `${t.count} supplier` : supplierName(ctx.state, t.supplierId);
  return h('span', { class: 'tier' }, `🏆 ${who} · ${fmtNum(t.price)}`);
}

function itemRow(ctx, it) {
  const { act, isBoss } = ctx;
  return h('div', { class: 'item' + (it.checked ? ' checked' : ''), 'data-id': it.id },
    h('label', { class: 'item-main' },
      h('input', { type: 'checkbox', checked: it.checked, onchange: () => act('toggleItem', { id: it.id }) }),
      h('span', {
        class: 'name',
        onclick: async (e) => {
          e.preventDefault();
          const v = await ask({ title: 'Ganti nama barang', value: it.name });
          if (v != null && v.trim() && v.trim() !== it.name) act('updateItem', { id: it.id, name: v }, 'Nama diperbarui');
        },
      }, it.name)),
    h('div', { class: 'item-ctrl' },
      h('button', { class: 'qty-btn', 'aria-label': 'Kurangi', onclick: () => act('updateItem', { id: it.id, delta: -1 }) }, '−'),
      h('button', {
        class: 'qty',
        onclick: async () => {
          const v = await ask({ title: 'Jumlah', value: String(it.qty), inputmode: 'decimal' });
          if (v != null) act('updateItem', { id: it.id, qty: String(v).replace(',', '.') });
        },
      }, String(it.qty)),
      h('button', { class: 'qty-btn', 'aria-label': 'Tambah', onclick: () => act('updateItem', { id: it.id, delta: 1 }) }, '+'),
      h('select', { onchange: (e) => act('updateItem', { id: it.id, unit: e.target.value }) },
        UNITS.map((u) => h('option', { value: u, selected: u === it.unit }, u)))),
    h('div', { class: 'item-meta' },
      isBoss ? tierLabel(ctx, it.id) : null,
      it.checked ? h('button', {
        class: 'link',
        onclick: async () => {
          const v = await ask({
            title: 'Terima barang', label: `Dipesan ${it.qty} ${it.unit}. Berapa yang datang?`,
            value: String(it.qty), inputmode: 'decimal', ok: 'Terima',
          });
          if (v == null) return;
          const out = await act('fulfillItem', { id: it.id, received: String(v).replace(',', '.') });
          if (out) toast(out.status === 'resolved' ? 'Terpenuhi ✓' : `Kurang, sisa ${out.qty} ${it.unit}`);
        },
      }, 'Terima') : null,
      h('button', {
        class: 'link danger-text',
        onclick: async () => {
          if (await confirmBox(`Hapus "${it.name}"?`, 'Hapus', true)) act('deleteItem', { id: it.id });
        },
      }, 'Hapus')));
}

function categoryMenu(ctx, cat) {
  const { act, isBoss, state } = ctx;
  const cats = categoriesOf(state);
  const idx = cats.findIndex((c) => c.id === cat.id);
  const move = (d) => {
    const ids = cats.map((c) => c.id);
    const j = idx + d;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    act('reorderCategories', { ids });
  };
  return h('div', { class: 'row wrap cat-tools' },
    h('button', {
      class: 'btn small',
      onclick: async () => {
        const v = await ask({ title: 'Ganti nama kategori', value: cat.name });
        if (v != null && v.trim() && v.trim() !== cat.name) act('saveCategory', { id: cat.id, name: v });
      },
    }, 'Ganti nama'),
    isBoss ? [
      h('button', { class: 'btn small', disabled: idx <= 0, onclick: () => move(-1) }, '◀'),
      h('button', { class: 'btn small', disabled: idx >= cats.length - 1, onclick: () => move(1) }, '▶'),
      h('label', { class: 'check-inline' },
        h('input', {
          type: 'checkbox', checked: !cat.excludeFromOrder,
          onchange: (e) => act('saveCategory', { id: cat.id, excludeFromOrder: !e.target.checked }),
        }), ' Ikut order'),
      h('button', {
        class: 'btn small danger',
        onclick: async () => {
          if (await confirmBox(`Hapus kategori "${cat.name}" beserta semua barangnya?`, 'Hapus', true)) {
            act('deleteCategory', { id: cat.id });
          }
        },
      }, 'Hapus'),
    ] : null);
}

export function renderChecklist(ctx) {
  const { state, act, isBoss } = ctx;
  const catId = ensureActiveCat(state);
  const addCat = h('button', {
    class: 'chip add',
    onclick: async () => {
      const v = await ask({ title: 'Kategori baru', label: 'Nama kategori' });
      if (v != null && v.trim()) act('saveCategory', { name: v }, 'Kategori dibuat');
    },
  }, '＋');

  if (catId == null) {
    return h('div', { class: 'view' },
      h('div', { class: 'empty' }, h('p', {}, 'Belum ada kategori.'), addCat, ' ', h('span', { class: 'muted' }, 'Buat kategori pertama')));
  }

  const cat = state.categories.get(catId);
  const q = draft.search.trim().toLowerCase();
  const items = itemsOf(state, catId).filter((i) => !q || i.name.toLowerCase().includes(q));
  const n = checkedCount(state);

  const addInput = h('textarea', {
    'data-keep': 'add', rows: 2, placeholder: 'Tambah barang, satu per baris\n5 dus Aqua\n2 kg Gula', value: draft.add,
    oninput: (e) => { draft.add = e.target.value; },
  });

  return h('div', { class: 'view' },
    categoryChips(ctx, { extra: addCat }),
    categoryMenu(ctx, cat),
    h('div', { class: 'add-box' }, addInput,
      h('button', {
        class: 'btn primary',
        onclick: async () => {
          if (!draft.add.trim()) return;
          const out = await act('addItems', { categoryId: catId, text: draft.add });
          if (out) { draft.add = ''; toast(`+${out.added} baru, ${out.updated} diperbarui`); ctx.render(); }
        },
      }, 'Tambah')),
    h('input', {
      type: 'search', 'data-keep': 'search', class: 'search', placeholder: 'Cari barang…', value: draft.search,
      oninput: (e) => { draft.search = e.target.value; ctx.render(); },
    }),
    items.length
      ? h('div', { class: 'list' }, items.map((it) => itemRow(ctx, it)))
      : h('div', { class: 'empty' }, q ? 'Tidak ada yang cocok.' : 'Belum ada barang di kategori ini.'),
    h('div', { class: 'footer-bar' },
      h('button', {
        class: 'btn primary wide', disabled: n === 0,
        onclick: async () => {
          const text = buildOrderText(state, { applyExclude: isBoss });
          if (!text) { toast('Tidak ada yang tercentang'); return; }
          toast((await copyText(text)) ? 'Teks order disalin' : 'Gagal menyalin');
        },
      }, `Salin order (${n})`)));
}

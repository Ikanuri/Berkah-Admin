import { h } from '../dom.js';
import { UNITS } from '../../tgcloud/lib/units.js';
import { parseAngka, fmtNum, inpVal, cost, pctOf } from '../../tgcloud/lib/money.js';
import { itemsOf } from '../state.js';
import { categoryChips, ensureActiveCat } from './shared.js';

// Kolom angka: simpan nilai presisi, tampilkan dibulatkan (aturan app lama).
function numInput(ctx, it, field) {
  return h('input', {
    class: 'num', inputmode: 'decimal', value: inpVal(it[field]),
    onchange: (e) => {
      const v = parseAngka(e.target.value);
      ctx.act('setHpp', { id: it.id, [field]: v > 0 ? v : null });
    },
  });
}

export function renderHpp(ctx) {
  const { state } = ctx;
  const catId = ensureActiveCat(state);
  if (catId == null) return h('div', { class: 'view' }, h('div', { class: 'empty' }, 'Buat kategori di tab Stok dulu.'));

  const rows = itemsOf(state, catId).map((it) => {
    const pokok = cost(it);
    const margin = it.hargaJual > 0 && pokok > 0 ? it.hargaJual - pokok : null;
    return h('tr', {},
      h('td', { class: 'sticky' }, it.name, h('div', { class: 'muted small' }, it.unit)),
      h('td', {}, numInput(ctx, it, 'isi')),
      h('td', {}, h('select', { onchange: (e) => ctx.act('setHpp', { id: it.id, satuanHpp: e.target.value }) },
        h('option', { value: '' }, '—'),
        UNITS.map((u) => h('option', { value: u, selected: u === it.satuanHpp }, u)))),
      h('td', {}, numInput(ctx, it, 'hargaBeli')),
      h('td', { class: 'r' }, pokok ? fmtNum(pokok) : '—'),
      h('td', {}, numInput(ctx, it, 'hargaJual')),
      h('td', { class: 'r ' + (margin == null ? '' : margin >= 0 ? 'pos' : 'neg') }, margin == null ? '—' : fmtNum(margin)),
      h('td', { class: 'r ' + (margin == null ? '' : margin >= 0 ? 'pos' : 'neg') },
        margin == null ? '—' : fmtNum(pctOf(margin, pokok)) + '%'));
  });

  return h('div', { class: 'view' },
    categoryChips(ctx),
    h('p', { class: 'muted small' }, 'Harga Beli = harga per satuan beli. Pokok = Harga Beli ÷ Isi. Harga Beli terisi otomatis dari harga terakhir di tab Supplier.'),
    rows.length
      ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Barang', 'Isi', 'Satuan', 'Harga Beli', 'Pokok', 'Harga Jual', 'Margin', 'Margin %']
          .map((t, i) => h('th', { class: i === 0 ? 'sticky' : '' }, t)))),
        h('tbody', {}, rows)))
      : h('div', { class: 'empty' }, 'Belum ada barang di kategori ini.'));
}

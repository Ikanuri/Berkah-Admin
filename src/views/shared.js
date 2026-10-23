import { h } from '../dom.js';
import { categoriesOf } from '../state.js';

export function ensureActiveCat(state) {
  const cats = categoriesOf(state);
  if (!cats.some((c) => c.id === state.activeCat)) state.activeCat = cats[0]?.id ?? null;
  return state.activeCat;
}

const p2 = (n) => String(n).padStart(2, '0');
export const dateStr = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
export const today = () => dateStr(Date.now());

// Lencana tanggal centang (skDateBadge di app lama).
export function dateBadge(ts) {
  if (!ts) return null;
  const ds = dateStr(ts);
  if (ds === today()) return { label: 'hari ini', cls: 'today' };
  if (ds === dateStr(Date.now() - 86400000)) return { label: 'kemarin', cls: 'yesterday' };
  return { label: Math.floor((Date.now() - ts) / 86400000) + 'h lalu', cls: 'old' };
}

// Deretan tab kategori. onLongPress(cat) membuka modal edit (klik kanan / tekan lama).
export function catBar(ctx, { onAdd, onEdit } = {}) {
  const { state } = ctx;
  return h('div', { class: 'cat-bar' },
    categoriesOf(state).map((c) => {
      let hold;
      return h('button', {
        class: 'cat-tab' + (c.id === state.activeCat ? ' active' : ''),
        title: onEdit ? 'Klik kanan / tekan lama: edit' : null,
        onclick: () => { state.activeCat = c.id; ctx.render(); },
        oncontextmenu: onEdit ? (e) => { e.preventDefault(); onEdit(c); } : null,
        ontouchstart: onEdit ? () => { hold = setTimeout(() => onEdit(c), 600); } : null,
        ontouchend: () => clearTimeout(hold),
        ontouchmove: () => clearTimeout(hold),
      }, c.name);
    }),
    onAdd ? h('button', { class: 'cat-tab cat-tab-add', onclick: onAdd }, '+ Kategori') : null);
}

// Kotak cari dengan ikon ⌕ (markup sama dengan app lama).
export function searchBox({ id, value, placeholder, oninput, onclear }) {
  return h('div', { style: 'position:relative;margin-bottom:12px;' },
    h('input', { type: 'text', class: 'inp', 'data-keep': id, style: 'width:100%;padding-left:34px;', placeholder, value, oninput }),
    h('span', { style: 'position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--ink4);' }, '⌕'),
    onclear && value ? h('button', { class: 'mini-btn', style: 'position:absolute;right:8px;top:50%;transform:translateY(-50%);', onclick: onclear }, '✕') : null);
}

export const panel = (title, body, { chip, headExtra } = {}) =>
  h('div', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('div', { class: 'panel-title', style: 'font-size:14px;' }, title), headExtra || null,
      chip ? h('div', { class: 'panel-chip' }, chip) : null),
    body);

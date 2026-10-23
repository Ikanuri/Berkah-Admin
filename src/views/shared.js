import { h } from '../dom.js';
import { categoriesOf } from '../state.js';

// Deretan chip kategori. onPick(id) dipanggil saat dipilih.
export function categoryChips(ctx, { extra } = {}) {
  const { state } = ctx;
  const cats = categoriesOf(state);
  return h('div', { class: 'chips' },
    cats.map((c) => h('button', {
      class: 'chip' + (c.id === state.activeCat ? ' active' : ''),
      onclick: () => { state.activeCat = c.id; ctx.render(); },
    }, c.name)),
    extra);
}

export function ensureActiveCat(state) {
  const cats = categoriesOf(state);
  if (!cats.some((c) => c.id === state.activeCat)) state.activeCat = cats[0]?.id ?? null;
  return state.activeCat;
}

export const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

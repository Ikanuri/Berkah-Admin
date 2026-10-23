import './style.css';
import { h } from './dom.js';
import { call, mode } from './api.js';
import { createState } from './state.js';
import { createSync } from './actions.js';
import { renderChecklist } from './views/checklist.js';
import { renderHpp } from './views/hpp.js';
import { renderSupplier } from './views/supplier.js';
import { renderUsers } from './views/users.js';

const app = document.getElementById('app');
const state = createState();
let view = 'stok';

const VIEWS = {
  stok: { label: 'Stok', render: renderChecklist, boss: false },
  hpp: { label: 'HPP', render: renderHpp, boss: true },
  supplier: { label: 'Supplier', render: renderSupplier, boss: true },
  users: { label: 'Pengguna', render: renderUsers, boss: true },
};

let sync;
let dirty = false;
const ctx = {
  state,
  get isBoss() { return state.me?.role === 'boss'; },
  render: () => render(),
  act: (...a) => sync.act(...a),
};

function shell() {
  const m = mode();
  const tabs = Object.entries(VIEWS).filter(([, v]) => !v.boss || ctx.isBoss);
  if (!VIEWS[view] || (VIEWS[view].boss && !ctx.isBoss)) view = 'stok';
  return h('div', { class: 'shell' },
    m.kind === 'dev' ? h('div', { class: 'dev-banner' }, `MODE DEV · data lokal browser · peran: ${m.role}`) : null,
    h('header', {},
      h('h1', {}, 'Toko Berkah'),
      h('span', { class: 'who' }, state.me.name + ' · ' + { boss: 'Bos', worker: 'Karyawan' }[state.me.role])),
    tabs.length > 1 ? h('nav', { class: 'tabs' }, tabs.map(([key, v]) => h('button', {
      class: 'tab' + (key === view ? ' active' : ''),
      onclick: () => { view = key; render(); },
    }, v.label))) : null,
    VIEWS[view].render(ctx));
}

function render() {
  const a = document.activeElement;
  const keep = a?.dataset?.keep;
  const pos = a && 'selectionStart' in a ? a.selectionStart : null;
  app.replaceChildren(shell());
  if (keep) {
    const el = app.querySelector(`[data-keep="${keep}"]`);
    if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch { /* abaikan */ } }
  }
}

// Render dari polling jangan merebut fokus saat orang sedang mengetik/memilih.
// Hanya isian teks yang dilindungi; checkbox/tombol/select selesai begitu diubah.
const TEXT_ENTRY = 'textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])';
const typing = () => {
  const a = document.activeElement;
  return !!(a && app.contains(a) && a.matches(TEXT_ENTRY));
};
function scheduleRender() {
  if (typing()) { dirty = true; return; }
  render();
}
app.addEventListener('focusout', () => {
  if (!dirty) return;
  setTimeout(() => { if (!typing()) { dirty = false; render(); } }, 0);
});

function screen(title, text, extra) {
  app.replaceChildren(h('div', { class: 'shell' }, h('div', { class: 'center' }, h('h1', {}, title), h('p', {}, text), extra)));
}

async function boot() {
  const tg = window.Telegram?.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); } catch { /* abaikan */ } }

  if (mode().kind === 'none') {
    screen('Toko Berkah', 'Buka aplikasi ini lewat Telegram (menu bot).');
    return;
  }
  try {
    state.me = await call('me');
  } catch (e) {
    screen('Gagal masuk', e.message, h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Coba lagi'));
    return;
  }
  if (state.me.role === 'pending') {
    screen('Menunggu persetujuan', 'Akun Anda sudah terdaftar. Minta Bos menyetujui, lalu muat ulang.',
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Cek lagi'));
    return;
  }
  sync = createSync(state, scheduleRender);
  render();
  await sync.refresh();
  sync.start();
}

boot();

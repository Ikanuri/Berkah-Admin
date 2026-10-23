import './style.css';
import { h, hasUnitPop } from './dom.js';
import { call, mode } from './api.js';
import { createState } from './state.js';
import { createSync } from './actions.js';
import { applyTheme, cycleTheme } from './theme.js';
import { relTime } from './state.js';
import { renderChecklist } from './views/checklist.js';
import { renderHpp } from './views/hpp.js';
import { renderSupplier } from './views/supplier.js';
import { openSettings } from './views/settings.js';
import { renderNota } from './views/nota.js';
import { renderPnl } from './views/pnl.js';

const app = document.getElementById('app');
const state = createState();
let view = 'checklist';
let mod = 'stok'; // modul aktif: stok | nota | pnl (Nota dan PNL khusus Bos)

// Sub-tampilan modul Stok. HPP dan Supplier = harga modal, khusus Bos.
const VIEWS = {
  checklist: { label: '☑ Checklist', render: renderChecklist, boss: false },
  hpp: { label: '💰 HPP', render: renderHpp, boss: true },
  supplier: { label: '🚚 Supplier', render: renderSupplier, boss: true },
};

let sync;
let dirty = false;
const ctx = {
  state,
  get isBoss() { return state.me?.role === 'boss'; },
  render: () => render(),
  act: (...a) => sync.act(...a),
};

const ROLE = { boss: ['badge badge-boss', 'Mode Bos'], worker: ['badge badge-timeout', 'Karyawan'] };

function dateLabel() {
  return new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

function shell() {
  const m = mode();
  if (mod !== 'stok' && !ctx.isBoss) mod = 'stok';
  if (!VIEWS[view] || (VIEWS[view].boss && !ctx.isBoss)) view = 'checklist';
  const [roleCls, roleLbl] = ROLE[state.me.role];
  return h('div', {},
    state.alerts.length ? h('div', { id: 'remind-banner' },
      h('span', { class: 'srb-ico' }, '🔔'),
      h('div', { class: 'srb-msg' }, state.alerts.join('\n')),
      h('button', { class: 'srb-close', onclick: () => { state.alerts.length = 0; render(); } }, 'Tutup')) : null,
    m.kind === 'dev' ? h('div', { class: 'dev-banner' }, `MODE DEV · data lokal browser · peran: ${m.role}`) : null,
    h('div', { class: 'topbar' }, h('div', { class: 'topbar-inner' },
      h('div', { class: 'brand', title: 'Toko Berkah' },
        h('span', { class: 'brand-mark' }, '✳'),
        h('span', { class: 'brand-name' }, 'Toko ', h('em', {}, 'Berkah'))),
      ctx.isBoss ? h('div', { class: 'mod-tabs' }, [['stok', 'Stok'], ['nota', 'Nota'], ['pnl', 'PNL']].map(([k, label]) => h('button', {
        class: 'mod-tab' + (mod === k ? ' active' : ''), 'data-mod': k,
        onclick: () => { mod = k; render(); },
      }, h('span', { class: 'dot' }), label))) : null,
      h('div', { style: 'flex:1' }),
      h('div', { class: 'top-actions' },
        h('button', { class: 'icon-btn', title: 'Ganti tema', onclick: () => { cycleTheme(); } }, '◐'),
        h('button', { class: 'icon-btn', title: 'Pengaturan', onclick: () => openSettings(ctx) }, '⚙')))),
    h('div', { class: 'wrap' },
      h('div', { class: 'module active' },
        h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;' },
          h('span', { style: 'font-family:var(--serif);font-style:italic;font-size:14px;color:var(--ink3);' }, dateLabel()),
          h('span', { class: roleCls }, roleLbl)),
        state.lastAct ? h('div', { class: 'sk-lastact' },
          h('span', { class: 'sk-la-dot' }),
          h('span', {}, 'Diubah ', h('b', {}, relTime(state.lastAct.ts)), ' — ', state.lastAct.desc,
            state.lastAct.by ? h('span', { style: 'color:var(--ink4);' }, ' · ' + state.lastAct.by) : null)) : null,
        mod === 'nota' ? renderNota(ctx) : null,
        mod === 'pnl' ? renderPnl(ctx) : null,
        mod === 'stok' && ctx.isBoss ? h('div', { class: 'pn-subnav' }, Object.entries(VIEWS).map(([key, v]) => h('button', {
          class: 'sub-btn' + (key === view ? ' active' : ''),
          onclick: () => { view = key; render(); },
        }, v.label))) : null,
        mod === 'stok' ? VIEWS[view].render(ctx) : null)),
    h('div', { class: 'app-footer' }, h('span', { class: 'sig' }, h('span', { class: 'spark' }, '✳'), ' ', h('b', {}, 'Toko Berkah'), ' · Telegram Mini App')));
}

function render() {
  const a = document.activeElement;
  const keep = a?.dataset?.keep;
  const pos = a && 'selectionStart' in a ? a.selectionStart : null;
  const scroll = window.scrollY;
  app.replaceChildren(shell());
  window.scrollTo(0, scroll);
  if (keep) {
    const el = app.querySelector(`[data-keep="${keep}"]`);
    if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch { /* abaikan */ } }
  }
}

// Render dari polling jangan merebut fokus saat orang mengetik atau memilih satuan.
// Hanya isian teks yang dilindungi; checkbox/tombol/select selesai begitu diubah.
const TEXT_ENTRY = 'textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])';
const typing = () => {
  const a = document.activeElement;
  return !!((a && app.contains(a) && a.matches(TEXT_ENTRY)) || hasUnitPop());
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
  app.replaceChildren(h('div', { class: 'center-screen' }, h('h1', {}, 'Toko ', h('em', { style: 'font-weight:400' }, 'Berkah')), h('p', {}, text), h('div', { class: 'hint' }, title), extra));
}

async function boot() {
  applyTheme();
  const tg = window.Telegram?.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); tg.onEvent?.('themeChanged', applyTheme); } catch { /* abaikan */ } }
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  if (mode().kind === 'none') {
    screen('Telegram', 'Buka aplikasi ini lewat Telegram (menu bot).');
    return;
  }
  try {
    state.me = await call('me');
  } catch (e) {
    screen('Gagal masuk', e.message, h('button', { class: 'btn primary', style: 'margin-top:12px', onclick: () => location.reload() }, 'Coba lagi'));
    return;
  }
  if (state.me.role === 'pending') {
    screen('Menunggu persetujuan', 'Akun Anda sudah terdaftar. Minta Bos menyetujui, lalu muat ulang.',
      h('button', { class: 'btn primary', style: 'margin-top:12px', onclick: () => location.reload() }, 'Cek lagi'));
    return;
  }
  sync = createSync(state, scheduleRender);
  render();
  await sync.refresh();
  sync.start();
}

boot();

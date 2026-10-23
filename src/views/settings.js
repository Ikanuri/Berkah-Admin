import { h, openModal, toast } from '../dom.js';
import { call } from '../api.js';
import { themePref, setTheme } from '../theme.js';
import { prefs } from '../prefs.js';

const ROLE_LABEL = { boss: 'Bos', worker: 'Karyawan', pending: 'Menunggu' };

function themeSeg() {
  const seg = h('div', { class: 'seg' });
  const paint = () => seg.replaceChildren(...[['auto', 'Otomatis'], ['light', 'Terang'], ['dark', 'Gelap']].map(([k, label]) =>
    h('button', { class: 'seg-opt' + (themePref() === k ? ' active' : ''), onclick: () => { setTheme(k); paint(); } }, label)));
  paint();
  return seg;
}

function prefSeg(label, key, options) {
  const seg = h('div', { class: 'seg' });
  const paint = () => seg.replaceChildren(...options.map(([val, text]) =>
    h('button', { class: 'seg-opt' + (prefs[key] === val ? ' active' : ''), onclick: () => { prefs[key] = val; paint(); } }, text)));
  paint();
  return h('div', {}, h('span', { class: 'set-sub', style: 'margin:0 0 6px;display:block;' }, label), seg);
}

async function usersSection(ctx, box) {
  box.replaceChildren(h('div', { class: 'hint' }, 'Memuat…'));
  let users;
  try { users = await call('listUsers'); } catch (e) { box.replaceChildren(h('div', { class: 'hint' }, e.message)); return; }
  const pending = users.filter((u) => u.role === 'pending').length;
  const rows = users.map((u) => h('div', { class: 'user-row' },
    h('div', { style: 'flex:1;min-width:0;' },
      h('div', { class: 'u-name' }, u.name),
      h('div', { class: 'u-sub' }, u.username ? '@' + u.username : 'id ' + u.tgId)),
    h('select', {
      class: 'inp', disabled: u.tgId === ctx.state.me.tgId,
      onchange: async (e) => {
        try { await call('setUserRole', { tgId: u.tgId, role: e.target.value }); toast('Peran diperbarui'); } catch (err) { toast(err.message); }
        usersSection(ctx, box);
      },
    }, ['boss', 'worker', 'pending'].map((r) => h('option', { value: r, selected: r === u.role }, ROLE_LABEL[r])))));
  // replaceChildren tidak meratakan array: sebarkan manual
  box.replaceChildren(...[pending ? h('div', { class: 'alert alert-warn' }, `${pending} orang menunggu persetujuan`) : null, ...rows].filter(Boolean));
}

export function openSettings(ctx) {
  const me = ctx.state.me;
  const box = h('div', {});
  const body = h('div', {},
    h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, 'Akun'),
      h('span', { class: 'badge ' + (me.role === 'boss' ? 'badge-boss' : 'badge-timeout') }, ROLE_LABEL[me.role]),
      h('div', { class: 'set-sub' }, me.name)),
    h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, 'Tema'), themeSeg()),
    ctx.isBoss ? h('div', { class: 'set-row', style: 'flex-direction:column;align-items:flex-start;' },
      h('div', { class: 'set-label' }, 'Checklist'),
      prefSeg('Item tercentang di luar filter tanggal:', 'oor', [['dim', 'Redup'], ['hide', 'Sembunyi']]),
      prefSeg('Header tanggal di teks order:', 'outputTs', [['show', 'Tampil'], ['hide', 'Sembunyi']])) : null,
    ctx.isBoss ? h('div', { style: 'margin-top:14px;' }, h('div', { class: 'field-label', style: 'margin-bottom:6px;' }, 'Pengguna'), box) : null);
  openModal({ title: 'Pengaturan', body });
  if (ctx.isBoss) usersSection(ctx, box);
}

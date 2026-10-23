import { h, toast } from '../dom.js';
import { call } from '../api.js';

let users = null;
let loading = false;

async function load(ctx) {
  if (loading) return;
  loading = true;
  try { users = await call('listUsers'); } catch (e) { toast(e.message); }
  loading = false;
  ctx.render();
}

export function renderUsers(ctx) {
  if (users == null) { load(ctx); return h('div', { class: 'view' }, h('div', { class: 'empty' }, 'Memuat…')); }
  const pending = users.filter((u) => u.role === 'pending').length;
  return h('div', { class: 'view' },
    h('h3', {}, 'Pengguna'),
    pending ? h('p', { class: 'notice' }, `${pending} orang menunggu persetujuan`) : null,
    h('div', { class: 'list' }, users.map((u) => h('div', { class: 'user-row' },
      h('div', { class: 'grow' }, u.name, h('div', { class: 'muted small' }, u.username ? '@' + u.username : 'id ' + u.tgId)),
      h('select', {
        disabled: u.tgId === ctx.state.me.tgId,
        onchange: async (e) => {
          try { await call('setUserRole', { tgId: u.tgId, role: e.target.value }); toast('Peran diperbarui'); } catch (err) { toast(err.message); }
          users = null; ctx.render();
        },
      }, ['boss', 'worker', 'pending'].map((r) => h('option', { value: r, selected: r === u.role },
        { boss: 'Bos', worker: 'Karyawan', pending: 'Menunggu' }[r])))))),
    h('button', { class: 'btn', onclick: () => { users = null; ctx.render(); } }, 'Muat ulang'));
}

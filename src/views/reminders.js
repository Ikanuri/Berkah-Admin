import { h, openModal, toast, confirmBox } from '../dom.js';
import { call } from '../api.js';
import { suppliersOf, supplierName, recurringOf, oneOffsOf } from '../state.js';
import { panel } from './shared.js';
import { DAY_LABELS, PRE_ALERT_OPTIONS, recSummary } from '../../tgcloud/lib/reminders.js';
import { fmtShopDT, shopMsFromLocalInput } from '../../tgcloud/lib/time.js';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // tampil Sen..Min seperti app lama

function preAlertFields(initial) {
  const chk = h('input', { type: 'checkbox', checked: !!initial, style: 'accent-color:var(--accent);width:16px;height:16px;' });
  const sel = h('select', { class: 'inp', style: 'width:100%;', disabled: !initial },
    PRE_ALERT_OPTIONS.map((m) => h('option', { value: m, selected: m === (initial || 30) }, `${m} menit`)));
  chk.addEventListener('change', () => { sel.disabled = !chk.checked; });
  return {
    nodes: [
      h('label', { style: 'display:flex;align-items:center;gap:8px;margin-top:14px;' }, chk, h('span', { style: 'font-size:12.5px;' }, 'Ingatkan sebelum jadwal (pra-alert)')),
      h('div', { class: 'field', style: 'margin-top:8px;' }, h('span', { class: 'field-label' }, 'Berapa menit sebelumnya'), sel),
    ],
    value: () => (chk.checked ? Number(sel.value) : null),
  };
}

function recurringModal(ctx, sup) {
  const rec = recurringOf(ctx.state, sup.id);
  const days = new Set(rec ? rec.days : []);
  const chips = h('div', { class: 'day-chip-row' }, DAY_ORDER.map((d) => {
    const b = h('button', { type: 'button', class: 'cat-tab' + (days.has(d) ? ' active' : ''), 'data-day': d }, DAY_LABELS[d]);
    b.addEventListener('click', () => { days.has(d) ? days.delete(d) : days.add(d); b.classList.toggle('active', days.has(d)); });
    return b;
  }));
  const time = h('input', { type: 'time', class: 'inp', style: 'width:100%;', value: rec ? rec.time : '08:00' });
  const pre = preAlertFields(rec ? rec.preAlertMin : null);
  const m = openModal({
    title: `Jadwal Mingguan — ${sup.name}`, maxWidth: 340,
    body: [h('span', { class: 'field-label' }, 'Hari (boleh lebih dari satu)'), chips,
      h('div', { class: 'field', style: 'margin-top:10px;' }, h('span', { class: 'field-label' }, 'Jam (waktu toko)'), time), ...pre.nodes],
    foot: [
      rec ? h('button', {
        class: 'btn sm danger', style: 'margin-right:auto',
        onclick: async () => { m.close(); await ctx.act('deleteRecurring', { supplierId: sup.id }, 'Jadwal mingguan dihapus'); },
      }, 'Hapus Jadwal') : null,
      h('button', { class: 'btn sm', onclick: () => m.close() }, 'Batal'),
      h('button', {
        class: 'btn sm primary', id: 'rec-save',
        onclick: async () => {
          if (!days.size) { toast('Pilih minimal satu hari'); return; }
          if (!time.value) { toast('Isi jam dulu'); return; }
          const out = await ctx.act('saveRecurring', { supplierId: sup.id, days: [...days], time: time.value, preAlertMin: pre.value() }, `Jadwal mingguan "${sup.name}" disimpan`);
          if (out) m.close();
        },
      }, 'Simpan'),
    ],
  });
}

function oneOffModal(ctx, preselect) {
  const sups = suppliersOf(ctx.state);
  if (!sups.length) { toast('Tambah supplier dulu di tab Input Harga'); return; }
  const sel = h('select', { class: 'inp', style: 'width:100%;' }, sups.map((s) => h('option', { value: s.id, selected: s.id === preselect }, s.name)));
  const dt = h('input', { type: 'datetime-local', class: 'inp', style: 'width:100%;' });
  const pre = preAlertFields(null);
  const m = openModal({
    title: 'Pengingat Sekali-Jadwal', maxWidth: 340,
    body: [h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Supplier'), sel),
      h('div', { class: 'field', style: 'margin-top:10px;' }, h('span', { class: 'field-label' }, 'Tanggal & Jam (waktu toko)'), dt), ...pre.nodes],
    foot: [
      h('button', { class: 'btn sm', onclick: () => m.close() }, 'Batal'),
      h('button', {
        class: 'btn sm primary', id: 'once-save',
        onclick: async () => {
          if (!dt.value) { toast('Isi tanggal & jam dulu'); return; }
          const ts = shopMsFromLocalInput(dt.value);
          const sup = ctx.state.suppliers.get(Number(sel.value));
          const out = await ctx.act('saveOneOff', { supplierId: Number(sel.value), ts, preAlertMin: pre.value() }, `Pengingat sekali untuk "${sup?.name}" disimpan`);
          if (out) m.close();
        },
      }, 'Simpan'),
    ],
  });
}

async function sendTest() {
  try {
    const out = await call('testReminder');
    toast(out.sent ? 'Pesan uji dikirim ke chat Anda' : `Gagal kirim: ${out.reason}. Buka chat dengan bot dan kirim /start dulu.`);
  } catch (e) { toast(e.message); }
}

export function renderReminders(ctx) {
  const { state } = ctx;
  const sups = suppliersOf(state);
  const once = oneOffsOf(state);
  return h('div', {},
    panel('Cara kerja', h('div', { class: 'panel-body' },
      h('div', { class: 'hint', style: 'margin-top:0;' },
        '🔔 Pengingat dikirim sebagai pesan Telegram ke semua Bos. Server memeriksanya tiap ~1 menit selama ada yang membuka app ini (tidak ada pemicu terjadwal), ',
        'jadi bila tidak ada yang membuka app, pesan baru dikirim begitu app dibuka lagi (alarm utama tetap berbunyi sekali pada hari itu walau telat; pra-alert bisa terlewat). Waktu mengikuti jam toko (WIB). ',
        'Agar pesan bisa masuk, kirim /start ke bot ini sekali.'),
      h('button', { class: 'btn sm', style: 'margin-top:8px;', onclick: sendTest }, '🔔 Kirim pesan uji'))),
    panel('Jadwal Mingguan per Supplier', h('div', { class: 'panel-body' },
      sups.length ? sups.map((s) => {
        const rec = recurringOf(state, s.id);
        return h('div', { class: 'sup-rem-row', 'data-sup': s.id },
          h('div', { class: 'sup-rem-row-name' }, s.name),
          h('div', { class: 'sup-rem-row-sched' }, rec ? recSummary(rec) : h('span', { style: 'color:var(--ink4);' }, 'Belum ada jadwal mingguan')),
          h('button', { type: 'button', class: 'mini-btn', onclick: () => recurringModal(ctx, s) }, 'Atur'));
      }) : h('div', { class: 'empty-sub' }, 'Belum ada supplier — tambah dulu di tab Input Harga.'))),
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title', style: 'font-size:14px;' }, 'Pengingat Sekali-Jadwal'),
        h('button', { class: 'btn sm primary', id: 'once-add', style: 'margin-left:auto;', onclick: () => oneOffModal(ctx) }, '+ Tambah')),
      h('div', { class: 'panel-body' }, once.length ? once.map((o) => h('div', { class: 'sup-rem-once-row', 'data-id': o.id },
        h('div', { class: 'sup-rem-row-name' }, supplierName(state, o.supplierId)),
        h('div', { class: 'sup-rem-row-sched' }, fmtShopDT(o.ts) + (o.preAlertMin ? ` (pra-alert ${o.preAlertMin} mnt)` : '')),
        h('button', {
          type: 'button', class: 'mini-btn',
          onclick: async () => { if (await confirmBox('Hapus pengingat ini?', 'Hapus', true)) ctx.act('deleteOneOff', { id: o.id }, 'Pengingat dihapus'); },
        }, 'Hapus'))) : h('div', { class: 'empty-sub' }, 'Belum ada pengingat sekali-jadwal.'))));
}

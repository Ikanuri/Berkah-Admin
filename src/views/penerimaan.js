// Halaman Penerimaan: tampil HANYA untuk peran Karyawan. Fungsinya sama dengan halaman
// karyawan app lama (tempel pesanan ke daftar sendiri, centang = sudah diambil, atur qty/satuan,
// "Balasan ke Bos"), ditambah tombol Setor yang mengirim barang yang sudah diambil ke Bos
// (menggantikan salin-tempel lewat WhatsApp). Daftar Bos tidak pernah sampai ke sini.
import { h, svg, confirmBox, toast, openCalc, unitPopup } from '../dom.js';
import { UNITS } from '../../tgcloud/lib/units.js';
import { replyText } from '../../tgcloud/lib/receipts.js';
import { makeId } from '../../tgcloud/lib/id.js';
import { parseLine, normName } from '../../tgcloud/lib/rules.js';
import { workerItemsOf, receiptsOf, relTime } from '../state.js';
import { searchBox, panel, dateBadge } from './shared.js';

const draft = { add: '', search: '' };
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

function itemCard(ctx, it) {
  const { act } = ctx;
  const badge = it.checked ? dateBadge(it.checkedAt) : null;
  return h('div', { class: 'item-card' + (it.checked ? ' checked' : ''), 'data-id': it.id },
    h('div', {
      class: 'chk' + (it.checked ? ' on' : ''), role: 'checkbox', 'aria-checked': String(it.checked), tabindex: '0',
      onclick: (e) => { e.stopPropagation(); act('wToggleItem', { id: it.id }); },
    }, it.checked ? svg(CHK_SVG) : null),
    h('div', { style: 'flex:1;min-width:0;' },
      h('div', { style: 'display:flex;align-items:center;min-width:0;overflow:hidden;' },
        h('span', { class: 'item-name', title: it.name }, it.name),
        badge ? h('span', { class: 'date-badge ' + badge.cls }, badge.label) : null),
      h('div', { class: 'qty-row' },
        h('button', { class: 'qty-btn', 'aria-label': 'Kurangi', onclick: () => act('wUpdateItem', { id: it.id, delta: -1 }) }, '−'),
        h('span', {
          class: 'qty-disp',
          onclick: async () => {
            const v = await openCalc(it.name, it.unit, it.qty);
            if (v != null) act('wUpdateItem', { id: it.id, qty: v });
          },
        }, String(it.qty)),
        h('button', { class: 'qty-btn', 'aria-label': 'Tambah', onclick: () => act('wUpdateItem', { id: it.id, delta: 1 }) }, '+'),
        h('div', { class: 'unit-wrap' },
          h('button', {
            class: 'unit-btn',
            onclick: (e) => {
              e.stopPropagation();
              const open = e.currentTarget.parentElement.querySelector('.unit-pop');
              if (open) { open.remove(); return; }
              unitPopup(e.currentTarget, UNITS, it.unit, (u) => act('wUpdateItem', { id: it.id, unit: u }));
            },
          }, it.unit + ' ▾')))));
}

const STATUS = {
  pending: ['badge badge-timeout', '⏳ Menunggu Bos'],
  approved: ['badge badge-boss', '✓ Disetujui'],
  rejected: ['badge', '✗ Ditolak'],
};

function historyPanel(ctx) {
  const list = receiptsOf(ctx.state).slice(0, 15);
  return panel('Riwayat Setoran', h('div', { class: 'panel-body' },
    !list.length ? h('div', { class: 'hint', style: 'margin:0;' }, 'Belum ada setoran. Centang barang yang sudah diambil lalu tekan "Setor ke Bos".')
      : list.map((r) => {
        const [cls, label] = STATUS[r.status];
        const c = r.result;
        const sum = r.status === 'approved' && c
          ? `${c.effects.filter((e) => e.status === 'resolved').length} terpenuhi · ${c.effects.filter((e) => e.status === 'partial').length} kurang${c.unmatched.length ? ` · ${c.unmatched.length} tidak cocok` : ''}`
          : r.status === 'rejected' ? (r.note ? `Catatan Bos: ${r.note} — barang dikembalikan ke daftar` : 'Barang dikembalikan ke daftar') : '';
        return h('div', { class: 'hist-item' },
          h('div', { class: 'hist-info' },
            h('div', { class: 'hist-title' }, `${r.lines.length} barang`),
            h('div', { class: 'hist-sub' }, relTime(r.submittedAt) + (sum ? ' · ' + sum : ''))),
          h('span', { class: cls }, label));
      })), { chip: String(receiptsOf(ctx.state, 'pending').length) + ' menunggu' });
}

export function renderPenerimaan(ctx) {
  const { state, act } = ctx;
  const q = draft.search.trim().toLowerCase();
  const all = workerItemsOf(state);
  const list = q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all;
  const nChecked = all.filter((i) => i.checked).length;
  const text = replyText(all);

  const addInput = h('textarea', {
    class: 'inp', 'data-keep': 'add', rows: 1, style: 'flex:1;min-height:42px;',
    placeholder: 'qty satuan nama — atau paste pesanan dari Bos', value: draft.add,
    oninput: (e) => { draft.add = e.target.value; },
  });

  const grid = h('div', { class: 'sk-grid' });
  if (!list.length) {
    grid.append(h('div', { class: 'empty', style: 'grid-column:1/-1' },
      h('div', { class: 'empty-icon' }, '📥'),
      h('div', { class: 'empty-title' }, q ? 'Tidak ketemu' : 'Belum ada barang'),
      h('div', { class: 'empty-sub' }, q ? `"${draft.search}" tidak ada di daftar` : 'Tempel pesanan dari Bos lewat kotak Input Barang di atas')));
  } else list.forEach((i) => grid.append(itemCard(ctx, i)));

  return h('div', {},
    panel('Input Barang', h('div', { class: 'panel-body' },
      h('div', { style: 'display:flex;gap:8px;' }, addInput,
        h('button', {
          class: 'btn primary',
          onclick: async () => {
            const raw = draft.add;
            if (!raw.trim()) return;
            // id baru dibuat di sini supaya barang langsung tampil dan cocok dengan baris di server
            const names = new Set(all.map((i) => normName(i.name)));
            const ids = raw.split('\n').map(parseLine).filter(Boolean).filter((l) => !names.has(normName(l.name))).map(() => makeId());
            draft.add = '';
            const out = await act('wAddItems', { text: raw, ids });
            if (out) toast([out.added && `+${out.added} baru`, out.updated && `${out.updated} diperbarui`].filter(Boolean).join(' · '));
            else draft.add = raw;
            ctx.render();
          },
        }, '+ Tambah')),
      h('div', { class: 'hint' }, 'Format opsional: ', h('span', { class: 'hl' }, 'qty satuan nama'), '. Centang barang yang SUDAH DIAMBIL; atur qty sesuai yang benar-benar diambil.'))),
    searchBox({
      id: 'search', value: draft.search, placeholder: 'Cari barang…',
      oninput: (e) => { draft.search = e.target.value; ctx.render(); },
      onclear: () => { draft.search = ''; ctx.render(); },
    }),
    grid,
    all.length ? h('div', { class: 'counter-line' },
      h('span', {}, h('span', { class: 'hl' }, nChecked), ' dari ', h('span', { class: 'hl' }, all.length), ' sudah diambil')) : null,
    h('div', { class: 'panel', style: 'margin-top:16px;' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title', style: 'font-size:14px;' }, 'Balasan ke Bos')),
      h('div', { class: 'panel-body' },
        h('div', { class: 'out-wrap' },
          h('div', { class: 'out-actions' }, h('button', {
            class: 'mini-btn', disabled: !text,
            onclick: async () => toast((await copyText(text)) ? 'Teks balasan disalin' : 'Gagal menyalin'),
          }, 'Salin')),
          h('textarea', { class: 'inp', readonly: true, style: 'width:100%;min-height:110px;', placeholder: 'Barang yang sudah dicentang muncul di sini', value: text })),
        h('button', {
          class: 'btn primary', id: 'setor-btn', style: 'width:100%;margin-top:12px;', disabled: !nChecked,
          onclick: async () => {
            if (!(await confirmBox(`Setor ${nChecked} barang yang sudah diambil ke Bos?\nBarang yang disetor keluar dari daftar ini.`, 'Setor'))) return;
            const out = await act('receiptSubmit', {});
            if (out) toast(`✓ ${out.count} barang disetor — menunggu persetujuan Bos`);
            ctx.render();
          },
        }, '📤 Setor ke Bos'))),
    h('div', { style: 'display:flex;gap:8px;justify-content:center;margin:18px 0 4px;' },
      h('button', {
        class: 'btn',
        onclick: async () => {
          if (!all.length) { toast('Belum ada item'); return; }
          const out = await act('wSetChecked', { checked: true });
          if (out) toast(out.changed ? `☑ Semua ditandai sudah diambil (${out.changed} baru)` : 'Semua sudah tercentang');
        },
      }, '☑ Centang Semua')),
    historyPanel(ctx));
}

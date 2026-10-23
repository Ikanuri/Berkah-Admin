// Inbox Bos untuk setoran Karyawan: daftar menunggu, pratinjau barang yang diambil lawan daftar
// Bos, lalu Setujui (mengurangi daftar seperti "balasan" app lama) atau Tolak.
import { h, ask, openModal, toast } from '../dom.js';
import { planReceipt } from '../../tgcloud/lib/receipts.js';
import { normName } from '../../tgcloud/lib/rules.js';
import { fmtNum } from '../../tgcloud/lib/money.js';
import { allLiveItems, receiptsOf, relTime } from '../state.js';
import { panel } from './shared.js';

const STATUS = {
  approved: ['badge badge-boss', '✓ Disetujui'],
  rejected: ['badge', '✗ Ditolak'],
};

// Baris pratinjau: setiap barang setoran + dampaknya pada daftar Bos.
function previewRows(state, rc) {
  const plan = planReceipt(allLiveItems(state), rc.lines, Date.now());
  const byName = new Map();
  for (const e of plan.effects) {
    const k = normName(e.name);
    (byName.get(k) ?? byName.set(k, []).get(k)).push(e);
  }
  const rows = rc.lines.map((l) => {
    const effs = byName.get(normName(l.name));
    let outcome;
    if (!effs) outcome = h('span', { style: 'color:var(--ink4);' }, '— tidak ada di daftar Bos (diabaikan)');
    else outcome = effs.map((e) => e.status === 'resolved'
      ? h('div', { style: 'color:var(--green);' }, `✓ terpenuhi (dipesan ${fmtNum(e.ordered)} ${e.unit})`)
      : h('div', { style: 'color:var(--amber);' }, `kurang: sisa ${fmtNum(e.patch.qty)} ${e.unit} (dipesan ${fmtNum(e.ordered)})`));
    return h('tr', {},
      h('td', { style: 'font-weight:600;' }, l.name),
      h('td', { class: 'num', style: 'white-space:nowrap;' }, `${fmtNum(l.qty)} ${l.unit}`),
      h('td', { style: 'font-size:12px;' }, outcome));
  });
  return { rows, counts: plan.counts };
}

function openReview(ctx, rc) {
  const { rows, counts } = previewRows(ctx.state, rc);
  const m = openModal({
    title: `Setoran ${rc.workerName}`, maxWidth: 520,
    body: [
      h('div', { class: 'hint', style: 'margin:0 0 10px;' }, `${relTime(rc.submittedAt)} · ${rc.lines.length} barang diambil`),
      h('div', { class: 'tbl-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Barang'), h('th', { class: 'num' }, 'Diambil'), h('th', {}, 'Hasil bila disetujui'))),
        h('tbody', {}, rows))),
      h('div', { class: 'hint', style: 'margin-top:10px;' }, `${counts.resolved} terpenuhi · ${counts.partial} kurang · ${counts.unmatched} tidak cocok. `,
        'Barang terpenuhi dilepas centangnya; yang kurang tetap tercentang dengan qty sisa.'),
    ],
    foot: [
      h('button', {
        class: 'btn sm danger', style: 'margin-right:auto',
        onclick: async () => {
          const note = await ask({ title: 'Tolak setoran', label: 'Catatan untuk karyawan (opsional)', value: '', ok: 'Tolak' });
          if (note == null) return;
          m.close();
          const out = await ctx.act('receiptDecide', { id: rc.id, approve: false, note });
          if (out) toast('Setoran ditolak — barang kembali ke daftar karyawan');
        },
      }, 'Tolak'),
      h('button', { class: 'btn sm', onclick: () => m.close() }, 'Tutup'),
      h('button', {
        class: 'btn sm primary', id: 'approve-btn',
        onclick: async () => {
          m.close();
          const out = await ctx.act('receiptDecide', { id: rc.id, approve: true });
          if (out) toast(`Disetujui: ${out.counts.resolved} terpenuhi, ${out.counts.partial} kurang${out.counts.unmatched ? `, ${out.counts.unmatched} tidak cocok` : ''}`);
        },
      }, '✓ Setujui'),
    ],
  });
}

export function renderReceipts(ctx) {
  const pending = receiptsOf(ctx.state, 'pending');
  const done = receiptsOf(ctx.state).filter((r) => r.status !== 'pending').slice(0, 20);
  return h('div', {},
    panel('Setoran Menunggu', h('div', { class: 'panel-body' },
      !pending.length ? h('div', { class: 'empty', style: 'padding:24px;' }, h('div', { class: 'empty-icon' }, '📥'), h('div', { class: 'empty-title' }, 'Tidak ada setoran'), h('div', { class: 'empty-sub' }, 'Setoran dari karyawan muncul di sini dan lewat notifikasi'))
        : pending.map((r) => h('div', { class: 'hist-item' },
          h('div', { class: 'hist-info' },
            h('div', { class: 'hist-title' }, r.workerName),
            h('div', { class: 'hist-sub' }, `${r.lines.length} barang · ${relTime(r.submittedAt)}`)),
          h('button', { class: 'btn sm primary', 'data-rid': r.id, onclick: () => openReview(ctx, r) }, 'Tinjau')))),
    { chip: `${pending.length} menunggu` }),
    done.length ? panel('Riwayat', h('div', { class: 'panel-body' }, done.map((r) => {
      const [cls, label] = STATUS[r.status];
      const c = r.result;
      const sum = r.status === 'approved' && c
        ? `${c.effects.filter((e) => e.status === 'resolved').length} terpenuhi · ${c.effects.filter((e) => e.status === 'partial').length} kurang${c.unmatched.length ? ` · ${c.unmatched.length} tidak cocok` : ''}`
        : (r.note || '');
      return h('div', { class: 'hist-item' },
        h('div', { class: 'hist-info' },
          h('div', { class: 'hist-title' }, `${r.workerName} · ${r.lines.length} barang`),
          h('div', { class: 'hist-sub' }, relTime(r.decidedAt || r.submittedAt) + (sum ? ' · ' + sum : ''))),
        h('span', { class: cls }, label));
    })), { chip: String(done.length) }) : null);
}

// Dipakai spanduk global: buka tinjauan setoran paling lama yang menunggu.
export function firstPending(ctx) {
  return receiptsOf(ctx.state, 'pending').at(-1) || null;
}
export { openReview };

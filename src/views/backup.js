// Backup & restore di sisi klien. Parsing/merge dilakukan server (tidak
// mempercayai klien); klien hanya membaca file, menampilkan preview, dan
// meminta persetujuan sebelum menulis.
import { h, openModal, toast } from '../dom.js';
import { call, mode } from '../api.js';

const MAX_BYTES = 5 * 1024 * 1024; // batas wajar untuk satu permintaan

function download(filename, data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function exportBackup() {
  try {
    const out = await call('exportBackup', { send: mode().kind === 'telegram' });
    if (out.sent) { toast(`Backup dikirim ke chat bot (${out.counts.items} barang)`); return; }
    if (out.reason) toast('Tidak bisa kirim ke chat (mulai chat dengan bot dulu); mengunduh langsung…');
    download(out.filename, out.data);
    if (!out.reason) toast(`Backup diunduh (${out.counts.items} barang)`);
  } catch (e) { toast(e.message); }
}

const FORMAT_LABEL = { 'berkah-aio': 'Backup app lama (v1.x)', 'berkah-mini': 'Backup Mini App' };

function countsTable(c) {
  const row = (label, parts) => h('tr', {}, h('td', {}, label), h('td', { style: 'color:var(--ink2);' }, parts.filter(Boolean).join(' · ') || '—'));
  return h('table', { style: 'width:100%;font-size:12.5px;' }, h('tbody', {},
    row('Kategori', [c.categories.add && `+${c.categories.add} baru`, c.categories.revive && `${c.categories.revive} dihidupkan lagi`]),
    row('Supplier', [c.suppliers.add && `+${c.suppliers.add} baru`, c.suppliers.revive && `${c.suppliers.revive} dihidupkan lagi`]),
    row('Barang', [c.items.add && `+${c.items.add} baru`, c.items.overwrite && `${c.items.overwrite} ditimpa`, c.items.skip && `${c.items.skip} sudah ada`]),
    row('Pengingat', c.reminders ? [c.reminders.recurring && `${c.reminders.recurring} jadwal mingguan`, c.reminders.oneOff && `${c.reminders.oneOff} sekali-jadwal`, c.reminders.recSkip && `${c.reminders.recSkip} mingguan sudah ada`, c.reminders.oneExpired && `${c.reminders.oneExpired} kedaluwarsa dilewati`] : []),
    c.nota ? row('Nota', [c.nota.hist && `+${c.nota.hist} nota riwayat`, c.nota.learn && `${c.nota.learn} kamus`, c.nota.products && `${c.nota.products} produk`, c.nota.productsSkip && `${c.nota.productsSkip} produk dilewati (DB sudah ada)`, c.nota.histDup && `${c.nota.histDup} nota sudah ada`]) : null,
    c.pnl ? row('PNL', [c.pnl.days && `+${c.pnl.days} hari`, c.pnl.arsip && `${c.pnl.arsip} tanggal arsip`, c.pnl.daySkip && `${c.pnl.daySkip} hari sudah ada`, c.pnl.arsipSkip && `${c.pnl.arsipSkip} arsip sudah ada`]) : null,
    row('Riwayat harga', [c.priceLog.add && `+${c.priceLog.add} baru`, c.priceLog.dup && `${c.priceLog.dup} sudah ada`, c.priceLog.orphan && `${c.priceLog.orphan} dilewati (barang tidak ada)`])));
}

async function previewAndConfirm(ctx, data, filename) {
  let onConflict = 'keep';
  const box = h('div', {});
  const status = h('div', { class: 'hint', style: 'margin-top:10px;' });
  const okBtn = h('button', { class: 'btn sm primary', disabled: true }, 'Restore');
  const m = openModal({
    title: 'Restore Backup', maxWidth: 440, body: [h('div', { class: 'hint', style: 'margin:0 0 8px;' }, filename), box, status],
    foot: [h('button', { class: 'btn sm', onclick: () => m.close() }, 'Batal'), okBtn],
  });

  const preview = async () => {
    okBtn.disabled = true;
    box.replaceChildren(h('div', { class: 'hint' }, 'Menghitung…'));
    let out;
    try { out = await call('restorePreview', { data, onConflict }); } catch (e) { box.replaceChildren(h('div', { class: 'alert alert-err' }, e.message)); return; }
    const total = out.counts.categories.add + out.counts.suppliers.add + out.counts.items.add + out.counts.items.overwrite + out.counts.priceLog.add
      + out.counts.categories.revive + out.counts.suppliers.revive + (out.counts.reminders ? out.counts.reminders.recurring + out.counts.reminders.oneOff : 0)
      + (out.counts.nota ? out.counts.nota.hist + out.counts.nota.learn + out.counts.nota.products : 0) + (out.counts.pnl ? out.counts.pnl.days + out.counts.pnl.arsip : 0);
    box.replaceChildren(
      h('div', { style: 'margin-bottom:8px;' }, h('span', { class: 'badge badge-timeout' }, FORMAT_LABEL[out.format] || out.format)),
      countsTable(out.counts),
      out.warnings.length ? h('div', { class: 'alert alert-warn', style: 'margin-top:10px;font-size:11.5px;' }, out.warnings.map((w) => h('div', {}, '• ' + w))) : null,
      h('div', { class: 'field-label', style: 'margin:14px 0 6px;' }, 'Jika barang sudah ada'),
      h('div', { class: 'seg' }, [['keep', 'Pertahankan data sekarang'], ['overwrite', 'Timpa dengan backup']].map(([k, label]) =>
        h('button', { class: 'seg-opt' + (onConflict === k ? ' active' : ''), onclick: () => { onConflict = k; preview(); } }, label))),
      h('div', { class: 'hint', style: 'margin-top:8px;' }, onConflict === 'keep'
        ? 'Hanya menambah yang belum ada. Barang yang sudah ada dan yang pernah Anda hapus tidak disentuh.'
        : 'Barang yang sama (id atau nama di kategori yang sama) diisi ulang dari backup, termasuk yang pernah dihapus. Riwayat harga tidak pernah dihapus.'));
    okBtn.disabled = total === 0;
    status.textContent = total === 0 ? 'Tidak ada yang perlu ditambahkan.' : '';
  };
  okBtn.onclick = async () => {
    okBtn.disabled = true;
    status.textContent = 'Menulis…';
    const out = await ctx.act('restoreApply', { data, onConflict });
    if (!out) { status.textContent = 'Gagal.'; okBtn.disabled = false; return; }
    m.close();
    const c = out.counts;
    toast(`Restore selesai: +${c.items.add} barang, ${c.items.overwrite} ditimpa, +${c.priceLog.add} riwayat harga${c.pnl?.days ? `, +${c.pnl.days} hari PNL` : ''}${c.nota?.hist ? `, +${c.nota.hist} nota` : ''}`);
  };
  preview();
}

export function pickRestoreFile(ctx) {
  const input = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    if (file.size > MAX_BYTES) { toast('File terlalu besar (maks 5 MB)'); return; }
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('File bukan JSON yang valid'); return; }
    previewAndConfirm(ctx, data, file.name);
  });
  document.body.append(input);
  input.click();
}

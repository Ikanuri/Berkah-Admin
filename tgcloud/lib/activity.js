// Deskripsi aktivitas untuk baris "Diubah ... — ..." (skTrackAct di app lama).
// Murni: dibuat dari baris activity_log, bukan disimpan, supaya format bisa
// diubah tanpa migrasi. Mengembalikan null untuk aksi yang tidak ditampilkan.
export function describeActivity(action, d = {}) {
  switch (action) {
    case 'check': return `dicentang: ${d.name}`;
    case 'uncheck': return `dibatalkan: ${d.name}`;
    case 'updateItem': {
      const p = d.patch || {};
      if (p.name != null) return `diganti nama: ${d.name} → ${p.name}`;
      if (p.qty != null) return `qty diubah: ${d.name} → ${p.qty}${d.unit ? ' ' + d.unit : ''}`;
      if (p.unit != null) return `satuan diubah: ${d.name} → ${p.unit}`;
      return null;
    }
    case 'addItems': {
      const parts = [];
      if (d.added) parts.push(`+${d.added} baru`);
      if (d.updated) parts.push(`${d.updated} diperbarui`);
      return parts.length ? `${parts.join(', ')} (${d.category})` : null;
    }
    case 'deleteItem': return `dihapus: ${d.name}`;
    case 'fulfill': return `diterima: ${d.name} (${d.received}${d.status === 'partial' ? ', kurang' : ''})`;
    case 'receiptSubmit': return `setoran dari ${d.worker}: ${d.n} barang`;
    case 'receiptApprove': return `setoran ${d.worker} disetujui: ${d.resolved} terpenuhi, ${d.partial} kurang${d.unmatched ? `, ${d.unmatched} tidak cocok` : ''}`;
    case 'receiptReject': return `setoran ${d.worker} ditolak (${d.n} barang)`;
    case 'addCategory': return `kategori dibuat: ${d.name}`;
    case 'deleteCategory': return `kategori dihapus: ${d.name}`;
    case 'checkAll': return `centang semua${d.category ? ` di kategori "${d.category}"` : ''} (${d.n} item)`;
    case 'uncheckAll': return `${d.category ? `batalkan semua centang di kategori "${d.category}"` : 'reset semua centang'} (${d.n} item)`;
    case 'clearItems': return d.category ? `semua item dihapus di kategori "${d.category}"` : 'semua item dihapus';
    case 'savePrices': return `${d.n} harga disimpan dari supplier "${d.supplier}" (${d.tanggal})`;
    case 'restore': {
      const c = d.counts || {};
      const it = c.items || {};
      return `restore backup (${d.onConflict === 'overwrite' ? 'timpa' : 'pertahankan'}): +${it.add || 0} barang, ${it.overwrite || 0} ditimpa, +${(c.priceLog || {}).add || 0} riwayat harga`;
    }
    case 'applyMargin': return `margin massal ${d.mode === 'pct' ? d.value + '%' : 'Rp' + d.value} → ${d.updated} barang`;
    default: return null;
  }
}

// Ambil deskripsi terbaru dari daftar baris (terbaru dulu).
export function latestActivity(rows) {
  for (const r of rows) {
    const desc = describeActivity(r.action, r.detail || {});
    if (desc) return { ts: r.ts, tgId: r.tgId, desc };
  }
  return null;
}

// Aksi yang menyentuh harga modal / supplier / pengguna: tidak boleh terlihat Karyawan.
export const BOSS_ONLY_ACTIONS = new Set([
  'savePrices', 'applyMargin', 'setHpp', 'deletePriceEntry',
  'addSupplier', 'renameSupplier', 'deleteSupplier', 'setUserRole', 'restore', 'exportBackup', 'saveRecurring', 'saveOneOff', 'notaImportCsv', 'notaSave', 'receiptSubmit', 'receiptApprove', 'receiptReject',
]);

export function visibleActivity(role, rows) {
  return role === 'boss' ? rows : rows.filter((r) => !BOSS_ONLY_ACTIONS.has(r.action));
}

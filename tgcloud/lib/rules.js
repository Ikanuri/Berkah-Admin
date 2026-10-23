// Aturan bisnis Stok yang murni (tanpa DB). Sumber: legacy v1.5.0.
import { roundQty } from './money.js';

import { UNITS } from './config.js';
const UNITS_SET = new Set(UNITS);

// skNorm (3886): trim + huruf kecil, TANPA merapatkan spasi di tengah.
export function normName(s) {
  return String(s).trim().toLowerCase();
}

// skParseLine (3912): "qty satuan nama"; selain itu seluruh baris = nama, 1 dus.
// Baris header tanggal ("── ..." / "--") diabaikan.
export function parseLine(line) {
  line = String(line).trim();
  if (!line) return null;
  if (line.startsWith('──') || line.startsWith('--')) return null;
  const parts = line.split(/\s+/);
  if (parts.length >= 3) {
    const q = parseFloat(String(parts[0]).replace(',', '.'));
    const u = parts[1].toLowerCase();
    if (!isNaN(q) && q > 0 && UNITS_SET.has(u)) {
      return { qty: q, unit: u, name: parts.slice(2).join(' ') };
    }
  }
  return { qty: 1, unit: 'dus', name: line };
}

// Satu baris teks order untuk disalin ke WhatsApp ("5 dus Aqua").
export function orderLine(item) {
  return item.qty + ' ' + item.unit + ' ' + item.name;
}

// skToggle (baris 4394). Mengembalikan patch item + apakah perlu masuk log.
export function toggle(item, now) {
  const checked = !item.checked;
  return { patch: { checked, checkedAt: checked ? now : null }, logged: !checked };
}

// skAdjustQty (4436): minus pada qty <= 1 = beku, tidak turun ke desimal.
export function adjustQty(qty, delta) {
  if (delta < 0 && qty <= 1) return qty;
  let v = qty + delta;
  if (delta < 0 && v < 1) v = 1;
  return roundQty(v);
}

// skSetQty (4451): harus > 0.
export function setQty(val) {
  const n = Number(val);
  return n > 0 ? roundQty(n) : null;
}

// skProcessReply (4567), kini per item: pemenuhan sebagian.
// received >= qty -> terpenuhi (centang dilepas); received < qty -> tetap
// tercentang dengan qty sisa.
export function fulfill(item, received, now) {
  const r = Number(received);
  if (!(r > 0)) return null;
  if (r >= item.qty) return { status: 'resolved', patch: { checked: false, checkedAt: null } };
  return {
    status: 'partial',
    patch: { checked: true, checkedAt: now, qty: roundQty(item.qty - r) },
  };
}

// skAddItems (4527): baris dengan nama sama (normal) di kategori itu DIPERBARUI,
// bukan dobel. Centang dipertahankan hanya jika pelaku Bos; selain itu direset.
export function mergeAddLine(existing, line, isBoss, now) {
  if (!existing) return { kind: 'new' };
  const keep = isBoss ? existing.checked : false;
  return {
    kind: 'update',
    patch: {
      qty: line.qty,
      unit: line.unit,
      checked: keep,
      checkedAt: keep ? existing.checkedAt || now : null,
    },
  };
}

// Harga supplier: HANYA nilai > 0 yang dicatat (baris 4986). Mengembalikan
// entri log dan patch item (Harga Beli = harga terakhir diinput, menimpa
// tanpa syarat).
export function applySupplierPrice(item, hargaBeli) {
  const v = Number(hargaBeli);
  if (!(v > 0)) return null;
  return { patch: { hargaBeli: v }, unit: item.satuanHpp || item.unit };
}

// Penutup kategori: minimal 1 kategori aktif (skDeleteCat, 4782).
export function canDeleteCategory(activeCount) {
  return activeCount > 1;
}

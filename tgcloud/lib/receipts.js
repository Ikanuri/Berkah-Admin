// Penerimaan: aturan murni (dipakai server, LocalStore, dan pratinjau Bos di klien).
//
// planReceipt = skProcessReply app lama (legacy/berkah-admin-1.5.0.html baris 4567), per
// setoran: baris "qty satuan nama" yang dicocokkan ke daftar Bos lewat nama (skNorm).
//   - diambil >= qty dipesan  -> terpenuhi: centang dilepas
//   - diambil <  qty dipesan  -> kurang: tetap tercentang, qty = sisa
// Satuan pada baris diabaikan (seperti app lama); nama kembar di setoran: yang terakhir menang;
// nama kembar di daftar Bos (beda kategori): semuanya diproses.
import { normName, fulfill } from './rules.js';

export const MAX_LINES = 300;

// Bersihkan baris setoran dari klien: tanpa kepercayaan pada bentuknya.
export function cleanReceiptLines(lines) {
  if (!Array.isArray(lines) || !lines.length) throw new Error('Tidak ada barang yang dicentang');
  if (lines.length > MAX_LINES) throw new Error(`Maksimal ${MAX_LINES} barang per setoran`);
  return lines.map((l, i) => {
    const name = String(l?.name ?? '').trim().slice(0, 200);
    const qty = Number(l?.qty);
    if (!name) throw new Error(`Baris ${i + 1}: nama kosong`);
    if (!(qty > 0) || !Number.isFinite(qty)) throw new Error(`Baris ${i + 1}: qty harus lebih dari 0`);
    return { name, qty, unit: String(l?.unit ?? '').trim().slice(0, 20) };
  });
}

// items: baris daftar Bos yang hidup ({id,name,qty,unit,checked,...}).
export function planReceipt(items, lines, now = Date.now()) {
  const taken = new Map();
  for (const l of lines) {
    taken.set(normName(l.name), { qty: Number(l.qty), unit: l.unit, name: l.name });
  }
  const matched = new Set();
  const effects = [];
  for (const it of items) {
    const key = normName(it.name);
    const m = taken.get(key);
    if (!m) continue;
    const r = fulfill(it, m.qty, now);
    if (!r) continue;
    matched.add(key);
    effects.push({ id: it.id, name: it.name, unit: it.unit, ordered: it.qty, taken: m.qty, status: r.status, patch: r.patch });
  }
  const unmatched = [...taken].filter(([k]) => !matched.has(k)).map(([, v]) => ({ name: v.name, qty: v.qty, unit: v.unit }));
  const resolved = effects.filter((e) => e.status === 'resolved').length;
  const partial = effects.length - resolved;
  return { effects, unmatched, counts: { resolved, partial, unmatched: unmatched.length } };
}

// Teks "Balasan ke Bos" (skBuildOutput mode karyawan): barang yang dicentang, satu baris tiap barang.
export function replyText(items) {
  return items.filter((i) => i.checked).map((i) => `${i.qty} ${i.unit} ${i.name}`).join('\n');
}

// Daftar karyawan: tempel baris "qty satuan nama"; nama sama = perbarui (centang direset
// untuk Karyawan, seperti app lama), selain itu baris baru.
export function mergeWorkerLine(existing, line, now) {
  if (!existing) return { kind: 'new' };
  void now;
  return { kind: 'update', patch: { qty: line.qty, unit: line.unit, checked: false, checkedAt: null } };
}

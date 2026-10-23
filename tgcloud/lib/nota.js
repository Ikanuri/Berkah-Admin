// Aturan Nota Kulakan yang murni (tanpa DB): validasi baris, nomor, kunci kamus.
import { tokenizeName, satClassOf } from './match.js';

export const HIST_MAX = 100;
const MAX_LINES = 500;

export function notaNumber(seq) {
  return 'KLK-' + String(seq).padStart(3, '0');
}

// Kunci kamus belajar (nkLearnKey app lama): token nama ternormalisasi | kelas satuan.
export function learnKey(nama, satuan) {
  return tokenizeName(nama).join(' ') + '|' + satClassOf(satuan);
}

const s = (v, max) => String(v ?? '').trim().slice(0, max);

// Bersihkan & hitung ulang baris nota di server (total tidak dipercaya dari klien).
export function cleanLines(lines) {
  if (!Array.isArray(lines) || !lines.length) throw new Error('Nota kosong');
  if (lines.length > MAX_LINES) throw new Error(`Maksimal ${MAX_LINES} baris per nota`);
  let total = 0;
  const out = lines.map((l, i) => {
    const nama = s(l?.nama, 200);
    const qty = Number(l?.qty);
    const harga = Number(l?.harga);
    if (!nama) throw new Error(`Baris ${i + 1}: nama kosong`);
    if (!(qty > 0) || !Number.isFinite(qty)) throw new Error(`Baris ${i + 1}: qty harus lebih dari 0`);
    if (!(harga >= 0) || !Number.isFinite(harga)) throw new Error(`Baris ${i + 1}: harga tidak valid`);
    const sub = qty * harga;
    total += sub;
    return { nama, qty, satuan: s(l?.satuan, 20), harga, sub, flag: !!l?.flag };
  });
  return { lines: out, total };
}

// Baris DB produk -> array ringkas untuk dikirim ke klien (hemat ukuran).
export function packProducts(rows, { withCost }) {
  return rows.map((r) => [r.nama, r.satuan, r.satClass, r.hargaJual, withCost ? r.hargaPokok : 0, r.kode || '', r.barcode || '']);
}

export function unpackProducts(arr) {
  return arr.map(([nama, satuan, satClass, hargaJual, hargaPokok, kode, barcode]) => ({ nama, satuan, satClass, hargaJual, hargaPokok, kode, barcode }));
}

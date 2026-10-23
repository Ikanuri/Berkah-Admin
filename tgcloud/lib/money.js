// Aritmatika uang. Port dari hpp* di legacy/berkah-admin-1.5.0.html (baris
// 4833-4887). Murni: tanpa DOM, tanpa localStorage, tanpa Intl.

// Parser context-aware: "1.500,75" -> 1500.75, "2.500" -> 2500 (ribuan), "0.5" -> 0.5
export function parseAngka(str) {
  if (str == null) return 0;
  let s = String(str).trim();
  if (!s) return 0;
  const neg = /^\s*-/.test(s);
  s = s.replace(/[^0-9.,]/g, '');
  if (!s) return 0;
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const v = parseFloat(s);
  if (!isFinite(v)) return 0;
  return neg ? -v : v;
}

// Pembulatan eksplisit; nudge 1e-9 menutup galat biner (1.005 -> 1.01).
export function round(n, dec) {
  const d = dec == null ? 2 : dec;
  const v = Number(n);
  if (!isFinite(v)) return 0;
  const p = Math.pow(10, d);
  return Math.round(v * p + (v >= 0 ? 1e-9 : -1e-9)) / p;
}

// Tampilan "4.062,5" (pemisah ribuan titik, desimal koma, maks 2 digit).
// Ditulis manual supaya tidak bergantung ICU runtime.
export function fmtNum(n) {
  const v = round(n, 2);
  const neg = v < 0;
  const [ip, fp] = Math.abs(v).toFixed(2).split('.');
  const int = ip.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = fp.replace(/0+$/, '');
  const out = int + (frac ? ',' + frac : '');
  return neg && out !== '0' ? '-' + out : out;
}

// Nilai di DALAM input: tanpa pemisah ribuan, koma desimal. parseAngka(inpVal(x)) === x.
export function inpVal(n) {
  if (n == null || n === '') return '';
  const v = Number(n);
  if (!isFinite(v) || v === 0) return '';
  return String(round(v, 2)).replace('.', ',');
}

// Harga pokok per satuan eceran.
export function cost(item) {
  return item.isi > 0 && item.hargaBeli > 0 ? item.hargaBeli / item.isi : 0;
}

export function pctOf(margin, pokok) {
  return pokok > 0 ? (margin / pokok) * 100 : 0;
}

// Qty disimpan maksimal 3 desimal (skAdjustQty/skSetQty di app lama).
export function roundQty(n) {
  return parseFloat(Number(n).toFixed(3));
}

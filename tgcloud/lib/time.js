// Waktu zona toko. WIB = UTC+7 tanpa DST, jadi offset tetap cukup dan tidak
// bergantung Intl/zona waktu runtime server (aturan #3: jangan pakai UTC server).
export const SHOP_OFFSET_MIN = 420;

const p2 = (n) => String(n).padStart(2, '0');

export function shopParts(ts) {
  const d = new Date(ts + SHOP_OFFSET_MIN * 60000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), dow: d.getUTCDay() };
}

export const shopDateStr = (ts) => {
  const { y, m, d } = shopParts(ts);
  return `${y}-${p2(m)}-${p2(d)}`;
};

// 'YYYY-MM-DD' + 'HH:MM' (jam toko) -> epoch ms
export function shopMs(dateStr, time) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm, 0, 0) - SHOP_OFFSET_MIN * 60000;
}

// 'DD/MM HH:MM' (supFmtDT di app lama)
export function fmtShopDT(ts) {
  const { m, d, hh, mm } = shopParts(ts);
  return `${p2(d)}/${p2(m)} ${p2(hh)}:${p2(mm)}`;
}

// nilai <input type="datetime-local"> ("YYYY-MM-DDTHH:MM") -> epoch ms jam toko
export function shopMsFromLocalInput(v) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(String(v));
  return m ? shopMs(m[1], m[2]) : NaN;
}

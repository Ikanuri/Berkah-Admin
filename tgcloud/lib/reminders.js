// Pengingat kedatangan supplier (legacy v1.5.0: supReminderTick & kawan-kawan).
// Murni: server dan LocalStore memakai planTick() yang sama; penulisan/klaim
// dilakukan pemanggil.
import { shopParts, shopDateStr, shopMs, fmtShopDT } from './time.js';

export const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']; // indeks = hari (0 = Minggu)
export const PRE_ALERT_OPTIONS = [15, 30, 60];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── validasi ────────────────────────────────────────────────────────────────
function cleanPre(v) {
  if (v == null || v === '' || v === 0) return null;
  const n = Number(v);
  if (!PRE_ALERT_OPTIONS.includes(n)) throw new Error('Pra-alert harus 15, 30, atau 60 menit');
  return n;
}

export function validateRecurring({ days, time, preAlertMin }) {
  const d = [...new Set((Array.isArray(days) ? days : []).map(Number))].filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
  if (!d.length) throw new Error('Pilih minimal satu hari');
  if (!TIME_RE.test(String(time))) throw new Error('Jam tidak valid (HH:MM)');
  return { days: d.sort((a, b) => a - b), time: String(time), preAlertMin: cleanPre(preAlertMin) };
}

export function validateOneOff({ ts, preAlertMin }, now = Date.now()) {
  const t = Number(ts);
  if (!Number.isFinite(t) || t <= 0) throw new Error('Tanggal & jam tidak valid');
  if (t < now - 60000) throw new Error('Waktu sudah lewat — pilih waktu di masa depan');
  return { ts: t, preAlertMin: cleanPre(preAlertMin) };
}

// ── status awal saat jadwal mingguan disimpan ──────────────────────────────
// App lama akan langsung membunyikan alarm bila jam hari ini sudah lewat saat
// jadwal disimpan. Di sini yang sudah lewat hari ini dianggap "sudah", supaya
// alarm pertama jatuh pada hari berikutnya yang cocok. (Penyimpangan sengaja.)
export function initialFired({ days, time, preAlertMin }, now = Date.now()) {
  const today = shopDateStr(now);
  const { dow } = shopParts(now);
  if (!days.includes(dow)) return { lastFiredDate: null, lastPreFiredDate: null };
  const onMs = shopMs(today, time);
  return {
    lastFiredDate: now >= onMs ? today : null,
    lastPreFiredDate: preAlertMin && now >= onMs - preAlertMin * 60000 ? today : null,
  };
}

// ── jendela alarm ───────────────────────────────────────────────────────────
// Pra-alert hanya di [on - menit, on). Alarm utama: kapan pun sesudah jam-nya
// pada hari yang cocok, sekali per hari (telat tetap berbunyi).
export function dueRecurring(rec, now = Date.now()) {
  const today = shopDateStr(now);
  const { dow } = shopParts(now);
  if (!rec.days.includes(dow)) return { pre: false, on: false };
  const onMs = shopMs(today, rec.time);
  const pre = !!rec.preAlertMin && rec.lastPreFiredDate !== today
    && now >= onMs - rec.preAlertMin * 60000 && now < onMs;
  const on = rec.lastFiredDate !== today && now >= onMs;
  return { pre, on };
}

export function dueOneOff(o, now = Date.now()) {
  const pre = !!o.preAlertMin && !o.preFiredAt && now >= o.ts - o.preAlertMin * 60000 && now < o.ts;
  const on = !o.firedAt && now >= o.ts;
  return { pre, on };
}

export function reminderMessage(kind, supplier, whenLabel) {
  return kind === 'pre'
    ? `⏰ Supplier "${supplier}" dijadwalkan datang sebentar lagi (${whenLabel})`
    : `🚚 Supplier "${supplier}" dijadwalkan datang SEKARANG (${whenLabel})`;
}

// Rencana satu tick: daftar klaim yang harus dicoba pemanggil, masing-masing
// beserta pesannya. Pemanggil hanya mengirim pesan bila klaimnya BERHASIL
// (UPDATE bersyarat, rowsAffected = 1), sehingga dua tick bersamaan tidak
// mengirim ganda.
export function planTick({ recurring, oneOff, supplierName }, now = Date.now()) {
  const claims = [];
  const today = shopDateStr(now);
  for (const rec of recurring) {
    const name = supplierName(rec.supplierId);
    if (name == null) continue; // supplier tidak ada lagi
    const { pre, on } = dueRecurring(rec, now);
    if (pre) claims.push({ type: 'rec-pre', supplierId: rec.supplierId, date: today, message: reminderMessage('pre', name, rec.time) });
    if (on) claims.push({ type: 'rec-on', supplierId: rec.supplierId, date: today, message: reminderMessage('on', name, rec.time) });
  }
  for (const o of oneOff) {
    const name = supplierName(o.supplierId);
    if (name == null) continue;
    const { pre, on } = dueOneOff(o, now);
    if (pre) claims.push({ type: 'once-pre', id: o.id, message: reminderMessage('pre', name, fmtShopDT(o.ts)) });
    if (on) claims.push({ type: 'once-on', id: o.id, message: reminderMessage('on', name, fmtShopDT(o.ts)) });
  }
  return claims;
}

export function recSummary(rec) {
  const days = [...rec.days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(',');
  return `${days} • ${rec.time}${rec.preAlertMin ? ` (pra-alert ${rec.preAlertMin} mnt)` : ''}`;
}

// Uji jadwal pengingat (murni). Jalankan: node tests/reminders-test.js
import assert from 'node:assert/strict';
import { shopParts, shopDateStr, shopMs, fmtShopDT, shopMsFromLocalInput } from '../tgcloud/lib/time.js';
import {
  validateRecurring, validateOneOff, initialFired, dueRecurring, dueOneOff, planTick, recSummary, reminderMessage,
} from '../tgcloud/lib/reminders.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

// Kamis 22 Okt 2026 (WIB). 08:00 WIB = 01:00 UTC
const at = (day, hh, mm = 0) => shopMs(`2026-10-${String(day).padStart(2, '0')}`, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
const THU = 4;

t('waktu zona toko: tanggal & hari mengikuti WIB, bukan UTC server', () => {
  const ts = Date.UTC(2026, 9, 22, 20, 30); // 22 Okt 20:30 UTC = 23 Okt 03:30 WIB (Jumat)
  assert.equal(shopDateStr(ts), '2026-10-23');
  assert.equal(shopParts(ts).dow, 5);
  assert.equal(shopMs('2026-10-22', '08:00'), Date.UTC(2026, 9, 22, 1, 0));
  assert.equal(fmtShopDT(shopMs('2026-10-22', '08:05')), '22/10 08:05');
  assert.equal(shopMsFromLocalInput('2026-10-22T08:05'), shopMs('2026-10-22', '08:05'));
  assert.ok(Number.isNaN(shopMsFromLocalInput('besok')));
  assert.equal(shopParts(at(22, 8)).dow, THU);
});

t('validateRecurring: normalisasi dan penolakan', () => {
  assert.deepEqual(validateRecurring({ days: [4, 1, 4], time: '08:00', preAlertMin: '30' }), { days: [1, 4], time: '08:00', preAlertMin: 30 });
  assert.equal(validateRecurring({ days: [0], time: '23:59', preAlertMin: '' }).preAlertMin, null);
  assert.throws(() => validateRecurring({ days: [], time: '08:00' }), /minimal satu hari/);
  assert.throws(() => validateRecurring({ days: [9, -1], time: '08:00' }), /minimal satu hari/);
  assert.throws(() => validateRecurring({ days: [1], time: '24:00' }), /Jam tidak valid/);
  assert.throws(() => validateRecurring({ days: [1], time: '8:00' }), /Jam tidak valid/);
  assert.throws(() => validateRecurring({ days: [1], time: '08:00', preAlertMin: 20 }), /15, 30, atau 60/);
});

t('validateOneOff: tidak boleh di masa lalu', () => {
  const now = at(22, 9);
  assert.deepEqual(validateOneOff({ ts: at(23, 8), preAlertMin: 15 }, now), { ts: at(23, 8), preAlertMin: 15 });
  assert.throws(() => validateOneOff({ ts: at(22, 8) }, now), /sudah lewat/);
  assert.doesNotThrow(() => validateOneOff({ ts: now - 30000 }, now), 'toleransi 1 menit');
  assert.throws(() => validateOneOff({ ts: 'x' }, now), /tidak valid/);
});

t('mingguan: jendela pra-alert dan alarm utama, sekali per hari', () => {
  const rec = { days: [THU], time: '08:00', preAlertMin: 30, lastFiredDate: null, lastPreFiredDate: null };
  assert.deepEqual(dueRecurring(rec, at(22, 7, 20)), { pre: false, on: false });
  assert.deepEqual(dueRecurring(rec, at(22, 7, 30)), { pre: true, on: false });
  assert.deepEqual(dueRecurring(rec, at(22, 7, 59)), { pre: true, on: false });
  assert.deepEqual(dueRecurring(rec, at(22, 8, 0)), { pre: false, on: true }, 'pra-alert tidak bunyi setelah jam-nya');
  assert.deepEqual(dueRecurring(rec, at(22, 15, 0)), { pre: false, on: true }, 'telat tetap berbunyi');
  assert.deepEqual(dueRecurring({ ...rec, lastFiredDate: '2026-10-22' }, at(22, 9)), { pre: false, on: false }, 'sudah bunyi hari ini');
  assert.deepEqual(dueRecurring({ ...rec, lastPreFiredDate: '2026-10-22' }, at(22, 7, 40)), { pre: false, on: false });
  assert.deepEqual(dueRecurring(rec, at(23, 8, 30)), { pre: false, on: false }, 'bukan hari yang dipilih');
  assert.deepEqual(dueRecurring({ ...rec, lastFiredDate: '2026-10-15' }, at(22, 8, 1)), { pre: false, on: true }, 'minggu lalu tidak menghalangi');
});

t('mingguan: hari dihitung dengan jam toko di sekitar tengah malam', () => {
  const rec = { days: [5], time: '00:30', preAlertMin: null, lastFiredDate: null, lastPreFiredDate: null }; // Jumat 00:30 WIB
  const thuLate = Date.UTC(2026, 9, 22, 17, 40); // 23 Okt 00:40 WIB = Jumat
  assert.equal(dueRecurring(rec, thuLate).on, true);
  const before = Date.UTC(2026, 9, 22, 16, 50); // 22 Okt 23:50 WIB = Kamis
  assert.equal(dueRecurring(rec, before).on, false);
});

t('sekali-jadwal: pra-alert, alarm, dan sudah dibunyikan', () => {
  const o = { id: 'o1', supplierId: 1, ts: at(22, 10), preAlertMin: 15, firedAt: null, preFiredAt: null };
  assert.deepEqual(dueOneOff(o, at(22, 9, 40)), { pre: false, on: false });
  assert.deepEqual(dueOneOff(o, at(22, 9, 50)), { pre: true, on: false });
  assert.deepEqual(dueOneOff({ ...o, preFiredAt: 1 }, at(22, 9, 50)), { pre: false, on: false });
  assert.deepEqual(dueOneOff(o, at(22, 10, 0)), { pre: false, on: true });
  assert.deepEqual(dueOneOff({ ...o, firedAt: 1 }, at(23, 10)), { pre: false, on: false });
});

t('initialFired: jadwal yang jamnya sudah lewat hari ini tidak langsung bunyi', () => {
  const spec = { days: [THU], time: '08:00', preAlertMin: 30 };
  assert.deepEqual(initialFired(spec, at(22, 9)), { lastFiredDate: '2026-10-22', lastPreFiredDate: '2026-10-22' });
  assert.deepEqual(initialFired(spec, at(22, 7, 45)), { lastFiredDate: null, lastPreFiredDate: '2026-10-22' }, 'sudah di jendela pra-alert');
  assert.deepEqual(initialFired(spec, at(22, 6)), { lastFiredDate: null, lastPreFiredDate: null });
  assert.deepEqual(initialFired(spec, at(23, 9)), { lastFiredDate: null, lastPreFiredDate: null }, 'bukan hari jadwal');
});

t('planTick: klaim + pesan; supplier terhapus dilewati', () => {
  const names = { 1: 'Agen A', 2: 'Agen B' };
  const supplierName = (id) => names[id] ?? null;
  const recurring = [
    { supplierId: 1, days: [THU], time: '08:00', preAlertMin: 30, lastFiredDate: null, lastPreFiredDate: null },
    { supplierId: 3, days: [THU], time: '08:00', preAlertMin: null, lastFiredDate: null, lastPreFiredDate: null }, // supplier tidak ada
  ];
  const oneOff = [{ id: 'o1', supplierId: 2, ts: at(22, 10), preAlertMin: null, firedAt: null, preFiredAt: null }];
  let claims = planTick({ recurring, oneOff, supplierName }, at(22, 7, 40));
  assert.deepEqual(claims.map((c) => c.type), ['rec-pre']);
  assert.equal(claims[0].message, '⏰ Supplier "Agen A" dijadwalkan datang sebentar lagi (08:00)');
  claims = planTick({ recurring, oneOff, supplierName }, at(22, 10, 5));
  assert.deepEqual(claims.map((c) => c.type), ['rec-on', 'once-on']);
  assert.equal(claims[1].message, '🚚 Supplier "Agen B" dijadwalkan datang SEKARANG (22/10 10:00)');
  assert.equal(claims[0].date, '2026-10-22');
});

t('recSummary & pesan', () => {
  assert.equal(recSummary({ days: [4, 1, 0], time: '08:00', preAlertMin: 30 }), 'Min,Sen,Kam • 08:00 (pra-alert 30 mnt)');
  assert.equal(recSummary({ days: [2], time: '13:30', preAlertMin: null }), 'Sel • 13:30');
  assert.match(reminderMessage('on', 'X', '08:00'), /SEKARANG/);
});

console.log(`\nHASIL: ${n} uji pengingat lulus`);

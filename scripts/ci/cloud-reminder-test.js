// Dijalankan SAAT DEPLOY lewat `tgcloud run` (disalin sementara ke tgcloud/endpoints/).
// Menguji klaim atomik pengingat di database tgcloud SUNGGUHAN. Hanya menyentuh
// baris sementaranya sendiri (supplierIds), tanpa mengirim pesan, lalu dibersihkan.
import { db } from 'sdk';
import { eq, like } from 'sdk/db';
import { suppliers, remRecurring, remOneoff } from '../schema.js';
import { runTick } from '../lib/remind-server.js';

function check(cond, msg) { if (!cond) throw new Error('CLOUD-TEST GAGAL: ' + msg); }

export default async function () {
  const tag = '__cit_rem' + Date.now().toString(36) + '_';
  const now = Date.now();
  let supId = null;
  try {
    await db.insert(suppliers).values({ name: tag + 'S', updatedAt: now }).run();
    supId = (await db.select().from(suppliers).where(eq(suppliers.name, tag + 'S')).get()).id;
    // jadwal mingguan: semua hari, jam 00:00 WIB (sudah lewat), pra-alert 60 -> alarm utama jatuh tempo
    await db.insert(remRecurring).values({ supplierId: supId, days: [0, 1, 2, 3, 4, 5, 6], time: '00:00', preAlertMin: null, lastFiredDate: null, lastPreFiredDate: null, updatedAt: now }).run();
    // sekali-jadwal: satu sudah lewat (alarm), satu 10 menit lagi dengan pra-alert 15 (pra-alert)
    await db.insert(remOneoff).values([
      { id: tag + 'a', supplierId: supId, ts: now - 5000, preAlertMin: null, firedAt: null, preFiredAt: null, updatedAt: now },
      { id: tag + 'b', supplierId: supId, ts: now + 10 * 60000, preAlertMin: 15, firedAt: null, preFiredAt: null, updatedAt: now },
    ]).run();

    const t1 = await runTick({ send: false, supplierIds: [supId] });
    check(t1.fired.length === 3, 'tick 1 harus mengklaim 3 kejadian (mingguan + sekali + pra-alert), dapat ' + JSON.stringify(t1.fired));
    check(t1.fired.some((m) => m.includes('SEKARANG')) && t1.fired.some((m) => m.includes('sebentar lagi')), 'isi pesan: ' + JSON.stringify(t1.fired));

    const t2 = await runTick({ send: false, supplierIds: [supId] });
    check(t2.fired.length === 0, 'tick 2 tidak boleh mengirim ganda, dapat ' + JSON.stringify(t2.fired));

    // dua tick bersamaan: total klaim tidak boleh melebihi satu per kejadian
    await db.update(remRecurring).set({ lastFiredDate: null, updatedAt: Date.now() }).where(eq(remRecurring.supplierId, supId)).run();
    const [x, y] = await Promise.all([runTick({ send: false, supplierIds: [supId] }), runTick({ send: false, supplierIds: [supId] })]);
    check(x.fired.length + y.fired.length === 1, 'balapan: tepat satu pemenang klaim, dapat ' + (x.fired.length + y.fired.length));

    const a = await db.select().from(remOneoff).where(eq(remOneoff.id, tag + 'a')).get();
    check(a.firedAt != null, 'firedAt tertulis');
    return { ok: true, claims: 3, doubleSend: false, raceWinners: 1 };
  } finally {
    await db.delete(remOneoff).where(like(remOneoff.id, tag + '%')).run();
    if (supId != null) await db.delete(remRecurring).where(eq(remRecurring.supplierId, supId)).run();
    await db.delete(suppliers).where(like(suppliers.name, tag + '%')).run();
  }
}

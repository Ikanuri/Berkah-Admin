// Penjalan tick pengingat di server. Dipanggil dari: endpoint tickReminders
// (dijadwalkan GitHub Actions), getChanges (klien yang sedang membuka app), dan
// handler bot. Klaim atomik: UPDATE bersyarat, hanya yang rowsAffected = 1
// yang mengirim pesan.
import { db, api } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { remRecurring, remOneoff, suppliers, users } from '../schema.js';
import { planTick } from './reminders.js';

async function claim(c, now) {
  const p = { ':n': now };
  let sql;
  if (c.type === 'rec-pre') {
    sql = 'UPDATE reminders_recurring SET last_pre_fired_date = :d, updated_at = :n WHERE supplier_id = :id AND deleted_at IS NULL AND (last_pre_fired_date IS NULL OR last_pre_fired_date != :d)';
    Object.assign(p, { ':d': c.date, ':id': c.supplierId });
  } else if (c.type === 'rec-on') {
    sql = 'UPDATE reminders_recurring SET last_fired_date = :d, updated_at = :n WHERE supplier_id = :id AND deleted_at IS NULL AND (last_fired_date IS NULL OR last_fired_date != :d)';
    Object.assign(p, { ':d': c.date, ':id': c.supplierId });
  } else if (c.type === 'once-pre') {
    sql = 'UPDATE reminders_oneoff SET pre_fired_at = :n, updated_at = :n WHERE id = :id AND deleted_at IS NULL AND pre_fired_at IS NULL AND fired_at IS NULL';
    p[':id'] = c.id;
  } else {
    sql = 'UPDATE reminders_oneoff SET fired_at = :n, updated_at = :n WHERE id = :id AND deleted_at IS NULL AND fired_at IS NULL';
    p[':id'] = c.id;
  }
  const r = await db.run(sql, p);
  return r.rowsAffected === 1;
}

// supplierIds (opsional): batasi hanya ke supplier itu. Dipakai uji agar tidak
// pernah "menghabiskan" pengingat milik pelanggan.
export async function runTick({ send = true, now = Date.now(), supplierIds = null } = {}) {
  const only = supplierIds ? new Set(supplierIds) : null;
  const recurring = (await db.select().from(remRecurring).where(isNull(remRecurring.deletedAt)).all())
    .filter((r) => !only || only.has(r.supplierId));
  const oneOff = (await db.select().from(remOneoff).where(and(isNull(remOneoff.deletedAt), isNull(remOneoff.firedAt))).all())
    .filter((o) => !only || only.has(o.supplierId));
  if (!recurring.length && !oneOff.length) return { fired: [], delivered: 0, failed: 0 };
  const sups = await db.select().from(suppliers).all();
  const supplierName = (id) => { const s = sups.find((x) => x.id === id); return s && !s.deletedAt ? s.name : null; };

  const fired = [];
  for (const c of planTick({ recurring, oneOff, supplierName }, now)) {
    if (await claim(c, now)) fired.push(c.message);
  }

  let delivered = 0, failed = 0;
  if (send && fired.length) {
    const bosses = await db.select().from(users).where(eq(users.role, 'boss')).all();
    for (const text of fired) {
      for (const b of bosses) {
        try { await api.sendMessage({ chat_id: b.tgId, text }); delivered++; } catch { failed++; }
      }
    }
  }
  return { fired, delivered, failed };
}

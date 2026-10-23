// Bos menyetujui atau menolak setoran. Menyetujui = logika "balasan" app lama (planReceipt):
// barang terpenuhi dilepas centangnya, yang kurang tetap tercentang dengan qty sisa.
// Klaim atomik (UPDATE ... WHERE status='pending'); rencana disimpan di receipts.result sebelum
// diterapkan, dan penerapan memakai nilai MUTLAK, jadi mengulang setelah gagal di tengah aman.
import { db, EndpointError, api } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { items, workerItems, receipts } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { touchItem } from '../lib/store.js';
import { claimReceipt } from '../lib/worker-store.js';
import { planReceipt } from '../lib/receipts.js';
import { normName } from '../lib/rules.js';
import { makeId } from '../lib/id.js';

async function applyEffects(effects, now) {
  for (const e of effects) {
    try { await touchItem(e.id, e.patch, now); } catch { await touchItem(e.id, e.patch, now); } // coba sekali lagi
  }
}

async function tell(workerId, text) {
  try { await api.sendMessage({ chat_id: workerId, text }); } catch { /* best-effort */ }
}

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const rc = await db.select().from(receipts).where(eq(receipts.id, String(input?.id ?? ''))).get();
  if (!rc) throw new EndpointError('Setoran tidak ditemukan');
  const approve = input?.approve === true;
  const note = input?.note ? String(input.note).trim().slice(0, 200) : null;
  const now = Date.now();

  // Pemulihan: disetujui tetapi penerapan belum selesai -> terapkan ulang nilai tersimpan.
  if (approve && rc.status === 'approved' && rc.result && rc.result.applied === false) {
    await applyEffects(rc.result.effects, now);
    await db.run('UPDATE receipts SET result = :r, updated_at = :n WHERE id = :id', { ':r': JSON.stringify({ ...rc.result, applied: true }), ':n': now, ':id': rc.id });
    return { status: 'approved', recovered: true, counts: { resolved: rc.result.effects.filter((e) => e.status === 'resolved').length, partial: rc.result.effects.filter((e) => e.status === 'partial').length, unmatched: rc.result.unmatched.length } };
  }
  if (rc.status !== 'pending') throw new EndpointError('Setoran sudah diproses');

  if (approve) {
    const live = await db.select().from(items).where(isNull(items.deletedAt)).all();
    const plan = planReceipt(live, rc.lines, now);
    const result = { effects: plan.effects, unmatched: plan.unmatched, applied: false };
    if (!(await claimReceipt({ id: rc.id, to: 'approved', now, by: u.tgId, note, result }))) throw new EndpointError('Setoran sudah diproses');
    await applyEffects(plan.effects, now);
    await db.run('UPDATE receipts SET result = :r, updated_at = :n WHERE id = :id', { ':r': JSON.stringify({ ...result, applied: true }), ':n': Date.now(), ':id': rc.id });
    await logActivity(u.tgId, 'receiptApprove', { worker: rc.workerName, ...plan.counts });
    await tell(rc.workerId, `✓ Setoran Anda disetujui: ${plan.counts.resolved} terpenuhi, ${plan.counts.partial} kurang${plan.counts.unmatched ? `, ${plan.counts.unmatched} tidak ada di daftar Bos` : ''}.`);
    return { status: 'approved', counts: plan.counts };
  }

  if (!(await claimReceipt({ id: rc.id, to: 'rejected', now, by: u.tgId, note }))) throw new EndpointError('Setoran sudah diproses');
  // ditolak: barang kembali ke daftar karyawan (tercentang) supaya bisa dikoreksi dan disetor ulang
  const own = await db.select().from(workerItems).where(and(eq(workerItems.ownerId, rc.workerId), isNull(workerItems.deletedAt))).all();
  const byName = new Map(own.map((i) => [normName(i.name), i]));
  let order = own.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 1;
  for (const l of rc.lines) {
    const cur = byName.get(normName(l.name));
    if (cur) {
      await db.update(workerItems).set({ qty: l.qty, unit: l.unit || cur.unit, checked: true, checkedAt: now, updatedAt: now }).where(eq(workerItems.id, cur.id)).run();
    } else {
      await db.insert(workerItems).values({ id: makeId(), ownerId: rc.workerId, name: l.name, qty: l.qty, unit: l.unit || 'dus', checked: true, checkedAt: now, sortOrder: order++, updatedAt: now }).run();
    }
  }
  await logActivity(u.tgId, 'receiptReject', { worker: rc.workerName, n: rc.lines.length });
  await tell(rc.workerId, `✗ Setoran Anda ditolak${note ? `: ${note}` : ''}. Barangnya dikembalikan ke daftar Anda.`);
  return { status: 'rejected' };
}

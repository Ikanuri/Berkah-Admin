// Akses DB daftar pribadi Karyawan dan setoran.
import { db, EndpointError, api } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { workerItems, users } from '../schema.js';

// Barang milik pemanggil saja; milik orang lain dianggap tidak ada.
export async function getOwnItem(id, ownerId) {
  const it = await db.select().from(workerItems)
    .where(and(eq(workerItems.id, id), eq(workerItems.ownerId, ownerId), isNull(workerItems.deletedAt))).get();
  if (!it) throw new EndpointError('Barang tidak ditemukan', { id });
  return it;
}

export async function touchWorkerItem(id, patch, now) {
  await db.update(workerItems).set({ ...patch, updatedAt: now }).where(eq(workerItems.id, id)).run();
}

// Kabari semua Bos (best-effort): gagal terkirim tidak menggagalkan setoran.
export async function notifyBosses(text) {
  const bosses = await db.select().from(users).where(eq(users.role, 'boss')).all();
  let delivered = 0, failed = 0;
  for (const b of bosses) {
    try { await api.sendMessage({ chat_id: b.tgId, text }); delivered++; } catch { failed++; }
  }
  return { delivered, failed };
}

// Klaim barang untuk setoran: hanya yang masih hidup, tercentang, milik pemanggil. true = berhasil
// diklaim (rowsAffected = 1); ketukan ganda/dua perangkat tidak bisa mengklaim barang yang sama dua kali.
export async function claimWorkerItem(id, ownerId, now) {
  const r = await db.run(
    'UPDATE worker_items SET deleted_at = :n, updated_at = :n WHERE id = :id AND owner_id = :o AND deleted_at IS NULL AND checked = 1',
    { ':n': now, ':id': id, ':o': ownerId });
  return r.rowsAffected === 1;
}

// Klaim keputusan Bos atas setoran: hanya satu pemanggil yang menang (status dari `from` ke `to`).
export async function claimReceipt({ id, from = 'pending', to, now, by, note = null, result = null }) {
  const r = await db.run(
    'UPDATE receipts SET status = :to, decided_at = :n, decided_by = :u, note = :note, result = :r, updated_at = :n WHERE id = :id AND status = :from',
    { ':to': to, ':n': now, ':u': by, ':note': note, ':r': result == null ? null : JSON.stringify(result), ':id': id, ':from': from });
  return r.rowsAffected === 1;
}

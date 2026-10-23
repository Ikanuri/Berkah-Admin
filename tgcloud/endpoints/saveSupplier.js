// Tambah / ganti nama supplier. Riwayat harga mengikuti nama baru karena
// price_log menunjuk supplier_id, bukan nama.
import { db, EndpointError } from 'sdk';
import { eq, isNull } from 'sdk/db';
import { suppliers } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { getSupplier } from '../lib/store.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const name = String(input?.name ?? '').trim();
  if (!name) throw new EndpointError('Nama supplier kosong');
  const all = await db.select().from(suppliers).where(isNull(suppliers.deletedAt)).all();
  if (all.some((s) => s.id !== input.id && s.name === name)) throw new EndpointError('Supplier sudah ada!', { name });
  const now = Date.now();
  if (input.id == null) {
    // nama milik supplier yang sudah dihapus: hidupkan lagi (nama unik di DB)
    const dead = await db.select().from(suppliers).where(eq(suppliers.name, name)).get();
    if (dead) {
      await db.update(suppliers).set({ deletedAt: null, updatedAt: now }).where(eq(suppliers.id, dead.id)).run();
    } else {
      await db.insert(suppliers).values({ name, updatedAt: now }).run();
    }
    await logActivity(u.tgId, 'addSupplier', { name });
    return { ok: true };
  }
  const s = await getSupplier(input.id);
  await db.update(suppliers).set({ name, updatedAt: now }).where(eq(suppliers.id, s.id)).run();
  await logActivity(u.tgId, 'renameSupplier', { id: s.id, from: s.name, to: name });
  return { ok: true };
}

// Identitas dan peran. ctx.initData sudah diverifikasi platform (401 otomatis
// bila tidak valid), jadi id-nya bisa dipercaya. Semua pengecekan di SERVER.
import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { users, activityLog } from '../schema.js';
import { BOSS_IDS } from './config.js';

// Ambil user; kalau belum ada, buat: Bos bila id ada di BOSS_IDS, selain itu 'pending'.
export async function currentUser(ctx) {
  const tg = ctx.initData.user;
  const now = Date.now();
  let u = await db.select().from(users).where(eq(users.tgId, tg.id)).get();
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ') || String(tg.id);
  if (!u) {
    const role = BOSS_IDS.includes(tg.id) ? 'boss' : 'pending';
    await db.insert(users).values({
      tgId: tg.id, name, username: tg.username ?? null, role, createdAt: now, updatedAt: now,
    }).run();
    u = { tgId: tg.id, name, username: tg.username ?? null, role, createdAt: now, updatedAt: now };
  } else if (tg.is_ci !== true && (u.name !== name || (u.username ?? null) !== (tg.username ?? null))) {
    // nama/username Telegram bisa berubah; ikuti yang terbaru. Identitas smoke test
    // CI (is_ci, hanya bisa disuntik lewat `tgcloud run` bertoken) tidak menimpa profil.
    await db.update(users).set({ name, username: tg.username ?? null, updatedAt: now }).where(eq(users.tgId, tg.id)).run();
    u = { ...u, name, username: tg.username ?? null };
  }
  if (u.role !== 'boss' && BOSS_IDS.includes(tg.id)) {
    // ID di konfigurasi selalu Bos, apa pun isi tabel
    await db.update(users).set({ role: 'boss', updatedAt: now }).where(eq(users.tgId, tg.id)).run();
    u = { ...u, role: 'boss' };
  }
  return u;
}

export async function requireRole(ctx, ...roles) {
  const u = await currentUser(ctx);
  if (!roles.includes(u.role)) {
    throw new EndpointError('Tidak punya akses', { role: u.role });
  }
  return u;
}

export async function logActivity(tgId, action, detail) {
  await db.insert(activityLog).values({ ts: Date.now(), tgId, action, detail: detail ?? null }).run();
}

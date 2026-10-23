// Simpan nota ke riwayat. Nomor otomatis (atomik) bila num kosong. Total dihitung ulang
// di server. Riwayat dibatasi HIST_MAX terbaru (yang lebih lama ditandai terhapus).
import { db, EndpointError } from 'sdk';
import { eq, desc, isNull } from 'sdk/db';
import { notaHist } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { cleanLines, notaNumber, HIST_MAX } from '../lib/nota.js';
import { makeId } from '../lib/id.js';

const str = (v, max) => String(v ?? '').trim().slice(0, max);

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  let cleaned;
  try { cleaned = cleanLines(input?.lines); } catch (e) { throw new EndpointError(e.message); }
  const now = Date.now();
  let num = str(input?.num, 40);
  if (!num) {
    const r = await db.run('INSERT INTO nota_seq (ts) VALUES (:t)', { ':t': now });
    num = notaNumber(Number(r.lastInsertRowid));
  } else {
    await db.run('INSERT INTO nota_seq (ts) VALUES (:t)', { ':t': now }); // nomor manual tetap menggeser urutan otomatis
  }
  const row = {
    id: makeId(), num, dateStr: str(input?.dateStr, 40), timeStr: str(input?.timeStr, 20),
    ket: str(input?.ket, 120) || 'Kulakan Harian', total: cleaned.total, savedAt: now,
    lines: cleaned.lines, createdBy: u.tgId, updatedAt: now, deletedAt: null,
  };
  await db.insert(notaHist).values(row).run();
  const live = await db.select().from(notaHist).where(isNull(notaHist.deletedAt)).orderBy(desc(notaHist.savedAt)).all();
  for (const old of live.slice(HIST_MAX)) {
    await db.update(notaHist).set({ deletedAt: now, updatedAt: now }).where(eq(notaHist.id, old.id)).run();
  }
  await logActivity(u.tgId, 'notaSave', { num, total: cleaned.total, lines: cleaned.lines.length });
  return { id: row.id, num, total: cleaned.total };
}

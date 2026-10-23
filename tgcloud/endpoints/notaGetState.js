// Keadaan Nota yang sering berubah (delta): kamus belajar, riwayat, dan nomor berikutnya.
import { db } from 'sdk';
import { gt, desc, isNull, and } from 'sdk/db';
import { notaLearn, notaHist, notaSeq } from '../schema.js';
import { requireRole } from '../lib/auth.js';
import { HIST_MAX, notaNumber } from '../lib/nota.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  const since = Number(input?.since) || 0;
  const serverTime = Date.now();
  const learn = await db.select().from(notaLearn).where(gt(notaLearn.updatedAt, since)).all();
  const hist = await db.select().from(notaHist).where(gt(notaHist.updatedAt, since)).orderBy(desc(notaHist.savedAt)).limit(HIST_MAX * 2).all();
  const last = await db.select().from(notaSeq).orderBy(desc(notaSeq.id)).limit(1).get();
  const nextSeq = (last ? last.id : 0) + 1;
  void and; void isNull;
  return { serverTime, learn, hist, nextNumber: notaNumber(nextSeq) };
}

// Proses teks harian: tiap tanggal valid DIGANTI utuh (juga arsipnya); hari lain tak tersentuh.
import { EndpointError } from 'sdk';
import { requireRole, logActivity } from '../lib/auth.js';
import { processRaw, arsipOf } from '../lib/pnl.js';
import { writeDay, readAll } from '../lib/pnl-store.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const raw = typeof input?.raw === 'string' ? input.raw : '';
  if (raw.length > 500_000) throw new EndpointError('Teks terlalu panjang');
  if (!raw.trim()) throw new EndpointError('Paste raw data dulu.');
  const r = processRaw(raw);
  if (!r.bloks) throw new EndpointError('Tidak ada blok terdeteksi (mulai tiap hari dengan #tanggal YYYY-MM-DD).');
  if (!r.days.length) throw new EndpointError('Tidak ada data valid.');
  const now = Date.now();
  let arsipN = 0;
  for (const { ds, data } of r.days) {
    await writeDay(ds, data, now);
    arsipN += arsipOf(data).length;
  }
  await logActivity(u.tgId, 'pnlProcess', { days: r.days.length });
  const all = await readAll();
  return { saved: r.days.length, skipped: r.skipped, arsipN, preview: r.preview, total: Object.keys(all.days).length, ...all };
}

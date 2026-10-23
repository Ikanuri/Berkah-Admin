// Ganti seluruh database produk dari teks CSV (skema rujukan, lihat parseProductsCSV).
// Tanpa transaksi: parsing divalidasi dulu SEBELUM menghapus, lalu hapus + insert chunk.
import { db, EndpointError } from 'sdk';
import { notaProducts, notaMeta } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { parseProductsCSV } from '../lib/match.js';

const CHUNK = 80; // 8 kolom

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const text = typeof input?.csv === 'string' ? input.csv : '';
  if (text.length > 6 * 1024 * 1024) throw new EndpointError('CSV terlalu besar (maks 6 MB)');
  const rows = parseProductsCSV(text);
  if (!rows.length) throw new EndpointError('CSV tidak valid — kolom "nama" tidak ditemukan');
  const now = Date.now();
  await db.run('DELETE FROM nota_products');
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(notaProducts).values(rows.slice(i, i + CHUNK).map((r) => ({
      nama: r.nama, kode: r.kode || null, barcode: r.barcode || null, satuan: r.satuan, satClass: r.satClass,
      hargaJual: r.hargaJual, hargaPokok: r.hargaPokok,
    }))).run();
  }
  await db.insert(notaMeta).values({ key: 'db_version', value: String(now) })
    .onConflictDoUpdate({ target: notaMeta.key, set: { value: String(now) } }).run();
  await logActivity(u.tgId, 'notaImportCsv', { count: rows.length });
  return { count: rows.length, version: now };
}

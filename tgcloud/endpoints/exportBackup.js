// Backup semua data Stok+HPP+Supplier sebagai JSON. Khusus Bos.
// send:true -> kirim sebagai dokumen ke chat Bos lewat Bot API (WebView Telegram
// tidak andal untuk unduhan blob). Bila gagal (mis. Bos belum /start bot),
// balas JSON-nya supaya klien bisa mencoba unduh langsung.
import { db, api, InputFile } from 'sdk';
import { isNull } from 'sdk/db';
import { categories, items, suppliers, priceLog } from '../schema.js';
import { requireRole, logActivity } from '../lib/auth.js';
import { makeBackup } from '../lib/backup.js';

const p2 = (n) => String(n).padStart(2, '0');

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  const now = Date.now();
  const data = makeBackup({
    categories: await db.select().from(categories).where(isNull(categories.deletedAt)).all(),
    items: await db.select().from(items).where(isNull(items.deletedAt)).all(),
    suppliers: await db.select().from(suppliers).all(),
    priceLog: await db.select().from(priceLog).where(isNull(priceLog.deletedAt)).all(),
  }, now);
  const d = new Date(now + 7 * 3600000); // nama file memakai tanggal zona toko (WIB)
  const filename = `berkah-${p2(d.getUTCDate())}-${p2(d.getUTCMonth() + 1)}-${String(d.getUTCFullYear()).slice(2)}.json`;
  const counts = { categories: data.tables.categories.length, items: data.tables.items.length, suppliers: data.tables.suppliers.length, priceLog: data.tables.priceLog.length };
  await logActivity(u.tgId, 'exportBackup', counts);

  if (input?.send) {
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(data));
      await api.sendDocument({
        chat_id: ctx.initData.user.id,
        document: new InputFile(bytes, filename, { type: 'application/json' }),
        caption: `Backup Toko Berkah — ${counts.items} barang, ${counts.priceLog} riwayat harga`,
      });
      return { sent: true, filename, counts };
    } catch (e) {
      return { sent: false, filename, counts, data, reason: String(e?.description || e?.message || e) };
    }
  }
  return { sent: false, filename, counts, data };
}

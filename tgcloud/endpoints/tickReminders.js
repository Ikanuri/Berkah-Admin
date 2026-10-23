// Cek & kirim pengingat yang jatuh tempo. Dipanggil terjadwal oleh GitHub Actions
// (tgcloud tidak punya cron) dan oleh klien Bos. input.send=false: hanya klaim
// (dipakai uji). Khusus Bos (identitas CI memakai id Bos).
import { requireRole } from '../lib/auth.js';
import { runTick } from '../lib/remind-server.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  return runTick({ send: input?.send !== false });
}

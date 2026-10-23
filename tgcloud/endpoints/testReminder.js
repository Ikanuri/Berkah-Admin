// Kirim pesan uji ke chat si pemanggil supaya Bos tahu apakah pengingat akan sampai.
import { api } from 'sdk';
import { requireRole } from '../lib/auth.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  try {
    await api.sendMessage({ chat_id: ctx.initData.user.id, text: '🔔 Tes pengingat Toko Berkah: pesan seperti ini yang akan Anda terima saat supplier dijadwalkan datang.' });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String(e?.description || e?.message || e) };
  }
}

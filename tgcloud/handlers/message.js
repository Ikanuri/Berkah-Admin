import { api } from 'sdk';

// /start cukup mengarahkan ke Mini App; semua kerja lewat endpoints/.
export default async function (message) {
  if (message.text === '/start') {
    await api.sendMessage({ chat_id: message.chat.id, text: 'Buka Toko Berkah lewat tombol menu bot ini.' });
  }
}

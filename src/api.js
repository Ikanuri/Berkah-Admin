// Pintu tunggal ke backend. Di Telegram: Telegram.WebApp.Serverless.call.
// Di luar Telegram dengan ?dev=boss|worker|pending: LocalStore (data lokal browser).
import { LocalStore } from './local-store.js';

let local = null;

export function mode() {
  const dev = new URLSearchParams(location.search).get('dev');
  if (dev) return { kind: 'dev', role: dev };
  const tg = window.Telegram?.WebApp;
  if (tg && tg.initData) return { kind: 'telegram' };
  return { kind: 'none' };
}

export function call(name, input = {}) {
  const m = mode();
  if (m.kind === 'dev') {
    local ??= new LocalStore(m.role);
    return local.call(name, input);
  }
  if (m.kind !== 'telegram') return Promise.reject(new Error('Buka aplikasi ini lewat Telegram.'));
  return new Promise((resolve, reject) => {
    window.Telegram.WebApp.Serverless.call(name, input, (err, result) => {
      if (err) reject(new Error(err.message || 'Terjadi kesalahan'));
      else resolve(result);
    });
  });
}

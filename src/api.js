// Pintu tunggal ke backend. Di Telegram: Telegram.WebApp.Serverless.call.
// Di luar Telegram dengan ?dev=boss|worker|pending: LocalStore (data lokal browser).
import { LocalStore } from './local-store.js';

let local = null;

// Build offline (satu file .html): ditentukan saat build lewat `vite build --mode offline`.
// Semua jalan lewat LocalStore (data di browser perangkat ini), tanpa Telegram.
const OFFLINE = typeof __OFFLINE__ !== 'undefined' && __OFFLINE__;

export function mode() {
  if (OFFLINE) return { kind: 'offline', role: 'boss' };
  const dev = new URLSearchParams(location.search).get('dev');
  if (dev) return { kind: 'dev', role: dev };
  const tg = window.Telegram?.WebApp;
  if (tg && tg.initData) return { kind: 'telegram' };
  return { kind: 'none' };
}

export function call(name, input = {}) {
  const m = mode();
  if (m.kind === 'offline') {
    local ??= new LocalStore('boss', undefined, { key: 'berkah-offline-db', seed: false });
    return local.call(name, input);
  }
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

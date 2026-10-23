// Tema terang/gelap/otomatis (token dari app lama). 'auto' mengikuti tema Telegram
// bila ada, kalau tidak, preferensi sistem. Disimpan lokal per perangkat.
const KEY = 'brk-theme';

function read() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}
let pref = read();

export const themePref = () => pref;

function isDark() {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  const tg = window.Telegram?.WebApp;
  if (tg?.colorScheme) return tg.colorScheme === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function applyTheme() {
  const dark = isDark();
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#262624' : '#FAF9F5');
  try {
    const tg = window.Telegram?.WebApp;
    tg?.setHeaderColor?.(dark ? '#262624' : '#FAF9F5');
    tg?.setBackgroundColor?.(dark ? '#262624' : '#FAF9F5');
  } catch { /* abaikan */ }
}

export function setTheme(next) {
  pref = next;
  try { localStorage.setItem(KEY, next); } catch { /* abaikan */ }
  applyTheme();
}

export function cycleTheme() {
  setTheme({ auto: 'light', light: 'dark', dark: 'auto' }[pref] || 'auto');
}

import { defineConfig } from 'vite';
import { inlineSingleFile } from './scripts/vite-inline-single-file.js';

// Dilayani di akar host (https://app<id>.tgcloud.ai/), jadi base '/'.
// Jangan tambah X-Frame-Options: Telegram Web membuka Mini App dalam iframe.
//
// `vite build --mode offline`: satu berkas berkah-offline.html (JS + CSS di dalam), tanpa
// Telegram, semua lewat LocalStore. Lihat src/api.js (__OFFLINE__) dan README.
export default defineConfig(({ mode }) => {
  if (mode === 'offline') {
    return {
      base: './',
      define: { __OFFLINE__: 'true' },
      plugins: [inlineSingleFile({ fileName: 'berkah-offline.html', dropTelegram: true })],
      build: { outDir: 'dist-offline', emptyOutDir: true, target: 'es2020', cssCodeSplit: false, modulePreload: false, assetsInlineLimit: 100000000 },
    };
  }
  return { define: { __OFFLINE__: 'false' }, build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' } };
});

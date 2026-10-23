import { defineConfig } from 'vite';

// Dilayani di akar host (https://app<id>.tgcloud.ai/), jadi base '/'.
// Jangan tambah X-Frame-Options: Telegram Web membuka Mini App dalam iframe.
export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
});

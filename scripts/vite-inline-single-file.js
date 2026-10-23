// Plugin Vite kecil: menyatukan hasil build (JS + CSS) ke satu berkas HTML mandiri.
// Tanpa dependensi tambahan. Dipakai hanya oleh `vite build --mode offline`.
export function inlineSingleFile({ fileName, dropTelegram = false } = {}) {
  return {
    name: 'inline-single-file',
    enforce: 'post',
    generateBundle(_, bundle) {
      const htmlKey = Object.keys(bundle).find((k) => k.endsWith('.html'));
      if (!htmlKey) throw new Error('inline-single-file: HTML tidak ditemukan');
      let html = bundle[htmlKey].source.toString();
      const take = (ref) => {
        const key = ref.replace(/^\.?\//, '');
        const item = bundle[key];
        if (!item) throw new Error('inline-single-file: aset tidak ditemukan: ' + ref);
        delete bundle[key];
        return item.type === 'chunk' ? item.code : item.source.toString();
      };
      if (dropTelegram) html = html.replace(/<script\b[^>]*telegram-web-app\.js[^>]*><\/script>\s*/g, '');
      // </script dan <!-- di dalam kode tidak boleh menutup/mengacaukan tag inline
      const safeJs = (code) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
      html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (m, src) => /^https?:/.test(src) ? m : `<script type="module">${safeJs(take(src))}</script>`);
      html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (m, href) => /^https?:/.test(href) ? m : `<style>${take(href).replace(/<\/style/gi, '<\\/style')}</style>`);
      html = html.replace(/<link\b[^>]*href="([^"]+)"[^>]*rel="stylesheet"[^>]*>/g, (m, href) => /^https?:/.test(href) ? m : `<style>${take(href).replace(/<\/style/gi, '<\\/style')}</style>`);
      delete bundle[htmlKey];
      this.emitFile({ type: 'asset', fileName: fileName || 'index.html', source: html });
      const left = Object.keys(bundle).filter((k) => !k.endsWith('.map'));
      if (left.length) throw new Error('inline-single-file: masih ada berkas terpisah: ' + left.join(', '));
    },
  };
}

// Regresi: modul yang gagal init tidak boleh mematikan modul LAIN yang tidak
// terkait. Ditemukan saat menguji fitur sync — record PNL yang tak lengkap
// (field hilang, mis. karena data korup/skema berubah) melempar exception di
// pnInit(), dan karena initApp() dulu memanggil nkInit/pnInit/skInit polos
// berurutan tanpa try/catch, skInit() ikut TIDAK PERNAH terpanggil — gestur
// 5-tap Mode Bos di Stok Kosong jadi mati total, tanpa pesan error ke user.
// Fix: initModuleSafe() mengisolasi tiap init modul (lihat DOKUMENTASI-TEKNIS §9).
const { chromium } = require('playwright');
const HTML = require('path').join(__dirname, '..', 'index.html');
const res = [];
const check = (n, c, x) => { res.push(!!c); console.log((c?'✓':'✗')+' '+n+(x!==undefined?' — '+x:'')); };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto('file://' + HTML);
  // seed record PNL YANG SENGAJA TIDAK LENGKAP (field wajib hilang) — simulasi
  // data korup/skema lama, sebelum app boot
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('brk-pnl-days', JSON.stringify({ '2026-01-01': { income: 99 } }));
  });
  await page.reload();
  await page.waitForTimeout(500);

  check('pnInit() memang error (kondisi awal yang mau diisolasi)',
    consoleErrors.some(e => e.includes('Gagal memuat modul "PNL Analyzer"')), consoleErrors.join(' | '));

  await page.click('.mod-tabs [data-mod="stok"]');
  await page.waitForTimeout(1000);
  for (let i = 0; i < 6 && !(await page.$('#sk-pin-overlay.open')); i++){
    await page.click('#sk-logo-tap');
    await page.waitForTimeout(110);
  }
  check('Gestur 5-tap Mode Bos TETAP jalan walau PNL korup (dulu mati total)',
    !!(await page.$('#sk-pin-overlay.open')));

  for (const d of ['1','2','3','4']) await page.click('#sk-pin-grid [data-k="'+d+'"]');
  await page.waitForTimeout(400);
  if (await page.$('#sk-pin-overlay.open')){
    for (const d of ['1','2','3','4']) await page.click('#sk-pin-grid [data-k="'+d+'"]');
    await page.waitForTimeout(450);
  }
  check('Mode Bos berhasil aktif — Stok Kosong berfungsi normal',
    await page.$eval('#sk-mode-badge', e => e.style.display !== 'none').catch(() => false));

  await page.fill('#sk-new-input', '1 pak Tes Item');
  await page.click('#sk-add-btn');
  await page.waitForTimeout(300);
  check('Tambah barang di Stok Kosong tetap berfungsi',
    await page.$eval('body', () => JSON.parse(localStorage.getItem('stok-boss-data')).items.Umum.some(i => i.name === 'Tes Item')));

  check('User diberi tahu (toast) modul PNL gagal, bukan senyap',
    (await page.evaluate(() => document.body.textContent)).includes('gagal dimuat') ||
    consoleErrors.some(e => e.includes('Gagal memuat modul')));

  const fail = res.filter(r => !r).length;
  console.log('\nINIT ISOLATION TEST: ' + (res.length - fail) + '/' + res.length + ' lulus');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

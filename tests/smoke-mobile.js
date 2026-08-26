// Smoke test MOBILE (390×844): nav bawah, kalkulator terpusat & stabil, seekbar, gesture PIN
const { chromium } = require('playwright');
const fs = require('fs');
const HTML = require('path').join(__dirname, '..', 'index.html');
const CSV = require('path').join(__dirname, '..', 'data', 'Products.csv');
const TEMPLATE = fs.readFileSync(__dirname + '/template.txt', 'utf8').trim();

const results = [];
function check(name, cond, extra){
  results.push(!!cond);
  console.log((cond ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  });
  async function tapSafe(sel){
    // klik programatik: yang diuji adalah PERILAKU setelah klik (posisi diukur via rect),
    // bukan akurasi jari — tabel overflow-x membuat tap fisik Playwright tidak stabil
    await page.$eval(sel, el => { el.scrollIntoView({ block:'center', behavior:'instant' }); el.click(); });
    await page.waitForTimeout(120);
  }
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + HTML);
  await page.waitForTimeout(600);

  // 1. nav bawah tampil, tab atas tersembunyi
  const bnavVisible = await page.$eval('#g-bottom-nav', el => getComputedStyle(el).display !== 'none');
  const topTabsHidden = await page.$eval('.mod-tabs', el => getComputedStyle(el).display === 'none');
  check('Nav bawah tampil di mobile', bnavVisible);
  check('Tab atas disembunyikan di mobile', topTabsHidden);

  // 2. pindah modul via nav bawah tanpa geser
  await tapSafe('#g-bottom-nav [data-mod="stok"]');
  await page.waitForTimeout(300);
  const stokActive = await page.$eval('#mod-stok', el => el.classList.contains('active'));
  check('Pindah ke Stok via nav bawah (1 tap)', stokActive);
  await tapSafe('#g-bottom-nav [data-mod="nota"]');
  await page.waitForTimeout(300);

  // 3. font input ≥16px (anti auto-zoom)
  const fs1 = await page.$eval('#nk-input', el => parseFloat(getComputedStyle(el).fontSize));
  check('Font input ≥16px (anti auto-zoom)', fs1 >= 16, fs1 + 'px');

  // 4. kalkulator: terpusat & ukuran stabil saat mengetik
  await page.setInputFiles('#nk-csv-file', CSV);
  await page.waitForTimeout(1200);
  await page.fill('#nk-input', TEMPLATE);
  await tapSafe('#nk-parse-btn');
  await page.waitForTimeout(2500);
  await tapSafe('#nk-table [data-act="qty"]');
  await page.waitForTimeout(400);
  const box1 = await page.$eval('.calc-modal', el => { const r = el.getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; });
  const vw = 390, vh = 844;
  const cx = box1.x + box1.w/2;
  check('Kalkulator terpusat horizontal', Math.abs(cx - vw/2) < 8, 'pusat x=' + cx.toFixed(0));
  const cy = box1.y + box1.h/2;
  check('Kalkulator terpusat vertikal', Math.abs(cy - vh/2) < 40, 'pusat y=' + cy.toFixed(0));
  await tapSafe('[data-k="7"]');
  await page.waitForTimeout(250);
  const box2 = await page.$eval('.calc-modal', el => { const r = el.getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; });
  check('Ukuran & posisi kalkulator STABIL setelah ketik', Math.abs(box1.w-box2.w) < 1 && Math.abs(box1.h-box2.h) < 1 && Math.abs(box1.x-box2.x) < 1 && Math.abs(box1.y-box2.y) < 1,
    'Δw=' + Math.abs(box1.w-box2.w).toFixed(1) + ' Δh=' + Math.abs(box1.h-box2.h).toFixed(1));
  await tapSafe('[data-k="ok"]');
  await page.waitForTimeout(300);

  // 4b. dropdown produk BARIS BAWAH tabel panjang — reproduksi persis bug
  // laporan: dropdown terpotong oleh overflow-x:auto milik .tbl-wrap.
  // Klik trigger via evaluate (bukan Playwright .click()) — tabel scroll
  // horizontal membuat tap fisik di dalamnya tidak stabil (lihat tapSafe).
  // #nk-cdfloat sendiri di LUAR area scroll itu, jadi klik native aman dipakai.
  async function clickLastTrigger(){
    await page.evaluate(() => {
      const trigs = document.querySelectorAll('#nk-table .cd-trigger');
      const el = trigs[trigs.length - 1];
      el.scrollIntoView({ block: 'end', behavior: 'instant' });
      el.click();
    });
    await page.waitForTimeout(300);
  }
  await clickLastTrigger();
  const floatOpen = await page.$eval('#nk-cdfloat', el => el.classList.contains('open'));
  check('Dropdown baris bawah terbuka (portal ke body)', floatOpen);
  const floatRect = await page.$eval('#nk-cdfloat', el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; });
  check('Dropdown TIDAK terpotong — seluruhnya di dalam viewport', floatRect.top >= 0 && floatRect.bottom <= 844, JSON.stringify(floatRect));
  const cdItemsM = await page.$$('#nk-cdfloat.open .cd-item');
  check('Item dropdown baris bawah ada & bisa diukur (bukti tidak terklip)', cdItemsM.length > 0, cdItemsM.length + ' item');
  if (cdItemsM.length){
    const itemBox = await cdItemsM[0].boundingBox();
    check('Item dropdown punya bounding box valid (benar-benar bisa diklik)', !!itemBox && itemBox.height > 0, JSON.stringify(itemBox));
    await cdItemsM[0].click();
    await page.waitForTimeout(300);
    const stillOpen = await page.$eval('#nk-cdfloat', el => el.classList.contains('open'));
    check('Klik item dropdown baris bawah berhasil memilih (dropdown menutup)', !stillOpen);
  }
  // scroll saat dropdown terbuka → otomatis menutup (posisi jadi tidak valid).
  // klik di atas memicu nkRenderTable() (#nk-table diregenerasi) — clickLastTrigger
  // query ulang dari DOM tiap dipanggil, jadi aman dari elemen stale.
  await clickLastTrigger();
  const openBeforeScroll = await page.$eval('#nk-cdfloat', el => el.classList.contains('open'));
  await page.evaluate(() => window.scrollBy(0, 50));
  await page.waitForTimeout(200);
  const openAfterScroll = await page.$eval('#nk-cdfloat', el => el.classList.contains('open'));
  check('Scroll saat dropdown terbuka → otomatis tertutup', openBeforeScroll && !openAfterScroll);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  // 4c. regresi: scroll DI DALAM daftar produk dropdown & keyboard HP (resize
  // saat kotak cari fokus) TIDAK BOLEH menutup dropdown — laporan bug user:
  // "ketika akan mengetik atau scroll produk di dropdown, dropdown tertutup
  // sendiri". Akar sebab: listener scroll/resize lama menutup TANPA CEK
  // sumber event — scroll di dalam #nk-cdfloat-res & resize dari keyboard HP
  // (saat fokus ke kotak cari) ikut ke-anggap "scroll/resize halaman".
  await clickLastTrigger();
  await page.evaluate(() => {
    const res = document.getElementById('nk-cdfloat-res');
    res.scrollTop = 20;
    res.dispatchEvent(new Event('scroll', { bubbles: false }));
  });
  await page.waitForTimeout(250);
  const openAfterInnerScroll = await page.$eval('#nk-cdfloat', el => el.classList.contains('open'));
  check('Scroll DI DALAM daftar produk dropdown TIDAK menutup (fix)', openAfterInnerScroll);
  await page.evaluate(() => {
    document.querySelector('#nk-cdfloat .cd-search input').focus();
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(250);
  const openAfterKbResize = await page.$eval('#nk-cdfloat', el => el.classList.contains('open'));
  check('Resize (keyboard HP) saat kotak cari fokus TIDAK menutup (fix)', openAfterKbResize);
  await page.type('#nk-cdfloat .cd-search input', 'lilin', { delay: 20 });
  await page.waitForTimeout(300);
  const openAfterTyping = await page.$eval('#nk-cdfloat', el => el.classList.contains('open'));
  const searchResLen = await page.$eval('#nk-cdfloat-res', el => el.innerHTML.length);
  check('Mengetik di kotak cari TIDAK menutup dropdown & hasil muncul (fix)', openAfterTyping && searchResLen > 0, 'html len=' + searchResLen);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const el = document.getElementById('nk-cdfloat'); if (el) el.classList.remove('open'); });

  // 5. seekbar muncul saat halaman panjang + jump bekerja
  const seekVisible = await page.$eval('#g-seek', el => !el.classList.contains('hide'));
  check('Seekbar tampil saat halaman panjang', seekVisible);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(400);
  await tapSafe('#g-seek-top');
  await page.waitForTimeout(900);
  const atTop = await page.evaluate(() => window.scrollY);
  check('Jump ke atas bekerja', atTop < 10, 'scrollY=' + atTop);
  await tapSafe('#g-seek-bottom');
  await page.waitForTimeout(1100);
  const nearBottom = await page.evaluate(() => Math.abs(window.scrollY - (document.documentElement.scrollHeight - window.innerHeight)) < 20);
  check('Jump ke bawah bekerja', nearBottom);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // 6. gesture 5 tap di nav bawah → PIN
  for (let i = 0; i < 5; i++){ await tapSafe('#sk-logo-tap-m'); await page.waitForTimeout(90); }
  await page.waitForTimeout(400);
  const pinOpen = await page.$eval('#sk-pin-overlay', el => el.classList.contains('open'));
  check('Gesture 5× tap nav bawah → PIN', pinOpen);

  // 7. buat PIN → Mode Bos → tab HPP/Supplier (fitur baru) render aman di layar sempit
  for (const d of ['1','2','3','4']) await tapSafe('#sk-pin-grid [data-k="'+d+'"]');
  await page.waitForTimeout(300);
  for (const d of ['1','2','3','4']) await tapSafe('#sk-pin-grid [data-k="'+d+'"]');
  await page.waitForTimeout(400);
  const bossBadgeM = await page.$eval('#sk-mode-badge', el => el.style.display !== 'none');
  check('Mode Bos aktif di mobile', bossBadgeM);
  const subnavVisibleM = await page.$eval('#sk-subnav', el => getComputedStyle(el).display !== 'none');
  check('Subnav HPP/Supplier tampil di mobile (Mode Bos)', subnavVisibleM);
  await tapSafe('#sk-subnav [data-skview="hpp"]');
  await page.waitForTimeout(300);
  const hppVisibleM = await page.$eval('#sk-view-hpp', el => getComputedStyle(el).display !== 'none');
  check('Tab HPP terbuka & render di layar mobile', hppVisibleM);
  await tapSafe('#sk-subnav [data-skview="supplier"]');
  await page.waitForTimeout(300);
  await tapSafe('#sup-subnav [data-supview="analisis"]');
  await page.waitForTimeout(300);
  const supDonutWidthM = await page.$eval('#sup-donut', el => el.getBoundingClientRect().width);
  check('Tab Supplier (Analisis) terbuka & donut punya ukuran valid di mobile', supDonutWidthM > 0, supDonutWidthM);
  await tapSafe('#sk-exit-btn');
  await page.waitForTimeout(300);

  // screenshot mobile
  await tapSafe('#g-bottom-nav [data-mod="nota"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: __dirname + '/shot-mobile.png' });
  // screenshot kalkulator mobile
  await tapSafe('#nk-table [data-act="qty"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: __dirname + '/shot-mobile-calc.png' });

  check('Tidak ada JS error', errors.length === 0, errors.slice(0,2).join(' | '));
  const fail = results.filter(r => !r).length;
  console.log('\nMOBILE SMOKE: ' + (results.length - fail) + '/' + results.length + ' lulus');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

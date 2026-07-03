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
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
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

  // screenshot mobile
  await page.keyboard.press('Escape');
  await page.$eval('#sk-pin-overlay', el => el.classList.remove('open'));
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

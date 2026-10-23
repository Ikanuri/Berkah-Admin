// E2E frontend di Chromium sungguhan, backend LocalStore (?dev=...).
// Jalankan: npm run build && CHROME_BIN=... npm run e2e   (tidak ikut `npm test`: butuh browser)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

// Lokal: CHROME_BIN=/opt/pw-browsers/chromium. Di CI: chromium dari `playwright-core install`.
const EXE = process.env.CHROME_BIN || undefined;
const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS_DIR;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { await wait(200); }
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
await ctx.route(/telegram-web-app\.js|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let n = 0;
const step = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const modalOk = async (text) => {
  if (text != null) await page.fill('.overlay .modal input, .overlay .modal textarea', text);
  await page.click('.overlay .modal .btn.primary, .overlay .modal .btn.danger');
};
const calc = async (digits) => {
  for (const d of String(digits)) await page.click(`.calc-btn:text-is("${d}")`);
  await page.click('.calc-btn.okbtn');
};
const card = (name) => page.locator('.item-card', { hasText: name });
const qtyOf = (name) => page.evaluate((nm) => [...document.querySelectorAll('.item-card')].find((e) => e.textContent.includes(nm))?.querySelector('.qty-disp').textContent.trim(), name);
const waitQty = (name, v) => page.waitForFunction(([nm, val]) => [...document.querySelectorAll('.item-card')].find((e) => e.textContent.includes(nm))?.querySelector('.qty-disp').textContent.trim() === val, [name, v]);
const isChecked = (name) => card(name).evaluate((e) => e.classList.contains('checked'));
const hppRow = (name) => page.locator('#hpp-table tbody tr', { hasText: name });
const hppInput = (name, f) => hppRow(name).locator(`.cell-inp[data-f=${f}]`);
const waitHpp = (name, f, v) => page.waitForFunction(([nm, field, val]) => [...document.querySelectorAll('#hpp-table tbody tr')].find((r) => r.textContent.includes(nm))?.querySelector(`[data-f=${field}]`).value === val, [name, f, v]);
const setInput = async (loc, v) => { await loc.fill(v); await loc.blur(); };

await step('di luar Telegram tanpa ?dev: pesan "buka lewat Telegram"', async () => {
  await page.goto(BASE);
  await page.waitForSelector('.center-screen');
  assert.match(await page.textContent('.center-screen'), /lewat Telegram/);
});

await step('Bos: topbar bermerek, state kosong, buat kategori', async () => {
  await page.goto(BASE + '?dev=boss');
  await page.waitForSelector('.topbar .brand-name');
  assert.match(await page.textContent('.brand-name'), /Toko Berkah/);
  assert.match(await page.textContent('.empty-title'), /Belum ada kategori/);
  await page.click('.cat-tab-add');
  await modalOk('Sembako');
  await page.waitForSelector('.cat-tab.active');
  assert.equal((await page.textContent('.cat-tab.active')).trim(), 'Sembako');
});

await step('Bos: tempel barang; nama sama memperbarui (tidak dobel)', async () => {
  await page.fill('[data-keep=add]', '5 dus Aqua\n2 kg Gula Pasir\nTelur');
  await page.click('text=+ Tambah');
  await page.waitForSelector('.item-card');
  assert.equal(await page.locator('.item-card').count(), 3);
  assert.equal(await qtyOf('Telur'), '1');
  assert.match(await card('Telur').locator('.unit-btn').textContent(), /dus/);
  await page.fill('[data-keep=add]', '9 dus aqua');
  await page.click('text=+ Tambah');
  await waitQty('Aqua', '9');
  assert.equal(await page.locator('.item-card').count(), 3);
});

await step('Bos: centang, qty ± (minus beku di 1), numpad, satuan', async () => {
  await card('Gula Pasir').locator('.chk').click();
  await page.waitForSelector('.item-card.checked');
  await card('Telur').locator('[aria-label=Kurangi]').click();
  await wait(200);
  assert.equal(await qtyOf('Telur'), '1');
  await card('Telur').locator('[aria-label=Tambah]').click();
  await waitQty('Telur', '2');
  await card('Telur').locator('.qty-disp').click();
  await calc('12');
  await waitQty('Telur', '12');
  await card('Telur').locator('.unit-btn').click();
  await page.click('.unit-pop .unit-opt:text-is("btl")');
  await page.waitForFunction(() => [...document.querySelectorAll('.item-card')].find((e) => e.textContent.includes('Telur'))?.querySelector('.unit-btn').textContent.includes('btl'));
});

await step('Bos: Terima sebagian lalu penuh', async () => {
  await card('Aqua').locator('.chk').click();
  await page.waitForFunction(() => document.querySelectorAll('.item-card.checked').length === 2);
  await card('Aqua').locator('.mini-btn:text("Terima")').click();
  await calc('3');
  await waitQty('Aqua', '6');
  assert.ok(await isChecked('Aqua'), 'tetap tercentang');
  await card('Aqua').locator('.mini-btn:text("Terima")').click();
  await calc('6');
  await page.waitForFunction(() => ![...document.querySelectorAll('.item-card')].find((e) => e.textContent.includes('Aqua')).classList.contains('checked'));
});

await step('Bos: teks order + filter kategori (oc-chip, butuh >= 2 kategori)', async () => {
  assert.equal(await page.locator('.oc-chip').count(), 0, 'chip filter baru muncul bila ada >= 2 kategori');
  await page.click('.cat-tab-add');
  await modalOk('Minuman');
  await page.waitForSelector('.oc-chip');
  assert.equal((await page.textContent('.cat-tab.active')).trim(), 'Sembako');
  assert.equal(await page.inputValue('.out-wrap textarea'), '2 kg Gula Pasir');
  await page.click('.out-actions .mini-btn');
  await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('disalin'));
  await page.click('.oc-chip');
  await page.waitForSelector('.oc-chip.off');
  assert.match(await page.textContent('.oc-hint'), /1 kategori dikecualikan/);
  assert.equal(await page.inputValue('.out-wrap textarea'), '', 'kategori dikecualikan tidak ikut order');
  await page.click('.oc-chip');
  await page.waitForFunction(() => !document.querySelector('.oc-chip.off'));
  await shot('1-stok-boss');
});

await step('Bos: judul panel & penghitung mengikuti kategori aktif', async () => {
  assert.match(await page.textContent('.panel-title'), /Tambah Barang — Sembako/);
  assert.match(await page.textContent('.counter-line'), /1 dari 3 dicentang/);
});

await step('Bos: pencarian lintas kategori', async () => {
  await page.fill('[data-keep=search]', 'telur');
  await page.waitForFunction(() => document.querySelectorAll('.item-card').length === 1);
  assert.match(await page.textContent('.sk-cat-label'), /Sembako/);
  await page.fill('[data-keep=search]', '');
  await page.waitForFunction(() => document.querySelectorAll('.item-card').length === 3);
});

await step('Bos: HPP menghitung pokok & margin; margin ⇄ %', async () => {
  await page.click('.sub-btn:has-text("HPP")');
  await page.waitForSelector('#hpp-table');
  await setInput(hppInput('Gula Pasir', 'isi'), '10');
  await setInput(hppInput('Gula Pasir', 'hargaBeli'), '50.000');
  await page.waitForFunction(() => [...document.querySelectorAll('#hpp-table tbody tr')].find((r) => r.textContent.includes('Gula Pasir'))?.children[4].textContent.trim() === '5.000');
  await setInput(hppInput('Gula Pasir', 'hargaJual'), '6000');
  await waitHpp('Gula Pasir', 'margin', '1000');
  assert.equal(await hppInput('Gula Pasir', 'margin').getAttribute('class'), 'cell-inp pos');
  await page.click('.th-toggle');
  await waitHpp('Gula Pasir', 'margin', '20');
  await setInput(hppInput('Gula Pasir', 'margin'), '10'); // 10% dari modal 5000 -> jual 5500
  await waitHpp('Gula Pasir', 'hargaJual', '5500');
  await page.click('.th-toggle'); // kembali ke Rp
  // margin massal: pokok Gula Pasir 5.000, +10% dari modal -> 5.500 (kategori ini)
  await page.fill('[data-keep=hpp-bulk]', '20');
  await page.click('.seg-opt:text-is("%")');
  await page.click('.btn:text("Terapkan ke kategori ini")');
  await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('1 Harga Jual diperbarui'));
  assert.match(await page.textContent('#toast'), /2 dilewati \(Isi\/Harga Beli kosong\)/);
  await waitHpp('Gula Pasir', 'hargaJual', '6000'); // 5000 + 20%
  await page.click('.seg-opt:text-is("Rp")');
  await hppRow('Gula Pasir').locator('.unit-btn').click();
  await page.click('.hpp-unit-pop .unit-opt:text-is("kg")');
  await page.waitForFunction(() => [...document.querySelectorAll('#hpp-table tbody tr')].find((r) => r.textContent.includes('Gula Pasir'))?.querySelector('.hpp-unit-btn').textContent.includes('kg'));
  await shot('2-hpp');
});

await step('Bos: supplier, input harga, tier termurah & seri', async () => {
  await page.click('.sub-btn:has-text("Supplier")');
  for (const nm of ['Agen A', 'Agen B']) {
    await page.click('.mini-btn:text("+ Supplier")');
    await modalOk(nm);
    await page.waitForFunction((x) => [...document.querySelectorAll('select.inp option')].some((o) => o.textContent === x), nm);
  }
  const fill = async (supplier, price) => {
    await page.selectOption('select.inp', { label: supplier });
    await setInput(page.locator('#sup-input-table tr', { hasText: 'Gula Pasir' }).locator('.sup-price-inp'), price);
    await page.click('text=💾 Simpan Sesi');
    await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('harga disimpan'));
  };
  await fill('Agen A', '48.000');
  await wait(2600); // biarkan toast lama hilang agar tunggu berikutnya tidak salah baca
  await fill('Agen B', '47.500');
  await page.click('.sub-btn:has-text("Analisis")');
  await page.waitForSelector('.sup-item-row');
  assert.match(await page.locator('.sup-item-row', { hasText: 'Gula Pasir' }).locator('.sup-item-tier').textContent(), /Agen B.*47\.500/);
  await page.click('.sub-btn:has-text("Input Harga")');
  await wait(2600);
  await fill('Agen A', '47.500');
  await page.click('.sub-btn:has-text("Analisis")');
  await page.waitForFunction(() => [...document.querySelectorAll('.sup-item-row')].find((r) => r.textContent.includes('Gula Pasir'))?.querySelector('.sup-item-tier').textContent.includes('2 supplier'));
  await page.locator('.sup-item-row', { hasText: 'Gula Pasir' }).locator('.sup-item-row-main').click();
  await page.waitForSelector('.hbar-row.cheapest');
  await shot('3-supplier');
  await page.click('.sub-btn:has-text("HPP")');
  await waitHpp('Gula Pasir', 'hargaBeli', '47500'); // harga terakhir menimpa Harga Beli
});

await step('Bos: pengaturan, tema gelap, persetujuan pengguna', async () => {
  await page.click('.icon-btn[title="Pengaturan"]');
  await page.waitForSelector('.user-row');
  assert.match(await page.textContent('.alert-warn'), /1 orang menunggu/);
  await page.locator('.user-row', { hasText: 'Budi' }).locator('select').selectOption('worker');
  await page.waitForFunction(() => !document.querySelector('.alert-warn'));
  await page.click('.seg-opt:text("Gelap")');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await shot('4-pengaturan-gelap');
  await page.click('.modal-x');
  await page.waitForFunction(() => !document.querySelector('.overlay'));
  await shot('5-stok-gelap');
  await page.evaluate(() => localStorage.setItem('brk-theme', 'light'));
});

await step('Karyawan: tanpa sub-tab, tier, filter order, hapus, atau angka modal', async () => {
  await page.goto(BASE + '?dev=worker');
  await page.waitForSelector('.item-card');
  assert.equal(await page.locator('.pn-subnav').count(), 0);
  assert.equal(await page.locator('.item-tier-badge').count(), 0);
  assert.equal(await page.locator('.oc-chip').count(), 0);
  assert.equal(await page.locator('.del-btn').count(), 0, 'hapus barang khusus Bos seperti app lama');
  assert.equal(await page.locator('.drag-handle').count(), 0);
  assert.doesNotMatch(await page.textContent('body'), /47\.500|5\.500|🏆/);
  await shot('6-stok-karyawan');
});

await step('Menunggu persetujuan untuk peran pending', async () => {
  await page.goto(BASE + '?dev=pending');
  await page.waitForSelector('.center-screen');
  assert.match(await page.textContent('.center-screen'), /Menunggu persetujuan/);
});

await step('tidak ada error konsol/halaman', async () => {
  assert.deepEqual(errors.filter((e) => !/telegram-web-app|fonts\.g|ERR_FAILED|net::/.test(e)), []);
});

await browser.close();
server.kill();
console.log(`\nHASIL E2E: ${n} skenario lulus`);

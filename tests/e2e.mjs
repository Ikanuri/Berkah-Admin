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
await ctx.route('**/telegram-web-app.js', (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let n = 0;
const step = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const modalOk = async (text) => {
  if (text != null) await page.fill('.modal input, .modal textarea', text);
  await page.click('.modal .btn.primary, .modal .btn.danger');
};
const rowOf = (name) => page.locator('.item', { hasText: name });
const toastText = async () => (await page.textContent('#toast')) || '';

await step('di luar Telegram tanpa ?dev: pesan "buka lewat Telegram"', async () => {
  await page.goto(BASE);
  await page.waitForSelector('.center');
  assert.match(await page.textContent('.center'), /lewat Telegram/);
});

await step('Bos: state kosong lalu buat kategori', async () => {
  await page.goto(BASE + '?dev=boss');
  await page.waitForSelector('.dev-banner');
  assert.match(await page.textContent('.empty'), /Belum ada kategori/);
  await page.click('.chip.add');
  await modalOk('Sembako');
  await page.waitForSelector('.chip.active');
  assert.equal((await page.textContent('.chip.active')).trim(), 'Sembako');
});

await step('Bos: tempel barang, nama sama memperbarui (tidak dobel)', async () => {
  await page.fill('[data-keep=add]', '5 dus Aqua\n2 kg Gula Pasir\nTelur');
  await page.click('text=Tambah');
  await page.waitForSelector('.item');
  assert.equal(await page.locator('.item').count(), 3);
  assert.equal((await rowOf('Telur').locator('.qty').textContent()).trim(), '1');
  assert.equal(await rowOf('Telur').locator('select').inputValue(), 'dus');
  await page.fill('[data-keep=add]', '9 dus aqua');
  await page.click('text=Tambah');
  await page.waitForFunction(() => document.querySelector('.item .qty')?.textContent.trim() === '9');
  assert.equal(await page.locator('.item').count(), 3);
});

await step('Bos: centang, qty ±, minus beku di 1', async () => {
  await rowOf('Gula Pasir').locator('input[type=checkbox]').check();
  await page.waitForSelector('.item.checked');
  await rowOf('Telur').locator('[aria-label=Kurangi]').click();
  await wait(150);
  assert.equal((await rowOf('Telur').locator('.qty').textContent()).trim(), '1');
  await rowOf('Telur').locator('[aria-label=Tambah]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.item')].find((e) => e.textContent.includes('Telur'))?.querySelector('.qty').textContent.trim() === '2');
});

await step('Bos: Terima sebagian lalu penuh (pemenuhan sebagian)', async () => {
  await rowOf('Aqua').locator('input[type=checkbox]').check();
  await page.waitForFunction(() => document.querySelectorAll('.item.checked').length === 2);
  await rowOf('Aqua').locator('text=Terima').click();
  await modalOk('3');
  await page.waitForFunction(() => [...document.querySelectorAll('.item')].find((e) => e.textContent.includes('Aqua'))?.querySelector('.qty').textContent.trim() === '6');
  assert.ok(await rowOf('Aqua').evaluate((e) => e.classList.contains('checked')), 'tetap tercentang');
  await rowOf('Aqua').locator('text=Terima').click();
  await modalOk('6');
  await page.waitForFunction(() => ![...document.querySelectorAll('.item')].find((e) => e.textContent.includes('Aqua')).classList.contains('checked'));
});

await step('Bos: salin order dari yang tercentang', async () => {
  await page.click('.footer-bar .btn');
  await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('disalin'));
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '2 kg Gula Pasir');
  await shot('1-stok-boss');
});

await step('Bos: HPP menghitung pokok & margin dari nilai presisi', async () => {
  await page.click('.tab:has-text("HPP")');
  await page.waitForSelector('table');
  const tr = page.locator('tr', { hasText: 'Gula Pasir' });
  await tr.locator('input.num').nth(0).fill('10');
  await tr.locator('input.num').nth(0).blur();
  await tr.locator('input.num').nth(1).fill('50.000');
  await tr.locator('input.num').nth(1).blur();
  await page.waitForFunction(() => document.querySelector('tr:nth-child(2) td:nth-child(5)')?.textContent !== '—' || true);
  await page.waitForFunction(() => [...document.querySelectorAll('tr')].find((r) => r.textContent.includes('Gula Pasir'))?.children[4].textContent === '5.000');
  const tr2 = page.locator('tr', { hasText: 'Gula Pasir' });
  await tr2.locator('input.num').nth(2).fill('6000');
  await tr2.locator('input.num').nth(2).blur();
  await page.waitForFunction(() => [...document.querySelectorAll('tr')].find((r) => r.textContent.includes('Gula Pasir'))?.children[6].textContent === '1.000');
  assert.equal((await tr2.locator('td').nth(7).textContent()).trim(), '20%');
  await shot('2-hpp');
});

await step('Bos: supplier, input harga, tier termurah & seri', async () => {
  await page.click('.tab:has-text("Supplier")');
  for (const nm of ['Agen A', 'Agen B']) {
    await page.click('text=＋ Supplier');
    await modalOk(nm);
    await page.waitForSelector(`.pill:has-text("${nm}")`);
  }
  const fill = async (supplier, price) => {
    await page.selectOption('section:has(h3:text("Input Harga")) select', { label: supplier });
    await page.locator('.price-row', { hasText: 'Gula Pasir' }).locator('input.num').fill(price);
    await page.click('text=Simpan harga');
    await page.waitForFunction((s) => document.getElementById('toast')?.textContent.includes('harga disimpan'), supplier);
  };
  await fill('Agen A', '48.000');
  await fill('Agen B', '47.500');
  await page.waitForSelector('.tier-head');
  assert.match(await page.textContent('.tier-head'), /🏆 Agen B · 47.500/);
  await fill('Agen A', '47.500');
  await page.waitForFunction(() => document.querySelector('.tier-head')?.textContent.includes('2 supplier'));
  await shot('3-supplier');
  // harga terakhir menimpa Harga Beli di HPP
  await page.click('.tab:has-text("HPP")');
  await page.waitForFunction(() => [...document.querySelectorAll('tr')].find((r) => r.textContent.includes('Gula Pasir'))?.children[4].textContent === '4.750');
});

await step('Bos: Pengguna & persetujuan', async () => {
  await page.click('.tab:has-text("Pengguna")');
  await page.waitForSelector('.user-row');
  assert.match(await page.textContent('.notice'), /1 orang menunggu/);
  await page.locator('.user-row', { hasText: 'Budi' }).locator('select').selectOption('worker');
  await page.waitForFunction(() => !document.querySelector('.notice'));
});

await step('Karyawan: tanpa tab HPP/Supplier, tier, atau angka harga modal di layar', async () => {
  await page.goto(BASE + '?dev=worker');
  await page.waitForSelector('.item');
  assert.equal(await page.locator('.tab').count(), 0);
  assert.equal(await page.locator('.tier').count(), 0);
  assert.equal(await page.locator('text=Ikut order').count(), 0, 'filter order khusus Bos');
  assert.doesNotMatch(await page.textContent('.shell'), /4\.750|47\.500|🏆/);
  await shot('4-stok-karyawan');
});

await step('Menunggu persetujuan untuk peran pending', async () => {
  await page.goto(BASE + '?dev=pending');
  await page.waitForSelector('.center');
  assert.match(await page.textContent('.center'), /Menunggu persetujuan/);
});

await step('tidak ada error konsol/halaman', async () => {
  assert.deepEqual(errors.filter((e) => !/telegram-web-app|ERR_FAILED|net::/.test(e)), []);
});

await browser.close();
server.kill();
console.log(`\nHASIL E2E: ${n} skenario lulus`);

// Uji fitur SYNC (F1) — full (semua modul) dan partial (cuma Stok, termasuk HPP).
// WebRTC (PeerJS) butuh internet & dua peer sungguhan — di luar jangkauan test
// offline ini. Yang diuji adalah LOGIKA sync yang sebenarnya menentukan benar/
// salahnya data: collectSyncPayload() di "device pengirim" dipanggil langsung,
// hasilnya di-pipe ke applySyncPayload() di "device penerima" — dua context
// browser terpisah (localStorage terpisah beneran), fungsi aslinya dipanggil
// apa adanya, cuma transport WebRTC-nya yang di-skip.
const { chromium } = require('playwright');
const HTML = require('path').join(__dirname, '..', 'index.html');
const res = [];
const check = (n, c, x) => { res.push(!!c); console.log((c?'✓':'✗')+' '+n+(x!==undefined?' — '+x:'')); };

// seed = {key: value} ditulis ke localStorage SEBELUM app boot (reload), supaya
// variabel in-memory (pnDays/hppSuppliers/hppLog/skState) ikut kebaca app saat
// init — bukan cuma nangkring di localStorage tanpa pernah dibaca siapa pun.
async function newDevice(browser, seed){
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + HTML);
  await page.evaluate((s) => {
    localStorage.clear();
    for (const k in s) localStorage.setItem(k, s[k]);
  }, seed || {});
  await page.reload();
  await page.waitForTimeout(400);
  page._errors = errors;
  return page;
}
async function enterBoss(page){
  await page.click('.mod-tabs [data-mod="stok"]');
  await page.waitForTimeout(1000);
  if (await page.$eval('#sk-mode-badge', e => e.style.display !== 'none').catch(() => false)) return;
  for (let i = 0; i < 6 && !(await page.$('#sk-pin-overlay.open')); i++){ await page.click('#sk-logo-tap'); await page.waitForTimeout(110); }
  await page.waitForSelector('#sk-pin-grid [data-k="1"]', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(300);
  for (const d of ['1','2','3','4']) await page.click('#sk-pin-grid [data-k="'+d+'"]');
  await page.waitForTimeout(400);
  if (await page.$('#sk-pin-overlay.open')){
    await page.waitForSelector('#sk-pin-grid [data-k="1"]', { state: 'visible', timeout: 10000 });
    for (const d of ['1','2','3','4']) await page.click('#sk-pin-grid [data-k="'+d+'"]');
    await page.waitForTimeout(450);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  // ═══════════════ DEVICE A — "sumber", data lengkap 3 modul + HPP ═══════════════
  const A = await newDevice(browser);
  await enterBoss(A);
  await A.fill('#sk-new-input', '2 dus Gula Pasir\n1 pak Kopi Sachet');
  await A.click('#sk-add-btn');
  await A.waitForTimeout(300);
  await A.click('#sk-subnav [data-skview="hpp"]');
  await A.waitForTimeout(300);
  const setCell = async (page, f, v) => { const s='#hpp-table tbody tr:first-child input[data-f="'+f+'"]'; await page.fill(s,v); await page.dispatchEvent(s,'change'); await page.waitForTimeout(120); };
  await setCell(A, 'isi', '16');
  await setCell(A, 'hargaBeli', '65000');
  await setCell(A, 'hargaJual', '4550');
  await A.click('#sk-subnav [data-skview="supplier"]');
  await A.waitForTimeout(250);
  await A.click('#sup-add-btn'); await A.waitForTimeout(150);
  await A.fill('#sup-add-input', 'Toko Grosir A'); await A.click('#sup-add-ok'); await A.waitForTimeout(200);
  await A.selectOption('#sup-picker', 'Toko Grosir A');
  await A.fill('#sup-date', '2026-08-20');
  await A.fill('#sup-input-table tbody tr:first-child .sup-price-inp', '65000');
  await A.click('#sup-save-btn'); await A.waitForTimeout(200);
  await A.click('#g-confirm-ok'); await A.waitForTimeout(300);

  // Nota: seed DB produk + kamus belajar + riwayat langsung ke localStorage
  // (upload CSV lewat UI di luar cakupan test ini, tapi struktur datanya sama)
  await A.evaluate(() => {
    localStorage.setItem('brk-nota-db', JSON.stringify([
      { nama:'Gula Pasir', kode_produk:'G1', barcode:'', satuan:'Dus', harga_jual:250000, harga_beli:200000, induk_nama:'', induk_kode:'', satuan_dasar:'', rasio:'' }
    ]));
    localStorage.setItem('brk-nota-dbmeta', JSON.stringify({ count:1, updated: Date.now() }));
    localStorage.setItem('brk-nota-learn', JSON.stringify({ 'gulapasir|dus':'Gula Pasir' }));
    localStorage.setItem('brk-nota-hist', JSON.stringify([{ id:'h1', ts:Date.now(), text:'nota A' }]));
    localStorage.setItem('brk-nota-counter', '7');
  });
  // PNL: seed riwayat tanggal 2026-08-01 (akan dibandingkan dgn tanggal lain di B)
  await A.evaluate(() => {
    localStorage.setItem('brk-pnl-days', JSON.stringify({ '2026-08-01': { income:1000000, kulakan:200000, cash:100000, receh:0, totalPengeluaran:0, totalPrive:0, rincianPengeluaran:[], rincianPrive:[], gross:800000, netPos:800000, marginP:0, marginC:0 } }));
    localStorage.setItem('brk-pnl-arsip', JSON.stringify({ '2026-08-01': [{ j:'p', amt:50000, ket:'listrik' }] }));
    localStorage.setItem('brk-pnl-raw', '#tanggal 2026-08-01\nsample');
  });
  await A.reload();
  await A.waitForTimeout(500);
  await enterBoss(A);   // sesi bos hilang setelah reload (expired/butuh re-entry), re-masuk

  console.log('\n═══ SETUP selesai. Isi data Device A: ═══');
  const stateA = await A.evaluate(() => ({
    notaDb: JSON.parse(localStorage.getItem('brk-nota-db')||'[]').length,
    pnlDays: Object.keys(JSON.parse(localStorage.getItem('brk-pnl-days')||'{}')),
    stokItems: JSON.parse(localStorage.getItem('stok-boss-data')).items,
    suppliers: JSON.parse(localStorage.getItem('stok-hpp-suppliers')||'[]'),
    pricelog: JSON.parse(localStorage.getItem('stok-hpp-pricelog')||'[]'),
  }));
  console.log('  Nota DB:', stateA.notaDb, 'produk | PNL hari:', stateA.pnlDays, '| Supplier:', stateA.suppliers);
  console.log('  Item pertama (HPP):', JSON.stringify(stateA.stokItems.Umum[0]));

  // ═══════════════ FULL SYNC: A → B (semua 3 modul dicentang, default) ═══════════════
  console.log('\n══════════════════ 1. FULL SYNC (Nota + PNL + Stok/HPP) ══════════════════');
  // B punya datanya SENDIRI dari awal (di-seed SEBELUM boot), supaya ketahuan
  // apa yang tertimpa (Nota) vs apa yang di-merge (PNL/supplier/pricelog)
  const B = await newDevice(browser, {
    'stok-hpp-suppliers': JSON.stringify(['Toko Lokal B']),
    'stok-hpp-pricelog': JSON.stringify([{ id:'logB1', ts:1, tanggal:'2026-07-01', supplier:'Toko Lokal B', itemId:'xxx', nama:'Barang B', unit:'pak', hargaBeli:1000 }]),
    'brk-nota-db': JSON.stringify([{ nama:'Produk Lokal B' }]),
    'brk-pnl-days': JSON.stringify({ '2026-08-15': { income:1000000, kulakan:100000, cash:50000, receh:0, totalPengeluaran:0, totalPrive:0, rincianPengeluaran:[], rincianPrive:[], gross:900000, netPos:900000, marginP:0, marginC:0 } }),
  });
  await enterBoss(B);
  await B.fill('#sk-new-input', '5 pak Sabun Cuci');
  await B.click('#sk-add-btn'); await B.waitForTimeout(250);

  const payloadFull = await A.evaluate(() => {
    document.getElementById('g-sm-nota').checked = true;
    document.getElementById('g-sm-pnl').checked = true;
    document.getElementById('g-sm-stok').checked = true;
    return collectSyncPayload();
  });
  check('collectSyncPayload (full) tidak error', !payloadFull.error, JSON.stringify(payloadFull.error));
  check('Payload full memuat 3 modul', Object.keys(payloadFull.payload.modules).sort().join(',') === 'nota,pnl,stok',
    Object.keys(payloadFull.payload.modules).join(','));

  const appliedFull = await B.evaluate((msg) => applySyncPayload(msg), payloadFull.payload);
  await B.waitForTimeout(300);
  check('applySyncPayload (full) melaporkan 3 modul diterapkan', appliedFull.sort().join(',') === 'Nota,PNL,Stok', appliedFull.join(','));

  const afterFull = await B.evaluate(() => ({
    notaDb: JSON.parse(localStorage.getItem('brk-nota-db')||'[]'),
    notaLearn: JSON.parse(localStorage.getItem('brk-nota-learn')||'{}'),
    notaHist: JSON.parse(localStorage.getItem('brk-nota-hist')||'[]'),
    notaCounter: localStorage.getItem('brk-nota-counter'),
    pnlDays: JSON.parse(localStorage.getItem('brk-pnl-days')||'{}'),
    pnlArsip: JSON.parse(localStorage.getItem('brk-pnl-arsip')||'{}'),
    stokItems: JSON.parse(localStorage.getItem('stok-boss-data')).items,
    suppliers: JSON.parse(localStorage.getItem('stok-hpp-suppliers')||'[]'),
    pricelog: JSON.parse(localStorage.getItem('stok-hpp-pricelog')||'[]'),
  }));
  check('Nota DB B tertimpa jadi DB A (Gula Pasir)', afterFull.notaDb.length === 1 && afterFull.notaDb[0].nama === 'Gula Pasir', JSON.stringify(afterFull.notaDb));
  check('Nota kamus/riwayat/counter A ikut masuk ke B', afterFull.notaLearn['gulapasir|dus'] === 'Gula Pasir' && afterFull.notaHist.length === 1 && afterFull.notaCounter === '7');
  check('PNL: hari B (08-15) TETAP ADA + hari A (08-01) MASUK (merge per-tanggal, bukan timpa)',
    !!afterFull.pnlDays['2026-08-15'] && !!afterFull.pnlDays['2026-08-01'], Object.keys(afterFull.pnlDays).join(','));
  check('PNL: arsip A (08-01) masuk ke B', !!afterFull.pnlArsip['2026-08-01']);
  check('Stok: item Checklist B (Sabun Cuci) HILANG, diganti item A (full replace, sesuai desain)',
    !afterFull.stokItems.Umum.some(i => i.name === 'Sabun Cuci') && afterFull.stokItems.Umum.some(i => i.name === 'Gula Pasir'),
    afterFull.stokItems.Umum.map(i=>i.name).join(','));
  const gulaB = afterFull.stokItems.Umum.find(i => i.name === 'Gula Pasir');
  check('HPP ikut "gratis" ke B lewat item (isi/hargaBeli/hargaJual)',
    gulaB && gulaB.isi === 16 && gulaB.hargaBeli === 65000 && gulaB.hargaJual === 4550, JSON.stringify(gulaB));
  check('Supplier: MERGE (union) — punya B (Toko Lokal B) + punya A (Toko Grosir A) SAMA-SAMA ada',
    afterFull.suppliers.includes('Toko Lokal B') && afterFull.suppliers.includes('Toko Grosir A'), JSON.stringify(afterFull.suppliers));
  check('Pricelog: MERGE (union) — entri lama B (logB1) TIDAK HILANG + entri A masuk',
    afterFull.pricelog.some(e => e.id === 'logB1') && afterFull.pricelog.length === 2, JSON.stringify(afterFull.pricelog.map(e=>e.id)));

  await B.context().close();

  // ═══════════════ PARTIAL SYNC: A → C, HANYA Stok (Nota+PNL di-uncheck) ═══════════════
  console.log('\n══════════════════ 2. PARTIAL SYNC (hanya Stok, termasuk HPP) ══════════════════');
  const C = await newDevice(browser, {
    'brk-nota-db': JSON.stringify([{ nama:'Produk Lokal C — TIDAK BOLEH BERUBAH' }]),
    'brk-pnl-days': JSON.stringify({ '2026-08-20': { income:500000, kulakan:50000, cash:20000, receh:0, totalPengeluaran:0, totalPrive:0, rincianPengeluaran:[], rincianPrive:[], gross:450000, netPos:450000, marginP:0, marginC:0 } }),
    'stok-hpp-suppliers': JSON.stringify(['Toko Lokal C']),
  });
  await enterBoss(C);

  const payloadPartial = await A.evaluate(() => {
    document.getElementById('g-sm-nota').checked = false;
    document.getElementById('g-sm-pnl').checked = false;
    document.getElementById('g-sm-stok').checked = true;
    return collectSyncPayload();
  });
  check('Payload partial HANYA berisi modul stok', Object.keys(payloadPartial.payload.modules).join(',') === 'stok',
    Object.keys(payloadPartial.payload.modules).join(','));

  const beforeC = await C.evaluate(() => ({ notaDb: localStorage.getItem('brk-nota-db'), pnlDays: localStorage.getItem('brk-pnl-days') }));
  const appliedPartial = await C.evaluate((msg) => applySyncPayload(msg), payloadPartial.payload);
  await C.waitForTimeout(300);
  check('applySyncPayload (partial) HANYA melaporkan Stok diterapkan', appliedPartial.join(',') === 'Stok', appliedPartial.join(','));

  const afterC = await C.evaluate(() => ({
    notaDb: localStorage.getItem('brk-nota-db'),
    pnlDays: localStorage.getItem('brk-pnl-days'),
    stokItems: JSON.parse(localStorage.getItem('stok-boss-data')).items,
    suppliers: JSON.parse(localStorage.getItem('stok-hpp-suppliers')||'[]'),
  }));
  check('Partial sync: Nota di C SAMA SEKALI TIDAK TERSENTUH', afterC.notaDb === beforeC.notaDb, afterC.notaDb);
  check('Partial sync: PNL di C SAMA SEKALI TIDAK TERSENTUH', afterC.pnlDays === beforeC.pnlDays, afterC.pnlDays);
  const gulaC = afterC.stokItems.Umum.find(i => i.name === 'Gula Pasir');
  check('Partial sync: Stok/HPP dari A TETAP masuk ke C walau Nota+PNL di-uncheck',
    gulaC && gulaC.isi === 16 && gulaC.hargaBeli === 65000 && gulaC.hargaJual === 4550, JSON.stringify(gulaC));
  check('Partial sync: supplier tetap MERGE (Toko Lokal C + Toko Grosir A)',
    afterC.suppliers.includes('Toko Lokal C') && afterC.suppliers.includes('Toko Grosir A'), JSON.stringify(afterC.suppliers));

  // ═══════════════ EDGE CASE: hanya "stok" dicentang tapi bukan Mode Bos di pengirim ═══════════════
  console.log('\n══════════════════ 3. GUARD: kirim Stok butuh Mode Bos ══════════════════');
  const D = await newDevice(browser);   // D = pengirim, TIDAK masuk Mode Bos
  const guardResult = await D.evaluate(() => {
    document.getElementById('g-sm-nota').checked = false;
    document.getElementById('g-sm-pnl').checked = false;
    document.getElementById('g-sm-stok').checked = true;
    return collectSyncPayload();
  });
  check('collectSyncPayload menolak kirim Stok kalau bukan Mode Bos', !!guardResult.error, guardResult.error);

  console.log('\n');
  const allErrors = [...A._errors, ...B._errors, ...C._errors, ...D._errors];
  check('Tidak ada JS error di semua device', allErrors.length === 0, allErrors.slice(0,5).join(' | '));
  const fail = res.filter(r => !r).length;
  console.log('\nSYNC TEST: ' + (res.length - fail) + '/' + res.length + ' lulus');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

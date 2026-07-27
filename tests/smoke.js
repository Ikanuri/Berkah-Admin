// Smoke test end-to-end: Nota (upload CSV → parse → generate), PNL, Stok, tema
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HTML = require('path').join(__dirname, '..', 'index.html');
const CSV = require('path').join(__dirname, '..', 'data', 'Products.csv');
const TEMPLATE = fs.readFileSync(__dirname + '/template.txt', 'utf8').trim();

const results = [];
function check(name, cond, extra){
  results.push({ name, ok: !!cond, extra: extra || '' });
  console.log((cond ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => {
    // abaikan kegagalan resource jaringan (font CDN dll) — offline by design
    if (msg.type() === 'error' && !/Failed to load resource|net::ERR/.test(msg.text())) errors.push(msg.text());
  });

  await page.goto('file://' + HTML);
  await page.waitForTimeout(600);
  check('Halaman termuat tanpa JS error', errors.length === 0, errors.slice(0,2).join(' | '));

  // ── NOTA: upload CSV ──
  await page.setInputFiles('#nk-csv-file', CSV);
  await page.waitForTimeout(1200);
  const dbChip = await page.textContent('#nk-db-chip');
  check('CSV terupload & tersimpan', /2\.7\d\d produk/.test(dbChip), dbChip);

  // persistensi DB: reload lalu cek chip
  await page.reload();
  await page.waitForTimeout(700);
  const dbChip2 = await page.textContent('#nk-db-chip');
  check('DB persisten setelah reload', /produk/.test(dbChip2) && !/belum/.test(dbChip2), dbChip2);

  // ── NOTA: parse template 43 baris ──
  await page.fill('#nk-input', TEMPLATE);
  await page.click('#nk-parse-btn');
  await page.waitForTimeout(2500);
  const rows = await page.$$eval('#nk-table tbody tr', trs => trs.length);
  check('Tabel review 43 item + total', rows === 44, rows + ' baris');
  const okChips = await page.$$eval('#nk-table .chip.ok', els => els.length);
  check('≥30 item hijau otomatis', okChips >= 30, okChips + ' hijau');
  const grand = await page.textContent('#nk-grand');
  check('Grand total terhitung', /\d/.test(grand), 'Rp ' + grand);

  // dropdown pilih → kamus belajar
  await page.click('#nk-table .cd-trigger');
  await page.waitForTimeout(300);
  const cdItems = await page.$$('#nk-cdfloat.open .cd-item');
  check('Dropdown produk terbuka', cdItems.length > 0, cdItems.length + ' opsi');
  if (cdItems.length) await cdItems[0].click();
  await page.waitForTimeout(300);
  const learnChip = await page.textContent('#nk-learn-chip');
  check('Kamus belajar bertambah', /kamus: [1-9]/.test(learnChip), learnChip);

  // kalkulator qty
  await page.click('#nk-table [data-act="qty"]');
  await page.waitForTimeout(300);
  const calcOpen = await page.$eval('#g-calc-overlay', el => el.classList.contains('open'));
  check('Kalkulator qty terbuka (modal)', calcOpen);
  await page.click('[data-k="5"]');
  await page.click('[data-k="ok"]');
  await page.waitForTimeout(300);

  // generate nota
  await page.click('#nk-generate-btn');
  await page.waitForTimeout(400);
  // jika ada konfirmasi item belum dikonfirmasi
  const confirmVisible = await page.$eval('#g-confirm-overlay', el => el.classList.contains('open'));
  if (confirmVisible) await page.click('#g-confirm-ok');
  await page.waitForTimeout(500);
  const receipt = await page.$('#nk-receipt');
  check('Nota thermal tergenerate', !!receipt);
  const notaStatus = await page.textContent('#nk-status');
  check('Status nota tampil total', /Rp/.test(notaStatus), notaStatus);

  // ── PNL: input per-hari AKUMULATIF (fix — dulu replace, sekarang nambah) ──
  await page.click('[data-mod="pnl"]');
  await page.waitForTimeout(300);

  // hari pertama diproses SENDIRI (mensimulasikan input harian terpisah)
  await page.fill('#pn-raw', `#tanggal 2026-06-01
#pengeluaran
350000 Uang Indah
#prive
66200 Belanja
#cash 5628000 + 190000 saldo
#receh 21000
#income 7497200
#kulakan 5808330`);
  await page.click('#pn-process-btn');
  await page.waitForTimeout(600);
  let pnRows = await page.$$('#pn-tbl-harian tbody tr');
  check('PNL: hari pertama tersimpan (1 baris + TOTAL)', pnRows.length === 2, pnRows.length + ' baris');
  const pnStatus1 = await page.textContent('#pn-status');
  check('PNL: status bilang "disimpan" (bukan cuma "diproses" sekali pakai)', /1 hari disimpan/.test(pnStatus1), pnStatus1);

  // hari kedua diproses TERPISAH — harus NAMBAH ke riwayat, bukan mengganti hari pertama
  await page.fill('#pn-raw', `#tanggal 2026-06-02
#cash 4100000
#receh 15000
#income 5000000
#kulakan 3900000`);
  await page.click('#pn-process-btn');
  await page.waitForTimeout(600);
  pnRows = await page.$$('#pn-tbl-harian tbody tr');
  check('PNL: proses hari kedua MENAMBAH, bukan replace (2 hari + TOTAL)', pnRows.length === 3, pnRows.length + ' baris');
  let harian = await page.textContent('#pn-tbl-harian');
  check('#cash multi-angka dijumlah (fix P2)', harian.includes('5.818.000'), '5.818.000 ada di tabel');
  check('PNL: hari pertama MASIH ADA setelah proses hari kedua', harian.includes('7.497.200'), 'income hari 1 (7.497.200) masih di tabel');
  const sumCards = await page.$$eval('#pn-sum-cards .sum-card', els => els.length);
  check('8 kartu ringkasan', sumCards === 8);
  let totalIncomeCard = await page.$eval('#pn-sum-cards .sum-card:first-child .sum-val', el => el.textContent);
  check('PNL: kartu Total Income = gabungan 2 hari (7.497.200+5.000.000)', totalIncomeCard.includes('12.497.200'), totalIncomeCard);

  // hapus SATU hari lewat tombol ✕ baru di tabel Harian → hitungan harus recompute valid
  await page.click('#pn-tbl-harian [data-pndel]');   // baris teratas = tanggal paling awal (01 Jun)
  await page.waitForTimeout(200);
  if (await page.$eval('#g-confirm-overlay', el => el.classList.contains('open'))) await page.click('#g-confirm-ok');
  await page.waitForTimeout(400);
  pnRows = await page.$$('#pn-tbl-harian tbody tr');
  check('PNL: hapus 1 hari → baris berkurang (1 hari + TOTAL)', pnRows.length === 2, pnRows.length + ' baris');
  harian = await page.textContent('#pn-tbl-harian');
  totalIncomeCard = await page.$eval('#pn-sum-cards .sum-card:first-child .sum-val', el => el.textContent);
  check('PNL: hitungan TETAP VALID setelah hapus (total income = sisa hari kedua saja, hari pertama hilang total)',
    totalIncomeCard.includes('5.000.000') && !harian.includes('7.497.200'), totalIncomeCard);

  // reload → riwayat harus tetap tampil otomatis (persisten per-tanggal, bukan replay draft teks)
  await page.reload();
  await page.waitForTimeout(700);
  await page.click('[data-mod="pnl"]');
  await page.waitForTimeout(300);
  const pnResultAfterReload = await page.$eval('#pn-result', el => getComputedStyle(el).display !== 'none');
  check('PNL: riwayat tampil otomatis setelah reload (tanpa klik Proses lagi)', pnResultAfterReload);
  const harianAfterReload = await page.textContent('#pn-tbl-harian');
  check('PNL: hari yang sudah dihapus TETAP hilang setelah reload', !harianAfterReload.includes('7.497.200') && harianAfterReload.includes('5.000.000'));

  // ── LAPORAN PDF ANALISIS: font & kontras kartu gelap ──
  // fix root-cause: print-color-adjust dulu tidak diset → latar kartu gelap
  // (Total Income/Kulakan) hilang saat print/PDF, teks terang jadi pudar di
  // atas kertas putih. Font laporan juga pindah dari Cormorant Garamond/DM
  // Mono (dekoratif+monospace) ke PT Serif (serif biasa ala koran).
  await page.locator('#pn-pdf-btn').scrollIntoViewIfNeeded();
  const [reportAnalisis] = await Promise.all([
    page.context().waitForEvent('page'),
    page.click('#pn-pdf-btn'),
  ]);
  await reportAnalisis.waitForLoadState('load');
  await reportAnalisis.waitForTimeout(800);
  check('Laporan Analisis: judul benar', (await reportAnalisis.title()) === 'Laporan PNL — Toko Berkah');
  const kpiDark = await reportAnalisis.evaluate(() => {
    const c = document.querySelector('.kpi-card.dark');
    if (!c) return null;
    const cs = getComputedStyle(c);
    const v = getComputedStyle(c.querySelector('.kpi-v'));
    return { bg: cs.backgroundColor, valColor: v.color, font: v.fontFamily };
  });
  check('Kartu KPI gelap: latar hitam tercetak (bukan pudar)', !!kpiDark && kpiDark.bg === 'rgb(26, 23, 20)', JSON.stringify(kpiDark && kpiDark.bg));
  check('Kartu KPI gelap: nilai putih terang (kontras tinggi)', !!kpiDark && kpiDark.valColor === 'rgb(255, 255, 255)', JSON.stringify(kpiDark && kpiDark.valColor));
  check('Font laporan pakai PT Serif (bukan Cormorant Garamond lagi)', !!kpiDark && /PT Serif/.test(kpiDark.font), kpiDark && kpiDark.font);
  await reportAnalisis.close();

  // ── STOK ──
  await page.click('[data-mod="stok"]');
  await page.waitForTimeout(300);
  await page.fill('#sk-new-input', '2 dus Gula Pasir\n1 slp Mie Goreng');
  await page.click('#sk-add-btn');
  await page.waitForTimeout(400);
  const cards = await page.$$('#sk-grid .item-card');
  check('Stok: 2 item ditambahkan (mode karyawan)', cards.length === 2, cards.length + ' kartu');
  // centang item pertama → muncul di output
  await page.click('#sk-grid .item-card .chk');
  await page.waitForTimeout(400);
  const out = await page.inputValue('#sk-output');
  check('Centang → output balasan terisi', out.includes('Gula Pasir'), JSON.stringify(out));
  // S3: edit output → qty & unit item berubah
  await page.fill('#sk-output', '5 slp Gula Pasir');
  await page.dispatchEvent('#sk-output', 'input');
  await page.waitForTimeout(400);
  const qd = await page.textContent('#sk-grid .item-card .qty-disp');
  const ub = await page.textContent('#sk-grid .item-card .unit-btn');
  check('Edit output → qty item ikut (fix S3)', qd.trim() === '5', 'qty=' + qd.trim());
  check('Edit output → satuan item ikut (fix S3)', ub.includes('slp'), ub.trim());
  // S6: minus di qty — set qty 1 dulu via output lalu tekan minus
  await page.fill('#sk-output', '1 slp Gula Pasir');
  await page.dispatchEvent('#sk-output', 'input');
  await page.waitForTimeout(300);
  await page.click('#sk-grid .item-card .qty-btn');   // tombol pertama = minus
  await page.waitForTimeout(300);
  const qd2 = await page.textContent('#sk-grid .item-card .qty-disp');
  check('Minus di qty 1 → freeze (fix S6)', qd2.trim() === '1', 'qty=' + qd2.trim());

  // gesture 5 tap → PIN muncul
  for (let i = 0; i < 5; i++){ await page.click('#sk-logo-tap'); await page.waitForTimeout(80); }
  await page.waitForTimeout(300);
  const pinOpen = await page.$eval('#sk-pin-overlay', el => el.classList.contains('open'));
  check('Gesture rahasia 5× tap → layar PIN', pinOpen);
  const pinTitle = await page.textContent('#sk-pin-title');
  check('Setup PIN pertama kali', pinTitle.includes('Buat PIN'), pinTitle);
  // buat PIN 1234 + konfirmasi
  for (const d of ['1','2','3','4']) await page.click('#sk-pin-grid [data-k="'+d+'"]');
  await page.waitForTimeout(400);
  for (const d of ['1','2','3','4']) await page.click('#sk-pin-grid [data-k="'+d+'"]');
  await page.waitForTimeout(600);
  const bossBadge = await page.$eval('#sk-mode-badge', el => el.style.display !== 'none');
  check('Masuk Mode Bos', bossBadge);
  const catsVisible = await page.$eval('#sk-section-cats', el => el.style.display !== 'none');
  check('Kategori tampil di Mode Bos', catsVisible);
  // pastikan storage tidak pernah menyimpan mode boss (aturan keamanan)
  const storedMode = await page.evaluate(() => JSON.parse(localStorage.getItem('stok-boss-data')||'{}').mode);
  check('state.mode di storage tetap "worker"', storedMode === 'worker', storedMode);

  // ── FILTER KATEGORI OUTPUT (fitur baru) ──
  // buat kategori kedua + item tercentang di masing-masing (via state agar cepat)
  await page.evaluate(() => {
    skState.cats = ['Umum','Gudang'];
    skState.items = {
      Umum:   [{id:makeId(), name:'Gula Pasir', qty:2, unit:'dus', checked:true, checkedAt:Date.now()}],
      Gudang: [{id:makeId(), name:'Beras Premium', qty:5, unit:'sak', checked:true, checkedAt:Date.now()}],
    };
    lsSet('stok-boss-data', skState);
    skRender(); skSyncOutput();
  });
  await page.waitForTimeout(400);
  const ocChips = await page.$$('#sk-outcat-bar .oc-chip');
  check('Chip kategori output tampil di Mode Bos', ocChips.length === 2, ocChips.length + ' chip');
  let outAll = await page.inputValue('#sk-output');
  check('Semua kategori ikut output (default)', outAll.includes('Gula Pasir') && outAll.includes('Beras Premium'));
  // kecualikan "Gudang"
  await page.click('#sk-outcat-bar [data-occat="Gudang"]');
  await page.waitForTimeout(400);
  const outEx = await page.inputValue('#sk-output');
  check('Kategori dikecualikan hilang dari output', outEx.includes('Gula Pasir') && !outEx.includes('Beras Premium'), JSON.stringify(outEx));
  // edit output → item kategori dikecualikan TIDAK boleh ter-uncheck
  await page.fill('#sk-output', '3 dus Gula Pasir');
  await page.dispatchEvent('#sk-output', 'input');
  await page.waitForTimeout(400);
  const gudangStillChecked = await page.evaluate(() => skState.items['Gudang'][0].checked === true);
  check('Item kategori dikecualikan tetap tercentang saat output diedit', gudangStillChecked);
  // persisten setelah reload (sesi bos masih hidup)
  await page.reload();
  await page.waitForTimeout(700);
  await page.click('[data-mod="stok"]');
  await page.waitForTimeout(400);
  const outAfterReload = await page.inputValue('#sk-output');
  check('Pengecualian kategori persisten', !outAfterReload.includes('Beras Premium') && outAfterReload.includes('Gula Pasir'), JSON.stringify(outAfterReload));
  // sertakan kembali
  await page.click('#sk-outcat-bar [data-occat="Gudang"]');
  await page.waitForTimeout(400);
  const outBack = await page.inputValue('#sk-output');
  check('Toggle kembali → item muncul lagi', outBack.includes('Beras Premium'));

  // ── JEJAK AKTIVITAS TERAKHIR (fitur baru) ──
  const laAfterToggle = await page.textContent('#sk-lastact');
  check('Baris aktivitas tampil setelah toggle kategori', /kategori.*Gudang.*disertakan/.test(laAfterToggle), laAfterToggle.trim());
  // toggle centang item → deskripsi "dicentang: nama"
  await page.click('#sk-grid .item-card .chk');
  await page.waitForTimeout(300);
  let laText = await page.textContent('#sk-lastact');
  check('Toggle centang tercatat di aktivitas', /(dicentang|dibatalkan)/.test(laText), laText.trim());
  // tambah item → deskripsi "+N baru"
  await page.fill('#sk-new-input', '3 pak Sabun Cuci');
  await page.click('#sk-add-btn');
  await page.waitForTimeout(300);
  laText = await page.textContent('#sk-lastact');
  check('Tambah item tercatat di aktivitas', laText.includes('baru'), laText.trim());
  // hapus item → deskripsi "dihapus: nama"
  await page.evaluate(() => {
    const cat = skState.activecat;
    const item = skState.items[cat].find(i => i.name === 'Sabun Cuci');
    if (item) skDelete(item.id);
  });
  await page.waitForTimeout(300);
  laText = await page.textContent('#sk-lastact');
  check('Hapus item tercatat di aktivitas', laText.includes('dihapus: Sabun Cuci'), laText.trim());
  check('Label sumber data (Bos/Karyawan) tampil', /data Bos/.test(laText), laText.trim());
  // persisten lintas reload
  await page.reload();
  await page.waitForTimeout(700);
  await page.click('[data-mod="stok"]');
  await page.waitForTimeout(400);
  const laAfterReload = await page.textContent('#sk-lastact');
  check('Aktivitas terakhir persisten setelah reload', laAfterReload.includes('dihapus: Sabun Cuci'), laAfterReload.trim());
  // banding lokal vs data masuk (dipakai di dialog konfirmasi sync/restore)
  const compareText = await page.evaluate(() => {
    const incoming = { lastAct: { ts: Date.now() + 3600000, desc: 'dicentang: Contoh dari device lain' } };
    return skStokCompareText(incoming);
  });
  check('Perbandingan lokal vs masuk berfungsi', compareText.includes('Stok lokal') && compareText.includes('Stok diterima') && compareText.includes('lebih baru'), compareText.replace(/\n/g,' | '));

  // ── CENTANG SEMUA — GLOBAL & PER-KATEGORI (fitur baru) ──
  await page.evaluate(() => {
    skState.cats = ['Umum','Gudang'];
    skState.activecat = 'Umum';
    skState.items = {
      Umum: [
        { id:'x1', name:'Gula Pasir', qty:2, unit:'dus', checked:false, checkedAt:null },
        { id:'x2', name:'Minyak Goreng', qty:1, unit:'dus', checked:false, checkedAt:null },
        { id:'x3', name:'Kecap', qty:3, unit:'biji', checked:true, checkedAt:Date.now() },
      ],
      Gudang: [ { id:'y1', name:'Rak Besi', qty:1, unit:'biji', checked:false, checkedAt:null } ],
    };
    lsSet('stok-boss-data', skState);
    skRender(); skSyncOutput();
  });
  await page.waitForTimeout(400);
  const catBtns = await page.$$('#sk-counter [data-catall]');
  check('Mini-tombol per-kategori tampil (Bos, >1 item)', catBtns.length === 2, catBtns.length + ' tombol');
  const checkBtnDisabled1 = await page.$eval('#sk-counter [data-catall="check"]', el => el.disabled);
  const uncheckBtnDisabled1 = await page.$eval('#sk-counter [data-catall="uncheck"]', el => el.disabled);
  check('Kedua tombol aktif saat state campuran (1/3 dicentang)', !checkBtnDisabled1 && !uncheckBtnDisabled1);
  // klik "Semua" (check) → hanya kategori Umum yang berubah, Gudang tidak tersentuh
  await page.click('#sk-counter [data-catall="check"]');
  await page.waitForTimeout(300);
  const umumAllChecked = await page.evaluate(() => skState.items.Umum.every(i => i.checked));
  const gudangUntouched1 = await page.evaluate(() => skState.items.Gudang[0].checked === false);
  check('Centang-semua per kategori: Umum semua tercentang', umumAllChecked);
  check('Centang-semua per kategori TIDAK menyentuh kategori lain', gudangUntouched1);
  const checkBtnDisabled2 = await page.$eval('#sk-counter [data-catall="check"]', el => el.disabled);
  check('Tombol "Semua" nonaktif setelah semua tercentang', checkBtnDisabled2);
  // klik "Batal" (uncheck) → Umum kembali kosong, Gudang tetap tak tersentuh
  await page.click('#sk-counter [data-catall="uncheck"]');
  await page.waitForTimeout(300);
  const umumAllUnchecked = await page.evaluate(() => skState.items.Umum.every(i => !i.checked));
  const gudangUntouched2 = await page.evaluate(() => skState.items.Gudang[0].checked === false);
  check('Batalkan-semua per kategori: Umum semua batal', umumAllUnchecked);
  check('Batalkan-semua per kategori TIDAK menyentuh kategori lain', gudangUntouched2);

  // tombol global "Centang Semua" — memengaruhi SEMUA kategori sekaligus
  const globalBtnVisibleBoss = await page.$eval('#sk-check-all', el => getComputedStyle(el).display !== 'none');
  check('Tombol global Centang Semua tampil (Mode Bos)', globalBtnVisibleBoss);
  await page.click('#sk-check-all');
  await page.waitForTimeout(300);
  await page.click('#g-confirm-ok');   // konfirmasi "Centang semua item di semua kategori?"
  await page.waitForTimeout(400);
  const allCheckedGlobal = await page.evaluate(() =>
    skState.items.Umum.every(i => i.checked) && skState.items.Gudang.every(i => i.checked));
  check('Centang Semua (global) menjangkau SEMUA kategori', allCheckedGlobal);
  const laGlobalCheck = await page.textContent('#sk-lastact');
  check('Centang Semua (global) tercatat di aktivitas', laGlobalCheck.includes('centang semua item'), laGlobalCheck.trim());

  // tombol global juga tampil di Mode Karyawan
  await page.click('#sk-exit-btn');
  await page.waitForTimeout(400);
  const globalBtnVisibleWorker = await page.$eval('#sk-check-all', el => getComputedStyle(el).display !== 'none');
  check('Tombol global Centang Semua tampil (Mode Karyawan)', globalBtnVisibleWorker);
  const catBtnsWorker = await page.$$('#sk-counter [data-catall]');
  check('Mini-tombol per-kategori TIDAK tampil di Mode Karyawan', catBtnsWorker.length === 0, catBtnsWorker.length + ' tombol');

  // ── DROPDOWN SEARCH PRODUK (fitur baru) ──
  await page.click('[data-mod="nota"]');
  await page.waitForTimeout(300);
  // reload di seksi stok mengosongkan tabel review (in-memory) — proses ulang dari draft tersimpan
  await page.click('#nk-parse-btn');
  await page.waitForTimeout(2500);
  // baris 38 = "Lilin Popular" (notfound) — dulu input teks polos, sekarang dropdown + search
  const trigs = await page.$$('#nk-table .cd-trigger');
  check('Baris notfound juga dapat dropdown', trigs.length === 43, trigs.length + ' dropdown');
  await trigs[37].click();
  await page.waitForTimeout(250);
  const searchInp = await page.$('#nk-cdfloat.open .cd-search input');
  check('Kotak search ada di dalam dropdown', !!searchInp);
  await searchInp.type('lilin');
  await page.waitForTimeout(350);
  const resItems = await page.$$('#nk-cdfloat.open [data-act="cdpick-db"]');
  check('Search DB memberi hasil', resItems.length > 0, resItems.length + ' hasil utk "lilin"');
  const learnBefore = await page.textContent('#nk-learn-chip');
  await resItems[0].click();
  await page.waitForTimeout(300);
  const learnAfter = await page.textContent('#nk-learn-chip');
  check('Pilih dari search → kamus bertambah', learnBefore !== learnAfter, learnBefore + ' → ' + learnAfter);

  // ── ARSIP PNL + DONUT (fitur baru) ──
  await page.click('[data-mod="pnl"]');
  await page.waitForTimeout(300);
  await page.click('.pn-subnav [data-view="arsip"]');
  await page.waitForTimeout(400);
  const arsChip = await page.textContent('#ar-count-chip');
  check('Arsip terisi otomatis dari Proses', /^[1-9]/.test(arsChip.trim()), arsChip);
  const donutPaths = await page.$$('#ar-donut [data-key]');
  check('Donut ter-render dengan slice', donutPaths.length >= 2, donutPaths.length + ' slice');
  const legRows = await page.$$('#ar-legend .ar-leg-row');
  check('Legend berlabel + nilai', legRows.length >= 2, legRows.length + ' baris');
  // interaksi: klik legend → detail muncul
  await legRows[0].click();
  await page.waitForTimeout(250);
  const detShow = await page.$eval('#ar-detail', el => el.classList.contains('show'));
  check('Klik legend → sorot + detail', detShow);
  await page.click('#ar-legend .ar-leg-row');   // re-query — legend di-render ulang
  await page.waitForTimeout(200);
  // search keterangan
  await page.fill('#ar-search', 'indah');
  await page.waitForTimeout(400);
  const arsChip2 = await page.textContent('#ar-count-chip');
  check('Search keterangan memfilter', arsChip2.trim().startsWith('1 /'), arsChip2);
  await page.fill('#ar-search', '');
  await page.waitForTimeout(400);
  // toggle jenis
  await page.click('#ar-jenis-seg [data-arj="p"]');
  await page.waitForTimeout(300);
  const centerLbl = await page.textContent('#ar-center-lbl');
  check('Toggle jenis Pengeluaran', /pengeluaran/.test(centerLbl), centerLbl);
  await page.click('#ar-jenis-seg [data-arj="all"]');
  // tabel entri
  const arsRows = await page.$$('#ar-table tbody tr');
  check('Tabel arsip berisi baris', arsRows.length >= 3, arsRows.length + ' baris');

  // ── LAPORAN PDF ARSIP: opsi print yang sama kini tersedia di tab Arsip ──
  const arPdfBtn = await page.$('#ar-pdf-btn');
  check('Tombol Laporan PDF ada di tab Arsip', !!arPdfBtn);
  await page.locator('#ar-pdf-btn').scrollIntoViewIfNeeded();
  const [reportArsip] = await Promise.all([
    page.context().waitForEvent('page'),
    page.click('#ar-pdf-btn'),
  ]);
  await reportArsip.waitForLoadState('load');
  await reportArsip.waitForTimeout(800);
  check('Laporan Arsip: judul benar', (await reportArsip.title()) === 'Laporan Arsip Pengeluaran & Prive — Toko Berkah');
  const arsipKpiCount = await reportArsip.evaluate(() => document.querySelectorAll('.kpi-card').length);
  check('Laporan Arsip: kartu KPI ter-render', arsipKpiCount === 6, arsipKpiCount + ' kartu');
  const arsipBars = await reportArsip.evaluate(() => document.querySelectorAll('.bar-row').length);
  check('Laporan Arsip: porsi per keterangan ter-render', arsipBars >= 1, arsipBars + ' baris');
  const arsipRinDays = await reportArsip.evaluate(() => document.querySelectorAll('.rin-day').length);
  check('Laporan Arsip: rincian per tanggal ter-render', arsipRinDays >= 1, arsipRinDays + ' hari');
  await reportArsip.close();

  // ── SEEKBAR AUTO-COLLAPSE (fitur baru) ──
  await page.evaluate(() => window.scrollTo(0, 200));
  await page.waitForTimeout(500);
  const railBefore = await page.$eval('#g-seek', el => el.classList.contains('rail'));
  check('Seekbar aktif saat scroll', !railBefore);
  await page.waitForTimeout(3400);
  const railAfter = await page.$eval('#g-seek', el => el.classList.contains('rail'));
  check('Idle 3 dtk → collapse jadi rail', railAfter);
  const railPE = await page.$eval('#g-seek', el => getComputedStyle(el).pointerEvents);
  check('Rail tembus klik (pointer-events none)', railPE === 'none', railPE);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const railWake = await page.$eval('#g-seek', el => el.classList.contains('rail'));
  check('Scroll → seekbar bangun lagi', !railWake);

  // ── TEMA ──
  await page.click('#g-theme-btn');
  await page.waitForTimeout(200);
  const theme1 = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.click('#g-theme-btn');
  await page.waitForTimeout(200);
  const theme2 = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('Toggle tema light↔dark (F8)', theme1 !== theme2, theme1 + '→' + theme2);

  // footer signature & about
  const sig = await page.textContent('.app-footer .sig');
  check('Signature Fable 5 di footer', sig.includes('Claude Fable'), sig.trim().slice(0,60));
  await page.click('#g-about-open');
  await page.waitForTimeout(300);
  const aboutOpen = await page.$eval('#g-about-overlay', el => el.classList.contains('open'));
  check('Modal Tentang terbuka', aboutOpen);

  // screenshot dua tema
  await page.click('.modal-x[data-close="g-about-overlay"]');
  await page.click('[data-mod="nota"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme','light'));
  await page.screenshot({ path: __dirname + '/shot-light.png', fullPage: false });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme','dark'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: __dirname + '/shot-dark.png', fullPage: false });

  check('Tidak ada JS error selama seluruh test', errors.length === 0, errors.slice(0,3).join(' | '));

  const fail = results.filter(r => !r.ok).length;
  console.log('\nSMOKE: ' + (results.length - fail) + '/' + results.length + ' lulus' + (fail ? ' · ' + fail + ' GAGAL' : ''));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

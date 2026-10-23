# Toko Berkah Mini

Telegram Mini App di atas Telegram Serverless (`tgcloud`) untuk Stok + HPP + Supplier,
dengan banyak pengguna pada satu database. Pengganti app single-file lama.

## Status

Semua fungsi app lama v1.5.0 sudah diport dan ter-deploy lewat GitHub Actions:

| Modul | Siapa | Isi |
|---|---|---|
| Stok | Bos | daftar utama, kategori, centang/qty/satuan, filter tanggal, aksi massal, teks order |
| Penerimaan | Karyawan (halaman utamanya) + Bos (inbox) | Karyawan: daftar pribadi seperti halaman karyawan app lama (tempel pesanan, centang = sudah diambil, qty/satuan, "Balasan ke Bos") + tombol **Setor**. Bos: notifikasi (spanduk + pesan Telegram), pratinjau barang yang diambil lawan daftar Bos, **Setujui** (logika "balasan" app lama: terpenuhi = centang dilepas, kurang = tetap tercentang dengan qty sisa) atau **Tolak** (barang kembali ke daftar karyawan) |
| HPP, Supplier | Bos | harga modal, margin (termasuk massal), riwayat harga supplier, tier termurah |
| Pengingat | Bos | jadwal mingguan & sekali-jadwal per supplier, pesan Telegram ke semua Bos; dicek tiap ada yang membuka app (tanpa cron, lihat catatan) |
| Nota Kulakan | Bos | impor CSV produk, pencocokan otomatis, kamus belajar, struk (cetak/WA/gambar), riwayat |
| PNL | Bos | parser teks harian, tabel harian/mingguan/bulanan/rincian, margin tertimbang, arsip + donut, CSV, laporan |
| Backup | Bos | export .json ke chat bot, restore merge dengan preview (format baru dan backup app lama, termasuk Nota & PNL) |

- `tgcloud/`: schema (17 tabel), lib murni (`money`, `tier`, `rules`, `shape`, `units`, `backup`, `reminders`, `match`, `nota`, `pnl`, `receipts`), `auth`, 47 endpoint
- `src/` + `index.html`: Mini App (Vite, JS biasa tanpa framework), tiga modul di topbar untuk Bos (Stok, Nota, PNL)
- `tests/`: `npm test` (lib, skrip CI, LocalStore, backup, pengingat, Nota, PNL, guard impor, sintaks) dan `npm run e2e` (Chromium, butuh browser)

Desain UI mengikuti app lama (`legacy/`): token warna ivory/arang + aksen crail, font Source Serif 4 /
Inter / JetBrains Mono, topbar, panel, kartu barang, pil sub-navigasi, tabel, modal, numpad, tema gelap.
Belum diport dari UI lama: panel Balasan/Log Bos (digantikan alur Setor + persetujuan), Export Excel,
donut ringkasan Supplier, seekbar, bottom-nav, laporan PDF berbagan grafik (diganti laporan cetak sederhana).

## Kecepatan (rasa lag)

Telegram Serverless punya latensi jaringan yang tidak bisa dihilangkan, jadi yang dilakukan adalah
**tidak menunggunya**:

- **Perubahan lokal seketika** (`src/optimistic.js`): centang, qty ±, satuan, tambah/hapus/urut barang
  dan seluruh daftar Penerimaan langsung tampil memakai aturan murni yang sama dengan server; server
  menyusul di belakang layar. Hasilnya diuji sama persis dengan hasil server (`tests/sync-test.js`).
- **Antrean berurutan** (`src/sync-core.js`): panggilan ke server dikirim satu per satu sesuai urutan ketukan;
  polling ditahan selama ada yang belum terkirim dan jawaban polling basi dibuang. Bila ada yang gagal,
  perubahan lokal dibatalkan dan data dimuat ulang penuh.
- **Buka cepat** (`src/cache.js`): data terakhir per pengguna Telegram ditampilkan dulu, lalu disegarkan di
  belakang layar. Tanpa cache, `me` dan data awal diminta bersamaan.
- **Render**: kartu yang tidak berubah dipakai ulang (`memo` di `views/shared.js`) dan kartu di luar layar
  tidak dihitung layout-nya (`content-visibility`). Dengan 300 barang pada CPU lambat (throttle 6x), satu
  centang turun dari ±1–2 detik menjadi ±0,25 detik, belum termasuk jaringan yang kini tidak ditunggu.

Yang tetap menunggu server: data awal pertama kali, aksi di modul Nota/PNL/HPP/Supplier, Setor, dan Setujui/Tolak.
Berkas offline (`berkah-offline.html`) tetap yang tercepat karena tanpa jaringan sama sekali.

## Mode offline (satu file `.html`)

Cadangan bila Telegram atau server sedang gangguan: satu berkas yang berjalan sendiri di browser,
tanpa Telegram dan tanpa server. Datanya tersimpan di perangkat itu (localStorage), satu pengguna (Bos),
semua modul (Stok, HPP, Supplier, Pengingat, Nota, PNL, Backup) dan logika bisnis yang sama (lib murni dan
`LocalStore`).

- Build: `npm run build:offline` menghasilkan `dist-offline/berkah-offline.html` (JS + CSS di dalam).
- Deploy otomatis menyalinnya ke `dist/berkah-offline.html` (dilayani di host Mini App; tombol "Versi offline" di Pengaturan)
  dan mengunggahnya sebagai artifact `berkah-offline` pada run Deploy.
- Tukar data dengan versi online lewat Backup/Restore (format sama, termasuk Nota dan PNL). Data offline TIDAK tersinkron
  otomatis; restore memakai merge dengan preview, jadi aman dilakukan berulang.
- Pengingat supplier hanya berbunyi (spanduk di app) selama berkas offline terbuka; tidak ada pesan Telegram.
- Font memakai Google Fonts bila ada koneksi; tanpa koneksi dipakai font sistem.

## Menjalankan frontend secara lokal

```
npm ci
npm run dev        # lalu buka http://localhost:5173/?dev=boss  (atau ?dev=worker, ?dev=pending)
```

`?dev=` memakai `src/local-store.js`: backend palsu di localStorage browser, tanpa Telegram.
Itu **bukan** sumber kebenaran: ia salinan manual logika endpoint (memakai lib murni yang
sama). Kalau endpoint berubah, ubah juga file itu. Di Telegram (initData ada) yang dipakai
`Telegram.WebApp.Serverless.call`, tanpa `?dev`.

Aturan keamanan frontend: `src/` dilarang mengimpor `config.js`, `boss-ids.js`, `auth.js`,
`store.js`, atau `sdk` (dijaga `tests/guard-test.js`), supaya ID Bos tidak masuk bundel publik.
Di CI, frontend dibangun SEBELUM `boss-ids.js` ditulis, dan ada pengecekan tambahan terhadap `dist/`.

## Deploy otomatis (GitHub Actions)

Satu kali, oleh pemilik (tidak bisa diotomasi):

1. Buat bot di @BotFather, aktifkan toggle Serverless, ambil token CLI.
2. Di repo GitHub: Settings > Secrets and variables > Actions, tambah dua secret:
   - `TGCLOUD_TOKEN`: token CLI (format `app<id>:<secret>`)
   - `BOSS_IDS`: telegram_user_id Bos, dipisah koma, mis. `123456789,987654321`
3. (Opsional) Settings > Environments > `production` > tambah required reviewer
   kalau mau persetujuan manual sebelum deploy.

Sesudah itu semuanya otomatis:

| Workflow | Kapan | Isi |
|---|---|---|
| `ci.yml` | PR / push non-main | `npm test` dan E2E browser |
| `deploy.yml` | push ke `main` / manual | test, build frontend, tulis `BOSS_IDS` ke `boss-ids.js`, cek kebocoran, `migrate --safe`, `push --force`, uji DB cloud (restore, pengingat, Nota/PNL; data sementara), diagnosa |
| `diagnose.yml` | tiap 6 jam / manual | status, webhook, skema, Mini App terlayani, smoke endpoint; gagal membuat issue berlabel `diagnosa`, pulih menutupnya |

Catatan:
- Pengingat supplier TIDAK punya pemicu terjadwal (cron Actions dihapus atas permintaan pemilik). Pengecekan terjadi tiap ~1 menit selama ada yang membuka Mini App; kalau tidak ada yang membuka app saat jamnya tiba, alarm utama baru berbunyi begitu app dibuka lagi pada hari yang sama (telat tetap berbunyi sekali per hari), sedangkan pra-alert bisa terlewat. Bila ingin pemicu mandiri, pulihkan `.github/workflows/reminders.yml` dari riwayat git (commit sebelum penghapusan).
- Runtime tgcloud tidak punya secret/env yang terdokumentasi, jadi `BOSS_IDS` disuntikkan
  ke kode saat deploy (`scripts/ci/gen-boss-ids.mjs`). `tgcloud/lib/boss-ids.js` di repo
  hanya placeholder; jangan commit isi aslinya.
- Perubahan skema yang destruktif (hapus kolom, ubah tipe) tidak diterapkan otomatis.
  Deploy gagal dengan pesan jelas; jalankan `npx tgcloud migrate` di terminal sendiri.
- `push --force` dipakai karena CI tidak punya snapshot lokal; jangan deploy manual
  bersamaan dengan CI.
- Smoke test hanya membaca (`me`, `getChanges`) memakai identitas Bos pertama.

## Dokumen

- `docs/AUDIT-SKEMA-MINI-APP.md`: audit app lama, keputusan, dan item terbuka
- `legacy/`: app lama v1.5.0 (`berkah-admin-1.5.0.html`), tes lamanya, dan `data/Products.csv`.
  Acuan perilaku; jalankan `node legacy/tests/match-test.js`.
- `docs/DOKUMENTASI-TEKNIS.md`, `docs/PANDUAN-PENGGUNA.md`: dokumentasi app lama

## Aturan yang dibawa dari app lama

Angka uang lewat `lib/money.js`, bukan `parseFloat`. Nilai presisi disimpan, pembulatan
hanya saat tampil. Harga terakhir dari supplier menimpa Harga Beli. Seri harga termurah
ditulis "N supplier". Karyawan tidak pernah menerima field modal: disaring di server
(`lib/shape.js`), bukan disembunyikan di UI.

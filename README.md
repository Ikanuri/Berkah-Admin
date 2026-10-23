# Toko Berkah Mini

Telegram Mini App di atas Telegram Serverless (`tgcloud`) untuk Stok + HPP + Supplier,
dengan banyak pengguna pada satu database. Pengganti app single-file lama.

## Status

Backend V1 dan frontend V1 sudah ada dan ter-deploy lewat GitHub Actions.

- `tgcloud/`: schema (6 tabel), lib murni (`money`, `tier`, `rules`, `shape`, `units`), `auth`, 21 endpoint
- `src/` + `index.html`: Mini App (Vite, JS biasa tanpa framework). Tab Stok (semua peran) dan HPP, Supplier, Pengguna (Bos)
- `tests/`: `npm test` (lib, skrip CI, LocalStore, guard impor, sintaks) dan `npm run e2e` (Chromium, butuh browser)

Belum ada: export/restore/import backup, pengingat (V2), Nota (V3), PNL (V4), mode offline satu file.

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
| `deploy.yml` | push ke `main` / manual | test, build frontend, tulis `BOSS_IDS` ke `boss-ids.js`, cek kebocoran, `migrate --safe`, `push --force`, diagnosa |
| `diagnose.yml` | tiap 6 jam / manual | status, webhook, skema, Mini App terlayani, smoke endpoint; gagal membuat issue berlabel `diagnosa`, pulih menutupnya |

Catatan:
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

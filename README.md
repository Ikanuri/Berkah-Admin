# Toko Berkah Mini

Telegram Mini App di atas Telegram Serverless (`tgcloud`) untuk Stok + HPP + Supplier,
dengan banyak pengguna pada satu database. Pengganti app single-file lama.

## Status

V1 backend (belum ada frontend, belum pernah di-deploy):

- `tgcloud/schema.js`: users, categories, items, suppliers, price_log, activity_log
- `tgcloud/lib/`: `money`, `tier`, `rules`, `shape` (permission), `auth`, `store`, `config`
- `tgcloud/endpoints/`: 21 endpoint (stok, HPP, supplier, pengguna, `getChanges` untuk polling)
- `tests/`: uji lib murni, skrip CI, dan cek sintaks (`npm test`)

Belum ada: frontend (Vite), export/restore/import backup, pengingat (V2), Nota (V3), PNL (V4).

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
| `ci.yml` | PR / push non-main | `npm test` |
| `deploy.yml` | push ke `main` / manual | test, tulis `BOSS_IDS` ke `boss-ids.js`, `migrate --safe`, `push --force`, diagnosa |
| `diagnose.yml` | tiap 6 jam / manual | status, webhook, skema, smoke endpoint; gagal membuat issue berlabel `diagnosa`, pulih menutupnya |

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

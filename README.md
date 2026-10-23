# Toko Berkah Mini

Telegram Mini App di atas Telegram Serverless (`tgcloud`) untuk Stok + HPP + Supplier,
dengan banyak pengguna pada satu database. Pengganti app single-file lama.

## Status

V1 backend (belum ada frontend, belum pernah di-deploy):

- `tgcloud/schema.js`: users, categories, items, suppliers, price_log, activity_log
- `tgcloud/lib/`: `money`, `tier`, `rules`, `shape` (permission), `auth`, `store`, `config`
- `tgcloud/endpoints/`: 21 endpoint (stok, HPP, supplier, pengguna, `getChanges` untuk polling)
- `tests/`: uji lib murni dan cek sintaks (`npm test`)

Belum ada: frontend (Vite), export/restore/import backup, pengingat (V2), Nota (V3), PNL (V4).

## Sebelum deploy pertama

1. Isi `BOSS_IDS` di `tgcloud/lib/config.js` dengan telegram_user_id pemilik.
2. Buat bot di @BotFather, aktifkan Serverless, `npx tgcloud login` (interaktif).
3. `npx tgcloud migrate` lalu `npx tgcloud push`. Kode dan skema dideploy terpisah.

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

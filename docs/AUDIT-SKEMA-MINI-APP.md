# Audit Skema App Lama → Mini App (menutup item terbuka §15 blueprint)

Sumber audit: `index.html` dan `docs/DOKUMENTASI-TEKNIS.md` di repo ini.
Tidak ada kode app lama yang diubah.

## 0. Temuan penting soal versi

Salinan repo ini **belum memuat** fitur yang disebut blueprint sebagai bagian
v1.3.0–v1.5.0: tidak ada `reminder`/`Pengingat` dan tidak ada `supRank`/tier
termurah (grep di `index.html` = 0 hasil). Tidak ada key `stok-hpp-reminders`
di Peta localStorage (§4 dok teknis).

Skema `reminders_*` dan logika tier di blueprint tidak bisa diaudit dari repo
ini. Butuh kode dari `Ikanuri/html5-project` (`apps/berkah-admin/`, v1.5.0).

## 1. Stok — bentuk data sebenarnya

`stok-boss-data` (= `skState`) bukan array per kategori seperti sketsa blueprint:

```js
{ cats: string[], activecat, items: { [namaKategori]: Item[] },
  output, reply, log, mode, outCatEx: string[], lastAct: {ts, desc} }
Item = { id, name, qty, unit, checked, checkedAt,
         isi?, satuanHpp?, hargaBeli?, hargaJual? }   // field HPP undefined bila kosong
```

Konsekuensi untuk skema:

1. **Kategori dikenali lewat NAMA, tidak punya id.** Migrasi harus membuat
   `categories.id` baru dan memetakan lewat nama. `outCatEx` (kategori yang
   dikecualikan dari "Order ke Karyawan") juga berupa nama, jadi perlu kolom
   `categories.exclude_from_order BOOLEAN`.
2. **`Item.id` adalah string dari `makeId()`**, bukan integer. Pakai
   `items.id TEXT PRIMARY KEY` dan pertahankan id lama. Kalau tidak,
   `price_log.itemId` putus, dan merge restore (kunci = id) tidak bisa jalan.
3. **Ada DUA state paralel**: `skState` (bos) dan `skWorker` (karyawan, punya
   `cats`/`items` sendiri), dihubungkan teks `output`/`reply` ala WhatsApp
   (`processReply`). `skWorker` tidak masuk backup gabungan. Di model baru yang
   satu database ini runtuh jadi satu daftar. **Keputusan produk yang belum
   dibahas**: apakah alur "bos kirim order teks ke karyawan, karyawan balas
   teks" tetap ada, atau diganti centang langsung pada daftar yang sama?
   Skema `items` di blueprint mengasumsikan yang kedua.
4. `lastAct` (jejak aktivitas terakhir) dipakai membandingkan dua device saat
   sync. Dengan mutasi per-baris dan `updated_at` ia tidak lagi dibutuhkan.
   Ganti dengan tabel `activity_log` (juga memenuhi usulan audit permission).
5. `PIN`, `stok-ver`, `stok-boss-exp`, `stok-timeout` mati sepenuhnya (digantikan
   role Telegram). `stok-oor` dan `stok-output-ts` adalah preferensi tampilan,
   tetap di klien.

## 2. Harga & supplier

- `stok-hpp-suppliers` adalah `string[]`. Supplier hanya berupa nama, tanpa id.
- `stok-hpp-pricelog`: `{id, ts, tanggal, supplier, itemId, nama, unit, hargaBeli}`.
  `supplier` berupa **nama string**, bukan id. Migrasi memetakan nama ke
  `suppliers.id` (nama harus UNIK; tambahkan unique index di aplikasi).
- Aturan yang harus dibawa: setiap input harga supplier menambah baris log
  **dan** menimpa `item.hargaBeli` (`index.html:4989-4990`).
- Restore lama: `stok.boss` diganti utuh, sedangkan suppliers (per nama) dan
  pricelog (per `id`) di-**union**, tidak pernah dihapus.

## 3. PNL — koreksi terhadap blueprint

`brk-pnl-days` = `{ 'YYYY-MM-DD': {income,kulakan,cash,receh,totalPengeluaran,
totalPrive,rincianPengeluaran,rincianPrive,gross,netPos,marginP,marginC} }`

- `rincianPengeluaran` dan `rincianPrive` keduanya `Array<{jumlah, ket}>`
  (`index.html:2722-2723`). Simpan sebagai `TEXT` JSON di `pnl_days`.
  Pecahan ke tabel anak tidak perlu: tidak pernah di-query per baris.
- Nama kolom blueprint (`margin_p`, `net_pos`) sudah sesuai pola camelCase → snake_case.
- **`pnl_arsip` BUKAN ledger append-only.** Bentuknya
  `{ 'YYYY-MM-DD': [{j:'p'|'v', amt, ket}] }` dan **diganti utuh per tanggal**
  tiap `pnProcess` (idempoten, dok teknis §7). Isinya diturunkan dari
  `rincian*` pada `pnl_days`. Hapus per tanggal di Harian dan Arsip juga
  **independen** (sengaja). Koreksi blueprint §3.3 dan §5: perlakukan
  `pnl_arsip` sebagai snapshot per tanggal (hapus-lalu-tulis dalam satu batch),
  dan kolomnya `tanggal, jenis, amt, ket` seperti sketsa sudah benar.
- Tanggal kunci dikanonisasi lewat `pnToInput`, jadi format `YYYY-MM-DD` zero-padded.
- Draft `brk-pnl-raw` tetap lokal (sudah di daftar "tidak dibawa").

## 4. Nota Kulakan — koreksi besar pada `nota_db`

Baris DB produk sebenarnya (dok teknis §5, "Struktur baris DB"):

```js
{ nama, hargaJual, hargaPokok, satuan, satClass, kode, barcode }
```

Kolom di blueprint `induk_nama`, `induk_kode`, `satuan_dasar`, `rasio` **tidak
ada** di app lama. Pakai kolom yang nyata: `nama, harga_jual, harga_pokok,
satuan, sat_class, kode, barcode`. `_tok`/`_nn` adalah cache runtime, jangan
disimpan. `nota_dbmeta` (`{count, updated}`) turunan: cukup hitung dari tabel,
atau satu baris di tabel `meta`.

- `nota_learn`: `{ "tokenNama|kelasSatuan": "Nama Produk DB" }` → `kunci PK, nilai TEXT`. Sesuai blueprint.
- `nota_hist` (maks 100, terbaru dulu):

  ```js
  { id, num, dateStr, timeStr, ket, total, savedAt,
    lines: [{ nama, qty, satuan, harga, sub, flag }] }
  ```

  Skema: kolom `id, num, date_str, time_str, ket, total, saved_at`, plus
  `lines TEXT` (JSON). Batas 100 diterapkan saat insert (hapus yang tertua).
- **`brk-nota-counter` rawan balapan di multi-user**: dua orang menyimpan
  bersamaan bisa mendapat nomor `KLK-xxx` yang sama. Nomor harus diberikan server
  secara atomik (satu baris counter di-UPDATE dan dibaca dalam satu operasi,
  atau pakai rowid autoincrement). Jangan dihitung di klien.

## 5. Format backup lama (`backupAll`, `index.html:5949`)

```js
{ app:'berkah-aio', version:1, exported,
  nota:{ db, dbmeta, learn, hist, counter },
  pnl:{ raw, days, arsip },
  stok:{ boss:{...skState, mode:'worker'}, suppliers, pricelog } }
```

`importLegacyBackup` harus menolak jika `app !== 'berkah-aio'` (sama seperti
`restoreAll`). Perhatikan: `skSanitizeImport` men-de-dup `item.id` yang
bentrok dan mengisi `checkedAt`, jadi importer perlu melakukan hal yang sama.
`pnl.raw` dan `stok.worker` tidak perlu diimpor.

## 6. Keputusan yang sudah diambil (sesi ini)

| Topik | Keputusan |
|---|---|
| Akses | Mini App di Telegram, auth `initData` (tanpa Login Widget) |
| Bos pertama | `telegram_user_id` di-hardcode di konfigurasi saat deploy |
| Restore backup | Merge dengan preview (kunci: `items.id`, `price_log.id`, tanggal PNL, `nota_learn.kunci`), bukan full-overwrite |
| Frontend | Dengan build step (Vite); target kedua `offline.html` satu file via adapter penyimpanan `RemoteStore`/`LocalStore`, logika bisnis dipakai bersama |
| Permission | Pengecekan role di server per endpoint + pembuangan field modal untuk `worker`; user baru berstatus `pending` sampai disetujui Bos; `activity_log` |

## 7. Item §15 yang masih terbuka

- [ ] Alur order teks bos↔karyawan (butir 1.3) tetap ada atau diganti centang bersama?
- [ ] Kode reminder dan tier dari `html5-project` v1.5.0 (butir 0) untuk mengaudit `reminders_*`.
- [ ] §7 blueprint: tabel mana yang delta-polling. Usulan: `items`, `price_log`,
      `nota_learn` pakai `updated_at`/`since`; tabel kecil (`categories`, `suppliers`) fetch penuh.
- [ ] §9: apakah `tgcloud` punya cron (butuh baca dokumentasi di luar halaman yang sudah dibaca).
- [ ] Urutan fase §13 (usulan blueprint tidak dibantah, tapi belum dikonfirmasi).

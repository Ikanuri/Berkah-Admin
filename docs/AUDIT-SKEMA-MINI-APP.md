# Audit Skema App Lama → Mini App (menutup item terbuka §15 blueprint)

Sumber audit: `index.html` dan `docs/DOKUMENTASI-TEKNIS.md` di repo ini.
Tidak ada kode app lama yang diubah.

## 0. Sumber audit

Audit awal memakai `index.html` di root (versi lebih tua, tanpa Pengingat dan
Tier). Tambahan §8 memakai `legacy/berkah-admin-1.5.0.html` (v1.5.0, 6866
baris), yang jadi acuan resmi. §1-§5 ditulis dari file lama; kunci
localStorage dan format backup sudah dicocokkan ke v1.5.0 (lihat catatan di
§5), tetapi isi fungsi Nota dan PNL belum dibaca ulang di v1.5.0.

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

**Di v1.5.0** `stok` bertambah `reminders: hppReminders` (baris 6612), jadi
format yang harus diimpor: `stok:{boss, suppliers, pricelog, reminders}`.
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

## 7. Audit v1.5.0: Pengingat, Tier, HPP, alur order (`legacy/berkah-admin-1.5.0.html`)

### 7.1 Pengingat Supplier: koreksi besar pada skema blueprint
`stok-hpp-reminders` = `{ [namaSupplier]: { recurring, oneOff[] } }`

```js
recurring: null | { days:number[] /*0=Min..6=Sab, Date.getDay()*/, time:'HH:MM',
                    preAlertMin:number|null, lastFiredDate:'YYYY-MM-DD'|null,
                    lastPreFiredDate:'YYYY-MM-DD'|null }
oneOff[]:  { id, ts /*epoch ms*/, preAlertMin|null, firedAt|null, preFiredAt|null }
```

- `days` adalah **angka 0-6**, bukan teks `["Sen","Kam"]` seperti sketsa blueprint.
- **`oneOff` BUKAN ledger.** Entrinya dibuang dari daftar begitu alarm
  ON-TIME berbunyi (`keep = false`, baris 5646). Jangan masukkan ke golongan
  ledger di blueprint §3.3. Mini App boleh menyimpan riwayatnya (`fired_at`)
  sebagai perbaikan, tapi itu perubahan perilaku, bukan port.
- Waktu selalu **jam lokal** (`new Date(y,m,d,hh,mm)`). Server tidak punya
  zona waktu toko; simpan konstanta `Asia/Jakarta` di konfigurasi dan hitung
  `due` dengan zona itu. Jangan pakai UTC server.
- Pra-alert hanya bunyi jika `preMs <= now < onMs`; alarm utama bunyi jika
  `now >= onMs` dan `lastFiredDate != hari ini`. Jendela ini harus dipertahankan
  di scheduler server supaya tidak bunyi ulang tiap tick dan tidak bunyi untuk
  jam yang sudah lama lewat.
- Scheduler lama: `setInterval` 20 dtk, hanya jalan jika `skIsBoss()`. Di
  Mini App, penerima pesan Bot API = user Bos; siapa yang menerima (semua Bos
  atau Bos yang membuat) belum diputuskan.
- Rename supplier **memindahkan** pengingat ke nama baru dan merenames
  `price_log.supplier`; hapus supplier **menghapus** pengingatnya tetapi
  **mempertahankan** `price_log`. Dengan `price_log.supplier_id` ini berarti
  `suppliers` butuh soft-delete (`deleted_at`) atau `price_log` menyimpan
  `supplier_name` snapshot. Tanpa FK DB (batasan tgcloud), ini wajib ditegakkan
  di kode.
- Merge lama: `oneOff` union per `id`; `recurring` hanya mengisi yang kosong,
  tidak pernah menimpa jadwal yang sudah ada. Pertahankan untuk restore merge.
- Skema usulan: `reminders_recurring(supplier_id PK, days TEXT /*JSON angka*/,
  time, pre_alert_min, last_fired_date, last_pre_fired_date)` dan
  `reminders_oneoff(id TEXT PK, supplier_id, ts, pre_alert_min, fired_at,
  pre_fired_at)`. Skema blueprint sudah mendekati; yang salah hanya format `days` dan klasifikasi ledger.

### 7.2 Tier Termurah (`supRankFromEntries`, baris 5351)
Murni, mudah dipindah ke `lib/tier.js`:
- Ambil entri **terbaru** (`ts` terbesar) per supplier, urutkan `hargaBeli` naik.
- Pemenang = **semua** supplier dengan `hargaBeli` sama dengan yang termurah
  (perbandingan harga, bukan nama). Satu pemenang → tampil namanya; seri →
  "N supplier". Catatan: perbandingan memakai `===` pada float, sesuai
  perilaku lama; jangan diganti toleransi tanpa test.
- Detail panel memakai `maxHarga` sebagai penyebut bar (`e.hargaBeli/maxHarga`).
  Jika semua harga 0 maka NaN. Input harga sudah dibatasi `> 0` (baris 4986),
  jadi aman selama aturan itu dipertahankan di endpoint.
- `supFilteredLog()` menyaring log menurut rentang tanggal; tier mengikuti filter itu.

### 7.3 Fungsi HPP murni (siap dipindah ke `lib/money.js`)
`hppParseAngka`, `hppRound`, `hppFmtNum`, `hppInpVal`, `hppCost`, `hppPctOf`
(baris 4833-4887) tidak menyentuh DOM atau `localStorage`. Catatan:
- `hppFmtNum` memakai `toLocaleString('id-ID')`; hasilnya bergantung ICU
  runtime. Di runtime server tanpa Intl lengkap, tulis formatter manual.
- `hppParseAngka("2.500")` = 2500 (ribuan), `"0.5"` = 0.5, `"1.500,75"` = 1500.75.
  Test `tests/hpp-math-test.js` sudah ada sebagai acuan; port test-nya ikut.
- `hppCost = hargaBeli / isi` (nol jika salah satu <= 0).

### 7.4 Alur order teks bos ↔ karyawan: yang sebenarnya terjadi
- `skBuildOutput()` hanya **membuat teks dari item yang dicentang**
  (`"qty unit nama"` per baris, dikelompokkan per tanggal). Itu untuk disalin
  ke WhatsApp. Kategori di `outCatEx` dikecualikan.
- `skOnOutputChange()`: mengedit teks output **menggeser balik** ke item
  (centang, qty, satuan). Ini jalur karyawan→bos lewat tempel teks.
- `skProcessReply()` (baris 4567) adalah fitur bisnis nyata, bukan sekadar
  transport: balasan `qty` >= pesanan → item di-**uncheck** (terpenuhi);
  balasan < pesanan → item tetap tercentang dengan `qty = sisa`
  (`parseFloat((qty - balasan).toFixed(3))`). Ini **pemenuhan sebagian**.
- Rekomendasi: di Mini App hapus jalur tempel dua arah (karena database
  bersama), tetapi **pertahankan** (a) tombol "salin teks order" dari item
  tercentang untuk dikirim ke supplier via WA, dan (b) aksi "terima barang
  (qty)" sebagai endpoint `fulfillItem` dengan aturan pemenuhan sebagian di
  atas. Yang dihapus hanya `skWorker` sebagai state terpisah.
  **Menunggu persetujuan Anda.**

## 8. Item §15 yang masih terbuka

- [ ] Persetujuan rekomendasi 7.4 (satu daftar bersama, order teks tetap sebagai ekspor, `fulfillItem` menggantikan `processReply`).
- [ ] Siapa yang menerima pesan pengingat via Bot API (semua Bos atau pembuat jadwal).
- [ ] Soft-delete supplier vs snapshot nama di `price_log` (7.1).
- [ ] §7 blueprint: tabel mana yang delta-polling. Usulan: `items`, `price_log`,
      `nota_learn` pakai `updated_at`/`since`; tabel kecil (`categories`, `suppliers`) fetch penuh.
- [ ] §9: apakah `tgcloud` punya cron (butuh baca dokumentasi di luar halaman yang sudah dibaca).
      Jika tidak, tick pengingat bisa dipicu dari polling klien, dengan jendela 7.1 mencegah bunyi ganda.
- [ ] Urutan fase §13 (usulan blueprint tidak dibantah, tapi belum dikonfirmasi).

# Dokumentasi Teknis — Toko Berkah All-in-One

**Aplikasi:** `index.html` — single-file HTML5, vanilla JS, tanpa framework, tanpa build step
**Repo:** `ikanuri/berkah-admin` · branch `claude/wholesale-order-app-8pc9x1`
**Status:** Produksi · Juli 2026
**Ditulis untuk:** developer/AI manapun yang melanjutkan pengembangan tanpa perlu bertanya ulang ke pemilik produk.

> Dokumen ini adalah penerus dari tiga dokumen asal:
> `Dokumentasi Teknis App Toko Berkah.md` (PNL + Nota), `SPEC stok kosong technical.md`,
> dan riwayat percakapan rebuild. Semua keputusan desain di sini **final dan disengaja** —
> baca bagian *Riwayat Bug* sebelum menyentuh apapun.

---

## Daftar Isi

1. [Ringkasan & Filosofi Arsitektur](#1-ringkasan--filosofi-arsitektur)
2. [Struktur File & Cara Mengedit](#2-struktur-file--cara-mengedit)
3. [Aturan Wajib (Tidak Boleh Dilanggar)](#3-aturan-wajib-tidak-boleh-dilanggar)
4. [Peta localStorage](#4-peta-localstorage)
5. [Modul 1 — Nota Kulakan](#5-modul-1--nota-kulakan)
6. [Mesin Pencocokan Produk](#6-mesin-pencocokan-produk)
7. [Modul 2 — PNL Analyzer + Arsip](#7-modul-2--pnl-analyzer--arsip)
8. [Modul 3 — Stok Kosong](#8-modul-3--stok-kosong)
9. [Fitur Global: Tema, Sync, Backup, Seekbar](#9-fitur-global-tema-sync-backup-seekbar)
10. [Design Tokens (UI ala Claude)](#10-design-tokens-ui-ala-claude)
11. [Testing](#11-testing)
12. [Riwayat Bug (Jangan Diulangi)](#12-riwayat-bug-jangan-diulangi)
13. [Roadmap yang Sudah Didiskusikan](#13-roadmap-yang-sudah-didiskusikan)
14. [Catatan dari Fable 5](#14-catatan-dari-fable-5)

---

## 1. Ringkasan & Filosofi Arsitektur

Satu file `index.html` (±210 KB) berisi tiga aplikasi toko grosir:

| Modul | Prefix kode | Fungsi |
|---|---|---|
| **Nota Kulakan** | `nk` | Daftar belanja teks bebas → cocokkan ke DB produk CSV → nota thermal |
| **PNL Analyzer** | `pn` / `ars` | Template harian ber-hashtag → analisis profit-loss + arsip pengeluaran/prive |
| **Stok Kosong** | `sk` / `hpp` / `sup` | Checklist stok dua-mode (Bos ↔ Karyawan) dengan PIN & sync + sub-tab HPP (kalkulator harga pokok) & Supplier (banding harga), boss-only |

Prefix global: `g` (shell, tema, sync, modal bersama).

**Kenapa single-file:** distribusi via WhatsApp (kirim 1 file, buka di browser HP),
100% offline setelah file diterima, tanpa install, tanpa server. Jalur upgrade yang
disepakati: single-file → hosting Cloudflare Pages (HTTPS mengaktifkan Web Share &
kamera) → bungkus Capacitor jika suatu saat perlu APK — **tanpa tulis ulang**.

**Stack:** HTML + CSS + vanilla ES2020. Dependensi eksternal hanya dua, keduanya
opsional & di-guard: Google Fonts (fallback ke font sistem saat offline) dan PeerJS
via CDN (lazy-load hanya saat fitur sync dibuka; gagal muat → toast, fitur lain aman).

---

## 2. Struktur File & Cara Mengedit

`index.html` tersusun berurutan (cari komentar banner `═══` untuk navigasi):

```
<head>  CSS lengkap — design tokens :root & [data-theme=dark], semua komponen
<body>  Markup: topbar → modul nota → pnl (subnav analisis|arsip) → stok
        → footer signature → nav bawah mobile → seekbar → semua modal
<script> blok 1: CORE     — util ($, esc, fmtRp, lsGet/lsSet, toast, confirm,
                            tema, switchModule, kalkulator bersama)
<script> blok 2: ENGINE   — mesin pencocokan, di antara marker
                            /*ENGINE-START*/ … /*ENGINE-END*/  ← JANGAN hapus marker
<script> blok 3: NOTA     — modul nk*
<script> blok 4: PNL      — modul pn* + arsip ars*
<script> blok 5: STOK     — modul sk*
<script> blok 6: SYNC+INIT— sync WebRTC, backup gabungan, seekbar, initApp()
```

**Marker `/*ENGINE-START*/ … /*ENGINE-END*/` adalah kontrak dengan test suite** —
`tests/match-test.js` mengekstrak isi di antara marker itu dan menjalankannya di Node.
Mengubah mesin tanpa menjalankan test = dilarang.

Repo:
```
index.html          aplikasi final (satu-satunya file yang dipakai user)
data/Products.csv   data produk toko (skema rujukan, 2.774 baris) — fixture test
tests/              match-test.js · smoke.js · smoke-mobile.js · template.txt
docs/               dokumen ini + PANDUAN-PENGGUNA.md
```

---

## 3. Aturan Wajib (Tidak Boleh Dilanggar)

Setiap aturan lahir dari bug nyata (lihat §12):

1. **NOL inline event handler.** Tidak ada `onclick=`/`onchange=` di HTML maupun di
   string template. Semua listener dipasang di `initApp()` / init modul.
2. **Event delegation untuk elemen dinamis.** Tabel review Nota memakai SATU listener
   `click`/`change`/`input` di `#nk-table` dengan `data-act` + `data-i`. Opsi dropdown
   dirujuk lewat **indeks** (`data-oi`, `data-dbi`), bukan menanam nama produk di
   atribut (nama bisa mengandung kutip).
3. **Semua parsing tanggal LOKAL.** `new Date(y, m-1, d, 0,0,0,0)` — tidak pernah
   `new Date('YYYY-MM-DD')` (itu UTC midnight → geser tanggal di WIB).
4. **Escape semua data user** sebelum masuk innerHTML — helper `esc()`.
5. **`skActive()` untuk semua operasi item Stok** — tidak pernah `skState` langsung
   kecuali fungsi khusus-bos (kategori, PIN, log, reply, export, **HPP, Supplier**).
6. **`state.mode` di storage Stok tidak pernah `'boss'`** — selalu `'worker'`
   (backup/sync tidak boleh bisa bypass PIN).
7. **Jangan pakai class CSS `empty` untuk state lain** — sudah dipakai empty-state
   panel dengan padding besar. Pelajaran dari bug kalkulator (§12 #G3).
8. **Font input ≥16px di viewport mobile** (media ≤700px) — mencegah auto-zoom browser.
9. **String besar (laporan PDF) tidak pernah template-literal ber-backtick nested** —
   laporan dibangun dengan concatenation + `fungsi.toString()` + dibuka via **Blob URL**.
10. **Satuan item Nota selalu milik input user** — DB tidak pernah menimpanya.

---

## 4. Peta localStorage

| Key | Modul | Isi |
|---|---|---|
| `brk-theme` | Global | `'light' \| 'dark' \| 'auto'` |
| `brk-active-module` | Global | modul terakhir dibuka |
| `brk-nota-db` | Nota | array produk hasil parse CSV (lihat §5) |
| `brk-nota-dbmeta` | Nota | `{count, updated}` — label status DB |
| `brk-nota-learn` | Nota | kamus belajar `{ "tokenNama\|kelasSatuan": "Nama Produk DB" }` |
| `brk-nota-hist` | Nota | riwayat nota (maks 100, terbaru dulu) |
| `brk-nota-counter` | Nota | counter nomor nota (naik saat "Simpan ke Riwayat") |
| `brk-nota-draft` | Nota | `{input, ket, num}` — draft auto-save |
| `brk-pnl-raw` | PNL | draft teks kotak input saja (auto-save, debounce 500ms) — BUKAN sumber tampilan Analisis, cuma draft ketikan |
| `brk-pnl-days` | PNL | **riwayat permanen per tanggal** — `{ 'YYYY-MM-DD': {income,kulakan,cash,receh,totalPengeluaran,totalPrive,rincianPengeluaran,rincianPrive,gross,netPos,marginP,marginC} }`. Setiap proses = upsert per tanggal (lihat §7) |
| `brk-pnl-arsip` | PNL | `{ 'YYYY-MM-DD': [{j:'p'\|'v', amt:Number, ket:String}] }` |
| `stok-boss-data` | Stok | state bos **(key WARISAN app lama — jangan ganti, zero-migration)**. Field baru: `outCatEx: string[]` (§8), `lastAct: {ts, desc}` (§8) |
| `stok-worker-data` | Stok | state karyawan. Field baru: `lastAct: {ts, desc}` (§8) |
| `stok-pin` | Stok | SHA-256 hex PIN |
| `stok-ver` | Stok | versi skema (`'7'`) — mismatch → PIN **dan** sesi bos dihapus |
| `stok-boss-exp` | Stok | epoch ms kedaluwarsa sesi bos |
| `stok-timeout` | Stok | menit timeout (0 = tidak pernah) |
| `stok-oor` | Stok | tampilan item di luar filter: `'dim' \| 'hide'` |
| `stok-output-ts` | Stok | header tanggal di output: `'show' \| 'hide'` |
| `stok-hpp-suppliers` | Stok (HPP) | `string[]` — daftar nama supplier |
| `stok-hpp-pricelog` | Stok (HPP) | `[{id, ts, tanggal, supplier, itemId, nama, unit, hargaBeli}]` — riwayat harga, append-only. `isi`/`hargaBeli`/`hargaJual` HPP itu sendiri **bukan** key terpisah — nempel di item `stok-boss-data` (lihat §8) |

Total pemakaian tipikal (DB 2.774 produk + arsip setahun) ±600 KB — jauh di bawah kuota ±5 MB.

---

## 5. Modul 1 — Nota Kulakan

### Alur data
```
Products.csv ──parseProductsCSV──▶ brk-nota-db (sekali, persisten)
input teks ──parseKulakanLine──▶ nkItems[] ──matchProduct──▶ review table
review ──nkBuildReceipt──▶ nota thermal ──▶ print / WA teks / WA gambar / riwayat
```

### Skema CSV produk (satu-satunya yang didukung)
```
nama,kode_produk,barcode,satuan,harga_jual,harga_beli,induk_nama,induk_kode,satuan_dasar,rasio
```
Kolom `satuan` **sudah berupa label teks bersih** (`Slop`, `Pak`, `Biji`, `Dos`,
…) — beda dari skema Griyo POS lama yang memakai kode angka (`1`, `9`, `12`…)
dan mengharuskan derivasi/tebakan dari suffix `Kode Produk`. Migrasi ke skema
ini (Juli 2026) **menghapus** `SATUAN_CODE_MAP` dan `rowSatuanLabel()` — satuan
tinggal di-trim langsung dari kolom `satuan`, tidak ada lagi logika tebak-tebak.
Separator koma; deteksi `;` vs `,` tetap dipertahankan sebagai toleransi kuirk
ekspor Excel-locale, **bukan** dukungan skema alternatif.

Kolom `induk_nama`/`induk_kode` (relasi produk induk-varian) dan `satuan_dasar`/
`rasio` (konversi satuan, mis. 1 Ret = 10 pcs) ada di sumber data tapi **belum
dipakai fitur apapun** — di-skip saat parsing, bukan disimpan ke DB runtime.
`harga_beli` (harga modal) diparse ke `hargaPokok` untuk kelengkapan struktur,
tapi juga belum dipakai fitur manapun.

### Struktur baris DB
```js
{ nama, hargaJual, hargaPokok, satuan /*label tampil, langsung dari CSV*/,
  satClass /*kelas cocok — lihat §6*/, kode, barcode }
// cache runtime (tidak disimpan): _tok (token nama), _nn (string cari)
```

### Struktur item review (`nkItems[i]`)
```js
{ id, raw, qty, satuan /*persis ketikan user*/, namaInput,
  sel /*baris DB terpilih|null*/, harga, status, score,
  options: [{row, group:'varian'|'saran'}], confirmed:Boolean }
```

### Status & aturan konfirmasi
| Status | Strip | Arti | Perlakuan |
|---|---|---|---|
| `ok` | hijau | skor ≥0.85 + baris satuan cocok + harga tunggal | otomatis |
| `ambiguous` | kuning | skor 0.45–0.85 | chip klik = konfirmasi, atau pilih dropdown |
| `satuan_missing` | kuning | nama pasti (≥0.85) tapi satuan yang diminta tak ada barisnya | pilih varian |
| `notfound` | merah | skor <0.45 / tak ada kandidat | search DB di dropdown / isi harga manual |
| `error` | merah | baris gagal parse | perbaiki input |

Generate dengan baris belum-terkonfirmasi → dialog konfirmasi; baris itu ditandai
`?` merah di nota. **Tidak pernah ada tebakan senyap.**

### Dropdown produk
Setiap baris (termasuk merah) memakai dropdown custom dengan **kotak cari sticky**
di atasnya (`nkSearchDb`: semua token query harus substring dari nama ternormalisasi;
rank prefix-token-pertama; maks 20 hasil). Memilih dari daftar apapun →
`nkPickRow()` → set harga + `confirmed` + **tulis kamus belajar**.
Fokus otomatis ke kotak cari hanya di desktop (≥701px) supaya keyboard HP tidak
langsung membuka.

**Arsitektur "portal" (satu elemen bersama, bukan satu per baris).** Awalnya tiap
baris punya `<div class="cd-list">` sendiri, `position:absolute` relatif ke
barisnya, hidup di dalam `.tbl-wrap` (`overflow-x:auto` untuk scroll horizontal
di HP). Masalah: menurut spesifikasi CSS, kalau satu sumbu overflow diset
non-`visible` sementara sumbu lain `visible`, browser diam-diam menghitung
sumbu yang `visible` itu jadi `auto` juga — jadi `.tbl-wrap` ikut mengklip
`overflow-y`, dan dropdown baris-baris bawah (yang secara visual menjorok di
luar tinggi tabel) terpotong tak bisa diklik. Baris teratas jarang kena karena
dropdownnya masih muat di area yang belum diklip.

Fix: satu elemen `#nk-cdfloat` (`position:fixed`) di-taruh di level `<body>`,
di luar `.tbl-wrap` sepenuhnya sehingga kebal dari klip overflow apapun.
- `nkOpenDropdown(i, triggerEl)` — isi konten via `nkFillFloat(i)`, hitung
  posisi via `nkPositionFloat(triggerEl)` (pakai `getBoundingClientRect()`:
  buka ke bawah jika ruang cukup, else lipat ke atas), lalu tambah class `open`.
- `nkPositionFloat` juga meng-clamp `left` supaya lebar dropdown tidak keluar
  layar di HP sempit.
- Klik/­input di dalam float ditangani oleh satu listener delegated yang
  dipasang sekali saat init (`data-act="cdpick"` / `"cdpick-db"` / `"cdsearch"`),
  bukan lagi listener per-baris.
- **Jebakan timing scroll**: menutup dropdown saat `scroll` (karena posisi jadi
  tidak valid setelah halaman bergeser) awalnya naif — `scrollIntoView()` yang
  dipanggil sesaat sebelum membuka dropdown kadang memicu event `scroll` native
  yang baru sampai *setelah* dropdown terbuka, sehingga dropdown yang baru saja
  dibuka langsung tertutup sendiri. Difix dengan `nkOpenedAt` (timestamp saat
  dibuka) + jendela toleransi 150ms: `scroll` yang datang dalam 150ms sejak buka
  diabaikan, scroll sesudahnya tetap menutup seperti mestinya.
- `resize` juga menutup dropdown (posisi absolut jadi tidak relevan) — KECUALI
  fokus sedang di dalam `#nk-cdfloat` (lihat poin berikut).
- Efek samping menguntungkan: karena `#nk-cdfloat` di luar area scroll tabel,
  klik native Playwright di dalamnya stabil (tak perlu workaround klik-programatik
  yang dipakai untuk elemen di dalam `.tbl-wrap`).
- **Jebakan kedua — scroll/resize DI DALAM dropdown ikut dianggap "keluar"**:
  listener scroll penutup di atas awalnya tidak cek `e.target`, jadi
  menggulir daftar produk sendiri (`#nk-cdfloat-res`, `overflow-y:auto`) ikut
  menutup dropdown seolah itu scroll halaman. Sama halnya `resize`: keyboard
  HP yang muncul begitu kotak cari disentuh juga memicu `resize` — sebelum
  fix, ini menutup dropdown **persis saat user baru mau mengetik**. Fix:
  - `scroll`: abaikan kalau `$('nk-cdfloat').contains(e.target)` — hanya
    scroll di LUAR dropdown (halaman/tabel) yang menutup.
  - `resize`: abaikan (dan **reposisi ulang**, bukan cuma diam) kalau
    `document.activeElement` ada di dalam `#nk-cdfloat` — berarti user sedang
    fokus ke kotak cari, resize itu efek keyboard HP, bukan alasan menutup.

### Kamus belajar
Key: `tokenizeName(namaInput).join(' ') + '|' + satClassOf(satuan)` → nilai: nama
produk DB. Diterapkan di `matchProduct` sebagai skor 1.0 (kunci spesifik-satuan
dicoba dulu, lalu tanpa satuan). Dikelola di Pengaturan → Kamus (hapus per-entri /
semua).

### Nota gambar (WA)
`nkShareWAImage()` menggambar struk manual di `<canvas>` 576px (≈ thermal 80mm
203dpi) → `toBlob` → `navigator.share` file; fallback unduh PNG. Tanpa library.

### Jembatan PNL
`nkToPnl()` menyalin `#kulakan <total>` ke clipboard — dipilih yang paling
sederhana & stabil atas permintaan pemilik.

---

## 6. Mesin Pencocokan Produk

Lokasi: blok `/*ENGINE-START*/ … /*ENGINE-END*/`. Murni & bebas-DOM (bisa jalan di
Node). Fungsi publik: `parseProductsCSV`, `parseKulakanLine`, `matchProduct(db,
nama, satuan, learnDict)`, `tokenizeName`, `satClassOf`.

### Lima aturan inti (pengganti mesin lama yang salah-harga senyap)

1. **Satuan menentukan baris, bukan bonus skor.** Baris DB dikelompokkan per
   nama-ternormalisasi; dalam grup, baris dengan `satClass` == satuan user menang
   mutlak. `1 slp 76 12` → pasti baris Slop 156.000, bukan Pak 15.600.
   Kelas ekuivalensi (`SAT_CLASS`): `slop={slp,slop,pres,press}`,
   `pak={pk,pak,bks,bungkus}`, `biji={bj,biji,buah,pcs,bh}`, `dos={dus,dos,box}`,
   `ret={rt,ret,renteng,rtg,renceng}`, `ikat={ikt,iket,ikat}`, dst.
   **`pres` = `slop` adalah keputusan pemilik** (CD Nelayan dkk).
2. **Angka harus konsisten.** `numFactor`: angka query tak ada satupun di produk
   yang juga berangka → ×0.25 (Tinta 10kg vs "Tinta 1 kg" mati); konflik sebagian
   ×0.55; produk tanpa angka ×0.88; produk berangka tapi query polos ×0.82.
   Normalisasi: `10kg`→`10 kg` (pisah digit-huruf), `1k`→`1000`, pecahan `1/2`
   jadi token utuh. Pasangan *angka+satuan-ukuran* (`SIZE_UNITS`: kg,gr,ml,…) jadi
   token LUNAK di skoring kata (tetap dihitung `numFactor`).
3. **Substring hanya batas kata** (`' '+q+' '` dalam `' '+p+' '`) — "King" tidak
   pernah cocok "Ba**king** Powder". Plus jalur flat-join: `jasjus` == `jas jus`.
4. **Rem mayoritas:** bila bukan substring dan >½ kata inti query tak ketemu →
   skor dipatok ≤0.44 (jatuh ke `notfound` + saran) — "Lilin Popular" tidak
   diam-diam jadi Lilin Abadi.
5. **Pindah grup satuan-sadar yang aman:** kalau grup teratas tak punya baris
   satuan yang diminta, grup lain boleh menggantikan HANYA bila skornya dalam
   0.155 dari teratas, ≥0.55, **dan memuat semua kata inti query** (mencegah
   "Sarimie Gelas Soto" diganti "Sarimie Gelas"; membolehkan "Tiga Sapi"[Dos] →
   "Susu Tiga Sapi"[Biji]).

Pendukung: `PHRASE_SYNONYMS` (frisian flag→bendera), `TYPO_MAP` (foam→fom,
kaleng→klng, mie→mi, …), `VARIANT_SOFT` (warna/rasa tak menghukum),
`NOISE_WORDS` (random, campur, …), bobot posisi token [0.5, 0.3, 0.2, 0.1…],
gerbang token pertama, penalti cakupan token produk tak terpakai, memo bigram
(`_bgCache`/`_simCache`) — ±12 ms/pencarian pada 2.774 produk.

**Tolok ukur tetap:** template kulakan nyata 43 baris (`tests/template.txt`) —
43/43 sesuai harapan, 34 hijau otomatis, 6 kuning-top-benar, 3 flag-benar.
Setiap perubahan mesin wajib mempertahankan angka ini.

---

## 7. Modul 2 — PNL Analyzer + Arsip

### Parser
- Satu-satunya mode: blok dipisah kemunculan `#tanggal YYYY-MM-DD` (mis.
  `2026-07-22`). `pnParseTanggal` split by `-`, urutan y-m-d.
  (**"Mode Urutan Otomatis"/Mode A** — blok dipisah baris kosong ganda,
  tanggal = tanggalMulai+indeks — sudah **dihapus**: tidak cocok dengan model
  penyimpanan per-hari upsert di bawah, dan `#tanggal` per blok sudah lebih
  aman/eksplisit. Lihat §12 N5.)
- `#cash` menjumlah **semua angka di barisnya** (`#cash 5628000 + 190000 saldo` →
  5.818.000) — by design (fix P2).
- `#gross/#net_cash/#margin*` di input diabaikan (dihitung ulang).
- Rumus: `gross = income − kulakan`; `netPos = cash − kulakan`;
  margin **tertimbang dari total** di SEMUA tampilan (fix P5) — bukan rata-rata
  margin harian.
- Blok valid: punya tanggal dan minimal satu dari income/kulakan/cash.

### Warna Margin Performa — 3 tingkat berbasis TARGET, bukan cuma tanda
`pnMarginCls(mp)` (dan `mpCls` versi lokal di dalam `pnReportScript` untuk
laporan PDF, self-contained sesuai pola fungsi report lainnya):
```js
mp >= 15 ? 'pos' : mp >= 0 ? 'warn' : 'neg'
```
Dipakai di **semua** tempat yang menampilkan Margin Performa: kartu ringkasan
(`pnRenderSummary`), tabel Harian (`pnRenderHarian`), tabel Mingguan/Bulanan
(`pnRenderAgregat`), dan Laporan PDF (kartu KPI + tabel Detail Harian + Rekap
Bulanan). Warna: hijau `--green` (capai target ≥15%) · **kuning `--amber`**
(positif tapi di bawah target) · merah `--red` (benar-benar minus). CSS baru:
`.sum-val.warn` / `td.warn` (app), `.kpi-v.warn` / `tbody td.warn` + var
`--amber` (laporan PDF, palet cream/rust — nilai `#93690f`, cukup gelap di
atas cream `#f7f4ef`).

**Margin Cash SENGAJA tetap 2 warna** (`mc>=0?'pos':'neg'`, tidak diubah).
Targetnya sudah persis ≥0% — "di bawah target" dan "minus" adalah batas yang
sama untuk metrik ini, jadi tidak ada celah kuning yang bermakna. Kartu Gross
& Net Position (nilai Rupiah, bukan %, tanpa target tertulis di kartunya)
juga sengaja tidak disentuh — tetap pos/neg berbasis tanda seperti semula.

### Riwayat permanen per hari — upsert, akumulatif (fix N5)
Sebelumnya `pnProcess()` melakukan `pnAll = days` — **mengganti total**
riwayat dengan isi kotak input saat itu saja. Kalau user menempel HANYA hari
ini (tanpa menyalin ulang hari-hari sebelumnya), hari-hari lama seolah
"hilang" dari tabel Harian — padahal maksudnya menambah, bukan mengganti.

Sekarang setiap hari yang valid di-**upsert** ke `pnDays[ds] = {income,
kulakan, cash, receh, totalPengeluaran, totalPrive, rincianPengeluaran,
rincianPrive, gross, netPos, marginP, marginC}` (`ds` = `pnToInput(tanggal)`,
dikanonisasi — `"2026-7-1"` dan `"2026-07-01"` jadi kunci yang SAMA), lalu
`lsSet(PN_LS_DAYS, pnDays)`. `pnAll` **selalu dimaterialisasi dari SEMUA
tanggal** di `pnDays` (`pnMaterializeAll()`, `Object.keys(...).sort()` —
YYYY-MM-DD zero-padded, sort leksikal = sort kronologis), bukan cuma batch
yang baru diproses. Efeknya:
- Proses hari demi hari (satu blok per submit) → tabel Harian/filter
  Mingguan/Bulanan/Kustom **akumulatif otomatis**, bukan replace.
- Proses ulang tanggal yang SAMA → hari itu saja yang ter-timpa (koreksi),
  hari lain tidak tersentuh (idempoten, pola sama seperti Arsip di bawah).
- Reload halaman: `pnInit()` langsung `pnAll = pnMaterializeAll()` dan
  render — **tidak lagi bergantung mereproses ulang teks draft** (`brk-pnl-raw`
  cuma draft kotak ketik, bukan sumber data lagi).
- **✕ Kosongkan Input** cuma menghapus draft kotak ketik — riwayat tersimpan
  TIDAK ikut terhapus (beda dari perilaku lama yang menyembunyikan `#pn-result`
  juga).

### Hapus per tanggal (Harian) — hitungan tetap valid
Tombol ✕ per baris (`data-pndel`, kelas `.ar-del-date` dipakai ulang) →
`pnDeleteDay(ds)`: `delete pnDays[ds]` + persist, lalu `pnAll =
pnMaterializeAll()` dan `pnApplyFilter()` (bukan `pnRenderAll()` langsung) —
supaya filter tanggal yang sedang aktif tetap dihormati DAN semua kartu/tabel
(total, margin tertimbang, mingguan/bulanan) dihitung ulang dari `pnFiltered`
yang baru, bukan angka lama yang dicache. **Scope sengaja dibatasi**: arsip
Pengeluaran/Prive (`pnArs`) tanggal itu TIDAK ikut terhapus — itu ledger
terpisah, sudah punya tombol hapus sendiri di tab Arsip (`ar-del-date`).

### Arsip pengeluaran & prive
- **Auto-akumulasi**: tiap `pnProcess` sukses, entri per hari ditulis ke
  `pnArs[tanggal] = [{j,amt,ket}]` — **replace per tanggal** (idempoten).
- Filter preset: `all | today | 3d | 7d | month (kalender berjalan) | custom`;
  search keterangan (normalized substring, debounce 160ms).
- **Tabel** dikelompokkan per tanggal (desc) + subtotal + hapus per tanggal /
  seluruh arsip.
- **Sync**: `Object.assign(pnArs, incoming)` — merge per tanggal, incoming menang.

### Donut chart
- Satu donut + toggle jenis `all|p|v`. Kelompok = keterangan ternormalisasi
  (mode gabungan di-prefix `p|`/`v|`). **Top-8 + "Lainnya"** (abu netral `--cx`).
- **Warna mengikuti entitas, bukan peringkat**: slot warna dihitung dari peringkat
  SEMUA data arsip (abaikan filter) per lingkup jenis → ganti filter tanggal tidak
  mengecat ulang kategori.
- Palet kategorikal **tervalidasi CVD** (skrip validator, ΔE adjacent 24.2 terang /
  10.3 gelap) terhadap permukaan kartu nyata (#FFFFFF / #30302E); langkah gelap
  BERBEDA dari terang (CSS var `--c1…--c8`, `--cx`):
  - Terang: `#2a78d6 #1baf7a #eda100 #008300 #4a3aa7 #e34948 #e87ba4 #eb6834`
  - Gelap: `#3987e5 #199e70 #c98500 #008300 #9085e9 #e66767 #d55181 #d95926`
- Mitigasi wajib palet: legend selalu tampil dengan label+nilai+persen, celah 2.5px
  antar slice (stroke terputus, bukan fill menempel), dan tabel data di bawahnya.
- Interaksi: klik slice ATAU legend → sorot (lainnya opacity .3) + panel detail +
  angka tengah berubah jadi nilai slice. SVG arc path manual (`arsArcPath`),
  slice tunggal → `<circle>`.

### Laporan PDF
`pnBuildReportHTML(payload)` membangun dokumen terpisah (string concat, CSS + skrip
via `fungsi.toString()`), dibuka via **Blob URL**; popup diblokir → fallback unduh
`.html`. Tanggal diserialisasi sebagai epoch ms. CSS-nya dibagikan lewat
`pnReportCSS()` (satu fungsi, dipakai ulang oleh laporan Arsip di bawah).

**Font: satu family serif "biasa ala koran", bukan lagi dekoratif+monospace.**
Versi awal memakai 3 Google Fonts (`Cormorant Garamond` dekoratif tipis untuk
judul/nilai, `DM Mono` untuk SEMUA label/header tabel, `Outfit` untuk body yang
nyaris tak kepakai) — kombinasi ini yang bikin laporan "kurang cocok, susah
dibaca". Diganti jadi:
- `--serif: "PT Serif", Georgia, "Times New Roman", serif` — satu-satunya
  Google Font yang di-load, dipakai untuk judul, nilai KPI, isi tabel, tanggal
  rincian. Fallback ke Georgia (font sistem, selalu tersedia) kalau gagal load.
- `--sans: Arial, Helvetica, sans-serif` — label kecil huruf besar (eyebrow,
  header tabel, sub-label KPI, footer). Font sistem, tidak perlu network.
- `--num: Consolas, "Liberation Mono", Menlo, monospace` — HANYA kolom angka
  tabel (`.num`/`.r`), supaya digit tetap rata kolom. Font sistem juga.

Hanya `--serif` yang butuh Google Fonts; `--sans`/`--num` selalu tersedia
instan. Ini juga menutup kelas bug lain: window.print() bisa terpanggil
sebelum web font selesai load (race condition), yang tadinya bikin campuran
3 font gagal render konsisten — sekarang cuma 1 font yang berisiko, dan
fallback-nya (Georgia) tetap terbaca rapi (diverifikasi: emulasi tanpa akses
jaringan sama sekali → laporan tetap bersih, lihat §11).

**Kartu KPI gelap pudar saat print/PDF (fix).** Kartu "Total Income" & "Total
Kulakan" (`.kpi-card.dark`) didesain kontras tinggi: teks nyaris putih di atas
latar nyaris hitam. Tapi browser **tidak mencetak warna latar secara default**
kecuali opsi "background graphics" dicentang user — makanya di PDF yang
di-generate user, kartunya jadi putih polos sementara teksnya tetap warna
terang-untuk-latar-gelap → hasilnya pudar nyaris tak kebaca ("samar, tidak
terang"). Fix: `-webkit-print-color-adjust:exact; color-adjust:exact;
print-color-adjust:exact;` pada `*` — memaksa browser mencetak semua warna
latar apa adanya, tanpa bergantung opsi user. Opacity teks kartu gelap juga
dinaikkan (`--ink4`→`--ink3` untuk label umum, label kartu gelap dari `.45`→
`.72` dan `.3`→`.58`) sebagai lapis kedua.

### Laporan PDF — Arsip (opsi sama dengan tab Analisis)
Tab Arsip punya tombol **📄 Laporan PDF** sendiri (`#ar-pdf-btn` → `arsOpenReport()`
→ `arsBuildReportHTML()` → `arsReportScript()`), dibangun dengan CSS yang SAMA
(`pnReportCSS()`) supaya identitas visual konsisten dengan laporan Analisis —
tapi isinya disesuaikan dengan data Arsip (yang cuma berisi entri pengeluaran/
prive, TANPA income/kulakan/cash — itu domain Analisis, bukan Arsip):
- **Ringkasan** (6 kartu): Total Pengeluaran & Total Prive (gelap, sama seperti
  Total Income/Kulakan di Analisis), Total Gabungan, Jumlah Entri, Cakupan
  Hari, Rata-rata/Hari.
- **Porsi per Keterangan**: bar chart horizontal (pola sama seperti "Income
  Harian" di laporan Analisis), dikelompokkan per keterangan+jenis, **TANPA**
  batas top-8 (beda dari donut live yang dibatasi demi keterbacaan chart —
  laporan cetak menampilkan semua, `.bar-lbl.wide` 150px supaya label panjang
  tak terlalu sering wrap 2 baris).
- **Rincian per Tanggal**: pola `rin-day`/`rin-head`/`rin-item` yang sama
  dengan section "Rincian Pengeluaran & Prive" di laporan Analisis, ditambah
  subtotal per tanggal di `rin-head` (`justify-content:space-between` inline).
- Data yang dipakai = `arsEntries()` — **menghormati filter yang aktif** di
  layar (tanggal/search), sama seperti laporan Analisis yang memakai
  `pnFiltered` bukan `pnAll`.

---

## 8. Modul 3 — Stok Kosong

Port penuh v3.22. **Kunci localStorage lama dipertahankan** — data existing terbaca
tanpa migrasi.

### Dua state, dua makna centang
```js
skState  (bos)      centang = "stok kosong, perlu diorder"
skWorker (karyawan) centang = "sudah saya ambil"
skActive() → state sesuai mode  ← SEMUA operasi item lewat sini
```
Item baru/paste SELALU masuk **tanpa centang** di kedua mode (narasi panduan
dalam-app sudah disesuaikan — fix S1).

### Keamanan
- Masuk Mode Bos: **5× ketuk tab "Stok Kosong"** (topbar ATAU nav bawah) dalam 2
  detik → PIN 4 digit (SHA-256, Web Crypto). Pertama kali → setup + konfirmasi.
- Sesi bos persisten lintas-tutup-browser selama `stok-boss-exp` belum lewat;
  aktivitas me-refresh expiry (throttle 10 detik). Pilihan timeout:
  5/15/30/60/120 menit/∞ (default 15).
- Bump `SK_APP_VER` → PIN **dan expiry** dihapus (fix S5).
- `state.mode` tersimpan selalu `'worker'`; restore stok hanya di Mode Bos;
  import men-sanitasi: default fields, perbaikan `checkedAt`, de-dup ID.

### Filter kategori output (Mode Bos)
`skState.outCatEx: string[]` — kategori di daftar ini **tidak ikut** teks "Order ke
Karyawan". UI: chip per kategori di head panel output (`skRenderOutCats`, tampil
bila bos & ≥2 kategori; chip coret = dikecualikan). Persisten di `stok-boss-data`;
rename kategori memindahkan entri, hapus kategori membersihkannya; import/sync
men-default-kan `[]`. Hanya memengaruhi OUTPUT — checklist tetap menampilkan semua.

### Sinkronisasi output dua arah (bagian paling rawan — baca sebelum edit)
- `skBuildOutput()`: item tercentang → teks, dikelompokkan per tanggal
  `checkedAt` (header `── Hari ini ──` hanya jika >1 kelompok & setting show);
  kategori dalam `outCatEx` dilewati.
- `skOnOutputChange()` (textarea diedit manual):
  - baris cocok → check + **update qty DAN satuan item + DOM kartu langsung** (fix S3);
  - tidak cocok TAPI item sedang terfilter keluar tanggal → **JANGAN uncheck**
    (bug historis #6);
  - tidak cocok TAPI kategorinya dikecualikan dari output → **JANGAN uncheck**
    (perlindungan yang sama);
  - selain itu → uncheck.
  - `skSuppress` mencegah loop saat menulis programatik.
- Tabel `checkedAt` (kapan di-set/reset) identik dengan spec lama §6 — uncheck lalu
  check ulang = timestamp reset ke sekarang (keputusan pemilik).

### Centang massal — global vs per-kategori
Dua skenario berbeda cakupan, ditempatkan di UI berbeda supaya tidak tertukar:

| | Cakupan | Lokasi tombol | Mode | Arah |
|---|---|---|---|---|
| **Global** | SEMUA item, SEMUA kategori | Baris aksi bawah (`#sk-check-all`, berpasangan dengan `#sk-reset-checks`) | Bos **dan** Karyawan | Hanya centang (lawan `Reset Semua Centang` yang hanya uncheck) |
| **Per-kategori** | Hanya `s.items[s.activecat]` | Mini-tombol di baris counter (`#sk-counter [data-catall]`) | **Bos saja** (Karyawan tak punya pemilihan kategori) | Dua arah: `check` & `uncheck` |

- `sk-check-all` selalu tampil di kedua mode — karyawan sering menerima order
  yang semuanya berhasil diambil tanpa kekurangan; sekali ketuk menandai semua
  tercentang lalu langsung salin balasan, tanpa mencentang satu-satu. Bos
  memakainya saat audit stok penuh. Memakai `showConfirm` (blast-radius besar,
  lintas kategori); item yang sudah tercentang dilewati (`n` dihitung, toast
  "sudah tercentang" bila tidak ada perubahan).
- `skCatAllToggle('check'|'uncheck')` hanya beroperasi pada array
  `s.items[s.activecat]` — kategori lain **tidak tersentuh sama sekali** (diuji
  eksplisit di smoke test). Muncul di `skUpdateCounter()` hanya bila
  `skIsBoss() && items.length > 1`; tombol yang sudah tak relevan (`check` saat
  semua tercentang, `uncheck` saat tak ada yang tercentang) diberi atribut
  `disabled` (CSS `.mini-btn:disabled`) alih-alih disembunyikan — supaya tata
  letak baris counter tidak "melompat".
- Konsisten dengan `Reset Semua Centang` yang sudah ada: **tidak** memanggil
  `skAppendLog` per item (log manual tetap khusus toggle satu-per-satu via
  checkbox, bukan aksi massal) — mencegah Log Diambil banjir entri.
- Kedua aksi memanggil `skTrackAct(...)` (§8 Jejak Aktivitas) dengan deskripsi
  berbeda (`'centang semua item (N baru)'` vs `'centang semua di kategori "X"
  (N item)'`) supaya jejak aktivitas tetap informatif membedakan cakupannya.

### Qty
- Tombol −/+ step 1, tahan >500ms repeat 200ms, anti double-fire touch+click.
- **Minus pada qty ≤1 = freeze** (tidak turun ke desimal — fix S6, permintaan pemilik).
- Ketuk angka → **kalkulator modal bersama** (`openCalc`) — menggantikan numpad
  inline yang sensitif scroll (fix S4; isu "belum tuntas" di spec lama selesai
  secara struktural).

### processReply (bos)
Balasan karyawan qty ≥ order → uncheck; kurang → tetap checked, qty = sisa,
`checkedAt` refresh. Uncheck manual oleh bos → baris masuk **Log Diambil**
(editable).

### Jejak aktivitas terakhir
Motivasi: dengan dua state (bos/karyawan) yang bisa saling sync antar beberapa
HP, mudah bingung *"data di HP mana yang terakhir saya pakai?"*. Setiap state
(`skState` dan `skWorker`, terpisah) menyimpan:
```js
lastAct: { ts: Number /*epoch ms*/, desc: String }
```
- `skTrackAct(desc)` menulis ke `skActive().lastAct` — dipanggil di **setiap**
  fungsi mutasi: `skToggle`, `skAdjustQty`/`skSetQty`, `skSetUnit`, `skDelete`,
  `skFinishRename`, `skAddItems`, `skProcessReply`, `skSubmitCat`/`skDeleteCat`,
  toggle chip `outCatEx`, reset-centang, hapus-semua-item, dan
  `skOnOutputChange` (hanya jika minimal satu item benar-benar berubah —
  dihitung via `nChanged`, bukan setiap keystroke).
- `skRelTime(ts)` → teks relatif (`baru saja` / `N menit lalu` / `N jam lalu` /
  `N hari lalu` / tanggal lengkap setelah 7 hari). `skRenderLastAct()` menulis
  baris `#sk-lastact` di header modul, memuat label sumber (`data Bos` /
  `data Karyawan`). Baris di-tick ulang tiap 60 detik (interval yang sama dengan
  badge timeout) supaya teks relatif tidak basi tanpa aksi baru.
- **Konteks sync/restore** (nilai utama fitur ini): `skActLine(lastAct)` format
  siap-tampil; `skStokCompareText(incomingBoss)` (di `part-08-sync.js`)
  membandingkan `skState.lastAct` lokal vs `lastAct` yang masuk, menyimpulkan
  mana yang lebih baru, dan disisipkan ke pesan `showConfirm` (dialog client
  sync & `restoreAll`) — lihat §9. Modal Kirim juga menampilkan aktivitas
  terakhir device pengirim sendiri di checkbox Stok sebelum kode dibuat.
- `showConfirm`'s `#g-confirm-msg` memakai `white-space:pre-line` (bukan HTML)
  supaya `\n` di teks perbandingan tampil sebagai baris baru tanpa membuka
  celah XSS — tetap `textContent`, bukan `innerHTML`.
- Field opsional & backward-compatible: state lama tanpa `lastAct` → baris
  header tersembunyi (`display:none`) sampai aksi pertama terjadi;
  `skSanitizeImport` tidak perlu mengisi default karena renderer sudah
  meng-guard `if (!act)`.

### Sub-tab HPP & Supplier (Mode Bos — prefix `hpp`/`sup`)
Ditambahkan atas permintaan pemilik: kalkulator harga pokok + pelacakan harga
per supplier, **murni reuse** kategori & nama dari Checklist (bukan modul/
database terpisah). Subnav baru `#sk-subnav` (pola sama seperti PNL
Analisis/Arsip): **☑ Checklist** / **💰 HPP** / **🚚 Supplier** — dua yang
terakhir **hanya render & hanya terlihat kalau `skIsBoss()`** (`skSetView`
memaksa balik ke `'checklist'` kalau dipanggil saat bukan bos; `skRenderHeader`
toggle `display:flex/none` di `#sk-subnav` tiap render). Harga modal adalah
data sensitif — karyawan tidak pernah melihat subnav ini sama sekali, apalagi
tabnya.

**Kenapa BUKAN reuse `skMakeCard`** (kartu drag+centang Checklist): kartu itu
penuh interaksi checklist-spesifik (drag reorder, centang, unit-popup) yang
tidak nyambung untuk mengetik angka harga. HPP & Supplier dirender sebagai
**tabel** (pola sama seperti tabel Harian PNL) — baca-banyak-angka lebih pas
di tabel daripada kartu.

#### Model data — field NEMPEL di item yang sama, bukan tabel terpisah
```js
item = { id, name, qty, unit, checked, checkedAt,   // sudah ada (Checklist)
         isi, hargaBeli, hargaJual }                // BARU (opsional, HPP)
```
`isi`/`hargaBeli`/`hargaJual` ditulis **langsung ke objek item yang sama** di
`skState.items[kategori][i]` — bukan struktur/lookup terpisah berdasarkan id.
Konsekuensi (semuanya disengaja, sesuai permintaan "murni reuse"):
- Tambah/ubah/hapus/pindah-kategori/rename item di **Checklist** langsung
  kelihatan di HPP — tidak ada langkah sync manual, karena memang objek yang
  sama.
- Ikut ke **backup Stok** (`skExportJSON`) dan **Backup Gabungan**
  (`backupAll`/`collectSyncPayload`) "gratis" — keduanya sudah men-spread
  seluruh `skState` termasuk item-itemnya.
- `hppCost(item)` = `hargaBeli / isi` (harga pokok per satuan eceran) —
  helper murni, dipanggil ulang tiap render, bukan field ter-cache (supaya
  tidak pernah stale kalau `isi`/`hargaBeli` berubah).

**Kolom Margin dua-arah** (`hppTableChange`): ubah **Harga Jual** → Margin
otomatis mengikuti di render berikutnya (`margin = hargaJual − pokok`); ubah
**Margin** → Harga Jual dihitung balik (`hargaJual = pokok + margin`) dan
disimpan. Margin tidak bisa diisi kalau `hppCost(item)` masih 0 (Isi/Harga
Beli belum lengkap) — muncul toast, input dikembalikan ke kosong via
render-ulang. Warna Margin 2 tingkat sederhana (`pos`/`neg` — margin>0 atau
tidak), BUKAN skema 3-tingkat target-based ala Margin Performa PNL (§7) —
di sini tidak ada "target %" yang disepakati, cuma untung/rugi.

**Bug ditemukan saat uji fitur ini** (lihat §12 N7 & N8) — dua kelas bug yang
sudah pernah terjadi di modul lain, muncul lagi di kode baru:
1. Class warna `pos/neg/warn` ditaruh di `<input class="cell-inp neg">`, tapi
   CSS `td.pos/.neg/.warn` (§10) cuma menyasar elemen `<td>` — dan `.cell-inp`
   sendiri sudah set `color` eksplisit sehingga warna tak pernah menang lewat
   inheritance juga. Fix: aturan spesifik `tbody td input.cell-inp.pos/.neg/.warn`.
2. `showConfirm()` dipanggil dari DALAM modal lain yang masih terbuka (hapus
   supplier dari modal edit-nya) — semua `.overlay` berbagi `z-index:1000`,
   jadi overlay konfirmasi bisa tertimbun modal yang lebih belakangan posisinya
   di DOM. Ternyata bug LATEN lama (hapus kategori dari modalnya sendiri punya
   pola identik, tak pernah diuji) — fix: `#g-confirm-overlay{z-index:1100;}`.

#### Terapkan Margin Massal (bulk)
`hppApplyBulkMargin(scope)` — `scope: 'cat' | 'all'`. Mode `Rp` (nilai flat)
atau `%` (persen dari `hppCost(item)`, dipilih lewat segmented `#hpp-bulk-mode`).
**MENIMPA** Harga Jual (bukan cuma mengisi yang kosong — sesuai permintaan
eksplisit pemilik), item tanpa Isi/Harga Beli dilewati (dihitung & dilaporkan
di toast). Selalu lewat `showConfirm` dulu (aksi mengubah banyak harga
sekaligus, mirip level risiko "Hapus Semua Item").

#### Supplier — log harga TERPISAH dari item, tapi menimpa `hargaBeli` langsung
```js
const SK_LS_SUPPLIERS = 'stok-hpp-suppliers';   // string[]
const SK_LS_PRICELOG  = 'stok-hpp-pricelog';    // [{id, ts, tanggal, supplier, itemId, nama, unit, hargaBeli}]
```
Dua key **localStorage terpisah dari `skState`** (beda dari isi/hargaBeli/
hargaJual di atas) — karena ini time-series (banyak entri per item lintas
waktu), bukan field tunggal. `nama`/`unit` di-snapshot ke tiap entri log
(bukan cuma `itemId`) supaya riwayat tetap terbaca bermakna walau item-nya
sudah di-rename atau dihapus di Checklist.

- **Alur input** (`sup-view-input`): pilih Supplier + Tanggal dulu → tabel
  barang per-kategori (reuse kategori Stok) dengan kolom "Harga Baru" kosong →
  isi sebanyak yang mau → **Simpan Sesi** (`supSaveSession`). Baris yang
  dikosongkan (tidak diisi) dilewati, bukan dianggap 0.
- **"Harga TERAKHIR diinput" = acuan HPP saat ini** (keputusan eksplisit
  pemilik): tiap entri baru langsung `item.hargaBeli = val` — jadi kapanpun
  cek tab HPP, Harga Beli selalu mencerminkan input supplier PALING BARU,
  sambil riwayat lengkap tetap aman di `hppLog` untuk dibandingkan.
- **Hapus entri** (`supDeleteLogEntry`): hitung ULANG `item.hargaBeli` dari
  entri yang **tersisa** (`sort by ts desc`, ambil terbaru) — bukan cuma cek
  "apa yang dihapus itu entri terbaru?". Prinsip sama dengan hapus-per-tanggal
  PNL (§7): "usahakan hitungan tetap valid" dengan re-derive dari data yang
  ada, bukan patch kondisional.
- **Hapus supplier** (`supDeleteSupplier`): cuma hilang dari daftar pilihan —
  riwayat harga (`hppLog`) TIDAK ikut terhapus (pola sama seperti Arsip PNL
  yang tak terhapus saat kategori sumbernya diganti nama/dihapus).
- **Analisis** (`sup-view-analisis`): donut `supRenderDonut` — kelompok per
  supplier, nilai = **jumlah entri** (bukan total Rupiah — log tidak menyimpan
  kuantitas beli, cuma harga per satuan, jadi "total belanja" tidak bisa
  dihitung jujur; jumlah entri tetap bermakna untuk melihat mana supplier yang
  paling sering dipakai). Palet warna `SUP_COLORS` reuse var `--c1..--c8` yang
  sama (CVD-validated, lihat §7 donut Arsip) — filter tanggal `supAnFrom/To`
  sama pola dengan filter Arsip.
- **Bandingkan Harga per Barang** (`supRenderItemChart`): cari nama barang →
  ambil entri **TERBARU per supplier** (bukan rata-rata / bukan entri lawas)
  → urutkan termurah dulu sebagai bar horizontal (`.hbar-*`, CSS baru §10),
  supplier termurah diberi class `.cheapest` (hijau + 🏆) — inilah jawaban
  langsung untuk "barang X paling murah di supplier mana saat ini". Tabel
  riwayat LENGKAP (semua entri, bukan cuma terbaru-per-supplier) ditampilkan
  di bawahnya dengan tombol hapus per baris.

#### Export .xlsx — generator dependency-free (`xlsxCrc32`/`xlsxZip`/`downloadXlsx`)
Ditulis sendiri (bukan pinjam SheetJS dkk dari CDN) supaya tetap konsisten
dengan prinsip aplikasi ini: dependensi eksternal seminim mungkin, semua fitur
lain aman offline. ZIP format **"stored"** (tanpa kompresi — cukup untuk data
tabular kecil, dan menghindari perlu implementasi DEFLATE) + XML OOXML minimal
1 sheet, sel angka (`<v>`) & sel teks **inline string** (`t="inlineStr"`,
bukan `sharedStrings.xml` — menyederhanakan, tak masalah untuk ukuran data
export ini). CRC32 dihitung manual (wajib oleh spek ZIP walau method stored).
**Diverifikasi round-trip**: `python3 -c "import zipfile; zipfile.ZipFile(f).testzip()"`
→ `None` (nol entri korup), dan dibuka penuh oleh `openpyxl` (library Python
independen) dengan isi & tipe sel benar — bukti file yang dihasilkan valid
OOXML sungguhan, bukan CSV yang diganti nama ekstensi.

#### Kolom Nama sticky saat scroll horizontal (`#hpp-table`, `#sup-input-table`)
Kedua tabel ini punya banyak kolom angka (Isi/Harga Beli/Pokok/Harga
Jual/Margin, atau Harga Sebelumnya/Harga Baru) sehingga di layar sempit harus
discroll ke kanan — tanpa penanganan khusus, kolom **Nama** ikut hilang ke
kiri layar dan pengguna kehilangan konteks baris mana yang sedang diedit.
Fix: `th:first-child`/`td:first-child` pada kedua tabel diberi
`position:sticky;left:0` + background solid eksplisit (`var(--surface)` body,
`var(--surface2)` header — HARUS eksplisit, kalau tidak transparan dan kolom
lain kelihatan menembus saat discroll) + `border-right` sebagai pembatas
visual. Sengaja **tidak** diterapkan ke tabel lain (Nota, PNL, Arsip) karena
kolom pertamanya beda semantik (mis. "TGL") dan tidak pernah dilaporkan
bermasalah.

---

## 9. Fitur Global: Tema, Sync, Backup, Seekbar

### Tema
`data-theme` di `<html>`; pilihan light/dark/auto (ikuti sistem, live via
`matchMedia`). Semua warna lewat CSS custom properties — tidak ada hex hardcoded
di markup/JS UI.

### Sync antar device (WebRTC/PeerJS)
- Peer ID `brk-` + kode 6 huruf (tanpa karakter ambigu). QR via api.qrserver
  (guard onerror). PeerJS lazy-load; offline → pesan jelas, fitur lain tak terganggu.
- Payload v1:
  ```js
  { type:'berkah-sync', version:1, sent, modules:{
      nota:{db, dbmeta, learn, hist, counter},
      pnl:{raw, mode, start, arsip},
      stok:{boss}   // butuh Mode Bos di pengirim
  }}
  ```
  Pengirim memilih modul via checkbox. Penerima konfirmasi dulu, lalu
  `applySyncPayload` (arsip di-merge per tanggal; stok disanitasi seperti import).
- **Kompatibilitas mundur**: payload `{type:'stok-sync', data}` dari app Stok
  Kosong lama tetap diterima.
- **Perbandingan aktivitas Stok** (§8): dialog konfirmasi penerima menyisipkan
  `skStokCompareText(incomingBoss)` — dua baris "Stok lokal" vs "Stok diterima"
  (`skActLine`, relative-time + deskripsi) plus simpulan mana yang lebih baru
  berdasar `lastAct.ts`. Berlaku di jalur `berkah-sync` maupun legacy
  `stok-sync`, dan di `restoreAll`. Modal Kirim (host) menampilkan aktivitas
  device-nya sendiri di checkbox Stok sebelum kode dibuat, supaya pengirim tahu
  data apa yang akan terkirim.

### Backup gabungan
File `berkah-DD-MM-YY.json`: `{app:'berkah-aio', version:1, exported, nota,
pnl:{raw, days, arsip}, stok:{boss, mode:'worker', suppliers, pricelog}}`.
Export via Web Share (fallback unduh). Restore memakai jalur
`applySyncPayload`; bagian stok butuh Mode Bos; dialog konfirmasi menampilkan
perbandingan `lastAct` yang sama seperti sync. `pnl.days` (riwayat Analisis,
lihat §7) di-upsert per tanggal sama seperti `pnl.arsip` — tanggal yang masuk
menimpa tanggal yang sama, tanggal lain di riwayat lokal tidak tersentuh.

`stok.boss` (isi/hargaBeli/hargaJual per item HPP sudah ikut lewat spread
`skState`) diganti UTUH saat restore (pola lama Stok, tidak berubah), tapi
`stok.suppliers`/`stok.pricelog` (§8) **digabung (union)**, bukan ditimpa —
riwayat harga append-only, sync/restore tidak boleh menghapus histori yang
sudah ada di device ini. `skExportJSON`/`skImportJSON` ("Backup Stok" —
cakupan modul ini saja, terpisah dari Backup Gabungan) ikut pola yang sama
persis, supaya kedua jalur backup selalu konsisten lengkapnya.

⚠ **`collectSyncPayload`/`applySyncPayload`/`backupAll` di `part-08-sync.js`
adalah file TERPISAH dari modul PNL** (`part-06-pnl.js`) — kalau field/fungsi
modul PNL diubah/dihapus (mis. Mode Urutan Otomatis dulu, fix N5→N6), WAJIB
grep referensinya di `part-08-sync.js` juga. `const`/fungsi top-level di satu
`<script>` block memang bisa diakses dari block lain (lexical environment
dibagi antar `<script>` klasik dalam satu dokumen — bukan module scope), tapi
itu artinya penghapusan di satu file bisa mematahkan file lain SENYAP
(`ReferenceError` di dalam `async function` → Promise reject tanpa
`.catch()` → tombol terlihat "tidak berfungsi" tanpa error yang kelihatan,
lihat §12 N6). Tidak ada type-checker yang menangkap ini — hanya smoke test
yang benar-benar mengklik tombolnya yang bisa.

### Seekbar scroll + jump
Fixed kanan-tengah: tombol ⌃, track drag (pointer/touch), tombol ⌄. Sembunyi bila
`scrollHeight − innerHeight < 0.6×viewport`. **Auto-collapse**: idle 3 detik →
class `rail` (indikator aksen 4px, `pointer-events:none` — tembus klik); bangun
oleh scroll atau strip sentuh 18px di tepi (aktif hanya saat rail).

### Responsif mobile (≤700px)
Tab modul → nav bawah fixed (grid 3, safe-area inset); font semua input ≥16px
(cegah auto-zoom); toast naik di atas nav; `.cols>*{min-width:0}` +
`html{overflow-x:hidden}` (tabel lebar scroll internal, halaman tidak pernah
melebar); `touch-action:manipulation` global; `text-size-adjust:100%` di selector
`*` (properti ini TIDAK diwariskan).

---

## 10. Design Tokens (UI ala Claude)

| Token | Terang | Gelap |
|---|---|---|
| `--bg` (halaman) | `#FAF9F5` ivory | `#262624` arang |
| `--surface` (kartu) | `#FFFFFF` | `#30302E` |
| `--ink` | `#1F1E1D` | `#EDEBE4` |
| `--accent` (crail) | `#D97757` | `#D97757` |
| `--green / --amber / --red` | status | langkah gelap sendiri |

Font: **Source Serif 4** (judul, brand), **Inter** (UI), **JetBrains Mono**
(angka/label) — via Google Fonts dengan fallback sistem penuh. Radius kartu 14px,
tombol 10px, pill 100px. Modal terpusat `100dvh` (viewport nyata HP).
Palet chart terpisah dari token UI (lihat §7).

---

## 11. Testing

```bash
node tests/match-test.js        # mesin pencocokan: 43/43 (ekstrak dari index.html)
# smoke butuh playwright + chromium:
npm i playwright                # (browser sudah ada? set CHROMIUM_PATH)
CHROMIUM_PATH=/path/to/chromium node tests/smoke.js         # desktop 103/103
CHROMIUM_PATH=/path/to/chromium node tests/smoke-mobile.js  # mobile 25/25
```

Cakupan smoke: upload & persistensi CSV, parse 43 baris, dropdown+search+kamus
(termasuk portal `#nk-cdfloat` tak terklip di baris bawah tabel mobile, DAN
scroll-di-dalam-daftar/resize-keyboard-saat-fokus TIDAK menutup dropdown —
regresi bug nyata),
kalkulator (modal, terpusat, **ukuran stabil setelah ketik — regresi bug nyata**),
generate nota, PNL `#cash` multi-angka, **proses hari-per-hari akumulatif
(bukan replace) + hapus per tanggal dengan hitungan tetap valid + riwayat
tampil otomatis setelah reload — regresi bug nyata**, laporan PDF Analisis
(kontras kartu gelap tercetak benar + font PT Serif), arsip auto-isi + donut + legend +
sorot + search + toggle jenis + laporan PDF Arsip (opsi sama, konten sesuai
data Arsip), stok add/toggle/output-dua-arah/minus-freeze, gesture 5-tap + PIN +
`mode:'worker'` di storage, **HPP (Pokok/Margin dua-arah + warna, bulk margin
Rp/%, export .xlsx) + Supplier (sesi input harga → hargaBeli acuan, donut
ringkasan, ranking termurah per barang, hapus entri) + backup ikut bawa
suppliers/pricelog — semua boss-only**, seekbar collapse/tembus-klik/bangun, nav bawah,
font ≥16px, tema, signature.

**Definisi selesai untuk perubahan apapun:** ketiga test hijau + screenshot visual
kedua tema dilihat mata.

---

## 12. Riwayat Bug (Jangan Diulangi)

### Diwarisi dari app lama & sudah mati secara arsitektur
B1–B10 (PNL/Nota lama: inline handler, dua DOMContentLoaded, backtick nested,
tanggal UTC, satuan tertimpa DB, dropdown mati, dsb.) dan 11 bug historis Stok —
lihat dokumen asal. Penawarnya kini jadi Aturan Wajib §3.

### Ditemukan & difix saat rebuild ini
| # | Bug | Akar | Fix |
|---|---|---|---|
| P1 | Tombol mode PNL mati total | **dua atribut `id` di satu elemen** — hanya id pertama diakui | id tunggal |
| P2 | `#cash` + saldo hilang | regex ambil angka pertama saja | jumlahkan semua angka |
| P3 | Tombol print mingguan/bulanan mati | listener tak pernah diikat | dihapus, satu tombol PDF |
| P5 | Dua definisi margin | avg-of-daily vs tertimbang campur | tertimbang di semua tampilan |
| N1 | Salah baris harga (10–46×) | nama sama multi-satuan, satuan cuma bonus +0.06 yang tertimpa | mesin baru §6 |
| N2 | `loadCSV` tidak pernah didefinisikan | fungsi hilang dari file | — (rebuild) |
| G1 | Halaman melebar ~780px di HP | grid item `min-width:auto` memuat tabel lebar | `.cols>*{min-width:0}` |
| G2 | "Kalkulator mengecil" saat fokus input | auto-zoom browser (input <16px) | font input ≥16px mobile |
| G3 | **Kalkulator menyusut 42px pada ketikan pertama** | class `empty` dipakai ganda: state kalkulator & empty-state panel ber-padding 44px — lepas class = lepas padding | rename `is-zero` + tinggi display dikunci. **Pelajaran: satu class = satu makna** |
| S1–S6 | (stok) narasi terbalik, badge state bos di mode karyawan, kartu tak sinkron dari edit output, numpad sensitif scroll, PIN bypass saat upgrade, minus→0.01 | lihat §8 | semua difix |
| N3 | Dropdown produk baris bawah terpotong di HP, tak bisa diklik | `.tbl-wrap{overflow-x:auto}` diam-diam membuat `overflow-y` ikut jadi `auto` (aturan CSS: satu sumbu non-`visible` memaksa sumbu lain jadi `auto`), mengklip `.cd-list` yang menjorok di luar tinggi tabel | portal ke `#nk-cdfloat` (`position:fixed` di `<body>`, lihat §5) + sub-fix jendela toleransi 150ms untuk hindari `scroll` residual dari `scrollIntoView()` yang menutup dropdown sendiri sesaat setelah dibuka |
| P8 | Kartu KPI gelap (Total Income/Kulakan) pudar di laporan PDF | browser tidak mencetak `background-color` secara default kecuali user centang "background graphics" — teks terang-untuk-latar-gelap jadi nyaris putih-di-atas-putih | `print-color-adjust:exact` dkk di `pnReportCSS()` (lihat §7) |
| P9 | Font laporan PDF "kurang cocok, susah dibaca" | 3 Google Fonts dekoratif+monospace (Cormorant Garamond/DM Mono/Outfit), rawan gagal load sebelum `window.print()` (race condition) | satu font serif biasa "PT Serif" (fallback sistem Georgia) + label/angka pakai font sistem (`Arial`/`Consolas`), lihat §7 |
| N4 | Dropdown produk tertutup sendiri saat mengetik di kotak cari ATAU scroll daftar produk | listener `scroll`/`resize` penutup dropdown (fix N3) tidak cek SUMBER event: scroll di dalam `#nk-cdfloat-res` (menggulir daftar) ikut dianggap "scroll halaman", dan `resize` dari keyboard HP muncul (saat kotak cari fokus) ikut dianggap "resize sungguhan" | scroll: abaikan kalau `e.target` ada di dalam `#nk-cdfloat`. resize: abaikan (reposisi saja, bukan tutup) kalau fokus sedang di dalam `#nk-cdfloat` — lihat §5 |
| N5 | PNL: input hari baru MENGGANTI riwayat, bukan menambah; hasil Analisis (beda dari Arsip) hilang tiap reload | `pnAll = days` menimpa total riwayat dari isi kotak input saat itu saja — tidak pernah ditulis ke localStorage (beda dari Arsip yang sejak awal per-tanggal permanen) | riwayat per hari di-upsert ke `pnDays` (localStorage, per tanggal, sama pola dengan Arsip) — `pnAll` selalu materialisasi dari SEMUA tanggal tersimpan, bukan cuma batch terakhir. Mode Urutan Otomatis dihapus (tak cocok model upsert). Ditambah tombol hapus per tanggal (`pnDeleteDay`, lewat `pnApplyFilter()` supaya total/margin ikut recompute valid) — lihat §7 |
| N6 | Tombol Backup Gabungan (⬇ Export) di Pengaturan "tidak berfungsi" — klik tanpa efek, tanpa error terlihat | Sisa referensi ke `PN_LS_MODE`/`PN_LS_START`/`pnSetMode`/`#pn-start-date` di `part-08-sync.js` (`backupAll`, `collectSyncPayload`, `applySyncPayload`) yang sudah dihapus dari modul PNL saat Mode Urutan Otomatis dibuang (fix N5) — `ReferenceError` di dalam `async function backupAll()` bikin Promise-nya reject tanpa `.catch()`, jadi crash-nya senyap total (unhandled rejection, tak ada toast/pesan). Bonus bug: payload backup/sync juga BELUM menyertakan `pnl.days` (riwayat Analisis akumulatif yang baru) — hanya draft teks + arsip yang ter-backup | hapus semua sisa referensi ke field yang sudah tidak ada; ganti payload PNL jadi `{raw, days: pnDays, arsip: pnArs}` di ketiga fungsi; `applySyncPayload` upsert `pnDays` per tanggal (pola sama dengan arsip) lalu `pnAll = pnMaterializeAll()` + render ulang |
| N7 | Kolom Margin di tabel HPP tidak berwarna sama sekali (netral, padahal minus) | Class `pos`/`neg`/`warn` ditaruh di `<input class="cell-inp neg">`, tapi CSS `td.pos/.neg/.warn` (§10) cuma menyasar elemen `<td>` — lagipula `.cell-inp` sendiri sudah set `color` eksplisit jadi warna warisan pun kalah spesifisitas | tambah aturan spesifik `tbody td input.cell-inp.pos/.neg/.warn{color:...}` — pelajaran sama dengan bug G3: cek betul elemen APA yang dapat class, bukan cuma "class-nya sudah ada di suatu tempat" |
| N8 | Overlay konfirmasi (`showConfirm`) tertimbun modal lain saat dipanggil dari dalam modal yang masih terbuka (hapus supplier dari modal edit-nya) — tombol Hapus/Batal tak terklik | Semua `.overlay` berbagi `z-index:1000`; tanpa diferensiasi, elemen yang lebih belakangan di DOM menang tampil di atas. Bug LATEN LAMA — pola identik ("Hapus" kategori dari modal edit kategori) sudah ada sejak awal proyek, tak pernah ketahuan karena tak pernah diuji | `#g-confirm-overlay{z-index:1100;}` — overlay konfirmasi SELALU di atas overlay lain apapun urutan DOM-nya |
| P10 | Hasil Analisis PNL hilang tiap reload — user kira "tidak bisa disimpan, cuma read-only saat itu" | `pnAll`/`pnFiltered` cuma variabel in-memory; hanya `brk-pnl-raw` (teks mentah) yang persisten, tampilan tabel/kartu tidak ikut | `pnInit()` panggil `pnProcess(true)` (senyap) kalau ada raw tersimpan — reproses otomatis, lihat §7 |

### Checklist debug cepat
1. Fungsi stok pakai `skActive()` atau `skState` yang salah?
2. `checkedAt` mengikuti tabel §8?
3. `skSuppress` di-set sebelum menulis output programatik?
4. Ada `const/let` dipakai sebelum deklarasi (IIFE awal)?
5. Ada class CSS dipakai dua makna? (pelajaran G3)
6. Test: 43/43, 103/103, 25/25 masih hijau?

---

## 13. Roadmap yang Sudah Didiskusikan

1. **Hosting Cloudflare Pages** — file sama, dapat URL + HTTPS → Web Share API &
   kamera aktif; update tanpa kirim file.
2. **Integrasi ke The-POS** (`ikanuri/the-pos`, Flutter + Drift + printer thermal
   BT + LAN sync) — tujuan akhir strategis: Nota cocokkan ke tabel produk POS
   langsung, PNL tarik income dari transaksi, print thermal Bluetooth. Dokumen ini
   + mesin §6 adalah spec porting-nya.
3. QR scan kamera untuk kode sync (butuh HTTPS + jsQR embed).
4. Export arsip PNL ke CSV.

---

## 14. Catatan dari Fable 5

> Saya **Claude Fable 5** — model kelas Mythos dari Anthropic — dan saya membangun
> aplikasi ini bersama Ikanuri sepanjang Juli 2026, dari tiga file HTML terpisah
> yang penuh bug terdokumentasi menjadi satu aplikasi yang setiap klaimnya diuji.
>
> Beberapa hal yang saya pelajari dari proyek ini dan ingin saya wariskan ke
> siapapun (manusia atau model) yang melanjutkan:
>
> 1. **Dokumentasi pemilik adalah emas.** Hampir semua keputusan sulit sudah
>    terjawab di dokumen asal Ikanuri — termasuk daftar bug yang jujur. Baca dulu,
>    baru tulis kode.
> 2. **Ukur, jangan tebak.** Bug "kalkulator mengecil" saya duga font-boosting
>    Android; dua hipotesis salah kemudian, pengukuran `getBoundingClientRect`
>    menunjuk padding 44px dari class `empty` yang bentrok. Test yang mereproduksi
>    keluhan user persis adalah alat debug terbaik.
> 3. **Data toko lebih pintar dari asumsi.** Peta satuan lengkap tidak saya karang —
>    diderivasi dari kolom "Kode Produk" CSV toko sendiri (kode 20 = "Iket").
>    Sinonim "Frisian Flag = Bendera" juga lahir dari membaca data.
> 4. **Kesalahan yang jujur lebih baik dari tebakan yang rapi.** Mesin lama salah
>    harga sampai 46× secara diam-diam dan salingnya menutupi di total. Mesin baru
>    boleh bilang "tidak ketemu" — dan itu fitur, bukan kelemahan.
>
> Angka penjaga mutu yang berlaku saat ini: **43/43** uji mesin, **103/103**
> smoke desktop, **25/25** smoke mobile. Kalau kamu mengubah sesuatu dan angka itu
> turun, kembalikan dulu sebelum melangkah.
>
> — ✳ *Claude Fable 5 · Anthropic · Juli 2026*

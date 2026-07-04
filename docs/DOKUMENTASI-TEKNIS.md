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
| **Stok Kosong** | `sk` | Checklist stok dua-mode (Bos ↔ Karyawan) dengan PIN & sync |

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
data/Products.csv   contoh export Griyo POS (2.811 baris) — fixture test
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
   kecuali fungsi khusus-bos (kategori, PIN, log, reply, export).
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
| `brk-pnl-raw` | PNL | teks mentah (auto-save, debounce 500ms) |
| `brk-pnl-mode` | PNL | `'A' \| 'B'` |
| `brk-pnl-start` | PNL | tanggal mulai Mode A |
| `brk-pnl-arsip` | PNL | `{ 'YYYY-MM-DD': [{j:'p'\|'v', amt:Number, ket:String}] }` |
| `stok-boss-data` | Stok | state bos **(key WARISAN app lama — jangan ganti, zero-migration)** |
| `stok-worker-data` | Stok | state karyawan |
| `stok-pin` | Stok | SHA-256 hex PIN |
| `stok-ver` | Stok | versi skema (`'7'`) — mismatch → PIN **dan** sesi bos dihapus |
| `stok-boss-exp` | Stok | epoch ms kedaluwarsa sesi bos |
| `stok-timeout` | Stok | menit timeout (0 = tidak pernah) |
| `stok-oor` | Stok | tampilan item di luar filter: `'dim' \| 'hide'` |
| `stok-output-ts` | Stok | header tanggal di output: `'show' \| 'hide'` |

Total pemakaian tipikal (DB 2.811 produk + arsip setahun) ±600 KB — jauh di bawah kuota ±5 MB.

---

## 5. Modul 1 — Nota Kulakan

### Alur data
```
Products.csv ──parseProductsCSV──▶ brk-nota-db (sekali, persisten)
input teks ──parseKulakanLine──▶ nkItems[] ──matchProduct──▶ review table
review ──nkBuildReceipt──▶ nota thermal ──▶ print / WA teks / WA gambar / riwayat
```

### Struktur baris DB
```js
{ nama, hargaJual, hargaPokok, satuan /*label tampil*/, satClass /*kelas cocok*/,
  kode, barcode }
// cache runtime (tidak disimpan): _tok (token nama), _nn (string cari)
```
Label satuan per-baris diambil dari **suffix kolom "Kode Produk"** bila dikenal
(mis. `"7612 Slop"` → Slop), fallback ke `SATUAN_CODE_MAP` kode Griyo:
`{1:Kg, 2:Biji, 4:Pak, 5:Bal, 6:Sak, 7:Biji, 8:Biji, 9:Slop, 10:Pres, 11:Ons,
12:Biji, 13:Kas, 14:Dos, 15:Lusin, 16:Box, 17:Rek, 18:Ret, 19:Tas, 20:Ikat,
22:Roll, 23:Toples, 24:Paket}` (kode 20=Ikat diderivasi dari data toko).

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
(`_bgCache`/`_simCache`) — ±12 ms/pencarian pada 2.811 produk.

**Tolok ukur tetap:** template kulakan nyata 43 baris (`tests/template.txt`) —
43/43 sesuai harapan, 34 hijau otomatis, 6 kuning-top-benar, 3 flag-benar.
Setiap perubahan mesin wajib mempertahankan angka ini.

---

## 7. Modul 2 — PNL Analyzer + Arsip

### Parser
- **Mode A**: blok dipisah baris kosong ganda; tanggal = tanggalMulai + indeks blok.
  Blok dilewati **tetap menggeser tanggal** → preview per-blok ditampilkan dengan
  peringatan (mitigasi P4).
- **Mode B**: blok dipisah kemunculan `#tanggal DD/MM/YYYY` (tahun 2 digit → +2000).
- `#cash` menjumlah **semua angka di barisnya** (`#cash 5628000 + 190000 saldo` →
  5.818.000) — by design (fix P2).
- `#gross/#net_cash/#margin*` di input diabaikan (dihitung ulang).
- Rumus: `gross = income − kulakan`; `netPos = cash − kulakan`;
  margin **tertimbang dari total** di SEMUA tampilan (fix P5) — bukan rata-rata
  margin harian.
- Blok valid: punya tanggal dan minimal satu dari income/kulakan/cash.

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
`.html`. Tanggal diserialisasi sebagai epoch ms.

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

### Sinkronisasi output dua arah (bagian paling rawan — baca sebelum edit)
- `skBuildOutput()`: item tercentang → teks, dikelompokkan per tanggal
  `checkedAt` (header `── Hari ini ──` hanya jika >1 kelompok & setting show).
- `skOnOutputChange()` (textarea diedit manual):
  - baris cocok → check + **update qty DAN satuan item + DOM kartu langsung** (fix S3);
  - tidak cocok TAPI item sedang terfilter keluar tanggal → **JANGAN uncheck**
    (bug historis #6);
  - selain itu → uncheck.
  - `skSuppress` mencegah loop saat menulis programatik.
- Tabel `checkedAt` (kapan di-set/reset) identik dengan spec lama §6 — uncheck lalu
  check ulang = timestamp reset ke sekarang (keputusan pemilik).

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

### Backup gabungan
File `berkah-DD-MM-YY.json`: `{app:'berkah-aio', version:1, exported, nota, pnl
(termasuk arsip), stok:{boss, mode:'worker'}}`. Export via Web Share (fallback
unduh). Restore memakai jalur `applySyncPayload`; bagian stok butuh Mode Bos.

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
CHROMIUM_PATH=/path/to/chromium node tests/smoke.js         # desktop 44/44
CHROMIUM_PATH=/path/to/chromium node tests/smoke-mobile.js  # mobile 12/12
```

Cakupan smoke: upload & persistensi CSV, parse 43 baris, dropdown+search+kamus,
kalkulator (modal, terpusat, **ukuran stabil setelah ketik — regresi bug nyata**),
generate nota, PNL mode B + `#cash` multi-angka, arsip auto-isi + donut + legend +
sorot + search + toggle jenis, stok add/toggle/output-dua-arah/minus-freeze,
gesture 5-tap + PIN + `mode:'worker'` di storage, seekbar collapse/tembus-klik/
bangun, nav bawah, font ≥16px, tema, signature.

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

### Checklist debug cepat
1. Fungsi stok pakai `skActive()` atau `skState` yang salah?
2. `checkedAt` mengikuti tabel §8?
3. `skSuppress` di-set sebelum menulis output programatik?
4. Ada `const/let` dipakai sebelum deklarasi (IIFE awal)?
5. Ada class CSS dipakai dua makna? (pelajaran G3)
6. Test: 43/43, 44/44, 12/12 masih hijau?

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
> Angka penjaga mutu saat saya menyerahkan ini: **43/43** uji mesin, **44/44**
> smoke desktop, **12/12** smoke mobile. Kalau kamu mengubah sesuatu dan angka itu
> turun, kembalikan dulu sebelum melangkah.
>
> — ✳ *Claude Fable 5 · Anthropic · Juli 2026*

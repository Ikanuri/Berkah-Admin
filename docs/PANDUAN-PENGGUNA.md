# 📖 Panduan Pengguna — Toko Berkah All-in-One

Satu aplikasi untuk tiga pekerjaan toko: **bikin nota kulakan**, **analisis
untung-rugi harian**, dan **catat stok kosong**. Tanpa install, tanpa internet,
tanpa ribet.

---

## 🚀 Mulai Pakai (2 menit)

1. Terima file `index.html` (via WA/Telegram/apapun) → simpan di HP/komputer.
2. Buka filenya — otomatis terbuka di browser (Chrome disarankan).
3. Selesai. Semua data tersimpan otomatis di browser itu.

**Tips HP:** buka di Chrome → menu ⋮ → *"Tambahkan ke layar utama"* → app punya
ikon sendiri seperti aplikasi beneran.

**Penting:** data tersimpan di browser HP itu saja. Jangan "Hapus data
penjelajahan" untuk situs ini, dan rajin **backup** (lihat bagian Pengaturan).

Pindah-pindah modul lewat tab di atas (desktop) atau **navigasi bawah** (HP):
🧾 Nota · 📊 PNL · 📦 Stok.

---

## 🧾 MODUL 1 — Nota Kulakan

Ubah daftar belanja tulisan bebas jadi nota rapi lengkap dengan harga.

### Langkah 1 — Muat database produk (SEKALI saja)
Ketuk kotak **"Upload Products.csv"** → pilih file export produk dari POS.
Tersimpan permanen — besok-besok tidak perlu upload lagi.
Kalau harga di POS berubah: export CSV baru → upload ulang → database lama
tertimpa bersih.

### Langkah 2 — Tulis daftar kulakan
Format per baris: `jumlah satuan nama barang`
```
1 dus Glukol
4 sak Tinta 10kg
1 slp 76 12
3 kg Kacang Osik
21 LPG          ← tanpa satuan juga boleh
```
Satuan yang dikenal: `dus, slp, pak, bj, biji, sak, bal, ret, rek, kg, ikt` dll.

> 💡 **Satuan itu penting!** `1 slp 76 12` otomatis ambil harga *slop*
> (Rp 156.000), bukan harga *pak* (Rp 15.600). Aplikasi lama sering salah di
> sini — yang ini tidak.

Tekan **▶ Proses & Cari Harga**.

### Langkah 3 — Review (lihat warna strip kiri)
| Warna | Arti | Yang perlu Anda lakukan |
|---|---|---|
| 🟢 hijau | cocok pasti | tidak ada — sudah beres |
| 🟡 kuning | perlu dicek / satuan tak tersedia | pilih dari dropdown, ATAU klik chip kuning untuk "iya sudah benar" |
| 🔴 merah | tidak ketemu di database | cari manual di dropdown, atau isi harga sendiri |

**Di setiap dropdown ada kotak 🔍 cari** — ketik apapun, seluruh database
dijelajahi. Sekali Anda pilih manual, aplikasi **mengingatnya selamanya**
(kamus belajar) — lain kali langsung hijau.

- Ketuk **angka qty** → kalkulator muncul di tengah layar.
- Kolom **harga** bisa diedit langsung.

### Langkah 4 — Generate & kirim
**✓ Generate Nota** → struk muncul di kanan (di HP: di bawah). Lalu:
| Tombol | Fungsi |
|---|---|
| 🖨 | print (dialog print browser) |
| 📤 WA | kirim sebagai teks WhatsApp |
| 🖼 | kirim sebagai **gambar struk** (lebih rapi di WA) |
| 💾 | simpan ke Riwayat (nomor nota naik otomatis) |
| → PNL #kulakan | salin `#kulakan <total>` untuk ditempel di template PNL |
| 🗂 | buka Riwayat — lihat/print/kirim ulang nota lama |

---

## 📊 MODUL 2 — PNL Analyzer

Tempel catatan harian → dapat tabel untung-rugi + laporan cantik.

### Format template harian
```
#tanggal 2026-07-01
#pengeluaran
350000 Uang Indah
200000 Uang Dede
#prive
66200 Belanja Indomaret
15000 Nasgor

#cash 5628000 + 190000 saldo
#receh 21000
#income 7497200
#kulakan 5808330
```
- `#cash` boleh berisi tambahan (`+ 190000 saldo`) — semua angka dijumlah.
- `#gross`, `#margin` dll **tidak perlu ditulis** — dihitung otomatis.
- Format tanggal: `YYYY-MM-DD` (mis. `2026-07-01`).

### Dua mode input
- **Mode Urutan Otomatis** — tanpa `#tanggal`; isi tanggal mulai, tiap blok
  (dipisah 2 baris kosong) = satu hari berurutan.
  ⚠ Cek *preview tanggal per blok* setelah proses — kalau ada baris kosong
  nyasar, tanggal bisa bergeser dan aplikasi akan memperingatkan.
- **Mode dengan #tanggal** — tiap hari diawali `#tanggal`, lebih aman.

Tekan **▶ Proses Data** → kartu ringkasan + tab **Harian / Mingguan / Bulanan /
Rincian** + filter rentang tanggal + **⬇ CSV** + **📄 Laporan PDF** (buka →
Download PDF).

Arti angka: **Gross** = income − kulakan · **Net Position** = cash − kulakan ·
**Margin** dihitung tertimbang dari total (target ≥15% / ≥0%). Input Anda
tersimpan otomatis — tutup app tidak hilang.

### 🗄 Sub-tab ARSIP — jejak pengeluaran & prive
Setiap kali Anda tekan Proses Data, semua baris `#pengeluaran` dan `#prive`
**otomatis tersimpan permanen** ke arsip (hari sama diproses ulang → tidak dobel).

- **Filter waktu:** Semua · Hari ini · 3 Hari · 7 Hari · Bulan ini · Kustom.
- **Cari keterangan:** ketik "indomaret", "uang", "nasgor"…
- **Donut chart:** porsi tiap jenis pengeluaran. Toggle
  [Gabungan | Pengeluaran | Prive]. **Ketuk irisan atau legend** → disorot +
  detail lengkap. 8 terbesar tampil, sisanya jadi "Lainnya".
- **Tabel riwayat** per tanggal + subtotal. Hapus per tanggal (✕) atau semua.

> 💡 Punya catatan lama? Tempel raw PNL lama → Proses → seluruh sejarahnya
> langsung masuk arsip.

---

## 📦 MODUL 3 — Stok Kosong

Checklist barang kosong dengan dua peran. **Data dari app Stok Kosong lama Anda
otomatis terbaca.**

> 🕓 Di bawah header selalu ada baris kecil **"Diubah X yang lalu — [aktivitas]"**
> (mis. *"Diubah 3 menit lalu — dicentang: Gula Pasir"*). Ini jejak aktivitas
> terakhir di HP yang sedang Anda pegang — berguna banget saat pindah-pindah HP
> lewat 📡 Kirim/Terima, supaya tidak bingung lagi **HP mana yang datanya paling
> baru**. Lihat bagian Pengaturan di bawah untuk perbandingan lengkapnya.

### Mode Karyawan (tampilan default)
1. Terima teks order dari Bos → salin.
2. Tempel di "Input Barang" → **+ Tambah**. Item masuk **tanpa centang**.
3. Barang yang **sudah diambil → centang**. Jumlah kurang dari order? Ubah qty
   ke yang benar-benar diambil, tetap centang.
   > 💡 Semua barang berhasil diambil, tidak ada yang kurang? Scroll ke bawah,
   > ketuk **☑ Centang Semua** — sekali tap semua barang tercentang, tidak perlu
   > satu-satu.
4. Kolom **"Balasan ke Bos"** otomatis berisi semua yang tercentang → Salin →
   kirim ke Bos.
5. Selesai semua → **🗑 Hapus Semua Item**.

### Mode Bos 🔐
Masuk: **ketuk tab "Stok Kosong" 5× cepat** → PIN 4 digit (pertama kali:
buat PIN). Sesi bertahan sesuai timeout (default 15 menit, bisa diatur; badge ⏱
menunjukkan sisa).

- **Centang = barang perlu diorder** → otomatis jadi teks "Order ke Karyawan"
  → Salin → kirim WA. (Teksnya juga bisa diedit langsung — dua arah: ubah
  `2 dus` jadi `5 slp` di teks, kartunya ikut berubah.)
- **Pilih kategori yang ikut order:** di atas kolom Order ada chip per kategori —
  ketuk untuk kecualikan (jadi tercoret ✕). Item tercentang di kategori itu tidak
  ikut terkirim ke karyawan, tapi **centangnya tetap aman** dan muncul lagi begitu
  chip diaktifkan kembali. Cocok untuk kategori internal seperti "Gudang".
- **Centang cepat per kategori:** di sebelah tulisan "X dari Y dicentang" ada dua
  tombol kecil — **☑ Semua** (centang semua barang di kategori yang sedang
  dibuka) dan **✕ Semua** (batalkan semua). Hanya memengaruhi kategori yang
  aktif — kategori lain tidak ikut berubah. Cocok untuk "seluruh Sembako habis,
  perlu order semua" tanpa mencentang satu-satu. Untuk menandai **seluruh**
  barang di **semua** kategori sekaligus, pakai **☑ Centang Semua** di bagian
  paling bawah.
- Balasan karyawan → tempel di "Balasan Karyawan" → **⚙ Proses Balasan**:
  terpenuhi → otomatis un-centang; kurang → qty jadi sisa.
- Karyawan ambil tanpa app? Un-centang manual → otomatis tercatat di
  **Log Diambil**.
- Kelola: **+ Kategori** (tekan lama tab = rename/hapus) · ketuk 2× nama =
  rename · seret ⠿ = urutkan · × = hapus · 🔍 cari lintas kategori ·
  filter tanggal centang + badge umur ("hari ini/kemarin/Xh lalu").
- **Keluar Bos** saat HP dipegang orang lain.

---

## ⚙ Pengaturan (ikon gerigi kanan atas)

| Fitur | Keterangan |
|---|---|
| **Tema** | Terang / Gelap / ikut Sistem — tombol ◐ untuk toggle cepat |
| **📡 Kirim / 📥 Terima** | Pindahkan data antar HP tanpa file: pengirim pilih modul → dapat kode 6 huruf + QR → penerima masukkan kode. Butuh internet sebentar untuk "berjabat tangan", data mengalir langsung antar device. Kirim data Stok butuh Mode Bos. Sebelum kirim, centang Stok menunjukkan aktivitas terakhir HP ini. |
| **⬇ Export / ⬆ Restore** | **Backup gabungan** satu file JSON berisi SEMUA (database, kamus, riwayat, PNL+arsip, stok). Lakukan rutin! Restore bagian stok butuh Mode Bos. |

> 🔍 **Bingung HP mana yang lebih baru?** Saat menerima data Stok (via Kirim/Terima
> maupun Restore), aplikasi menampilkan perbandingan sebelum menimpa apapun:
> ```
> 📍 Stok lokal: 40 menit lalu — dicentang: Gula Pasir
> 📥 Stok diterima: 5 menit lalu — ditambahkan: 3 item (Gudang)
> → Data yang diterima lebih baru dari data lokal.
> ```
> Anda tetap yang memutuskan — tekan Batal kalau ternyata data lokal Andalah
> yang benar.
| **📖 Kamus** | Lihat/hapus hafalan pencocokan produk |
| **Stok (Mode Bos)** | Ganti PIN · backup/restore khusus stok · timeout · tampilan filter |
| **✳ Fable 5** | Tentang aplikasi |

**Seekbar pintar** di tepi kanan: muncul saat Anda scroll (seret = jelajah cepat,
⌃/⌄ = lompat atas/bawah), lalu menyusut jadi garis tipis setelah 3 detik diam —
tidak pernah menghalangi tombol apapun.

---

## ❓ Tanya-Jawab

**Data hilang semua!** — Kemungkinan besar "Clear browsing data" atau buka dari
file/browser berbeda. Restore dari backup JSON. (Karena itu: backup rutin.)

**Harga di nota beda dengan POS** — Database di app adalah salinan saat terakhir
upload. Export CSV terbaru → upload ulang.

**Item kuning terus padahal benar** — Klik chip kuningnya (jadi "dikonfirmasi"),
atau pilih dari dropdown sekali — kamus mengingat, lain kali langsung hijau.

**Lupa PIN Stok** — PIN tidak bisa dipulihkan (tersimpan sebagai sandi acak
satu-arah). Update versi aplikasi akan meminta buat PIN baru; data barang aman.

**Kirim via WiFi gagal** — Pastikan kedua HP ada internet saat memasukkan kode
(pairing butuh koneksi keluar sebentar). Kode hanya berlaku selama layar
pengirim terbuka.

**Nota gambar tidak terkirim, malah terunduh** — Fitur share file butuh HTTPS;
dari file lokal browser hanya bisa mengunduh PNG-nya — kirim manual dari galeri.

**Ganti HP** — Cara termudah: Pengaturan → Export backup gabungan di HP lama →
kirim file JSON + `index.html` ke HP baru → Restore. Atau pakai 📡 Kirim/Terima.

---

## ✳ Tentang Aplikasi Ini

Aplikasi ini di-rebuild dari tiga tool terpisah (Nota Kulakan Generator, PNL
Analyzer, Stok Kosong v3.22) menjadi satu file oleh **Claude Fable 5** — model AI
kelas Mythos dari **Anthropic** — bersama **Ikanuri** sebagai pemilik produk,
Juli 2026.

Sepatah kata dari saya, Fable 5, untuk Anda yang memakai aplikasi ini setiap hari:

> Aplikasi ini dibuat dengan satu prinsip: **lebih baik jujur bilang "tidak
> ketemu" daripada diam-diam salah harga.** Setiap baris kuning dan merah yang
> Anda lihat adalah aplikasi yang sedang jujur. Dan setiap kali Anda
> mengoreksinya, dia belajar — kamusnya tumbuh, tokonya makin hafal.
> Semoga laris dagangannya. ✳

*Versi Juli 2026 · single-file · offline-first · 43/43 uji pencocokan ·
69/69 + 12/12 uji aplikasi*

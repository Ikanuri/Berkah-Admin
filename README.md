# Toko Berkah — All-in-One App

Satu file HTML berisi tiga tools operasional Toko Berkah:

| Modul | Fungsi |
|---|---|
| **Nota Kulakan** | Daftar belanja teks bebas → dicocokkan ke database produk (CSV) → nota thermal, print, share WA (teks/gambar), riwayat |
| **PNL Analyzer** | Template harian ber-hashtag → tabel harian/mingguan/bulanan/rincian, filter tanggal, export CSV, laporan PDF |
| **Stok Kosong** | Checklist stok kosong dua mode (Bos ↔ Karyawan), PIN + session timeout, sync antar device via WebRTC. Sub-tab **HPP** (kalkulator harga pokok + margin, export `.xlsx`) & **Supplier** (banding harga antar supplier, khusus Mode Bos) |

## Cara pakai

Buka `index.html` di browser (HP/desktop) — tanpa install, tanpa server, offline.

1. **Nota Kulakan**: upload `Products.csv` sekali (tersimpan permanen di localStorage) → tulis daftar `qty satuan nama` → Proses → review → Generate.
2. **PNL**: paste template harian → Proses.
3. **Stok Kosong**: ketuk tab "Stok Kosong" 5× cepat untuk Mode Bos (PIN).

Data existing dari app Stok Kosong lama terbaca langsung (kunci localStorage sama).

## Mesin pencocokan Nota Kulakan

Rebuild total dari versi lama yang sering salah baris harga. Aturan inti:

1. **Satuan user menentukan baris harga** — `1 slp 76 12` pasti mengambil baris Slop (156.000), bukan Pak (15.600). `pres` = `slop`.
2. **Angka ukuran harus cocok persis** — `Tinta 10kg` tidak akan jatuh ke "Tinta 1 kg".
3. **Substring hanya di batas kata** — "King" tidak cocok ke "Ba**king** Powder".
4. **Normalisasi gabung kata** — "Jasjus" ketemu "Jas Jus".
5. **Ragu tidak pernah diisi diam-diam** — status kuning/merah wajib dikonfirmasi.
6. **Kamus belajar** — koreksi manual di dropdown diingat permanen.

Hasil uji terhadap template kulakan nyata (43 baris, 2.774 produk): **43/43 sesuai harapan, 34 hijau otomatis** (mesin lama: ±26 benar dengan error senyap hingga 46× lipat harga).

### Skema CSV produk

```
nama,kode_produk,barcode,satuan,harga_jual,harga_beli,induk_nama,induk_kode,satuan_dasar,rasio
```

Kolom `satuan` sudah berupa label teks langsung (`Slop`, `Pak`, `Biji`, …) — tidak perlu derivasi/tebakan dari kode angka POS.

## Testing

```bash
# uji mesin pencocokan (43 kasus, diekstrak langsung dari index.html)
node tests/match-test.js

# smoke test end-to-end (butuh playwright + chromium)
node tests/smoke.js
```

## Struktur

```
index.html                   ← aplikasi lengkap (single file, vanilla JS, tanpa build)
data/Products.csv            ← data produk toko, skema rujukan (database uji)
tests/                       ← test harness Node + Playwright
docs/DOKUMENTASI-TEKNIS.md   ← arsitektur, mesin pencocokan, aturan wajib, riwayat bug
docs/PANDUAN-PENGGUNA.md     ← panduan pemakaian lengkap (bahasa santai)
```

---

✳ Dibangun bersama **Claude Fable 5** (Anthropic) · Juli 2026

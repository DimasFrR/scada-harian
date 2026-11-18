# SCADA Harian — Tirta Sukapura

Dashboard monitoring debit & tekanan harian **Perumda Air Minum Tirta Sukapura**.
Dipakai petugas lapangan (input dari HP saat keliling) dan atasan (lihat dashboard +
tarik data jadi PDF untuk diprint).

- **Web**: Next.js (App Router, TypeScript), mobile-first, deploy di Vercel.
- **Android APK**: Capacitor — APK memuat situs Vercel live, jadi satu kode untuk
  web + HP. APK debug otomatis di-build oleh GitHub Actions tiap push ke `main`.

## Fitur

- **Login dulu**: satu password bersama (env `APP_PASSWORD`). Semua halaman
  dilindungi middleware; sesi via cookie httpOnly.
- **Dashboard**: pengukuran terbaru tiap titik + alarm otomatis:
  - KRITIS — titik ditandai "kosong" (tidak ada air) atau tekanan 0 bar.
  - PERINGATAN — tekanan < 0,5 bar atau debit turun > 30% vs pengukuran sebelumnya.
- **Input Ukur**: tanggal + jam terisi otomatis (WIB) tapi bisa diubah (input
  susulan), debit (L/detik), tekanan (bar), checkbox "kosong". Angka boleh pakai
  koma Indonesia (6,55). Tambah/ubah/hapus titik & pengukuran.
- **Data**: tabel semua pengukuran dengan filter tanggal + titik.
- **Tren**: grafik garis debit & tekanan per titik.
- **Download PDF**: tombol di Dashboard & Data — generate PDF laporan asli
  (tabel data + ringkasan alarm) untuk diprint, seperti billing. Ada juga tombol
  Print (print stylesheet bersih).
- **Panel referensi**: volume tertagih Okt 2026 — 49.102 SL / 683.735 m³ /
  Rp 6.957.377.800 (18/18 cabang). NRW: "Menunggu data produksi IPA".
- **29 titik ukur** terdaftar otomatis saat database pertama kali diisi
  (`lib/points.ts`) — data pengukuran mulai dari NOL.

## Deploy (Vercel)

1. Buat project Vercel dari repo ini (import GitHub).
2. Buat **Vercel Postgres** (Storage → Create Database → Postgres) dan hubungkan
   ke project — `DATABASE_URL` terisi otomatis.
3. Atur env var **`APP_PASSWORD`** (password login dashboard) di
   Settings → Environment Variables (Production).
4. Deploy. Tabel dibuat + 29 titik ter-seed otomatis saat pertama diakses.
5. **Perbaiki URL APK**: setelah tahu URL Vercel sebenarnya, ubah
   `PRODUCTION_URL` di `capacitor.config.ts` (saat ini placeholder
   `https://scada-harian.vercel.app`), commit, push — workflow akan build APK
   baru yang menunjuk ke URL benar.

## APK Android

- Workflow `.github/workflows/build-apk.yml` berjalan tiap push ke `main`:
  install deps → `next build` → `cap sync android` → `./gradlew assembleDebug`
  → upload artifact **`scada-harian-apk`**.
- Unduh APK dari tab **Actions** repo → artifact `scada-harian-apk` → install
  di HP (izinkan "install dari sumber tidak dikenal" sekali saja).
- APK memuat situs Vercel live, jadi HP harus online. Data tersimpan di
  Postgres, bukan di HP — ganti HP pun data tetap ada.

## Instal sebagai "aplikasi" dari browser HP (tanpa APK)

Buka situs di Chrome HP → menu ⋮ → **"Tambahkan ke Layar Utama"** — ikon
aplikasi muncul di home screen dan dibuka layar penuh seperti aplikasi biasa.

## Jalankan lokal

```bash
cp .env.example .env.local   # isi APP_PASSWORD + DATABASE_URL
npm install
npm run dev
```

Tanpa `DATABASE_URL`, aplikasi tetap jalan tapi menampilkan pesan setup
database; tanpa `APP_PASSWORD`, halaman login menampilkan pesan setup password.

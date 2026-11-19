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
- **Foto bukti**: tiap pengukuran bisa dilampiri 1 foto meter/titik (diambil
  dari kamera HP, otomatis dikompres ke maks 1280px JPEG q70, tersimpan di
  Vercel Blob). Foto tampil sebagai thumbnail di riwayat Input & halaman Data.
  Kalau `BLOB_READ_WRITE_TOKEN` belum diatur, fitur foto nonaktif dan
  pengukuran tetap bisa disimpan tanpa foto.
- **Alarm WhatsApp**: tiap pengukuran baru yang memicu alarm KRITIS/PERINGATAN
  otomatis dikirim ke WhatsApp penerima via Fonnte (1x per pengukuran, tidak
  spam). Butuh env `FONNTE_TOKEN` + `WA_ALARM_TARGETS`. Kalau belum diatur,
  alarm tetap tampil di dashboard, WA tidak dikirim.
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

## Aktivasi fitur foto & alarm WhatsApp (opsional)

Keduanya **nonaktif secara default** dan aplikasi tetap jalan normal tanpanya.

**Foto (Vercel Blob):**

1. Vercel Dashboard → project ini → **Storage → Create → Blob**.
2. Buka store baru → tab **.env.local** → salin `BLOB_READ_WRITE_TOKEN`.
3. Project → **Settings → Environment Variables** → tambah
   `BLOB_READ_WRITE_TOKEN` (Production) → **Redeploy**.
4. Cek: di menu Input Ukur muncul kolom foto (bukan pesan "belum diaktifkan").

**Alarm WhatsApp (Fonnte):**

1. Daftar di [fonnte.com](https://fonnte.com), hubungkan nomor WhatsApp
   pengirim (scan QR di dashboard Fonnte), salin **token** perangkat.
2. Project → **Settings → Environment Variables** → tambah:
   - `FONNTE_TOKEN` = token Fonnte
   - `WA_ALARM_TARGETS` = nomor penerima dipisah koma, contoh
     `6281234567890,6289876543210` (boleh tulis `08...`, otomatis diubah ke `62...`)
3. **Redeploy**. Cek: di Dashboard muncul "Alarm WhatsApp: aktif — terkirim
   ke N nomor." Alarm KRITIS/PERINGATAN dari pengukuran baru terkirim 1x per
   pengukuran (edit pengukuran tidak mengirim ulang).

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

# SCADA Harian Tirta Sukapura — Vercel build brief

Repo: https://github.com/DimasFrR/scada-harian (public, created 18 Nov 2026)
Target: Vercel + Vercel Postgres. Login gate (APP_PASSWORD env var) before dashboard.
Status: WAITING on user's full-access Vercel token (current token is scoped to aevum-checkout only) + login password choice.

## 29 measurement points (canonical, in field-round order)

Derived 18 Nov 2026 from the 5 field reports (6/23/27/29 Oct, 16 Nov 2026) in
~/workspace/goals/nrw-reduction-and-dma-monitoring-at-tirta-sukapura/files/.
Raw names had spelling variants/typos across reports (e.g. "Otlet Cioray" =
Outlet Cioray, "Rongok" = Rongsok, "Simlim" = Simpang Lima, "MT" = Mina Tirta,
"Cbr"/"Looger Cibeureum" = Logger Cibeureum, "Bumiasri" = Prm. Bumi Asri).
These 29 are the canonical list — matches the SCADA Harian Muse app
("Kantor Pusat → Paseh 500").

1. Kantor Pusat
2. PDI (PDI Perjuangan)
3. Dr. Tata
4. Cilingga
5. Jemb. Mina Tirta
6. P. Aay
7. Bantar
8. Kejaksaan
9. Samsat
10. Prm. Bumi Asri
11. Prm. Cisalak
12. Jemb. Simpang Lima
13. LP
14. Jemb. Parahyangan
15. Logger Cibeureum
16. Condong 250
17. Condong 200
18. Hera
19. Rongsok
20. Gn Tajur
21. SPK
22. Inlet booster
23. Inlet Cioray
24. Outlet Cioray
25. D Village
26. Lauk
27. Respati
28. Sd Wo
29. Paseh 500

## App spec (mirror the SCADA Harian Muse app + additions)

- Login page FIRST (single shared password, env var APP_PASSWORD). Session cookie after login. No public data without login.
- **MOBILE-FIRST (boss wants a phone app — 18 Nov): the web app must work like an
  app on HP: responsive layout, big input buttons, installable to home screen
  (PWA manifest). Real APK later possible from the same code (Capacitor wrap).**
- Dashboard: today's/latest measurements per point, automatic alarms:
  - CRITICAL: point marked "kosong" (no water) or pressure 0 bar.
  - WARNING: pressure < 0.5 bar, or debit drop > 30% vs previous measurement of same point.
- Input Ukur form: date + time (auto-fill current WIB, editable for late entry),
  debit (L/detik), tekanan (bar), "kosong" checkbox per point. Add/edit/delete
  points and measurements.
- Trend charts per point (debit + tekanan over time).
- Data tab: table with date/point filters.
- Oct 2026 billed-volume reference panel: 49,102 SL / 683,735 m3 / Rp 6.957.377.800
  (18/18 branches verified). NRW shows "Menunggu data produksi IPA" (no number invented).
- Export PDF (NEW, user asked 18 Nov): "Download PDF" button builds a printable
  report (per-date table: point, debit, tekanan, kosong flags + alarm summary)
  as a real PDF file (jsPDF or equivalent), like the billing system's PDF print.
  Also a print stylesheet so window.print() gives a clean printout.
- Fresh/empty start: 29 points pre-registered, ZERO measurements (same as SCADA Harian).
- Units: debit L/detik, tekanan bar. Decimal comma input accepted (Indonesian format).
- Language: Indonesian.

## Data model (Postgres)

- points(id, name, sort_order, created_at)
- measurements(id, point_id, date, time, debit_lps NULL, pressure_bar NULL, is_empty BOOL, created_at)
- Seed points from the list above on first deploy.

## Deploy notes

- Next.js (same pattern as aevum-checkout: repo DimasFrR/aevum-checkout, Vercel project prj_FM9DqtLjU0qQILPZVgJecAtwrYPG).
- Env vars: DATABASE_URL (from Vercel Postgres), APP_PASSWORD (user-chosen).
- Vercel Postgres: create via Vercel API/dashboard once the full-access token lands; link to project so env vars are injected.
- Verify live: login works, input saves + persists, alarm logic, PDF download.

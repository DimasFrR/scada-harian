// Rincian per cabang Oktober 2026 — disalin persis dari file Bagian Produksi
// (laporan_teknik_bulan_oktober_2026.xlsx, sheet OKT26(DEAL),
// "REKAPITULASI DATA OPERASIONAL BULAN OKTOBER 2026"), diekstrak ulang
// 26 Nov 2026 dan dicocokkan dengan total perusahaan:
//   produksi 1.038.148,1064 · distribusi 1.036.354,6584 · terjual 683.735
//   kehilangan 352.619,6584 · NRW 34,025% · SL terpasang 49.651 / aktif 49.102.
// Nilai disimpan presisi penuh (4 desimal) agar jumlahannya sama persis
// dengan JUMLAH di file; tampilan tetap 2 desimal (fmt2).
//
// Catatan dari file:
// - Cabang tanpa produksi sendiri (Tasik Timur, Cibeureum, Tamansari,
//   Manonjaya, Kawalu, Singaparna, Sariwangi, Mangunreja) punya production
//   NULL — produksinya dibukukan di Tasik Barat (Gn. Tajur 319,33 L/s,
//   pembacaan AMR, melayani Tasik Barat + Timur + Cibeureum + Manonjaya +
//   Kawalu). Bukan nol — memang tidak ada di file.
// - SALAWU dan CIAWI masing-masing punya 2 sumber air (header gabung
//   M7:N7 dan T7:U7): SALAWU = Mata Air Cisitu + Mata Air Cibatur;
//   CIAWI = Mata Air Sanghiang + Mata Air Cipondok. Label ini sudah
//   dikonfirmasi user 25 Nov 2026 dari foto layar Excel-nya.
// - Kehilangan SALAWU–Cisitu di file = 1.781,88 m³ (bukan 796,88):
//   file membukukan kehilangan total Salawu di kolom Cisitu, dan kolom
//   Cibatur dikosongkan. NRW 19,52% = 1.781,88 / 9.128,88 (produksi
//   gabungan Salawu). Disalin apa adanya, tidak dihitung ulang.
// - Sel kosong di file (Cibatur: kehilangan/NRW/SL terpasang; Tangki:
//   kehilangan/NRW) disimpan NULL dan ditampilkan "—".
export interface MonthlyBranchSeedRow {
  month: string; // YYYY-MM
  branch: string;
  sort_order: number;
  production_m3: number | null;
  distribution_m3: number | null;
  billed_m3: number;
  loss_m3: number | null;
  nrw_pct: number | null;
  sl_installed: number | null;
  sl_active: number | null;
}

export const OCT_2026_BRANCH_ROWS: MonthlyBranchSeedRow[] = [
  { month: "2026-10", branch: "Tasik Barat", sort_order: 1, production_m3: 855293.472, distribution_m3: 229779.936, billed_m3: 149316, loss_m3: 80463.936, nrw_pct: 35.0178, sl_installed: 10592, sl_active: 10592 },
  { month: "2026-10", branch: "Tasik Timur", sort_order: 2, production_m3: null, distribution_m3: 184756.032, billed_m3: 120135, loss_m3: 64621.032, nrw_pct: 34.9764, sl_installed: 8699, sl_active: 8496 },
  { month: "2026-10", branch: "Cibeureum", sort_order: 3, production_m3: null, distribution_m3: 77325.408, billed_m3: 51960, loss_m3: 25365.408, nrw_pct: 32.8035, sl_installed: 3610, sl_active: 3606 },
  { month: "2026-10", branch: "Tamansari", sort_order: 4, production_m3: null, distribution_m3: 40979.52, billed_m3: 28330, loss_m3: 12649.52, nrw_pct: 30.8679, sl_installed: 2077, sl_active: 2077 },
  { month: "2026-10", branch: "Manonjaya", sort_order: 5, production_m3: null, distribution_m3: 26784, billed_m3: 17816, loss_m3: 8968, nrw_pct: 33.4827, sl_installed: 1496, sl_active: 1447 },
  { month: "2026-10", branch: "Kawalu", sort_order: 6, production_m3: null, distribution_m3: 83967.84, billed_m3: 55843, loss_m3: 28124.84, nrw_pct: 33.4948, sl_installed: 3977, sl_active: 3949 },
  { month: "2026-10", branch: "Singaparna", sort_order: 7, production_m3: null, distribution_m3: 132687.936, billed_m3: 87974, loss_m3: 44713.936, nrw_pct: 33.6986, sl_installed: 5802, sl_active: 5732 },
  { month: "2026-10", branch: "Sariwangi", sort_order: 8, production_m3: null, distribution_m3: 29060.64, billed_m3: 18622, loss_m3: 10438.64, nrw_pct: 35.9202, sl_installed: 1609, sl_active: 1567 },
  { month: "2026-10", branch: "Mangunreja", sort_order: 9, production_m3: null, distribution_m3: 49952.16, billed_m3: 33376, loss_m3: 16576.16, nrw_pct: 33.1841, sl_installed: 2513, sl_active: 2505 },
  { month: "2026-10", branch: "SALAWU – Cisitu", sort_order: 10, production_m3: 4106.88, distribution_m3: 4106.88, billed_m3: 3310, loss_m3: 1781.88, nrw_pct: 19.5192, sl_installed: 548, sl_active: 245 },
  { month: "2026-10", branch: "SALAWU – Cibatur", sort_order: 11, production_m3: 5022, distribution_m3: 5022, billed_m3: 4037, loss_m3: null, nrw_pct: null, sl_installed: null, sl_active: 298 },
  { month: "2026-10", branch: "Sukaraja", sort_order: 12, production_m3: 17376.12, distribution_m3: 16016.832, billed_m3: 9968, loss_m3: 6048.832, nrw_pct: 37.7655, sl_installed: 712, sl_active: 712 },
  { month: "2026-10", branch: "Bt. Kalong", sort_order: 13, production_m3: 40014, distribution_m3: 39579.84, billed_m3: 27344, loss_m3: 12235.84, nrw_pct: 30.9143, sl_installed: 1927, sl_active: 1863 },
  { month: "2026-10", branch: "Indihiang", sort_order: 14, production_m3: 30480.192, distribution_m3: 30480.192, billed_m3: 18988, loss_m3: 11492.192, nrw_pct: 37.7038, sl_installed: 1485, sl_active: 1434 },
  { month: "2026-10", branch: "Rajapolah", sort_order: 15, production_m3: 5024.6784, distribution_m3: 5024.6784, billed_m3: 3351, loss_m3: 1673.6784, nrw_pct: 33.3092, sl_installed: 291, sl_active: 274 },
  { month: "2026-10", branch: "Pg. Ageung", sort_order: 16, production_m3: 8704.8, distribution_m3: 8704.8, billed_m3: 5644, loss_m3: 3060.8, nrw_pct: 35.1622, sl_installed: 569, sl_active: 569 },
  { month: "2026-10", branch: "CIAWI – Sanghiang", sort_order: 17, production_m3: 16713.216, distribution_m3: 16713.216, billed_m3: 10519, loss_m3: 6194.216, nrw_pct: 37.0618, sl_installed: 925, sl_active: 918 },
  { month: "2026-10", branch: "CIAWI – Cipondok", sort_order: 18, production_m3: 9960.3, distribution_m3: 9960.3, billed_m3: 6326, loss_m3: 3634.3, nrw_pct: 36.4879, sl_installed: 434, sl_active: 434 },
  { month: "2026-10", branch: "Cisayong", sort_order: 19, production_m3: 45452.448, distribution_m3: 45452.448, billed_m3: 30876, loss_m3: 14576.448, nrw_pct: 32.0697, sl_installed: 2384, sl_active: 2383 },
  { month: "2026-10", branch: "Tangki", sort_order: 20, production_m3: 0, distribution_m3: 0, billed_m3: 0, loss_m3: null, nrw_pct: null, sl_installed: 1, sl_active: 1 },
];

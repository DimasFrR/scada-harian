// Hitung-hitungan Rekap Bulanan — fungsi murni, dipakai halaman Bulanan dan
// PDF rekap bulanan (dan tes Node), jadi rumusnya tidak ditulis dua kali.
// Rumus (sesuai rekap yang disepakati):
//   kehilangan transmisi = produksi − distribusi
//   kehilangan air       = distribusi − volume tertagih
//   % kehilangan         = kehilangan / distribusi × 100
//   NRW                  = (produksi − volume tertagih) / produksi × 100
//   nilai kehilangan     = kehilangan × (harga air / volume tertagih) — ESTIMASI
//                          dari tarif rata-rata tertagih, bukan angka tagihan.
import { formatID } from "./alarms";
import type { MonthlyBilledRow } from "./db";

/** Angka Indonesia 2 desimal: 683735 -> "683.735,00". */
export function fmt2(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Persen 2 desimal: 34.02 -> "34,02%". */
export function fmtPct2(n: number): string {
  return `${fmt2(n)}%`;
}

/** "≈ Rp 3,59 miliar" untuk miliaran, "≈ Rp 12.345.678" di bawah itu. */
export function fmtLossValueRp(n: number): string {
  if (n >= 1e9) return `≈ Rp ${fmt2(n / 1e9)} miliar`;
  return `≈ Rp ${formatID(Math.round(n))}`;
}

/** "2026-10" -> "Okt 26" (label pendek untuk grafik). */
export function shortMonthID(month: string): string {
  const names = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  const [y, m] = month.split("-");
  const n = Number(m);
  if (!y || !n || n < 1 || n > 12) return month;
  return `${names[n - 1]} ${y.slice(2)}`;
}

export interface DerivedBilled {
  month: string;
  transmissionLoss: number | null;
  lossM3: number | null;
  lossPct: number | null; // % dari distribusi
  nrwPct: number | null; // % dari produksi
  lossValueRp: number | null;
}

export function deriveBilled(b: MonthlyBilledRow): DerivedBilled {
  const hasProd = b.production_m3 !== null && b.distribution_m3 !== null;
  const transmissionLoss = hasProd
    ? b.production_m3! - b.distribution_m3!
    : null;
  const lossM3 =
    b.distribution_m3 !== null ? b.distribution_m3 - b.m3 : null;
  const lossPct =
    lossM3 !== null && b.distribution_m3 !== null && b.distribution_m3 > 0
      ? (lossM3 / b.distribution_m3) * 100
      : null;
  const nrwPct =
    hasProd && b.production_m3! > 0
      ? ((b.production_m3! - b.m3) / b.production_m3!) * 100
      : null;
  const lossValueRp =
    lossM3 !== null && b.m3 > 0 ? lossM3 * (b.harga_air / b.m3) : null;
  return { month: b.month, transmissionLoss, lossM3, lossPct, nrwPct, lossValueRp };
}

export interface BranchRowLike {
  production_m3: number | null;
  distribution_m3: number | null;
  billed_m3: number;
  loss_m3: number | null;
  sl_installed: number | null;
  sl_active: number | null;
}

export interface BranchTotals {
  production: number;
  distribution: number;
  billed: number;
  loss: number;
  /** % kehilangan dari distribusi (jumlah kehilangan / jumlah distribusi). */
  lossPct: number | null;
  slInstalled: number;
  slActive: number;
}

/** Jumlahkan baris-baris cabang satu bulan (NULL dilewati). Dipakai baris
 *  TOTAL di tabel rincian per cabang — jumlahannya sama persis dengan
 *  JUMLAH file Prodist Okt 2026 (tes: lib/monthly.test.ts). */
export function sumBranchRows(rows: BranchRowLike[]): BranchTotals {
  let production = 0;
  let distribution = 0;
  let billed = 0;
  let loss = 0;
  let slInstalled = 0;
  let slActive = 0;
  for (const r of rows) {
    production += r.production_m3 ?? 0;
    distribution += r.distribution_m3 ?? 0;
    billed += r.billed_m3;
    loss += r.loss_m3 ?? 0;
    slInstalled += r.sl_installed ?? 0;
    slActive += r.sl_active ?? 0;
  }
  return {
    production,
    distribution,
    billed,
    loss,
    lossPct: distribution > 0 ? (loss / distribution) * 100 : null,
    slInstalled,
    slActive,
  };
}

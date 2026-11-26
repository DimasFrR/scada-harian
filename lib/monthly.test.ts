import { describe, expect, it } from "vitest";
import { fmtPct2, sumBranchRows } from "./monthly";
import { OCT_2026_BRANCH_ROWS } from "./monthlyBranchSeed";

describe("rincian per cabang Okt 2026 (file Bagian Produksi)", () => {
  it("20 baris, label SALAWU/CIAWI terverifikasi", () => {
    expect(OCT_2026_BRANCH_ROWS).toHaveLength(20);
    const names = OCT_2026_BRANCH_ROWS.map((r) => r.branch);
    expect(names).toContain("SALAWU – Cisitu");
    expect(names).toContain("SALAWU – Cibatur");
    expect(names).toContain("CIAWI – Sanghiang");
    expect(names).toContain("CIAWI – Cipondok");
    expect(names[0]).toBe("Tasik Barat");
    expect(names[19]).toBe("Tangki");
  });

  it("jumlahannya sama persis dengan JUMLAH file", () => {
    const t = sumBranchRows(OCT_2026_BRANCH_ROWS);
    expect(t.production).toBeCloseTo(1038148.1064, 4);
    expect(t.distribution).toBeCloseTo(1036354.6584, 4);
    expect(t.billed).toBe(683735);
    expect(t.loss).toBeCloseTo(352619.6584, 4);
    expect(t.slInstalled).toBe(49651);
    expect(t.slActive).toBe(49102);
    expect(t.lossPct).toBeCloseTo(34.025, 3);
    expect(fmtPct2(t.lossPct!)).toBe("34,02%");
  });

  it("sel kosong di file disimpan NULL", () => {
    const byName = new Map(OCT_2026_BRANCH_ROWS.map((r) => [r.branch, r]));
    const cibatur = byName.get("SALAWU – Cibatur")!;
    expect(cibatur.loss_m3).toBeNull();
    expect(cibatur.nrw_pct).toBeNull();
    expect(cibatur.sl_installed).toBeNull();
    expect(cibatur.sl_active).toBe(298);
    const tangki = byName.get("Tangki")!;
    expect(tangki.loss_m3).toBeNull();
    expect(tangki.nrw_pct).toBeNull();
    // Cabang tanpa produksi sendiri: NULL, bukan 0.
    expect(byName.get("Tasik Timur")!.production_m3).toBeNull();
    expect(byName.get("Cibeureum")!.production_m3).toBeNull();
    // Kehilangan Salawu–Cisitu disalin dari file (1.781,88), bukan dihitung.
    expect(byName.get("SALAWU – Cisitu")!.loss_m3).toBe(1781.88);
    expect(byName.get("SALAWU – Cisitu")!.nrw_pct).toBe(19.5192);
  });

  it("sumBranchRows melewati NULL dan nol bila kosong", () => {
    expect(sumBranchRows([])).toEqual({
      production: 0,
      distribution: 0,
      billed: 0,
      loss: 0,
      lossPct: null,
      slInstalled: 0,
      slActive: 0,
    });
  });
});

"use client";

import { useEffect, useMemo, useState } from "react";
import MonthlyPdfButton from "@/components/MonthlyPdfButton";
import { formatID, monthNameID } from "@/lib/alarms";
import type {
  MonthlyBilledRow,
  MonthlyBranchBilledRow,
  MonthlyReadingRecap,
} from "@/lib/db";
import {
  deriveBilled,
  fmt2,
  fmtLossValueRp,
  fmtPct2,
  shortMonthID,
  sumBranchRows,
} from "@/lib/monthly";
import type { MonthlyPdfInput } from "@/lib/monthlyPdf";

/**
 * Rekap Bulanan — hanya menampilkan (read-only), tanpa form input billing.
 * Angka billing/produksi/distribusi dimasukkan asisten dari Lap DRD tiap
 * bulan (lewat API); halaman ini hanya menampilkan hasil rekapnya.
 * Bulan yang rekap billing-nya belum masuk tetap tampil dengan bacaan
 * lapangan saja + catatan "belum masuk", tanpa angka yang dikarang.
 */

// ---------- grafik SVG sederhana (tanpa dependensi), gaya TrendChart ----------

function MonthlyBarChart({ rows }: { rows: { month: string; billed: number; loss: number }[] }) {
  const W = 640;
  const H = 220;
  const PAD_L = 58;
  const PAD_R = 12;
  const PAD_T = 16;
  const PAD_B = 30;
  const maxV = Math.max(...rows.flatMap((r) => [r.billed, r.loss]), 1);
  const plotW = W - PAD_L - PAD_R;
  const groupW = plotW / rows.length;
  const barW = Math.min(34, groupW / 3);
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / maxV);
  const base = H - PAD_B;
  return (
    <div className="chart-box">
      <h3>Volume tertagih vs kehilangan air (m³ per bulan)</h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Volume tertagih vs kehilangan air">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={base} stroke="#cbd5e1" />
        <line x1={PAD_L} y1={base} x2={W - PAD_R} y2={base} stroke="#cbd5e1" />
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD_L} y1={y(maxV * f)} x2={W - PAD_R} y2={y(maxV * f)} stroke="#f1f5f9" />
            <text x={PAD_L - 6} y={y(maxV * f) + 4} fontSize="11" textAnchor="end" fill="#64748b">
              {`${Math.round((maxV * f) / 1000)} rb`}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = PAD_L + groupW * i + groupW / 2;
          const bH = ((base - PAD_T - 8) * r.billed) / maxV;
          const lH = ((base - PAD_T - 8) * r.loss) / maxV;
          return (
            <g key={r.month}>
              <rect x={cx - barW - 2} y={base - bH} width={barW} height={bH} fill="#0e7c5f" />
              <rect x={cx + 2} y={base - lH} width={barW} height={lH} fill="#dc2626" />
              <text x={cx - barW / 2 - 2} y={base - bH - 4} fontSize="11" textAnchor="middle" fill="#0e7c5f">
                {`${Math.round(r.billed / 1000)} rb`}
              </text>
              <text x={cx + barW / 2 + 2} y={base - lH - 4} fontSize="11" textAnchor="middle" fill="#dc2626">
                {`${Math.round(r.loss / 1000)} rb`}
              </text>
              <text x={cx} y={H - 10} fontSize="11" textAnchor="middle" fill="#64748b">
                {shortMonthID(r.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span>
          <span className="dot" style={{ background: "#0e7c5f" }} />
          Tertagih
        </span>
        <span>
          <span className="dot" style={{ background: "#dc2626" }} />
          Hilang
        </span>
      </div>
    </div>
  );
}

function MonthlyLineChart({ rows }: { rows: { month: string; lossPct: number; nrwPct: number }[] }) {
  const W = 640;
  const H = 220;
  const PAD_L = 52;
  const PAD_R = 12;
  const PAD_T = 16;
  const PAD_B = 30;
  const maxV = Math.max(...rows.flatMap((r) => [r.lossPct, r.nrwPct]), 1);
  const yMax = Math.max(5, Math.ceil(maxV / 5) * 5);
  const x = (i: number) =>
    PAD_L + ((W - PAD_L - PAD_R) * i) / Math.max(1, rows.length - 1);
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / yMax);
  const base = H - PAD_B;
  const line = (key: "lossPct" | "nrwPct") =>
    rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(" ");
  return (
    <div className="chart-box">
      <h3>Kehilangan air &amp; NRW (% per bulan)</h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Kehilangan air dan NRW">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={base} stroke="#cbd5e1" />
        <line x1={PAD_L} y1={base} x2={W - PAD_R} y2={base} stroke="#cbd5e1" />
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD_L} y1={y(yMax * f)} x2={W - PAD_R} y2={y(yMax * f)} stroke="#f1f5f9" />
            <text x={PAD_L - 6} y={y(yMax * f) + 4} fontSize="11" textAnchor="end" fill="#64748b">
              {`${fmt2(yMax * f)}%`}
            </text>
          </g>
        ))}
        <path d={line("lossPct")} fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={line("nrwPct")} fill="none" stroke="#b45309" strokeWidth="2.5" strokeLinejoin="round" />
        {rows.map((r, i) => (
          <g key={r.month}>
            <circle cx={x(i)} cy={y(r.lossPct)} r="3.5" fill="#dc2626" stroke="#fff" strokeWidth="1" />
            <circle cx={x(i)} cy={y(r.nrwPct)} r="3.5" fill="#b45309" stroke="#fff" strokeWidth="1" />
            <text x={x(i)} y={y(r.lossPct) - 8} fontSize="11" textAnchor="middle" fill="#dc2626">
              {fmtPct2(r.lossPct)}
            </text>
            <text x={x(i)} y={y(r.nrwPct) + 16} fontSize="11" textAnchor="middle" fill="#b45309">
              {fmtPct2(r.nrwPct)}
            </text>
            <text x={x(i)} y={H - 10} fontSize="11" textAnchor="middle" fill="#64748b">
              {shortMonthID(r.month)}
            </text>
          </g>
        ))}
      </svg>
      <div className="legend">
        <span>
          <span className="dot" style={{ background: "#dc2626" }} />
          Kehilangan (dari distribusi)
        </span>
        <span>
          <span className="dot" style={{ background: "#b45309" }} />
          NRW (dari produksi)
        </span>
      </div>
    </div>
  );
}

function BranchNrwChart({
  rows,
  totalPct,
}: {
  rows: { branch: string; nrw: number | null }[];
  totalPct: number;
}) {
  const maxV = Math.max(...rows.map((r) => r.nrw ?? 0), 1);
  return (
    <div className="chart-box">
      <h3>NRW per cabang (%) — merah = di atas total perusahaan</h3>
      <div>
        {rows.map((r) => {
          const above = r.nrw !== null && r.nrw > totalPct;
          return (
            <div
              key={r.branch}
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
            >
              <span
                style={{ width: 150, fontSize: 13, textAlign: "right", flexShrink: 0 }}
              >
                {r.branch}
              </span>
              <span
                style={{
                  flex: 1,
                  height: 16,
                  background: "#f1f5f9",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                {r.nrw !== null && (
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${(r.nrw / maxV) * 100}%`,
                      background: above ? "#dc2626" : "#0e7c5f",
                    }}
                  />
                )}
              </span>
              <span
                style={{
                  width: 64,
                  fontSize: 13,
                  fontWeight: 700,
                  color:
                    r.nrw === null ? "#64748b" : above ? "#dc2626" : "#0e7c5f",
                }}
              >
                {r.nrw !== null ? fmtPct2(r.nrw) : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Total perusahaan {fmtPct2(totalPct)} — bar merah di atas angka itu.
      </p>
    </div>
  );
}

// ---------- halaman ----------

export default function BulananPage() {
  const [months, setMonths] = useState<MonthlyBilledRow[]>([]);
  const [recap, setRecap] = useState<MonthlyReadingRecap[]>([]);
  const [branches, setBranches] = useState<MonthlyBranchBilledRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/monthly-billed");
        const data = await res.json();
        if (data.ok) {
          setMonths(data.months);
          setRecap(data.recap);
          setBranches(data.branches ?? []);
        } else {
          setError(data.error || "Gagal memuat rekap bulanan.");
        }
      } catch {
        setError("Gagal memuat rekap bulanan — periksa koneksi, lalu login ulang bila perlu.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Daftar bulan = gabungan bulan billing + bulan bacaan lapangan, terbaru dulu.
  const allMonths = useMemo(() => {
    const s = new Set<string>();
    months.forEach((m) => s.add(m.month));
    recap.forEach((r) => s.add(r.month));
    return [...s].sort().reverse();
  }, [months, recap]);

  // Default: bulan terbaru yang ada billing-nya, kalau tidak ada — bulan terbaru.
  useEffect(() => {
    if (selected === "" && allMonths.length > 0) {
      const latestBilled = months.length > 0 ? months[0].month : allMonths[0];
      setSelected(latestBilled);
    }
  }, [allMonths, months, selected]);

  const billed = useMemo(
    () => months.find((m) => m.month === selected) ?? null,
    [months, selected],
  );
  const derived = useMemo(() => (billed ? deriveBilled(billed) : null), [billed]);

  // Rincian per cabang bulan yang dipilih (urut file) — kosong bila bulan
  // itu belum punya rincian cabang (mis. Nov 2026), seksinya disembunyikan.
  const selectedBranches = useMemo(
    () =>
      branches
        .filter((b) => b.month === selected)
        .sort((a, b) => a.sort_order - b.sort_order || a.branch.localeCompare(b.branch)),
    [branches, selected],
  );
  const branchTotals = useMemo(
    () => (selectedBranches.length > 0 ? sumBranchRows(selectedBranches) : null),
    [selectedBranches],
  );

  // Bulan-bulan dengan billing, urut kronologis — untuk grafik tren.
  const chartRows = useMemo(() => {
    const asc = [...months].sort((a, b) => a.month.localeCompare(b.month));
    return asc
      .map((b) => ({ b, d: deriveBilled(b) }))
      .filter((r) => r.d.lossM3 !== null && r.d.lossPct !== null && r.d.nrwPct !== null)
      .map((r) => ({
        month: r.b.month,
        billed: r.b.m3,
        loss: r.d.lossM3!,
        lossPct: r.d.lossPct!,
        nrwPct: r.d.nrwPct!,
      }));
  }, [months]);

  const pdfInput: MonthlyPdfInput | null =
    selected === ""
      ? null
      : {
          selectedMonth: selected,
          billed,
          billedMonths: [...months].sort((a, b) => a.month.localeCompare(b.month)),
          recap,
        };

  return (
    <div>
      <h1>Rekap Bulanan</h1>
      <p className="lead">
        Rekap bulanan ala NRW: volume tertagih, produksi, distribusi, dan
        kehilangan air — angka billing dimasukkan dari Lap DRD tiap bulan.
      </p>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <p className="muted">Memuat rekap bulanan...</p>
      ) : allMonths.length === 0 ? (
        <div className="notice">Belum ada data bulanan maupun bacaan lapangan.</div>
      ) : (
        <>
          <label htmlFor="b-month">Bulan</label>
          <select
            id="b-month"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {allMonths.map((m) => {
              const hasBilling = months.some((x) => x.month === m);
              return (
                <option key={m} value={m}>
                  {monthNameID(m)}
                  {hasBilling ? "" : " — rekap billing belum masuk"}
                </option>
              );
            })}
          </select>

          <div className="btn-row no-print" style={{ marginTop: 12, marginBottom: 12 }}>
            {pdfInput && <MonthlyPdfButton input={pdfInput} />}
          </div>

          {billed && derived ? (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-num">{formatID(billed.sl)}</div>
                  <div className="kpi-label">Pelanggan tertagih (SL)</div>
                </div>
                <div className="kpi">
                  <div className="kpi-num">{fmt2(billed.m3)}</div>
                  <div className="kpi-label">Volume tertagih (m³) · Rp {formatID(billed.total_rp)}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-num">
                    {billed.production_m3 !== null ? fmt2(billed.production_m3) : "—"}
                  </div>
                  <div className="kpi-label">Produksi IPA (m³)</div>
                </div>
                <div className="kpi">
                  <div className="kpi-num">
                    {billed.distribution_m3 !== null ? fmt2(billed.distribution_m3) : "—"}
                  </div>
                  <div className="kpi-label">
                    Distribusi (m³)
                    {derived.transmissionLoss !== null &&
                      ` · kehilangan transmisi ${fmt2(derived.transmissionLoss)} m³`}
                  </div>
                </div>
              </div>

              {derived.lossM3 !== null ? (
                <div className="card">
                  <h3>Kehilangan Air — {monthNameID(billed.month)}</h3>
                  <p>
                    <b>{fmt2(derived.lossM3)} m³</b> ·{" "}
                    <b>{derived.lossPct !== null ? fmtPct2(derived.lossPct) : "—"}</b> dari
                    distribusi · NRW{" "}
                    <b>{derived.nrwPct !== null ? fmtPct2(derived.nrwPct) : "—"}</b> dari
                    produksi
                  </p>
                  <p className="muted">
                    Nilai kehilangan{" "}
                    {derived.lossValueRp !== null ? fmtLossValueRp(derived.lossValueRp) : "—"}{" "}
                    (estimasi dari tarif rata-rata tertagih, bukan angka tagihan).
                  </p>
                  {billed.distribution_m3 !== null && derived.lossPct !== null && (
                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          display: "flex",
                          height: 16,
                          borderRadius: 8,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${(billed.m3 / billed.distribution_m3) * 100}%`,
                            background: "#15803d",
                          }}
                        />
                        <div
                          style={{
                            width: `${derived.lossPct}%`,
                            background: "#dc2626",
                          }}
                        />
                      </div>
                      <p className="muted" style={{ marginTop: 6 }}>
                        <span style={{ color: "#15803d" }}>
                          Tertagih {fmt2(billed.m3)} m³ (
                          {fmtPct2((billed.m3 / billed.distribution_m3) * 100)})
                        </span>{" "}
                        ·{" "}
                        <span style={{ color: "#dc2626" }}>
                          Hilang {fmt2(derived.lossM3)} m³ ({fmtPct2(derived.lossPct)})
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="notice">
                  Produksi / distribusi bulan ini belum masuk, jadi kehilangan air belum
                  bisa dihitung.
                </div>
              )}

              {selectedBranches.length > 0 && branchTotals && (
                <>
                  <h2>Rincian per Cabang — {monthNameID(billed.month)}</h2>
                  <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Cabang / Unit</th>
                            <th className="num">Produksi (m³)</th>
                            <th className="num">Distribusi (m³)</th>
                            <th className="num">Terjual (m³)</th>
                            <th className="num">Kehilangan (m³)</th>
                            <th className="num">NRW</th>
                            <th className="num">SL Terpasang</th>
                            <th className="num">SL Aktif</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedBranches.map((r) => (
                            <tr key={r.branch}>
                              <td>
                                <b>{r.branch}</b>
                              </td>
                              <td className="num">
                                {r.production_m3 !== null ? fmt2(r.production_m3) : "—"}
                              </td>
                              <td className="num">
                                {r.distribution_m3 !== null ? fmt2(r.distribution_m3) : "—"}
                              </td>
                              <td className="num">{fmt2(r.billed_m3)}</td>
                              <td className="num">
                                {r.loss_m3 !== null ? fmt2(r.loss_m3) : "—"}
                              </td>
                              <td
                                className="num"
                                style={
                                  r.nrw_pct !== null &&
                                  derived.lossPct !== null &&
                                  r.nrw_pct > derived.lossPct
                                    ? { color: "#dc2626", fontWeight: 700 }
                                    : undefined
                                }
                              >
                                {r.nrw_pct !== null ? fmtPct2(r.nrw_pct) : "—"}
                              </td>
                              <td className="num">
                                {r.sl_installed !== null ? formatID(r.sl_installed) : "—"}
                              </td>
                              <td className="num">
                                {r.sl_active !== null ? formatID(r.sl_active) : "—"}
                              </td>
                            </tr>
                          ))}
                          <tr style={{ background: "#e6f4fb", fontWeight: 700 }}>
                            <td>
                              <b>TOTAL</b>
                            </td>
                            <td className="num">
                              {billed.production_m3 !== null ? fmt2(billed.production_m3) : "—"}
                            </td>
                            <td className="num">
                              {billed.distribution_m3 !== null ? fmt2(billed.distribution_m3) : "—"}
                            </td>
                            <td className="num">{fmt2(billed.m3)}</td>
                            <td className="num">
                              {derived.lossM3 !== null ? fmt2(derived.lossM3) : "—"}
                            </td>
                            <td className="num">
                              {derived.lossPct !== null ? fmtPct2(derived.lossPct) : "—"}
                            </td>
                            <td className="num">{formatID(branchTotals.slInstalled)}</td>
                            <td className="num">{formatID(branchTotals.slActive)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="muted">
                    SALAWU dan CIAWI masing-masing punya 2 sumber air
                    (Cisitu/Cibatur dan Sanghiang/Cipondok). &quot;—&quot; =
                    sel kosong di file Bagian Produksi; cabang tanpa produksi
                    sendiri (produksinya dibukukan di Tasik Barat) tampil
                    &quot;—&quot; di kolom Produksi.
                  </p>
                  {derived.lossPct !== null && (
                    <BranchNrwChart
                      rows={selectedBranches.map((r) => ({
                        branch: r.branch,
                        nrw: r.nrw_pct,
                      }))}
                      totalPct={derived.lossPct}
                    />
                  )}
                </>
              )}

              <h2>Tren Bulanan</h2>
              {chartRows.length >= 2 ? (
                <>
                  <MonthlyBarChart rows={chartRows} />
                  <MonthlyLineChart rows={chartRows} />
                </>
              ) : (
                <p className="muted">
                  Baru satu bulan yang rekap billing-nya lengkap, jadi grafik masih satu
                  titik — trennya terbentuk otomatis begitu rekap bulan berikutnya masuk.
                </p>
              )}
            </>
          ) : (
            <div className="notice">
              <b>Rekap Billing {monthNameID(selected)} Belum Masuk</b>
              <br />
              Rekap billing bulan {monthNameID(selected)} belum masuk. Di bawah ini hanya
              rekap bacaan lapangan — angka tertagih, produksi, dan kehilangan air akan
              muncul setelah rekap Lap DRD bulan tersebut selesai.
            </div>
          )}

          <h2>Rekap Bacaan Lapangan</h2>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bulan</th>
                    <th className="num">Ronde laporan</th>
                    <th className="num">Baris bacaan</th>
                    <th className="num">Titik terukur</th>
                    <th className="num">Bacaan kosong</th>
                  </tr>
                </thead>
                <tbody>
                  {recap.map((r) => (
                    <tr
                      key={r.month}
                      style={
                        r.month === selected
                          ? { background: "#e6f4fb", fontWeight: 700 }
                          : undefined
                      }
                    >
                      <td>
                        <b>{monthNameID(r.month)}</b>
                      </td>
                      <td className="num">{r.rounds}</td>
                      <td className="num">{r.rows}</td>
                      <td className="num">{r.points_measured}</td>
                      <td className="num" style={r.empty_rows > 0 ? { color: "#dc2626" } : undefined}>
                        {r.empty_rows}
                      </td>
                    </tr>
                  ))}
                  {recap.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        Belum ada data bacaan lapangan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="muted">
            Dihitung dari seluruh pengukuran tersimpan (ronde keliling Senin &amp; Jumat).
            &quot;Bacaan kosong&quot; = titik yang pada ronde itu dilaporkan tanpa air /
            tanpa tekanan.
          </p>
        </>
      )}
    </div>
  );
}

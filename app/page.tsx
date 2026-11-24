import Link from "next/link";
import PdfButton, { type PdfAlarm, type PdfRow } from "@/components/PdfButton";
import PrintButton from "@/components/PrintButton";
import { computeAlarm, formatID, formatNum, monthNameID } from "@/lib/alarms";
import { fmtPct2 } from "@/lib/monthly";
import { getWaTargets, isWaConfigured } from "@/lib/whatsapp";
import {
  DbNotConfigured,
  getLatestMonthlyBilled,
  getLatestPerPoint,
  getPoints,
  isDbConfigured,
  type MonthlyBilledRow,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!isDbConfigured()) {
    return (
      <div>
        <h1>Dashboard</h1>
        <div className="card">
          <h3>Database belum dikonfigurasi</h3>
          <p>
            Aplikasi belum terhubung ke database. Atur env var <b>DATABASE_URL</b>{" "}
            (Vercel Postgres) di pengaturan project Vercel, lalu deploy ulang.
          </p>
          <p className="muted">
            Setelah database terhubung, 29 titik ukur otomatis terdaftar dan siap
            diisi dari menu Input Ukur.
          </p>
        </div>
        <BilledPanel />
      </div>
    );
  }

  let latest: Awaited<ReturnType<typeof getLatestPerPoint>> = [];
  let points: Awaited<ReturnType<typeof getPoints>> = [];
  let latestMonthly: MonthlyBilledRow | null = null;
  try {
    [latest, points, latestMonthly] = await Promise.all([
      getLatestPerPoint(),
      getPoints(),
      getLatestMonthlyBilled(),
    ]);
  } catch (e) {
    if (e instanceof DbNotConfigured) {
      return (
        <div>
          <h1>Dashboard</h1>
          <div className="notice">Database belum dikonfigurasi (DATABASE_URL kosong).</div>
          <BilledPanel />
        </div>
      );
    }
    throw e;
  }

  const measuredIds = new Set(latest.map((m) => m.point_id));
  const unmeasured = points.filter((p) => !measuredIds.has(p.id));

  const alarms = latest.map((m) => ({
    row: m,
    alarm: computeAlarm(m, m.prev_debit_lps === null ? null : { debit_lps: m.prev_debit_lps, pressure_bar: null, is_empty: false }),
  }));
  const critical = alarms.filter((a) => a.alarm.level === "critical");
  const warning = alarms.filter((a) => a.alarm.level === "warning");

  const pdfRows: PdfRow[] = latest.map((m) => ({
    date: m.date,
    time: m.time.slice(0, 5),
    point_name: m.point_name,
    debit_lps: m.debit_lps,
    pressure_bar: m.pressure_bar,
    is_empty: m.is_empty,
  }));
  const pdfAlarms: PdfAlarm[] = [...critical, ...warning].map((a) => ({
    point_name: a.row.point_name,
    level: a.alarm.level as "critical" | "warning",
    reasons: a.alarm.reasons,
  }));

  return (
    <div>
      <h1 style={{ textAlign: "center" }}>Dashboard</h1>
      <p className="lead">Pengukuran terbaru tiap titik + alarm otomatis.</p>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-num">{points.length}</div>
          <div className="kpi-label">Titik ukur</div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{latest.length}</div>
          <div className="kpi-label">Sudah diukur</div>
        </div>
        {/* Kartu kritis/peringatan dibedakan bukan hanya lewat warna angka
            (tidak jelas bagi pengguna buta warna / di bawah matahari):
            ada ikon teks + border/latar pembeda (.kpi-crit / .kpi-warn). */}
        <div className={`kpi${critical.length ? " kpi-crit" : ""}`}>
          <div className={`kpi-num ${critical.length ? "crit" : ""}`}>{critical.length ? `⚠ ${critical.length}` : critical.length}</div>
          <div className="kpi-label">Kritis</div>
        </div>
        <div className={`kpi${warning.length ? " kpi-warn" : ""}`}>
          <div className={`kpi-num ${warning.length ? "warn" : ""}`}>{warning.length ? `! ${warning.length}` : warning.length}</div>
          <div className="kpi-label">Peringatan</div>
        </div>
      </div>

      <div className="btn-row no-print" style={{ marginBottom: 12 }}>
        <Link href="/input" className="btn" style={{ textAlign: "center" }}>
          ＋ Input Ukur
        </Link>
        <PdfButton rows={pdfRows} alarms={pdfAlarms} title="Laporan pengukuran terbaru per titik" />
        <PrintButton />
      </div>

      {critical.length === 0 && warning.length === 0 && latest.length > 0 && (
        <div className="alarm ok">✓ Semua titik yang terukur dalam kondisi normal.</div>
      )}
      {latest.length === 0 && (
        <div className="notice">
          Belum ada data pengukuran — mulai input dari keliling berikutnya lewat menu{" "}
          <Link href="/input">Input Ukur</Link>.
        </div>
      )}

      {critical.map(({ row, alarm }) => (
        <div key={row.id} className="alarm critical">
          <span className="badge critical">KRITIS</span>
          <b>{row.point_name}</b> — {alarm.reasons.join("; ")} ({row.date} {row.time.slice(0, 5)})
        </div>
      ))}
      {warning.map(({ row, alarm }) => (
        <div key={row.id} className="alarm warning">
          <span className="badge warning">PERINGATAN</span>
          <b>{row.point_name}</b> — {alarm.reasons.join("; ")} ({row.date} {row.time.slice(0, 5)})
        </div>
      ))}

      <p className="muted no-print" style={{ marginTop: 4 }}>
        Alarm WhatsApp:{" "}
        {isWaConfigured()
          ? `aktif — alarm kritis/peringatan terkirim ke ${getWaTargets().length} nomor.`
          : "belum diaktifkan (atur FONNTE_TOKEN & WA_ALARM_TARGETS di Vercel). Alarm tetap tampil di dashboard ini."}
      </p>

      <h2>Pengukuran Terbaru</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Titik</th>
                <th className="num">Debit (L/dtk)</th>
                <th className="num">Tekanan (bar)</th>
                <th>Tanggal / Jam</th>
              </tr>
            </thead>
            <tbody>
              {alarms.map(({ row, alarm }) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.point_name}</b>
                    <br />
                    {/* Badge status dipindah ke bawah nama titik di kolom
                        pertama: di layar HP 360px kolom Status terpisah
                        terpotong ke kanan sampai digeser horizontal. */}
                    {alarm.level === "critical" && <span className="badge critical">KRITIS</span>}
                    {alarm.level === "warning" && <span className="badge warning">PERINGATAN</span>}
                    {alarm.level === "ok" && <span className="badge ok">NORMAL</span>}
                    {row.is_empty && <span className="badge empty">KOSONG</span>}
                  </td>
                  <td className="num">{formatNum(row.debit_lps)}</td>
                  <td className="num">{formatNum(row.pressure_bar)}</td>
                  <td>
                    {row.date}
                    <br />
                    <span className="muted">{row.time.slice(0, 5)}</span>
                  </td>
                </tr>
              ))}
              {latest.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    Belum ada pengukuran.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {unmeasured.length > 0 && (
        <div className="card">
          <h3>Belum ada pengukuran ({unmeasured.length} titik)</h3>
          <p className="muted">{unmeasured.map((p) => p.name).join(" · ")}</p>
        </div>
      )}

      <BilledPanel row={latestMonthly} />
    </div>
  );
}

function BilledPanel({ row }: { row?: MonthlyBilledRow | null }) {
  // row === undefined: DB belum dikonfigurasi — tampilkan Oktober 2026
  // (angka terverifikasi) sebagai info statis. row === null: DB kosong.
  if (row === undefined) {
    return (
      <div className="card">
        <h3>Volume Tertagih — Oktober 2026</h3>
        <p>
          <b>{formatID(49102)} SL</b> · <b>{formatID(683735)} m³</b> ·{" "}
          <b>Rp {formatID(6957377800)}</b>
        </p>
        <p className="muted">Sumber: Lap DRD Rekapitulasi Global · 18 cabang.</p>
        <p>
          NRW: <b>Menunggu data produksi IPA</b>
        </p>
      </div>
    );
  }
  if (row === null) {
    return (
      <div className="card">
        <h3>Volume Tertagih</h3>
        <p className="muted">
          Belum ada data bulanan. Isi dari menu{" "}
          <Link href="/bulanan">Bulanan</Link>.
        </p>
        <p>
          NRW: <b>Menunggu data produksi IPA</b>
        </p>
      </div>
    );
  }
  return (
    <div className="card">
      <h3>Volume Tertagih — {monthNameID(row.month)}</h3>
      <p>
        <b>{formatID(row.sl)} SL</b> · <b>{formatID(row.m3)} m³</b> ·{" "}
        <b>Rp {formatID(row.total_rp)}</b>
      </p>
      <p className="muted">
        Harga Air Rp {formatID(row.harga_air)} + Materai Rp {formatID(row.materai)}
        {row.branches ? ` · ${row.branches} cabang` : ""}
        {row.note ? ` · ${row.note}` : ""}
      </p>
      <p>
        NRW:{" "}
        {row.production_m3 !== null && row.distribution_m3 !== null && row.production_m3 > 0 ? (
          <b>
            {fmtPct2(((row.production_m3 - row.m3) / row.production_m3) * 100)}{" "}
            (kehilangan {formatID(Math.round(row.distribution_m3 - row.m3))} m³ dari
            distribusi)
          </b>
        ) : (
          <b>Menunggu data produksi IPA</b>
        )}
      </p>
      <p>
        <Link href="/bulanan">Lihat rekap bulanan →</Link>
      </p>
    </div>
  );
}

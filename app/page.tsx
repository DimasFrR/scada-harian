import Link from "next/link";
import PdfButton, { type PdfAlarm, type PdfRow } from "@/components/PdfButton";
import PrintButton from "@/components/PrintButton";
import { computeAlarm, formatID, formatNum } from "@/lib/alarms";
import { DbNotConfigured, getLatestPerPoint, getPoints, isDbConfigured } from "@/lib/db";

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
  try {
    [latest, points] = await Promise.all([getLatestPerPoint(), getPoints()]);
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
      <h1>Dashboard</h1>
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
        <div className="kpi">
          <div className={`kpi-num ${critical.length ? "crit" : ""}`}>{critical.length}</div>
          <div className="kpi-label">Kritis</div>
        </div>
        <div className="kpi">
          <div className={`kpi-num ${warning.length ? "warn" : ""}`}>{warning.length}</div>
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {alarms.map(({ row, alarm }) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.point_name}</b>
                  </td>
                  <td className="num">{formatNum(row.debit_lps)}</td>
                  <td className="num">{formatNum(row.pressure_bar)}</td>
                  <td>
                    {row.date}
                    <br />
                    <span className="muted">{row.time.slice(0, 5)}</span>
                  </td>
                  <td>
                    {alarm.level === "critical" && <span className="badge critical">KRITIS</span>}
                    {alarm.level === "warning" && <span className="badge warning">PERINGATAN</span>}
                    {alarm.level === "ok" && <span className="badge ok">NORMAL</span>}
                    {row.is_empty && <span className="badge empty">KOSONG</span>}
                  </td>
                </tr>
              ))}
              {latest.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
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

      <BilledPanel />
    </div>
  );
}

function BilledPanel() {
  return (
    <div className="card">
      <h3>Volume Tertagih — Oktober 2026</h3>
      <p>
        <b>{formatID(49102)} SL</b> · <b>{formatID(683735)} m³</b> ·{" "}
        <b>Rp {formatID(6957377800)}</b>
      </p>
      <p className="muted">Tervalidasi 18/18 cabang (DRD = DSML, selisih 0).</p>
      <p>
        NRW: <b>Menunggu data produksi IPA</b>
      </p>
    </div>
  );
}

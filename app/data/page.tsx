import Link from "next/link";
import PdfButton, { type PdfAlarm, type PdfRow } from "@/components/PdfButton";
import PrintButton from "@/components/PrintButton";
import { computeAlarm, formatNum } from "@/lib/alarms";
import { DbNotConfigured, getMeasurements, getPoints, isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ date?: string; pointId?: string }>;
}

export default async function DataPage({ searchParams }: Props) {
  const sp = await searchParams;
  const date = sp.date || "";
  const pointId = sp.pointId ? Number(sp.pointId) : undefined;

  if (!isDbConfigured()) {
    return (
      <div>
        <h1>Data Pengukuran</h1>
        <div className="notice">Database belum dikonfigurasi (DATABASE_URL kosong). Data tidak bisa ditampilkan.</div>
      </div>
    );
  }

  let rows: Awaited<ReturnType<typeof getMeasurements>> = [];
  let points: Awaited<ReturnType<typeof getPoints>> = [];
  try {
    [rows, points] = await Promise.all([
      getMeasurements({ date: date || undefined, pointId }),
      getPoints(),
    ]);
  } catch (e) {
    if (e instanceof DbNotConfigured) {
      return (
        <div>
          <h1>Data Pengukuran</h1>
          <div className="notice">Database belum dikonfigurasi (DATABASE_URL kosong).</div>
        </div>
      );
    }
    throw e;
  }

  // Alarm untuk baris yang tampil (bandingkan dengan pengukuran sebelumnya per titik —
  // disederhanakan: alarm dihitung dari baris itu sendiri; penurunan debit butuh histori).
  const pdfRows: PdfRow[] = rows.map((r) => ({
    date: r.date,
    time: r.time.slice(0, 5),
    point_name: r.point_name,
    debit_lps: r.debit_lps,
    pressure_bar: r.pressure_bar,
    is_empty: r.is_empty,
  }));
  const pdfAlarms: PdfAlarm[] = rows
    .map((r) => ({ r, a: computeAlarm(r, null) }))
    .filter(({ a }) => a.level !== "ok")
    .map(({ r, a }) => ({
      point_name: `${r.point_name} (${r.date} ${r.time.slice(0, 5)})`,
      level: a.level as "critical" | "warning",
      reasons: a.reasons,
    }));

  const qs = (d: string, p: string) => {
    const params = new URLSearchParams();
    if (d) params.set("date", d);
    if (p) params.set("pointId", p);
    const s = params.toString();
    return s ? `/data?${s}` : "/data";
  };

  return (
    <div>
      <h1>Data Pengukuran</h1>
      <p className="lead">Semua data yang sudah diinput. Saring berdasarkan tanggal / titik, lalu unduh PDF.</p>

      <form className="card no-print" method="get" action="/data">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label htmlFor="date">Tanggal</label>
            <input id="date" type="date" name="date" defaultValue={date} />
          </div>
          <div>
            <label htmlFor="pointId">Titik Ukur</label>
            <select id="pointId" name="pointId" defaultValue={pointId ? String(pointId) : ""}>
              <option value="">Semua titik</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" type="submit">
            Tampilkan
          </button>
          <Link href="/data" className="btn btn-secondary" style={{ textAlign: "center" }}>
            Reset
          </Link>
        </div>
      </form>

      <div className="btn-row no-print" style={{ marginBottom: 12 }}>
        <PdfButton
          rows={pdfRows}
          alarms={pdfAlarms}
          title="Laporan data pengukuran"
          subtitle={`${date ? `Tanggal: ${date}` : "Semua tanggal"}${pointId ? ` · Titik: ${points.find((p) => p.id === pointId)?.name ?? ""}` : ""}`}
        />
        <PrintButton />
      </div>

      <p className="muted">
        Menampilkan {rows.length} baris
        {date ? ` · tanggal ${date}` : " · semua tanggal"}
        {pointId ? ` · titik ${points.find((p) => p.id === pointId)?.name ?? ""}` : ""}.
      </p>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Jam</th>
                <th>Titik</th>
                <th className="num">Debit (L/dtk)</th>
                <th className="num">Tekanan (bar)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = computeAlarm(r, null);
                return (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.time.slice(0, 5)}</td>
                    <td>
                      <b>{r.point_name}</b>
                    </td>
                    <td className="num">{formatNum(r.debit_lps)}</td>
                    <td className="num">{formatNum(r.pressure_bar)}</td>
                    <td>
                      {r.is_empty && <span className="badge empty">KOSONG</span>}
                      {a.level === "critical" && !r.is_empty && <span className="badge critical">KRITIS</span>}
                      {a.level === "warning" && <span className="badge warning">PERINGATAN</span>}
                      {a.level === "ok" && !r.is_empty && <span className="badge ok">NORMAL</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Tidak ada data untuk filter ini.{" "}
                    <Link href={qs("", "")}>Tampilkan semua</Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

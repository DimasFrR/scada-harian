"use client";

import { useEffect, useState } from "react";
import TrendChart from "@/components/TrendChart";
import type { MeasurementRow, PointRow } from "@/lib/db";

export default function TrenPage() {
  const [points, setPoints] = useState<PointRow[]>([]);
  const [pointId, setPointId] = useState("");
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  // Loading per bagian (dulu satu gate "Memuat..." untuk seluruh halaman,
  // jadi halaman kosong melulu sampai titik + data selesai dimuat).
  const [loadingPoints, setLoadingPoints] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoadingPoints(true);
      try {
        const res = await fetch("/api/points");
        const data = await res.json();
        if (data.ok) {
          setPoints(data.points);
          if (data.points.length > 0) setPointId(String(data.points[0].id));
        } else {
          setError(data.error || "Gagal memuat titik ukur.");
        }
      } catch {
        setError("Gagal memuat titik ukur — periksa koneksi, lalu login ulang bila perlu.");
      } finally {
        setLoadingPoints(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!pointId) return;
    (async () => {
      setLoadingRows(true);
      try {
        const res = await fetch(`/api/measurements?pointId=${pointId}`);
        const data = await res.json();
        if (data.ok) {
          // Urutkan kronologis untuk grafik
          const sorted = [...data.measurements].sort((a, b) =>
            `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
          );
          setRows(sorted);
        } else {
          setError(data.error || "Gagal memuat data.");
        }
      } catch {
        setError("Gagal memuat data — periksa koneksi, lalu login ulang bila perlu.");
      } finally {
        setLoadingRows(false);
      }
    })();
  }, [pointId]);

  const debitPts = rows
    .filter((r) => r.debit_lps !== null)
    .map((r) => ({ date: r.date, time: r.time.slice(0, 5), value: r.debit_lps as number }));
  const pressurePts = rows
    .filter((r) => r.pressure_bar !== null)
    .map((r) => ({ date: r.date, time: r.time.slice(0, 5), value: r.pressure_bar as number }));
  const selected = points.find((p) => String(p.id) === pointId);

  return (
    <div>
      <h1>Tren Pengukuran</h1>
      <p className="lead">Perkembangan debit &amp; tekanan tiap titik dari waktu ke waktu.</p>
      {error && <div className="error">{error}</div>}

      <label htmlFor="point">Titik Ukur</label>
      <select id="point" value={pointId} onChange={(e) => setPointId(e.target.value)} disabled={loadingPoints}>
        {loadingPoints ? (
          <option value="">Memuat titik...</option>
        ) : (
          points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))
        )}
      </select>

      {loadingRows ? (
        <p className="muted" style={{ marginTop: 14 }}>Memuat data...</p>
      ) : (
        <div style={{ marginTop: 14 }}>
          <TrendChart title={`Debit — ${selected?.name ?? ""}`} unit="L/dtk" points={debitPts} color="#0e7490" />
          <TrendChart title={`Tekanan — ${selected?.name ?? ""}`} unit="bar" points={pressurePts} color="#b45309" />
        </div>
      )}

      <p className="muted">{loadingRows ? "" : `${rows.length} pengukuran tercatat untuk titik ini.`}</p>
    </div>
  );
}

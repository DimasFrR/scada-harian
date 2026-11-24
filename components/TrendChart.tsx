"use client";

interface Pt {
  date: string;
  time: string;
  value: number;
}

interface Props {
  title: string;
  unit: string;
  points: Pt[];
  color: string;
}

/** Grafik garis SVG sederhana (tanpa dependensi) — debit atau tekanan per titik. */
export default function TrendChart({ title, unit, points, color }: Props) {
  const W = 640;
  const H = 220;
  const PAD_L = 52;
  const PAD_R = 12;
  const PAD_T = 14;
  const PAD_B = 30;

  if (points.length === 0) {
    return (
      <div className="chart-box">
        <h3>{title}</h3>
        <p className="muted">Belum ada data untuk grafik ini.</p>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min = Math.max(0, min - 1);
    max = max + 1;
  }
  const span = max - min || 1;
  // Titik tunggal diposisikan di tengah, bukan menempel di tepi kiri.
  const x = (i: number) =>
    points.length === 1
      ? PAD_L + (W - PAD_L - PAD_R) / 2
      : PAD_L + ((W - PAD_L - PAD_R) * i) / Math.max(1, points.length - 1);
  const y = (v: number) =>
    PAD_T + (H - PAD_T - PAD_B) * (1 - (v - min) / span);

  // Label sumbu Y dibulatkan maks 2 desimal (koma Indonesia) agar tidak
  // overflow seperti "1,2500000000000002" yang terpotong keluar SVG.
  const formatAxisVal = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
  const last = points[points.length - 1].value;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD_B} L${x(0).toFixed(1)},${H - PAD_B} Z`;

  const labelIdx = points.length <= 8 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <div className="chart-box">
      <h3>{title}</h3>
      {/* Ringkasan angka HTML di atas grafik — tetap terbaca di HP walau
          teks SVG mengecil, dan mudah dibaca screen reader. */}
      <div className="chart-stats">
        <span>
          Terakhir: <b>{formatAxisVal(last)} {unit}</b>
        </span>
        <span>
          Min: <b>{formatAxisVal(min)} {unit}</b>
        </span>
        <span>
          Maks: <b>{formatAxisVal(max)} {unit}</b>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#cbd5e1" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#cbd5e1" />
        {[0, 0.5, 1].map((f) => {
          const v = min + span * f;
          const yy = y(v);
          return (
            <g key={f}>
              <line x1={PAD_L} y1={yy} x2={W - PAD_R} y2={yy} stroke="#f1f5f9" />
              <text x={PAD_L - 6} y={yy + 4} fontSize="15" textAnchor="end" fill="#334155">
                {formatAxisVal(v)}
              </text>
            </g>
          );
        })}
        <path d={area} fill={color} opacity="0.12" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r="3.5" fill={color} stroke="#fff" strokeWidth="1" />
        ))}
        {labelIdx.map((i) => {
          // Jepit label tanggal di dalam viewBox: dengan font 15px, label
          // terakhir (x = 628) akan terpotong di tepi kanan kalau tidak dijepit.
          const lx = Math.max(24, Math.min(W - 24, x(i)));
          return (
            <text key={i} x={lx} y={H - 10} fontSize="15" textAnchor="middle" fill="#334155">
              {points[i].date.slice(5)}
            </text>
          );
        })}
      </svg>
      <div className="legend">
        <span>
          <span className="dot" style={{ background: color }} />
          {title} ({unit}) — {points.length} pengukuran
        </span>
      </div>
    </div>
  );
}

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
  const x = (i: number) =>
    PAD_L + ((W - PAD_L - PAD_R) * i) / Math.max(1, points.length - 1);
  const y = (v: number) =>
    PAD_T + (H - PAD_T - PAD_B) * (1 - (v - min) / span);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD_B} L${x(0).toFixed(1)},${H - PAD_B} Z`;

  const labelIdx = points.length <= 8 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <div className="chart-box">
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#cbd5e1" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#cbd5e1" />
        {[0, 0.5, 1].map((f) => {
          const v = min + span * f;
          const yy = y(v);
          return (
            <g key={f}>
              <line x1={PAD_L} y1={yy} x2={W - PAD_R} y2={yy} stroke="#f1f5f9" />
              <text x={PAD_L - 6} y={yy + 4} fontSize="11" textAnchor="end" fill="#64748b">
                {String(v).replace(".", ",")}
              </text>
            </g>
          );
        })}
        <path d={area} fill={color} opacity="0.12" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r="3.5" fill={color} stroke="#fff" strokeWidth="1" />
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 10} fontSize="11" textAnchor="middle" fill="#64748b">
            {points[i].date.slice(5)}
          </text>
        ))}
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

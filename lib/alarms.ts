// Logika alarm — fungsi murni, bisa diuji tanpa DB.
// Aturan (sesuai spec):
//   CRITICAL: titik ditandai "kosong" (tidak ada air) ATAU tekanan 0 bar.
//   WARNING:  tekanan < 0,5 bar ATAU debit turun > 30% vs pengukuran sebelumnya
//             pada titik yang sama.

export type AlarmLevel = "critical" | "warning" | "ok";

export interface MeasurementLike {
  debit_lps: number | null;
  pressure_bar: number | null;
  is_empty: boolean;
}

export interface AlarmResult {
  level: AlarmLevel;
  reasons: string[];
}

export function computeAlarm(
  current: MeasurementLike,
  previous: MeasurementLike | null,
): AlarmResult {
  const reasons: string[] = [];

  if (current.is_empty) {
    reasons.push("Tidak ada air (kosong)");
  }
  if (current.pressure_bar !== null && current.pressure_bar === 0) {
    reasons.push("Tekanan 0 bar");
  }
  if (reasons.length > 0) {
    return { level: "critical", reasons };
  }

  if (current.pressure_bar !== null && current.pressure_bar < 0.5) {
    reasons.push(`Tekanan rendah (${formatNum(current.pressure_bar)} bar)`);
  }
  if (
    current.debit_lps !== null &&
    previous !== null &&
    previous.debit_lps !== null &&
    previous.debit_lps > 0
  ) {
    const drop = (previous.debit_lps - current.debit_lps) / previous.debit_lps;
    if (drop > 0.3) {
      reasons.push(
        `Debit turun ${Math.round(drop * 100)}% (sebelumnya ${formatNum(previous.debit_lps)} L/dtk)`,
      );
    }
  }

  if (reasons.length > 0) {
    return { level: "warning", reasons };
  }
  return { level: "ok", reasons: [] };
}

export function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return String(n).replace(".", ",");
}

/** Format angka Indonesia: 683735 -> "683.735", 6.9573778e9 -> "6.957.377.800" */
export function formatID(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

/** Parse input angka Indonesia: "6,55" / "6.55" / " 6,55 " -> 6.55 */
export function parseIDNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Tanggal + jam saat ini dalam WIB (Asia/Jakarta), format input HTML. */
export function nowWIB(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

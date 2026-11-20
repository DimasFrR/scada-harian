// Logika alarm — fungsi murni, bisa diuji tanpa DB.
// Aturan (sesuai spec):
//   CRITICAL: titik ditandai "kosong" (tidak ada air) ATAU tekanan <= 0 bar.
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

const EPSILON = 1e-9;

const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const idFormatter = new Intl.NumberFormat("id-ID");

const wibFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function isValidNumber(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function computeAlarm(
  current: MeasurementLike,
  previous: MeasurementLike | null,
): AlarmResult {
  const reasons: string[] = [];

  if (current.is_empty) {
    reasons.push("Tidak ada air (kosong)");
  }
  if (isValidNumber(current.pressure_bar) && current.pressure_bar <= 0) {
    reasons.push(
      current.pressure_bar === 0
        ? "Tekanan 0 bar"
        : `Tekanan tidak valid (${formatNum(current.pressure_bar)} bar)`,
    );
  }
  if (reasons.length > 0) {
    return { level: "critical", reasons };
  }

  if (isValidNumber(current.pressure_bar) && current.pressure_bar < 0.5) {
    reasons.push(`Tekanan rendah (${formatNum(current.pressure_bar)} bar)`);
  }
  if (
    isValidNumber(current.debit_lps) &&
    current.debit_lps >= 0 &&
    previous !== null &&
    isValidNumber(previous.debit_lps) &&
    previous.debit_lps > 0
  ) {
    const drop = (previous.debit_lps - current.debit_lps) / previous.debit_lps;
    if (drop > 0.3 + EPSILON) {
      const pct = Math.round(drop * 1000) / 10;
      reasons.push(
        `Debit turun ${formatNum(pct)}% (sebelumnya ${formatNum(previous.debit_lps)} L/dtk)`,
      );
    }
  }

  if (reasons.length > 0) {
    return { level: "warning", reasons };
  }
  return { level: "ok", reasons: [] };
}

export function formatNum(n: number | null | undefined): string {
  if (!isValidNumber(n)) return "—";
  return String(n === 0 ? 0 : n).replace(".", ",");
}

/** Format angka Indonesia: 683735 -> "683.735", 6.9573778e9 -> "6.957.377.800" */
export function formatID(n: number | null | undefined): string {
  if (!isValidNumber(n)) return "—";
  return idFormatter.format(n === 0 ? 0 : n);
}

/** Parse input angka Indonesia: "6,55" / "6.55" / "1.250,50" / " 6,55 " -> number */
export function parseIDNumber(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/\s+/g, "");
  if (cleaned === "" || cleaned.length > 50) return null;

  let normalized = cleaned;
  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) {
    // Format Indonesia: "1.250,50"
    if (!/^[+-]?\d{1,3}(\.\d{3})+,\d+$/.test(cleaned)) return null;
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasDot && cleaned.indexOf(".") !== cleaned.lastIndexOf(".")) {
    // Banyak titik sebagai pemisah ribuan: "1.000.000"
    if (!/^[+-]?\d{1,3}(\.\d{3})+$/.test(cleaned)) return null;
    normalized = cleaned.replace(/\./g, "");
  } else if (hasComma) {
    // Desimal koma tunggal: "6,55"
    if (cleaned.indexOf(",") !== cleaned.lastIndexOf(",")) return null;
    normalized = cleaned.replace(",", ".");
  }

  // Tolak literal hex (0x), biner (0b), oktal (0o), dan notasi ilmiah (1e5)
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : n;
}

/** "2026-10" -> "Oktober 2026" */
export function monthNameID(month: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month.trim());
  if (!match) return month;
  const [, year, monthStr] = match;
  return `${MONTH_NAMES_ID[Number(monthStr) - 1]} ${year}`;
}

/** Tanggal + jam saat ini dalam WIB (Asia/Jakarta), format input HTML. */
export function nowWIB(now: Date = new Date()): { date: string; time: string } {
  const parts = wibFormatter.formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  // Fallback defensif untuk runtime dengan ICU lama yang masih menghasilkan "24"
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hour}:${get("minute")}`,
  };
}

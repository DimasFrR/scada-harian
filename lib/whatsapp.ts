// Kirim alarm ke WhatsApp via Fonnte (https://fonnte.com).
// Semua konfigurasi HANYA dari env var — tidak ada nomor / token hardcode:
//   FONNTE_TOKEN      — token dari dashboard Fonnte (Device > token).
//   WA_ALARM_TARGETS  — nomor penerima, dipisah koma, contoh: 6281234567890,6289876543210.
// Kalau salah satu kosong, pengiriman dilewati diam-diam (alarm di dashboard
// tetap tampil; tidak ada yang crash dan tidak ada yang menghalangi simpan data).
// Fungsi ini TIDAK PERNAH melempar — semua kegagalan dikembalikan sebagai hasil.

export type WaSendResult =
  | { sent: true; targets: number }
  | { sent: false; reason: "not-configured" | "no-targets" | "gateway-error" | "error"; detail?: string };

/** Nomor tujuan yang terkonfigurasi (setelah dinormalisasi ke format 62...). */
export function getWaTargets(): string[] {
  const raw = process.env.WA_ALARM_TARGETS ?? "";
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().replace(/[^0-9]/g, ""))
    .filter(Boolean)
    .map((n) => (n.startsWith("0") ? `62${n.slice(1)}` : n));
}

export function isWaConfigured(): boolean {
  return !!process.env.FONNTE_TOKEN && getWaTargets().length > 0;
}

export async function sendWaAlarm(message: string): Promise<WaSendResult> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) return { sent: false, reason: "not-configured" };
  const targets = getWaTargets();
  if (targets.length === 0) return { sent: false, reason: "not-configured" };

  try {
    const body = new URLSearchParams({
      target: targets.join(","),
      message,
      countryCode: "62",
    });
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as { status?: boolean; reason?: string } | null;
    if (!res.ok || data?.status === false) {
      console.error("[wa-alarm] Fonnte menolak:", res.status, data?.reason ?? "");
      return { sent: false, reason: "gateway-error", detail: data?.reason };
    }
    return { sent: true, targets: targets.length };
  } catch (e) {
    console.error("[wa-alarm] Gagal kirim:", e);
    return { sent: false, reason: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Teks pesan alarm — singkat, jelas di HP, tanpa jargon. */
export function formatAlarmMessage(input: {
  level: "critical" | "warning";
  pointName: string;
  reasons: string[];
  date: string;
  time: string;
  debit_lps: number | null;
  pressure_bar: number | null;
}): string {
  const level = input.level === "critical" ? "KRITIS" : "PERINGATAN";
  const lines = [
    `Alarm SCADA Harian — ${level}`,
    `Titik: ${input.pointName}`,
    ...input.reasons,
    `Debit: ${input.debit_lps === null ? "-" : String(input.debit_lps).replace(".", ",")} L/dtk · Tekanan: ${input.pressure_bar === null ? "-" : String(input.pressure_bar).replace(".", ",")} bar`,
    `${input.date} ${input.time} WIB`,
    `Cek di aplikasi SCADA Harian.`,
  ];
  return lines.join("\n");
}

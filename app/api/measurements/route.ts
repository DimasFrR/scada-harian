import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { DbNotConfigured, getMeasurements, query } from "@/lib/db";
import { computeAlarm, parseIDNumber } from "@/lib/alarms";
import { formatAlarmMessage, sendWaAlarm } from "@/lib/whatsapp";

function dbError(e: unknown) {
  if (e instanceof DbNotConfigured) {
    return NextResponse.json(
      { ok: false, error: "Database belum dikonfigurasi (DATABASE_URL kosong)." },
      { status: 503 },
    );
  }
  console.error(e);
  return NextResponse.json({ ok: false, error: "Kesalahan server." }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const date = sp.get("date") || undefined;
    const pointId = sp.get("pointId") ? Number(sp.get("pointId")) : undefined;
    const rows = await getMeasurements({ date, pointId });
    return NextResponse.json({ ok: true, measurements: rows });
  } catch (e) {
    return dbError(e);
  }
}

function parseBody(body: Record<string, unknown>) {
  const point_id = Number(body.point_id);
  const date = String(body.date ?? "");
  const time = String(body.time ?? "");
  const debit_lps =
    body.debit_lps === null || body.debit_lps === undefined
      ? null
      : typeof body.debit_lps === "number"
        ? body.debit_lps
        : parseIDNumber(String(body.debit_lps));
  const pressure_bar =
    body.pressure_bar === null || body.pressure_bar === undefined
      ? null
      : typeof body.pressure_bar === "number"
        ? body.pressure_bar
        : parseIDNumber(String(body.pressure_bar));
  const is_empty = body.is_empty === true;
  // URL foto bukti (opsional, dari /api/photos). Diterima apa adanya tapi
  // dibatasi: harus URL http(s) dan maks 1000 karakter — bukan jalur lokal.
  const photo_url =
    typeof body.photo_url === "string" &&
    body.photo_url.length > 0 &&
    body.photo_url.length <= 1000 &&
    /^https?:\/\//i.test(body.photo_url)
      ? body.photo_url
      : null;
  if (!point_id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("VALIDATION");
  }
  if (!is_empty && debit_lps === null && pressure_bar === null) {
    throw new Error("VALIDATION");
  }
  return { point_id, date, time, debit_lps, pressure_bar, is_empty, photo_url };
}

/**
 * Kirim alarm WA untuk satu pengukuran baru (jalan SETELAH respons terkirim,
 * jadi tidak memperlambat simpan). Dedup: 1 pengukuran hanya dikirim 1x
 * (tabel alarm_notifications). Kalau WA belum dikonfigurasi, dilewati diam-diam.
 */
function notifyAlarmWa(measurement: {
  id: number;
  point_id: number;
  point_name: string;
  date: string;
  time: string;
  debit_lps: number | null;
  pressure_bar: number | null;
  is_empty: boolean;
  prev_debit_lps: number | null;
}) {
  after(async () => {
    try {
      const alarm = computeAlarm(
        measurement,
        measurement.prev_debit_lps === null
          ? null
          : { debit_lps: measurement.prev_debit_lps, pressure_bar: null, is_empty: false },
      );
      if (alarm.level === "ok") return;
      // Sudah pernah dikirim untuk pengukuran ini? Jangan kirim ulang.
      const done = await query<{ measurement_id: number }>(
        "SELECT measurement_id FROM alarm_notifications WHERE measurement_id = $1",
        [measurement.id],
      );
      if (done.length > 0) return;
      const result = await sendWaAlarm(
        formatAlarmMessage({
          level: alarm.level,
          pointName: measurement.point_name,
          reasons: alarm.reasons,
          date: measurement.date,
          time: measurement.time.slice(0, 5),
          debit_lps: measurement.debit_lps,
          pressure_bar: measurement.pressure_bar,
        }),
      );
      if (result.sent) {
        await query(
          "INSERT INTO alarm_notifications (measurement_id, level) VALUES ($1, $2) ON CONFLICT (measurement_id) DO NOTHING",
          [measurement.id, alarm.level],
        );
      }
    } catch (e) {
      // Alarm WA tidak boleh mengganggu apa pun — cukup log.
      console.error("[wa-alarm] Gagal proses notifikasi:", e);
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const parsed = parseBody(await req.json());
    // Debit pengukuran sebelumnya di titik ini (untuk hitung penurunan debit
    // pada alarm) — diambil SEBELUM insert supaya tidak membaca baris baru.
    const prev = await query<{ debit_lps: number | null }>(
      `SELECT debit_lps FROM measurements WHERE point_id = $1
        ORDER BY date DESC, time DESC, id DESC LIMIT 1`,
      [parsed.point_id],
    ).catch(() => [] as { debit_lps: number | null }[]);
    const rows = await query<{ id: number; point_name: string }>(
      `INSERT INTO measurements (point_id, date, time, debit_lps, pressure_bar, is_empty, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, (SELECT name FROM points WHERE id = $1) AS point_name`,
      [parsed.point_id, parsed.date, parsed.time, parsed.debit_lps, parsed.pressure_bar, parsed.is_empty, parsed.photo_url],
    );
    notifyAlarmWa({
      id: rows[0].id,
      point_id: parsed.point_id,
      point_name: rows[0].point_name,
      date: parsed.date,
      time: parsed.time,
      debit_lps: parsed.debit_lps,
      pressure_bar: parsed.pressure_bar,
      is_empty: parsed.is_empty,
      prev_debit_lps: prev[0]?.debit_lps ?? null,
    });
    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch (e) {
    if (e instanceof Error && e.message === "VALIDATION") {
      return NextResponse.json(
        { ok: false, error: "Data tidak lengkap: isi tanggal, jam, dan minimal satu dari debit/tekanan (atau tandai kosong)." },
        { status: 400 },
      );
    }
    return dbError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!id) return NextResponse.json({ ok: false, error: "ID tidak valid." }, { status: 400 });
    const parsed = parseBody(body);
    await query(
      `UPDATE measurements SET point_id=$1, date=$2, time=$3, debit_lps=$4, pressure_bar=$5, is_empty=$6, photo_url=$7 WHERE id=$8`,
      [parsed.point_id, parsed.date, parsed.time, parsed.debit_lps, parsed.pressure_bar, parsed.is_empty, parsed.photo_url, id],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "VALIDATION") {
      return NextResponse.json({ ok: false, error: "Data tidak lengkap." }, { status: 400 });
    }
    return dbError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ ok: false, error: "ID tidak valid." }, { status: 400 });
    await query("DELETE FROM measurements WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { DbNotConfigured, getMeasurements, query } from "@/lib/db";
import { parseIDNumber } from "@/lib/alarms";

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
  if (!point_id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("VALIDATION");
  }
  if (!is_empty && debit_lps === null && pressure_bar === null) {
    throw new Error("VALIDATION");
  }
  return { point_id, date, time, debit_lps, pressure_bar, is_empty };
}

export async function POST(req: NextRequest) {
  try {
    const parsed = parseBody(await req.json());
    const rows = await query<{ id: number }>(
      `INSERT INTO measurements (point_id, date, time, debit_lps, pressure_bar, is_empty)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [parsed.point_id, parsed.date, parsed.time, parsed.debit_lps, parsed.pressure_bar, parsed.is_empty],
    );
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
      `UPDATE measurements SET point_id=$1, date=$2, time=$3, debit_lps=$4, pressure_bar=$5, is_empty=$6 WHERE id=$7`,
      [parsed.point_id, parsed.date, parsed.time, parsed.debit_lps, parsed.pressure_bar, parsed.is_empty, id],
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

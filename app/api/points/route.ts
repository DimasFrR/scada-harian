import { NextRequest, NextResponse } from "next/server";
import { DbNotConfigured, getPoints, query } from "@/lib/db";

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

export async function GET() {
  try {
    const points = await getPoints();
    return NextResponse.json({ ok: true, points });
  } catch (e) {
    return dbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "Nama titik wajib diisi." }, { status: 400 });
    }
    const rows = await query<{ id: number }>(
      `INSERT INTO points (name, sort_order)
       VALUES ($1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM points))
       ON CONFLICT (name) DO NOTHING RETURNING id`,
      [name],
    );
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Titik dengan nama itu sudah ada." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch (e) {
    return dbError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID titik tidak valid." }, { status: 400 });
    }
    await query("DELETE FROM points WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}

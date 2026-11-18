// Akses Postgres (Vercel Postgres / DATABASE_URL).
// Pool dibuat malas (lazy) — build TIDAK PERNAH menyentuh DB.
// Kalau DATABASE_URL tidak diset, query() melempar DbNotConfigured dan
// halaman/API menampilkan pesan setup, bukan crash.
import { Pool } from "pg";
import { POINTS } from "./points";

export class DbNotConfigured extends Error {
  constructor() {
    super("DATABASE_URL belum dikonfigurasi");
    this.name = "DbNotConfigured";
  }
}

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new DbNotConfigured();
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl:
        process.env.DATABASE_URL.includes("sslmode=require") ||
        process.env.DATABASE_URL.includes("vercel") ||
        process.env.DATABASE_URL.includes("neon")
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }
  return pool;
}

let schemaReady: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const p = getPool();
      // Satu round-trip untuk ketiga tabel (dulu 3 query terpisah) —
      // penting karena tiap query ke Neon yang lagi "tidur" (free tier
      // suspend setelah ~5 menit idle) kena biaya wake-up per query.
      await p.query(`
        CREATE TABLE IF NOT EXISTS points (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS measurements (
          id SERIAL PRIMARY KEY,
          point_id INTEGER NOT NULL REFERENCES points(id) ON DELETE CASCADE,
          date DATE NOT NULL,
          time TIME NOT NULL,
          debit_lps NUMERIC NULL,
          pressure_bar NUMERIC NULL,
          is_empty BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS monthly_billed (
          month TEXT PRIMARY KEY,
          sl INTEGER NOT NULL,
          m3 NUMERIC NOT NULL,
          harga_air BIGINT NOT NULL,
          materai BIGINT NOT NULL DEFAULT 0,
          branches INTEGER NULL,
          note TEXT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      // Satu query untuk kedua hitungan seed (dulu 2 query terpisah).
      const { rows: counts } = await p.query<{ mb: string; p: string }>(
        `SELECT (SELECT COUNT(*)::text FROM monthly_billed) AS mb,
                (SELECT COUNT(*)::text FROM points) AS p`,
      );
      const mbCount = Number(counts[0].mb);
      const pointsCount = Number(counts[0].p);
      // Seed Oktober 2026 (terverifikasi dari Lap DRD Excel, 18 Nov 2026)
      // — hanya bila tabel masih kosong.
      if (mbCount === 0) {
        await p.query(
          `INSERT INTO monthly_billed (month, sl, m3, harga_air, materai, branches, note)
           VALUES ('2026-10', 49102, 683735, 6957137800, 240000, 18, 'Lap DRD Rekapitulasi Global')
           ON CONFLICT (month) DO NOTHING`,
        );
      }
      // Seed 29 titik kanonis — hanya bila tabel masih kosong.
      if (pointsCount === 0) {
        for (let i = 0; i < POINTS.length; i++) {
          await p.query(
            "INSERT INTO points (name, sort_order) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
            [POINTS[i], i + 1],
          );
        }
      }
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

export async function query<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const { rows } = await getPool().query(text, params as never[]);
  // Normalisasi tipe pg -> tipe yang dipakai aplikasi:
  // - DATE / TIMESTAMPTZ dikembalikan pg sebagai objek Date; React tidak bisa
  //   me-render objek Date sebagai child dan Next tidak bisa mengirimnya sebagai
  //   prop ke client component — itu yang membuat Dashboard & /data crash
  //   ("Application error") begitu ada 1 pengukuran tersimpan.
  // - NUMERIC dikembalikan pg sebagai string; ubah ke number agar
  //   perbandingan alarm (tekanan === 0, debit turun >30%) bekerja benar.
  return (rows as Record<string, unknown>[]).map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Date) {
        out[k] = k === "date" ? v.toISOString().slice(0, 10) : v.toISOString();
      } else if (
        (k === "debit_lps" ||
          k === "pressure_bar" ||
          k === "prev_debit_lps" ||
          k === "m3" ||
          k === "sl" ||
          k === "harga_air" ||
          k === "materai" ||
          k === "total_rp") &&
        typeof v === "string"
      ) {
        out[k] = v === "" ? null : Number(v);
      } else {
        out[k] = v;
      }
    }
    return out as T;
  });
}

export interface PointRow {
  id: number;
  name: string;
  sort_order: number;
}

export interface MeasurementRow {
  id: number;
  point_id: number;
  point_name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  debit_lps: number | null;
  pressure_bar: number | null;
  is_empty: boolean;
  created_at: string;
}

export async function getPoints(): Promise<PointRow[]> {
  return query<PointRow>(
    "SELECT id, name, sort_order FROM points ORDER BY sort_order ASC, id ASC",
  );
}

/** Pengukuran terbaru per titik + pengukuran sebelumnya (untuk hitung penurunan debit). */
export async function getLatestPerPoint(): Promise<
  (MeasurementRow & { prev_debit_lps: number | null })[]
> {
  // LAG dihitung di CTE atas SEMUA pengukuran dulu, baru disaring ke yang terbaru.
  return query(
    `WITH ranked AS (
       SELECT m.*, p.name AS point_name, p.sort_order AS point_sort,
              LAG(m.debit_lps) OVER (PARTITION BY m.point_id ORDER BY m.date, m.time, m.id) AS prev_debit_lps,
              ROW_NUMBER() OVER (PARTITION BY m.point_id ORDER BY m.date DESC, m.time DESC, m.id DESC) AS rn
         FROM measurements m
         JOIN points p ON p.id = m.point_id
     )
     SELECT * FROM ranked WHERE rn = 1 ORDER BY point_sort ASC`,
  );
}

export interface MonthlyBilledRow {
  month: string; // YYYY-MM
  sl: number;
  m3: number;
  harga_air: number;
  materai: number;
  total_rp: number;
  branches: number | null;
  note: string | null;
  updated_at: string;
}

const MONTHLY_SELECT =
  `SELECT month, sl, m3, harga_air, materai, harga_air + materai AS total_rp,
          branches, note, updated_at FROM monthly_billed`;

/** Volume tertagih bulan terbaru (untuk panel Dashboard). */
export async function getLatestMonthlyBilled(): Promise<MonthlyBilledRow | null> {
  const rows = await query<MonthlyBilledRow>(`${MONTHLY_SELECT} ORDER BY month DESC LIMIT 1`);
  return rows[0] ?? null;
}

/** Semua bulan, terbaru dulu (untuk halaman Bulanan). */
export async function getMonthlyBilledList(): Promise<MonthlyBilledRow[]> {
  return query<MonthlyBilledRow>(`${MONTHLY_SELECT} ORDER BY month DESC`);
}

/** Simpan / perbarui satu bulan (upsert berdasar month). */
export async function upsertMonthlyBilled(r: {
  month: string;
  sl: number;
  m3: number;
  harga_air: number;
  materai: number;
  branches: number | null;
  note: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO monthly_billed (month, sl, m3, harga_air, materai, branches, note, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (month) DO UPDATE SET
       sl = EXCLUDED.sl, m3 = EXCLUDED.m3, harga_air = EXCLUDED.harga_air,
       materai = EXCLUDED.materai, branches = EXCLUDED.branches,
       note = EXCLUDED.note, updated_at = NOW()`,
    [r.month, r.sl, r.m3, r.harga_air, r.materai, r.branches, r.note],
  );
}

export async function deleteMonthlyBilled(month: string): Promise<void> {
  await query(`DELETE FROM monthly_billed WHERE month = $1`, [month]);
}

export async function getMeasurements(filter: {
  date?: string;
  pointId?: number;
  limit?: number;
}): Promise<MeasurementRow[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filter.date) {
    params.push(filter.date);
    conds.push(`m.date = $${params.length}`);
  }
  if (filter.pointId) {
    params.push(filter.pointId);
    conds.push(`m.point_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;
  params.push(limit);
  return query<MeasurementRow>(
    `SELECT m.*, p.name AS point_name
       FROM measurements m
       JOIN points p ON p.id = m.point_id
       ${where}
      ORDER BY m.date DESC, m.time DESC, p.sort_order ASC
      LIMIT $${params.length}`,
    params,
  );
}

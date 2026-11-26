// Akses Postgres (Vercel Postgres / DATABASE_URL).
// Pool dibuat malas (lazy) — build TIDAK PERNAH menyentuh DB.
// Kalau DATABASE_URL tidak diset, query() melempar DbNotConfigured dan
// halaman/API menampilkan pesan setup, bukan crash.
import { Pool } from "pg";
import { OCT_2026_BRANCH_ROWS } from "./monthlyBranchSeed";
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
        -- Foto bukti pengukuran (1 foto per pengukuran, URL Vercel Blob).
        -- ALTER terpisah karena tabel measurements sudah ada di production.
        ALTER TABLE measurements ADD COLUMN IF NOT EXISTS photo_url TEXT;
        -- Produksi IPA & distribusi per bulan (dari atasan, untuk hitung
        -- kehilangan air / NRW di Rekap Bulanan). Kolom baru — tabel
        -- monthly_billed sudah ter-seed Okt 2026 sebelum kolom ini ada.
        ALTER TABLE monthly_billed ADD COLUMN IF NOT EXISTS production_m3 NUMERIC;
        ALTER TABLE monthly_billed ADD COLUMN IF NOT EXISTS distribution_m3 NUMERIC;
        -- Rincian per cabang/unit per bulan (dari Bagian Produksi, mulai
        -- Okt 2026). Produksi NULL = cabang itu tidak punya produksi sendiri
        -- (dibukukan di Tasik Barat); kehilangan/NRW/SL NULL = sel kosong
        -- di file sumber. Satu bulan bisa tidak punya baris sama sekali.
        CREATE TABLE IF NOT EXISTS monthly_branch_billed (
          month TEXT NOT NULL,
          branch TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          production_m3 NUMERIC NULL,
          distribution_m3 NUMERIC NULL,
          billed_m3 NUMERIC NOT NULL,
          loss_m3 NUMERIC NULL,
          nrw_pct NUMERIC NULL,
          sl_installed INTEGER NULL,
          sl_active INTEGER NULL,
          PRIMARY KEY (month, branch)
        );
        -- Dedup kirim alarm WA: 1 baris = 1 alarm sudah dikirim untuk 1 pengukuran.
        CREATE TABLE IF NOT EXISTS alarm_notifications (
          measurement_id INTEGER PRIMARY KEY REFERENCES measurements(id) ON DELETE CASCADE,
          level TEXT NOT NULL,
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      // Satu query untuk ketiga hitungan seed (dulu 2 query terpisah).
      const { rows: counts } = await p.query<{ mb: string; p: string; bb: string }>(
        `SELECT (SELECT COUNT(*)::text FROM monthly_billed) AS mb,
                (SELECT COUNT(*)::text FROM points) AS p,
                (SELECT COUNT(*)::text FROM monthly_branch_billed WHERE month = '2026-10') AS bb`,
      );
      const mbCount = Number(counts[0].mb);
      const pointsCount = Number(counts[0].p);
      const branchCount = Number(counts[0].bb);
      // Seed Oktober 2026 (terverifikasi dari Lap DRD Excel, 18 Nov 2026)
      // — hanya bila tabel masih kosong.
      if (mbCount === 0) {
        await p.query(
          `INSERT INTO monthly_billed (month, sl, m3, harga_air, materai, branches, note)
           VALUES ('2026-10', 49102, 683735, 6957137800, 240000, 18, 'Lap DRD Rekapitulasi Global')
           ON CONFLICT (month) DO NOTHING`,
        );
      }
      // Produksi & distribusi Okt 2026 (dari atasan, 18 Nov 2026:
      // produksi IPA 1.038.148,11 m³, distribusi 1.036.354,66 m³) — hanya
      // diisi bila baris Okt sudah ada tapi kolomnya masih kosong (tabel
      // sudah ter-seed sebelum kolom production/distribution ada).
      await p.query(
        `UPDATE monthly_billed
            SET production_m3 = 1038148.11, distribution_m3 = 1036354.66
          WHERE month = '2026-10' AND production_m3 IS NULL`,
      );
      // Seed rincian per cabang Okt 2026 (20 baris, dari file Bagian
      // Produksi — lib/monthlyBranchSeed.ts) — hanya bila belum ada.
      if (branchCount === 0) {
        const cols =
          "(month, branch, sort_order, production_m3, distribution_m3, billed_m3, loss_m3, nrw_pct, sl_installed, sl_active)";
        const placeholders: string[] = [];
        const params: unknown[] = [];
        OCT_2026_BRANCH_ROWS.forEach((r, i) => {
          const b = i * 10;
          placeholders.push(
            `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10})`,
          );
          params.push(
            r.month,
            r.branch,
            r.sort_order,
            r.production_m3,
            r.distribution_m3,
            r.billed_m3,
            r.loss_m3,
            r.nrw_pct,
            r.sl_installed,
            r.sl_active,
          );
        });
        await p.query(
          `INSERT INTO monthly_branch_billed ${cols} VALUES ${placeholders.join(", ")} ON CONFLICT (month, branch) DO NOTHING`,
          params as never[],
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
          k === "production_m3" ||
          k === "distribution_m3" ||
          k === "billed_m3" ||
          k === "loss_m3" ||
          k === "nrw_pct" ||
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
  photo_url: string | null;
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
  // Produksi IPA & distribusi (m³) — null bila rekap bulan itu belum masuk.
  production_m3: number | null;
  distribution_m3: number | null;
  updated_at: string;
}

const MONTHLY_SELECT =
  `SELECT month, sl, m3, harga_air, materai, harga_air + materai AS total_rp,
          branches, note, production_m3, distribution_m3, updated_at FROM monthly_billed`;

/** Volume tertagih bulan terbaru (untuk panel Dashboard). */
export async function getLatestMonthlyBilled(): Promise<MonthlyBilledRow | null> {
  const rows = await query<MonthlyBilledRow>(`${MONTHLY_SELECT} ORDER BY month DESC LIMIT 1`);
  return rows[0] ?? null;
}

/** Semua bulan, terbaru dulu (untuk halaman Bulanan). */
export async function getMonthlyBilledList(): Promise<MonthlyBilledRow[]> {
  return query<MonthlyBilledRow>(`${MONTHLY_SELECT} ORDER BY month DESC`);
}

export interface MonthlyBranchBilledRow {
  month: string; // YYYY-MM
  branch: string;
  sort_order: number;
  production_m3: number | null;
  distribution_m3: number | null;
  billed_m3: number;
  loss_m3: number | null;
  nrw_pct: number | null;
  sl_installed: number | null;
  sl_active: number | null;
}

/** Semua rincian per cabang, terbaru dulu (untuk halaman Bulanan). */
export async function getMonthlyBranchBilledList(): Promise<MonthlyBranchBilledRow[]> {
  return query<MonthlyBranchBilledRow>(
    `SELECT month, branch, sort_order, production_m3, distribution_m3,
            billed_m3, loss_m3, nrw_pct, sl_installed, sl_active
       FROM monthly_branch_billed
      ORDER BY month DESC, sort_order ASC, branch ASC`,
  );
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
  production_m3?: number | null;
  distribution_m3?: number | null;
}): Promise<void> {
  await query(
    `INSERT INTO monthly_billed (month, sl, m3, harga_air, materai, branches, note, production_m3, distribution_m3, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (month) DO UPDATE SET
       sl = EXCLUDED.sl, m3 = EXCLUDED.m3, harga_air = EXCLUDED.harga_air,
       materai = EXCLUDED.materai, branches = EXCLUDED.branches,
       note = EXCLUDED.note,
       production_m3 = COALESCE(EXCLUDED.production_m3, monthly_billed.production_m3),
       distribution_m3 = COALESCE(EXCLUDED.distribution_m3, monthly_billed.distribution_m3),
       updated_at = NOW()`,
    [
      r.month,
      r.sl,
      r.m3,
      r.harga_air,
      r.materai,
      r.branches,
      r.note,
      r.production_m3 ?? null,
      r.distribution_m3 ?? null,
    ],
  );
}

export async function deleteMonthlyBilled(month: string): Promise<void> {
  await query(`DELETE FROM monthly_billed WHERE month = $1`, [month]);
}

export interface MonthlyReadingRecap {
  month: string; // YYYY-MM
  rounds: number; // jumlah ronde laporan (tanggal berbeda)
  rows: number; // jumlah baris bacaan
  points_measured: number; // titik berbeda yang terukur (baris tidak kosong)
  empty_rows: number; // baris yang dilaporkan tanpa air / tanpa tekanan
}

/** Rekap bacaan lapangan per bulan — untuk tabel Rekap Bacaan Lapangan di
 *  halaman Bulanan. "Titik terukur" = titik berbeda yang punya minimal satu
 *  baris bacaan tidak kosong pada bulan itu. */
export async function getMonthlyReadingRecap(): Promise<MonthlyReadingRecap[]> {
  return query<MonthlyReadingRecap>(
    `SELECT to_char(date, 'YYYY-MM') AS month,
            COUNT(DISTINCT date)::int AS rounds,
            COUNT(*)::int AS rows,
            COUNT(DISTINCT CASE WHEN NOT is_empty THEN point_id END)::int AS points_measured,
            COUNT(*) FILTER (WHERE is_empty)::int AS empty_rows
       FROM measurements
      GROUP BY 1
      ORDER BY 1 DESC`,
  );
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { formatID, monthNameID } from "@/lib/alarms";
import type { MonthlyBilledRow } from "@/lib/db";

interface FormState {
  month: string;
  sl: string;
  m3: string;
  harga_air: string;
  materai: string;
  branches: string;
  note: string;
}

function emptyForm(): FormState {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  return { month, sl: "", m3: "", harga_air: "", materai: "", branches: "", note: "" };
}

function fmt(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

/** Angka Indonesia dengan pemisah ribuan titik: "49.102" -> 49102,
 * "6.957.137.800" -> 6957137800, "6,55" -> 6.55. */
function parseIDInt(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = raw.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function BulananPage() {
  const [rows, setRows] = useState<MonthlyBilledRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/monthly-billed");
    const data = await res.json();
    if (data.ok) setRows(data.months);
    else setMsg({ kind: "err", text: data.error || "Gagal memuat data bulanan." });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  function editRow(r: MonthlyBilledRow) {
    setForm({
      month: r.month,
      sl: fmt(r.sl),
      m3: fmt(r.m3),
      harga_air: fmt(r.harga_air),
      materai: fmt(r.materai),
      branches: r.branches === null ? "" : String(r.branches),
      note: r.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const sl = parseIDInt(form.sl);
    const m3 = parseIDInt(form.m3);
    const harga_air = parseIDInt(form.harga_air);
    const materai = parseIDInt(form.materai) ?? 0;
    const branches = form.branches.trim() === "" ? null : parseIDInt(form.branches);
    if (!/^\d{4}-\d{2}$/.test(form.month)) {
      return setMsg({ kind: "err", text: "Pilih bulan dulu." });
    }
    if (sl === null || m3 === null || harga_air === null) {
      return setMsg({ kind: "err", text: "Isi SL, m³, dan Harga Air (boleh pakai titik ribuan, contoh 683.735)." });
    }
    setBusy(true);
    try {
      const res = await fetch("/api/monthly-billed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: form.month,
          sl,
          m3,
          harga_air,
          materai,
          branches,
          note: form.note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Gagal menyimpan.");
      setMsg({ kind: "ok", text: `Data ${monthNameID(form.month)} tersimpan — panel Dashboard ikut berubah.` });
      setForm(emptyForm());
      await load();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan." });
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(month: string) {
    const res = await fetch(`/api/monthly-billed?month=${month}`, { method: "DELETE" });
    const data = await res.json();
    setConfirmDelete(null);
    if (data.ok) {
      setMsg({ kind: "ok", text: `Data ${monthNameID(month)} dihapus.` });
      await load();
    } else {
      setMsg({ kind: "err", text: data.error || "Gagal menghapus." });
    }
  }

  if (loading) return <p className="muted">Memuat...</p>;

  return (
    <div>
      <h1>Volume Tertagih Bulanan</h1>
      <p className="lead">
        Isi angka dari Lap DRD billing tiap bulan. Bulan terbaru otomatis tampil di panel
        Dashboard — tidak perlu edit kode lagi.
      </p>

      {msg && <div className={msg.kind === "ok" ? "success" : "error"}>{msg.text}</div>}

      <form className="card" onSubmit={submit}>
        <h3>Input Bulanan</h3>
        <label htmlFor="month">Bulan</label>
        <input
          id="month"
          type="month"
          value={form.month}
          onChange={(e) => setForm({ ...form, month: e.target.value })}
          required
        />

        <label htmlFor="sl">Jumlah SL (pelanggan)</label>
        <input
          id="sl"
          type="text"
          inputMode="numeric"
          value={form.sl}
          onChange={(e) => setForm({ ...form, sl: e.target.value })}
          placeholder="contoh: 49.102"
          required
        />

        <label htmlFor="m3">Volume (m³)</label>
        <input
          id="m3"
          type="text"
          inputMode="decimal"
          value={form.m3}
          onChange={(e) => setForm({ ...form, m3: e.target.value })}
          placeholder="contoh: 683.735"
          required
        />

        <label htmlFor="harga_air">Harga Air (Rp)</label>
        <input
          id="harga_air"
          type="text"
          inputMode="numeric"
          value={form.harga_air}
          onChange={(e) => setForm({ ...form, harga_air: e.target.value })}
          placeholder="contoh: 6.957.137.800"
          required
        />

        <label htmlFor="materai">Materai (Rp)</label>
        <input
          id="materai"
          type="text"
          inputMode="numeric"
          value={form.materai}
          onChange={(e) => setForm({ ...form, materai: e.target.value })}
          placeholder="contoh: 240.000 (boleh kosong = 0)"
        />

        <label htmlFor="branches">Jumlah cabang</label>
        <input
          id="branches"
          type="text"
          inputMode="numeric"
          value={form.branches}
          onChange={(e) => setForm({ ...form, branches: e.target.value })}
          placeholder="contoh: 18 (boleh kosong)"
        />

        <label htmlFor="note">Keterangan / sumber</label>
        <input
          id="note"
          type="text"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="contoh: Lap DRD Rekapitulasi Global"
        />

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Menyimpan..." : "Simpan Data Bulanan"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setForm(emptyForm())}>
            Reset
          </button>
        </div>
        <p className="hint">
          Total dihitung otomatis: Harga Air + Materai. Kalau bulan yang sama disimpan lagi,
          angka lamanya ditimpa.
        </p>
      </form>

      <h2>Riwayat Bulanan</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bulan</th>
                <th className="num">SL</th>
                <th className="num">m³</th>
                <th className="num">Total (Rp)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td>
                    <b>{monthNameID(r.month)}</b>
                    {r.note && (
                      <>
                        <br />
                        <span className="muted">{r.note}</span>
                      </>
                    )}
                  </td>
                  <td className="num">{formatID(r.sl)}</td>
                  <td className="num">{formatID(r.m3)}</td>
                  <td className="num">{formatID(r.total_rp)}</td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: "6px 10px", minHeight: 36 }} onClick={() => editRow(r)}>
                      Ubah
                    </button>{" "}
                    {confirmDelete === r.month ? (
                      <>
                        <button className="btn btn-danger" style={{ padding: "6px 10px", minHeight: 36 }} onClick={() => deleteRow(r.month)}>
                          Yakin hapus?
                        </button>{" "}
                        <button className="btn btn-secondary" style={{ padding: "6px 10px", minHeight: 36 }} onClick={() => setConfirmDelete(null)}>
                          Batal
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-danger" style={{ padding: "6px 10px", minHeight: 36 }} onClick={() => setConfirmDelete(r.month)}>
                        Hapus
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Belum ada data bulanan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

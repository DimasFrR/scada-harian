"use client";

import { useCallback, useEffect, useState } from "react";
import { nowWIB, parseIDNumber } from "@/lib/alarms";
import type { MeasurementRow, PointRow } from "@/lib/db";

interface FormState {
  id: number | null;
  point_id: string;
  date: string;
  time: string;
  debit: string;
  pressure: string;
  is_empty: boolean;
}

function emptyForm(): FormState {
  const wib = nowWIB();
  return { id: null, point_id: "", date: wib.date, time: wib.time, debit: "", pressure: "", is_empty: false };
}

export default function InputPage() {
  const [points, setPoints] = useState<PointRow[]>([]);
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filterDate, setFilterDate] = useState(nowWIB().date);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPoint, setNewPoint] = useState("");
  const [loading, setLoading] = useState(true);

  const loadPoints = useCallback(async () => {
    const res = await fetch("/api/points");
    const data = await res.json();
    if (data.ok) setPoints(data.points);
    else setMsg({ kind: "err", text: data.error || "Gagal memuat titik ukur." });
  }, []);

  const loadRows = useCallback(async (date: string) => {
    const res = await fetch(`/api/measurements?date=${date}`);
    const data = await res.json();
    if (data.ok) setRows(data.measurements);
    else setMsg({ kind: "err", text: data.error || "Gagal memuat data." });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadPoints();
      await loadRows(filterDate);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRows(filterDate);
  }, [filterDate, loadRows]);

  function setNow() {
    const wib = nowWIB();
    setForm((f) => ({ ...f, date: wib.date, time: wib.time }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const debit = form.is_empty ? null : parseIDNumber(form.debit);
    const pressure = form.is_empty ? null : parseIDNumber(form.pressure);
    if (!form.point_id) return setMsg({ kind: "err", text: "Pilih titik ukur dulu." });
    if (!form.is_empty && debit === null && pressure === null) {
      return setMsg({ kind: "err", text: "Isi debit atau tekanan (boleh pakai koma, contoh 6,55) — atau tandai Kosong." });
    }
    setBusy(true);
    try {
      const payload = {
        id: form.id,
        point_id: Number(form.point_id),
        date: form.date,
        time: form.time,
        debit_lps: debit,
        pressure_bar: pressure,
        is_empty: form.is_empty,
      };
      const res = await fetch("/api/measurements", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Gagal menyimpan.");
      setMsg({ kind: "ok", text: form.id ? "Pengukuran diperbarui." : "Pengukuran tersimpan." });
      setForm((f) => ({ ...emptyForm(), point_id: f.point_id }));
      setFilterDate(form.date);
      await loadRows(form.date);
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan." });
    } finally {
      setBusy(false);
    }
  }

  function editRow(r: MeasurementRow) {
    setForm({
      id: r.id,
      point_id: String(r.point_id),
      date: r.date,
      time: r.time.slice(0, 5),
      debit: r.debit_lps === null ? "" : String(r.debit_lps).replace(".", ","),
      pressure: r.pressure_bar === null ? "" : String(r.pressure_bar).replace(".", ","),
      is_empty: r.is_empty,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteRow(id: number) {
    if (!confirm("Hapus pengukuran ini?")) return;
    const res = await fetch(`/api/measurements?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setMsg({ kind: "ok", text: "Pengukuran dihapus." });
      await loadRows(filterDate);
    } else {
      setMsg({ kind: "err", text: data.error || "Gagal menghapus." });
    }
  }

  async function addPoint(e: React.FormEvent) {
    e.preventDefault();
    if (!newPoint.trim()) return;
    const res = await fetch("/api/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPoint.trim() }),
    });
    const data = await res.json();
    if (data.ok) {
      setNewPoint("");
      setMsg({ kind: "ok", text: `Titik "${newPoint.trim()}" ditambahkan.` });
      await loadPoints();
    } else {
      setMsg({ kind: "err", text: data.error || "Gagal menambah titik." });
    }
  }

  async function deletePoint(id: number, name: string) {
    if (!confirm(`Hapus titik "${name}" beserta SEMUA pengukurannya?`)) return;
    const res = await fetch(`/api/points?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setMsg({ kind: "ok", text: `Titik "${name}" dihapus.` });
      await loadPoints();
      await loadRows(filterDate);
    } else {
      setMsg({ kind: "err", text: data.error || "Gagal menghapus titik." });
    }
  }

  if (loading) return <p className="muted">Memuat...</p>;

  return (
    <div>
      <h1>Input Ukur</h1>
      <p className="lead">Catat debit &amp; tekanan tiap titik. Tanggal &amp; jam terisi otomatis (WIB), bisa diubah untuk input susulan.</p>

      {msg && <div className={msg.kind === "ok" ? "success" : "error"}>{msg.text}</div>}

      <form className="card" onSubmit={submit}>
        <h3>{form.id ? "Ubah Pengukuran" : "Pengukuran Baru"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label htmlFor="date">Tanggal</label>
            <input id="date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="time">Jam (WIB)</label>
            <input id="time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={setNow} style={{ marginTop: 10 }}>
          Pakai waktu sekarang
        </button>

        <label htmlFor="point">Titik Ukur</label>
        <select id="point" value={form.point_id} onChange={(e) => setForm({ ...form, point_id: e.target.value })} required>
          <option value="">— Pilih titik —</option>
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <label htmlFor="debit">Debit (Liter/detik)</label>
        <input
          id="debit"
          type="text"
          inputMode="decimal"
          value={form.debit}
          onChange={(e) => setForm({ ...form, debit: e.target.value })}
          placeholder="contoh: 6,55"
          disabled={form.is_empty}
        />

        <label htmlFor="pressure">Tekanan (bar)</label>
        <input
          id="pressure"
          type="text"
          inputMode="decimal"
          value={form.pressure}
          onChange={(e) => setForm({ ...form, pressure: e.target.value })}
          placeholder="contoh: 1,05"
          disabled={form.is_empty}
        />
        <p className="hint">Angka boleh pakai koma (6,55) atau titik (6.55).</p>

        <div className="check-row">
          <input
            id="kosong"
            type="checkbox"
            checked={form.is_empty}
            onChange={(e) => setForm({ ...form, is_empty: e.target.checked })}
          />
          <label htmlFor="kosong">Kosong — tidak ada air / tidak ada tekanan</label>
        </div>

        <div className="btn-row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Menyimpan..." : form.id ? "Simpan Perubahan" : "Simpan Pengukuran"}
          </button>
          {form.id && (
            <button type="button" className="btn btn-secondary" onClick={() => setForm(emptyForm())}>
              Batal
            </button>
          )}
        </div>
      </form>

      <h2>Data {filterDate}</h2>
      <label htmlFor="filterDate">Tampilkan tanggal</label>
      <input id="filterDate" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
      <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 10 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Titik</th>
                <th className="num">Debit</th>
                <th className="num">Tekanan</th>
                <th>Jam</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.point_name}</b>
                    {r.is_empty && <span className="badge empty">KOSONG</span>}
                  </td>
                  <td className="num">{r.debit_lps === null ? "—" : String(r.debit_lps).replace(".", ",")}</td>
                  <td className="num">{r.pressure_bar === null ? "—" : String(r.pressure_bar).replace(".", ",")}</td>
                  <td>{r.time.slice(0, 5)}</td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: "6px 10px", minHeight: 36 }} onClick={() => editRow(r)}>
                      Ubah
                    </button>{" "}
                    <button className="btn btn-danger" style={{ padding: "6px 10px", minHeight: 36 }} onClick={() => deleteRow(r.id)}>
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Belum ada pengukuran pada tanggal ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2>Kelola Titik Ukur</h2>
      <form className="card" onSubmit={addPoint}>
        <label htmlFor="newPoint">Tambah titik baru</label>
        <input id="newPoint" type="text" value={newPoint} onChange={(e) => setNewPoint(e.target.value)} placeholder="Nama titik, contoh: Reservoir Baru" />
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-secondary" type="submit">
            Tambah Titik
          </button>
        </div>
      </form>
      <div className="card">
        {points.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
            <span>{p.name}</span>
            <button className="btn btn-danger" style={{ padding: "4px 10px", minHeight: 32, fontSize: 14 }} onClick={() => deletePoint(p.id, p.name)}>
              Hapus
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

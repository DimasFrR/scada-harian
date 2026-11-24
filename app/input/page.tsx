"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  // Loading per bagian, bukan satu gate untuk seluruh halaman: dulu halaman
  // cuma menampilkan "Memuat..." sampai titik + data selesai dimuat
  // berurutan, padahal form-nya bisa langsung tampil dan diisi.
  const [loadingPoints, setLoadingPoints] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  // Konfirmasi hapus dua-tahap (bukan confirm() bawaan browser): dialog
  // bawaan sering ditolak otomatis oleh browser otomatis dan tidak terlihat
  // jelas di HP — tombol "Hapus" berubah jadi "Yakin hapus?" dulu.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeletePointId, setConfirmDeletePointId] = useState<number | null>(null);
  // Foto bukti (1 foto per pengukuran). photoEnabled dicek ke /api/photos:
  // null = belum tahu, false = Blob belum dikonfigurasi (fitur nonaktif,
  // form tetap bisa disimpan tanpa foto), true = aktif.
  const [photoEnabled, setPhotoEnabled] = useState<boolean | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  // Tahap unggah foto yang sedang berjalan ("Mengambil lokasi GPS..." lalu
  // "Mengompres & mengunggah foto...") + nomor urut unggahan agar hasil
  // unggahan basi (foto lama yang selesai belakangan) diabaikan.
  const [photoStatus, setPhotoStatus] = useState("");
  const photoSeq = useRef(0);
  // Aksi mutasi (hapus/tambah) yang sedang berjalan — tombolnya dinonaktifkan
  // selama diproses agar tidak ada klik ganda / request dobel di sinyal lemah.
  const [mutating, setMutating] = useState(false);
  // Banner pesan digulir ke area pandang agar langsung terlihat di HP.
  const msgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (msg) msgRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msg]);

  const loadPoints = useCallback(async () => {
    setLoadingPoints(true);
    try {
      const res = await fetch("/api/points");
      const data = await res.json();
      if (data.ok) setPoints(data.points);
      else setMsg({ kind: "err", text: data.error || "Gagal memuat titik ukur." });
    } catch {
      setMsg({ kind: "err", text: "Gagal memuat titik ukur — periksa koneksi, lalu login ulang bila perlu." });
    } finally {
      setLoadingPoints(false);
    }
  }, []);

  const loadRows = useCallback(async (date: string) => {
    setLoadingRows(true);
    try {
      const res = await fetch(`/api/measurements?date=${date}`);
      const data = await res.json();
      if (data.ok) setRows(data.measurements);
      else setMsg({ kind: "err", text: data.error || "Gagal memuat data." });
    } catch {
      setMsg({ kind: "err", text: "Gagal memuat data — periksa koneksi, lalu login ulang bila perlu." });
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    // Paralel (dulu berurutan: titik dulu, baru data) — dan form langsung
    // tampil, tidak menunggu keduanya selesai. loadRows TIDAK dipanggil di
    // sini: effect [filterDate, loadRows] di bawah sudah memuat data saat
    // halaman dibuka, jadi memanggilnya dua kali hanya memboroskan kuota
    // & memperlambat muat di sinyal lemah.
    void loadPoints();
    fetch("/api/photos")
      .then((r) => r.json())
      .then((d) => setPhotoEnabled(d.enabled === true))
      .catch(() => setPhotoEnabled(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRows(filterDate);
  }, [filterDate, loadRows]);

  function setNow() {
    const wib = nowWIB();
    setForm((f) => ({ ...f, date: wib.date, time: wib.time }));
  }

  // Stempel bukti lapangan ala aplikasi Timestamp Camera: tanggal + jam
  // WIB dan koordinat GPS dibakar langsung ke foto (bukan metadata EXIF),
  // jadi buktinya kelihatan di gambarnya sendiri.
  // GPS diambil dengan akurasi tinggi; kalau ditolak / tidak tersedia /
  // timeout (~10 detik), stempel tetap jalan dengan "GPS tidak tersedia" —
  // foto & pengukuran TIDAK PERNAH gagal karena GPS.
  async function getGPS(): Promise<{ lat: number; lon: number } | null> {
    if (!("geolocation" in navigator)) return null;
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: { lat: number; lon: number } | null) => {
        if (!done) {
          done = true;
          resolve(v);
        }
      };
      const timer = setTimeout(() => finish(null), 10000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          finish({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }

  function stampDateTimeWIB(): string {
    const datePart = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
    return `${datePart} ${nowWIB().time} WIB`;
  }

  interface StampInfo {
    pointName: string;
    gps: { lat: number; lon: number } | null;
    dateTime: string;
  }

  // Bar gelap semi-transparan di bawah foto dengan 3 baris teks putih:
  // nama titik, koordinat GPS (6 desimal) atau "GPS tidak tersedia",
  // dan tanggal + jam WIB. Ukuran huruf mengikuti lebar foto; bar tidak
  // pernah menutup lebih dari ~35% tinggi foto.
  function drawStamp(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, stamp: StampInfo) {
    const lines = [
      stamp.pointName,
      stamp.gps ? `Lat ${stamp.gps.lat.toFixed(6)}, Lon ${stamp.gps.lon.toFixed(6)}` : "GPS tidak tersedia",
      stamp.dateTime,
    ];
    let fontSize = Math.max(14, Math.min(34, Math.round(canvas.width * 0.024)));
    const layout = (fs: number) => ({
      padX: Math.round(fs * 0.6),
      padY: Math.round(fs * 0.5),
      lineHeight: Math.round(fs * 1.4),
    });
    let { padX, padY, lineHeight } = layout(fontSize);
    let barH = padY * 2 + lineHeight * lines.length;
    while (barH > canvas.height * 0.35 && fontSize > 12) {
      fontSize -= 1;
      ({ padX, padY, lineHeight } = layout(fontSize));
      barH = padY * 2 + lineHeight * lines.length;
    }
    const y0 = canvas.height - barH;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, y0, canvas.width, barH);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      ctx.fillText(line, padX, y0 + padY + i * lineHeight, canvas.width - padX * 2);
    });
  }

  // Kompres foto di HP sebelum diunggah: sisi terpanjang maks 1280px,
  // JPEG kualitas 70, lalu stempel tanggal/jam WIB + GPS dibakar ke bawah
  // foto. createImageBitmap menangani orientasi EXIF (foto tegak dari
  // kamera HP tidak jadi miring); fallback ke <img> bila browser tidak
  // mendukung.
  async function compressImage(file: File, stamp: StampInfo): Promise<Blob> {
    const MAX = 1280;
    const toBlob = (canvas: HTMLCanvasElement) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Gagal mengompres foto."))),
          "image/jpeg",
          0.7,
        );
      });
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
    if (bitmap) {
      const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Gagal memproses foto.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      drawStamp(ctx, canvas, stamp);
      bitmap.close();
      return toBlob(canvas);
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("Gagal membaca foto."));
        im.src = url;
      });
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Gagal memproses foto.");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawStamp(ctx, canvas, stamp);
      return toBlob(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // boleh pilih file yang sama lagi
    if (!file) return;
    if (!form.point_id) {
      setMsg({ kind: "err", text: "Pilih titik ukur dulu sebelum mengambil foto." });
      return;
    }
    const seq = ++photoSeq.current;
    setPhotoUploading(true);
    try {
      // GPS diambil dulu (maks ~10 detik, gagal = "GPS tidak tersedia"),
      // lalu foto dikompres + distempel nama titik, koordinat, dan
      // tanggal/jam WIB saat foto diambil.
      setPhotoStatus("Mengambil lokasi GPS...");
      const gps = await getGPS();
      const pointName =
        points.find((p) => String(p.id) === form.point_id)?.name ?? "Titik ukur";
      setPhotoStatus("Mengompres & mengunggah foto...");
      const blob = await compressImage(file, {
        pointName,
        gps,
        dateTime: stampDateTimeWIB(),
      });
      const fd = new FormData();
      fd.append("file", blob, "foto.jpg");
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Gagal mengunggah foto.");
      // Abaikan hasil unggahan basi bila pengguna sudah memilih foto lain.
      if (seq === photoSeq.current) setPhotoUrl(data.url);
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Gagal mengunggah foto." });
    } finally {
      setPhotoUploading(false);
      setPhotoStatus("");
    }
  }

  function clearPhoto() {
    setPhotoUrl(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!form.point_id) return setMsg({ kind: "err", text: "Pilih titik ukur dulu." });
    // Validasi eksplisit per kolom: teks yang diketik tapi gagal di-parse
    // (misal tekanan "1..05") atau bernilai negatif ditolak dengan pesan
    // yang menyebut kolomnya — jangan diam-diam tersimpan sebagai null.
    if (!form.is_empty) {
      if (form.debit.trim() !== "") {
        const d = parseIDNumber(form.debit);
        if (d === null || d < 0)
          return setMsg({ kind: "err", text: `Debit "${form.debit}" tidak valid — periksa lagi angkanya (boleh pakai koma, contoh 6,55).` });
      }
      if (form.pressure.trim() !== "") {
        const p = parseIDNumber(form.pressure);
        if (p === null || p < 0)
          return setMsg({ kind: "err", text: `Tekanan "${form.pressure}" tidak valid — periksa lagi angkanya (boleh pakai koma, contoh 1,05).` });
      }
    }
    const debit = form.is_empty ? null : parseIDNumber(form.debit);
    const pressure = form.is_empty ? null : parseIDNumber(form.pressure);
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
        photo_url: photoUrl,
      };
      const res = await fetch("/api/measurements", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Gagal menyimpan.");
      // Titik di-reset setelah simpan (jangan dipertahankan) supaya ronde
      // ke titik berikutnya tidak mudah tersimpan di bawah nama titik lama;
      // pesan konfirmasi menyebut nama titik yang tersimpan.
      const savedPointName =
        points.find((p) => String(p.id) === form.point_id)?.name ?? "Titik ukur";
      setMsg({ kind: "ok", text: form.id ? `Pengukuran ${savedPointName} diperbarui.` : `Pengukuran ${savedPointName} tersimpan.` });
      setForm(emptyForm());
      setPhotoUrl(null);
      // Muat ulang sekali saja: kalau tanggal filter sudah sama, panggil
      // langsung; kalau beda, ganti filter dan biarkan effect yang memuat
      // (jangan keduanya, nanti double-fetch lagi).
      if (form.date === filterDate) {
        await loadRows(form.date);
      } else {
        setFilterDate(form.date);
      }
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
    setPhotoUrl(r.photo_url ?? null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteRow(id: number) {
    if (mutating) return;
    setMutating(true);
    try {
      const res = await fetch(`/api/measurements?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      setConfirmDeleteId(null);
      if (data.ok) {
        setMsg({ kind: "ok", text: "Pengukuran dihapus." });
        await loadRows(filterDate);
      } else {
        setMsg({ kind: "err", text: data.error || "Gagal menghapus." });
      }
    } catch {
      setMsg({ kind: "err", text: "Gagal menghapus — periksa koneksi." });
    } finally {
      setMutating(false);
    }
  }

  async function addPoint(e: React.FormEvent) {
    e.preventDefault();
    if (!newPoint.trim() || mutating) return;
    setMutating(true);
    try {
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
    } catch {
      setMsg({ kind: "err", text: "Gagal menambah titik — periksa koneksi." });
    } finally {
      setMutating(false);
    }
  }

  async function deletePoint(id: number, name: string) {
    if (mutating) return;
    setMutating(true);
    try {
      const res = await fetch(`/api/points?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      setConfirmDeletePointId(null);
      if (data.ok) {
        setMsg({ kind: "ok", text: `Titik "${name}" dihapus.` });
        await loadPoints();
        await loadRows(filterDate);
      } else {
        setMsg({ kind: "err", text: data.error || "Gagal menghapus titik." });
      }
    } catch {
      setMsg({ kind: "err", text: "Gagal menghapus titik — periksa koneksi." });
    } finally {
      setMutating(false);
    }
  }

  return (
    <div>
      <h1>Input Ukur</h1>
      <p className="lead">Catat debit &amp; tekanan tiap titik. Tanggal &amp; jam terisi otomatis (WIB), bisa diubah untuk input susulan.</p>

      {msg && <div ref={msgRef} role="alert" className={msg.kind === "ok" ? "success" : "error"}>{msg.text}</div>}

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
        <select
          id="point"
          value={form.point_id}
          onChange={(e) => {
            const nextPoint = e.target.value;
            // Foto distempel nama titik — kalau titik diganti setelah foto
            // diambil, foto lama ikut dihapus supaya tidak tersimpan di
            // bawah nama titik yang salah.
            if (nextPoint !== form.point_id && photoUrl) {
              setPhotoUrl(null);
              setMsg({ kind: "ok", text: "Titik diganti — foto sebelumnya dihapus, ambil foto baru untuk titik ini." });
            }
            setForm({ ...form, point_id: nextPoint });
          }}
          required
          disabled={loadingPoints}
        >
          <option value="">{loadingPoints ? "Memuat titik..." : "— Pilih titik —"}</option>
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

        <label htmlFor="photo">Foto meter / titik (opsional, maks 1 foto)</label>
        {photoEnabled === false ? (
          <p className="hint">Fitur foto belum diaktifkan — penyimpanan foto (Vercel Blob) belum diatur. Pengukuran tetap bisa disimpan tanpa foto.</p>
        ) : (
          <>
            {/* Tombol kamera ramah jempol (48px): titik harus dipilih dulu
                supaya stempel foto tidak memakai nama generik "Titik ukur". */}
            <label
              htmlFor="photo"
              className={`file-trigger${photoUploading ? " disabled" : ""}`}
              onClick={(e) => {
                if (!form.point_id) {
                  e.preventDefault();
                  setMsg({ kind: "err", text: "Pilih titik ukur dulu sebelum mengambil foto." });
                }
              }}
            >
              {photoUploading ? photoStatus || "Mengunggah foto..." : "Ambil Foto"}
            </label>
            <input
              id="photo"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPhotoChange}
              disabled={photoUploading}
              className="sr-only"
            />
            <p className="hint">Foto diambil dari kamera HP, otomatis dikompres (maks 1280px) dan diberi stempel nama titik, koordinat GPS, dan tanggal + jam (WIB) di bawah foto sebelum diunggah.</p>
            {photoUploading && <p className="muted">{photoStatus}</p>}
            {photoUrl && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <a href={photoUrl} target="_blank" rel="noreferrer">
                  <img src={photoUrl} alt="Foto pengukuran" width={96} height={96} style={{ objectFit: "cover", borderRadius: 8 }} />
                </a>
                <button type="button" className="btn btn-secondary" onClick={clearPhoto}>
                  Hapus foto
                </button>
              </div>
            )}
          </>
        )}

        <div className="btn-row">
          {/* Tombol simpan ikut nonaktif selama foto/GPS masih diunggah —
              kalau tidak, foto bisa hilang (tersimpan photo_url: null) atau
              malah menempel ke form kosong titik berikutnya. */}
          <button className="btn" type="submit" disabled={busy || photoUploading}>
            {busy ? "Menyimpan..." : photoUploading ? "Mengunggah foto..." : form.id ? "Simpan Perubahan" : "Simpan Pengukuran"}
          </button>
          {form.id && (
            <button type="button" className="btn btn-secondary" onClick={() => { setForm(emptyForm()); setPhotoUrl(null); }}>
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
                <th>Foto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Memuat data...
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.point_name}</b>
                    {r.is_empty && <span className="badge empty">KOSONG</span>}
                  </td>
                  <td className="num">{r.debit_lps === null ? "—" : String(r.debit_lps).replace(".", ",")}</td>
                  <td className="num">{r.pressure_bar === null ? "—" : String(r.pressure_bar).replace(".", ",")}</td>
                  <td>{r.time.slice(0, 5)}</td>
                  <td>
                    {r.photo_url ? (
                      <a href={r.photo_url} target="_blank" rel="noreferrer">
                        <img src={r.photo_url} alt="Foto" width={48} height={48} style={{ objectFit: "cover", borderRadius: 6, display: "block" }} />
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => editRow(r)} disabled={mutating}>
                      Ubah
                    </button>{" "}
                    {confirmDeleteId === r.id ? (
                      <>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteRow(r.id)} disabled={mutating}>
                          Yakin hapus?
                        </button>{" "}
                        <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDeleteId(null)} disabled={mutating}>
                          Batal
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDeleteId(r.id)} disabled={mutating}>
                        Hapus
                      </button>
                    )}
                  </td>
                </tr>
              )))}
              {!loadingRows && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Belum ada pengukuran pada tanggal ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kelola Titik Ukur disembunyikan di balik <details> yang tertutup
          secara default: ini aksi administratif yang jarang dipakai, dan
          tombol Hapus master titik tidak boleh terbuka langsung di layar
          input harian (rawan salah sentuh di lapangan). */}
      <details className="admin-box">
        <summary>Kelola Titik Ukur</summary>
        <form className="card" onSubmit={addPoint} style={{ marginTop: 12 }}>
          <label htmlFor="newPoint">Tambah titik baru</label>
          <input id="newPoint" type="text" value={newPoint} onChange={(e) => setNewPoint(e.target.value)} placeholder="Nama titik, contoh: Reservoir Baru" />
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-secondary" type="submit" disabled={mutating}>
              Tambah Titik
            </button>
          </div>
        </form>
        <div className="card">
          {points.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <span>{p.name}</span>
              {confirmDeletePointId === p.id ? (
                <span>
                  <button className="btn btn-danger btn-sm" onClick={() => deletePoint(p.id, p.name)} disabled={mutating}>
                    Yakin hapus?
                  </button>{" "}
                  <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDeletePointId(null)} disabled={mutating}>
                    Batal
                  </button>
                </span>
              ) : (
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmDeletePointId(p.id)} disabled={mutating}>
                  Hapus
                </button>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

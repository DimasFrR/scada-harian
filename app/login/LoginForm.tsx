"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginForm({ notConfigured }: { notConfigured: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const search = useSearchParams();
  const next = search.get("next") || "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        // Navigasi penuh (bukan router.push): cookie sesi yang baru diset
        // dijamin ikut terkirim pada request dokumen berikutnya, jadi
        // middleware langsung mengenali sesi dan tidak melempar balik ke
        // halaman login. router.push + router.refresh sebelumnya sering
        // balapan dengan cookie sehingga login pertama "nyangkut" dan
        // baru masuk di percobaan kedua.
        window.location.href = next;
      } else {
        setError(data.error || "Password salah.");
      }
    } catch {
      setError("Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card login-card">
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <img src="/logo.png" alt="Logo Tirta Sukapura" width={84} height={84} style={{ borderRadius: "50%" }} />
      </div>
      <h1>Login SCADA Harian</h1>
      <p className="lead">Perumda Air Minum Tirta Sukapura</p>
      {notConfigured ? (
        <div className="notice">
          Password login belum diatur di server (env var <b>APP_PASSWORD</b> kosong).
          Minta admin mengatur APP_PASSWORD di Vercel, lalu buka lagi halaman ini.
        </div>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan password dashboard"
            autoComplete="current-password"
            required
          />
          {error && <div className="error">{error}</div>}
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-block" type="submit" disabled={busy}>
              {busy ? "Memeriksa..." : "Masuk"}
            </button>
          </div>
          <p className="hint">
            Satu password dipakai bersama untuk semua petugas. Jangan dibagikan ke
            luar kantor.
          </p>
        </form>
      )}
    </div>
  );
}

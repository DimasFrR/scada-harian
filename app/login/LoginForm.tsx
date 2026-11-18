"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm({ notConfigured }: { notConfigured: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
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
        router.push(next);
        router.refresh();
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

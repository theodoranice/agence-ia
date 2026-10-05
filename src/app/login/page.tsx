"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Connexion impossible.");
      window.location.href = "/agents";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <div className="vhead" style={{ marginBottom: 4 }}>
          <span className="mono muted small">{process.env.NEXT_PUBLIC_BRAND || "Tech Teranga"}</span>
          <h1>Agence IA</h1>
          <p>Connecte-toi pour retrouver tes agents et tes missions.</p>
        </div>
        {error && <div className="alert err">{error}</div>}
        <label className="field" htmlFor="email">
          <span>E-mail</span>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field" htmlFor="password">
          <span>Mot de passe</span>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

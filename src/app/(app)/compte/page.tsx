"use client";
import { useEffect, useState } from "react";
import { api, usd, xof } from "@/components/api";
import Skeleton from "@/components/Skeleton";

type Me = {
  user: { name: string; email: string; role: string; company_context: string };
  budget: { spent: number; budget: number | null; remaining: number | null };
  usage: { month: string; cost_usd: string; searches: string; calls: string }[];
  usdToXof: number;
};

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [ctx, setCtx] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then((r) => {
      setMe(r);
      setName(r.user.name);
      setCtx(r.user.company_context);
    });
  }, []);

  async function save(body: Record<string, string>, ok: string) {
    setMsg(null);
    try {
      await api("/api/me", { method: "PATCH", body });
      setMsg({ kind: "ok", text: ok });
      return true;
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erreur." });
      return false;
    }
  }

  if (!me) return <Skeleton />;

  return (
    <>
      <div className="vhead">
        <h1>Compte</h1>
        <p>{me.user.email} · {me.user.role === "admin" ? "Administrateur" : "Membre"}</p>
      </div>

      {msg && <div className={`alert ${msg.kind === "err" ? "err" : "info"}`} style={{ marginBottom: 14 }}>{msg.text}</div>}

      <div className="kpis">
        <div className="kpi"><b>{usd(me.budget.spent)}</b><span>Dépensé ce mois · {xof(me.budget.spent, me.usdToXof)}</span></div>
        <div className="kpi"><b>{me.budget.budget == null ? "Illimité" : usd(me.budget.budget)}</b><span>Budget mensuel</span></div>
        <div className="kpi"><b>{me.budget.remaining == null ? "—" : usd(me.budget.remaining)}</b><span>Reste ce mois</span></div>
        <div className="kpi"><b>{me.usage.at(-1)?.searches ?? 0}</b><span>Recherches web ce mois</span></div>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        <div className="panel">
          <h2 style={{ fontSize: "1.05rem" }}>Contexte de ton entreprise</h2>
          <p className="muted small">Lu par chaque agent avant chaque mission : qui tu es, ton marché, ta monnaie, tes canaux de vente, ton ton de marque.</p>
          <textarea id="ctx" value={ctx} onChange={(e) => setCtx(e.target.value)} maxLength={4000} style={{ minHeight: 140 }} aria-label="Contexte de l'entreprise" />
          <div className="row">
            <button type="button" className="btn primary" onClick={() => save({ companyContext: ctx }, "Contexte enregistré.")}>Enregistrer le contexte</button>
          </div>
        </div>

        <div className="grid2">
          <div className="panel">
            <h2 style={{ fontSize: "1.05rem" }}>Nom affiché</h2>
            <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom affiché" />
            <div className="row">
              <button type="button" className="btn" onClick={() => save({ name }, "Nom enregistré.")}>Enregistrer</button>
            </div>
          </div>
          <div className="panel">
            <h2 style={{ fontSize: "1.05rem" }}>Mot de passe</h2>
            <input type="password" id="cur" autoComplete="current-password" placeholder="Mot de passe actuel" value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Mot de passe actuel" />
            <input type="password" id="next" autoComplete="new-password" placeholder="Nouveau (10 caractères minimum)" value={next} onChange={(e) => setNext(e.target.value)} aria-label="Nouveau mot de passe" />
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={!cur || next.length < 10}
                onClick={async () => {
                  if (await save({ currentPassword: cur, newPassword: next }, "Mot de passe modifié.")) {
                    setCur("");
                    setNext("");
                  }
                }}
              >
                Changer le mot de passe
              </button>
            </div>
          </div>
        </div>

        {me.usage.length > 0 && (
          <div className="tablebox">
            <table className="data" style={{ minWidth: 0 }}>
              <thead>
                <tr><th>Mois</th><th style={{ textAlign: "right" }}>Appels</th><th style={{ textAlign: "right" }}>Recherches web</th><th style={{ textAlign: "right" }}>Coût</th></tr>
              </thead>
              <tbody>
                {me.usage.map((u) => (
                  <tr key={u.month}>
                    <td>{u.month}</td>
                    <td className="num">{u.calls}</td>
                    <td className="num">{u.searches}</td>
                    <td className="num">{usd(u.cost_usd, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

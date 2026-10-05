"use client";
import { useEffect, useState } from "react";
import { api, usd, xof } from "@/components/api";
import Skeleton from "@/components/Skeleton";

type U = {
  id: string; email: string; name: string; role: string; monthly_budget_usd: string | null; active: boolean;
  spent_month: string; searches_month: string; missions_month: string;
};
type Data = {
  users: U[];
  totals: { cost_usd: string; searches: string; calls: string };
  byModel: { model: string; cost_usd: string; input_tokens: string; output_tokens: string }[];
  usdToXof: number;
};

export default function AdminPanel({ meId }: { meId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "member", monthlyBudgetUsd: "20", companyContext: "" });
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");

  const load = () =>
    api<Data>("/api/admin/users")
      .then((r) => {
        setData(r);
        setBudgets(Object.fromEntries(r.users.map((u) => [u.id, u.monthly_budget_usd ?? ""])));
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function patch(id: string, body: Record<string, unknown>, ok: string) {
    setError("");
    setNotice("");
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body });
      setNotice(ok);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      await api("/api/admin/users", { body: { ...form, monthlyBudgetUsd: form.monthlyBudgetUsd === "" ? null : form.monthlyBudgetUsd } });
      setNotice(`Compte créé pour ${form.email}. Transmets-lui le mot de passe provisoire : il pourra le changer dans « Compte ».`);
      setForm({ email: "", name: "", password: "", role: "member", monthlyBudgetUsd: "20", companyContext: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    }
  }

  function genPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const a = new Uint32Array(14);
    crypto.getRandomValues(a);
    return Array.from(a, (n) => chars[n % chars.length]).join("");
  }

  if (!data) return error ? <div className="alert err">{error}</div> : <Skeleton />;
  const rate = data.usdToXof;

  return (
    <>
      <div className="vhead">
        <h1>Administration</h1>
        <p>Comptes, budgets mensuels et consommation de l&apos;API. Les budgets se renouvellent le 1er de chaque mois ; laisse le champ vide pour un budget illimité.</p>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{usd(data.totals.cost_usd)}</b><span>Coût API ce mois · {xof(data.totals.cost_usd, rate)}</span></div>
        <div className="kpi"><b>{data.totals.searches}</b><span>Recherches web ce mois</span></div>
        <div className="kpi"><b>{data.totals.calls}</b><span>Appels à l&apos;API ce mois</span></div>
        <div className="kpi"><b>{data.users.filter((u) => u.active).length}</b><span>Comptes actifs</span></div>
      </div>

      {error && <div className="alert err" style={{ marginBottom: 14 }}>{error}</div>}
      {notice && <div className="alert info" style={{ marginBottom: 14 }}>{notice}</div>}

      <div className="tablebox" style={{ marginBottom: 22 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Utilisateur</th><th>Rôle</th><th style={{ textAlign: "right" }}>Missions</th><th style={{ textAlign: "right" }}>Dépensé</th>
              <th>Budget mensuel ($)</th><th>Compte</th><th />
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => {
              const spent = Number(u.spent_month);
              const b = u.monthly_budget_usd == null ? null : Number(u.monthly_budget_usd);
              const over = b != null && spent >= b;
              return (
                <tr key={u.id}>
                  <td>
                    <b>{u.name}</b>
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td>
                    <select aria-label={`Rôle de ${u.name}`} value={u.role} disabled={u.id === meId} onChange={(e) => patch(u.id, { role: e.target.value }, "Rôle modifié.")}>
                      <option value="member">Membre</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="num">{u.missions_month}</td>
                  <td className="num" style={over ? { color: "var(--err)" } : undefined}>{usd(spent)}</td>
                  <td>
                    <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <input
                        type="number" min={0} step={1} style={{ width: 90 }} aria-label={`Budget de ${u.name}`}
                        placeholder="Illimité" value={budgets[u.id] ?? ""}
                        onChange={(e) => setBudgets({ ...budgets, [u.id]: e.target.value })}
                      />
                      {(budgets[u.id] ?? "") !== (u.monthly_budget_usd ?? "") && (
                        <button type="button" className="btn sm" onClick={() => patch(u.id, { monthlyBudgetUsd: budgets[u.id] === "" ? null : budgets[u.id] }, "Budget mis à jour.")}>OK</button>
                      )}
                    </span>
                  </td>
                  <td>
                    {u.id === meId ? (
                      <span className="pill done">Toi</span>
                    ) : (
                      <button type="button" className={`btn sm ${u.active ? "" : "primary"}`} onClick={() => patch(u.id, { active: !u.active }, u.active ? "Compte désactivé." : "Compte réactivé.")}>
                        {u.active ? "Désactiver" : "Réactiver"}
                      </button>
                    )}
                  </td>
                  <td>
                    {resetFor === u.id ? (
                      <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <input type="text" style={{ width: 150 }} value={resetPw} onChange={(e) => setResetPw(e.target.value)} aria-label="Nouveau mot de passe" />
                        <button type="button" className="btn sm primary" disabled={resetPw.length < 10} onClick={() => { patch(u.id, { password: resetPw }, `Mot de passe de ${u.name} réinitialisé : ${resetPw}`); setResetFor(null); }}>OK</button>
                        <button type="button" className="btn sm ghost" onClick={() => setResetFor(null)}>×</button>
                      </span>
                    ) : (
                      <button type="button" className="btn sm ghost" onClick={() => { setResetFor(u.id); setResetPw(genPassword()); }}>Nouveau mot de passe</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid2" style={{ alignItems: "start" }}>
        <form className="panel" onSubmit={create}>
          <h2 style={{ fontSize: "1.05rem" }}>Créer un compte</h2>
          <label className="field" htmlFor="nemail"><span>E-mail</span>
            <input id="nemail" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field" htmlFor="nname"><span>Nom</span>
            <input id="nname" type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field" htmlFor="npw"><span>Mot de passe provisoire (10 caractères min.)</span>
            <span className="row" style={{ gap: 6 }}>
              <input id="npw" type="text" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ flex: 1 }} />
              <button type="button" className="btn sm" onClick={() => setForm({ ...form, password: genPassword() })}>Générer</button>
            </span>
          </label>
          <div className="row">
            <label className="field" htmlFor="nrole"><span>Rôle</span>
              <select id="nrole" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="member">Membre (client)</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="field" htmlFor="nbudget"><span>Budget mensuel ($)</span>
              <input id="nbudget" type="number" min={0} step={1} placeholder="Illimité" value={form.monthlyBudgetUsd} onChange={(e) => setForm({ ...form, monthlyBudgetUsd: e.target.value })} style={{ width: 120 }} />
            </label>
          </div>
          <label className="field" htmlFor="nctx"><span>Contexte de son entreprise (modifiable ensuite par la personne)</span>
            <textarea id="nctx" value={form.companyContext} onChange={(e) => setForm({ ...form, companyContext: e.target.value })} placeholder="Activité, marché, monnaie, canaux de vente…" />
          </label>
          <div className="row"><button type="submit" className="btn primary">Créer le compte</button></div>
        </form>

        <div className="panel">
          <h2 style={{ fontSize: "1.05rem" }}>Coût par modèle ce mois</h2>
          {data.byModel.length === 0 ? (
            <p className="muted small">Aucune consommation ce mois.</p>
          ) : (
            <table className="data" style={{ minWidth: 0 }}>
              <thead><tr><th>Modèle</th><th style={{ textAlign: "right" }}>Tokens entrée</th><th style={{ textAlign: "right" }}>Tokens sortie</th><th style={{ textAlign: "right" }}>Coût</th></tr></thead>
              <tbody>
                {data.byModel.map((m) => (
                  <tr key={m.model}>
                    <td className="mono small">{m.model}</td>
                    <td className="num">{Number(m.input_tokens).toLocaleString("fr-FR")}</td>
                    <td className="num">{Number(m.output_tokens).toLocaleString("fr-FR")}</td>
                    <td className="num">{usd(m.cost_usd, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">Coûts estimés à partir des tarifs publics ; la facture fait foi dans la Console Anthropic.</p>
        </div>
      </div>
    </>
  );
}

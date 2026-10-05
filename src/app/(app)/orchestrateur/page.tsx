"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TIERS, type Tier } from "@/lib/pricing";
import { api, RUN_STATUS, usd, when } from "@/components/api";
import Skeleton from "@/components/Skeleton";

type Run = { id: string; goal: string; summary: string; status: string; project_name: string | null; steps: string; done: string; cost_usd: string; created_at: string };
type Project = { id: string; name: string };

export default function OrchestratorPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goal, setGoal] = useState("");
  const [projectId, setProjectId] = useState("");
  const [tier, setTier] = useState<Tier>("standard");
  const [web, setWeb] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ runs: Run[] }>("/api/runs").then((r) => setRuns(r.runs)).catch((e) => setError(e.message));
    api<{ projects: Project[] }>("/api/projects").then((r) => setProjects(r.projects)).catch(() => {});
  }, []);

  async function plan() {
    if (goal.trim().length < 10 || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>("/api/runs", { body: { goal, projectId: projectId || null, tier, webSearch: web } });
      router.push(`/orchestrateur/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="vhead">
        <span className="mono muted small">Agents Orchestrator</span>
        <h1>Confie un objectif, l&apos;équipe s&apos;en charge</h1>
        <p>
          L&apos;orchestrateur découpe ton objectif en étapes et choisit un agent pour chacune. Tu relis et ajustes le plan, puis tu le lances : les
          agents travaillent l&apos;un après l&apos;autre, chacun avec les livrables des précédents. Tu peux fermer la page, le travail continue.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="row">
          <label className="field" style={{ flexDirection: "row", alignItems: "center" }} htmlFor="oproj">
            <span>Projet</span>
            <select id="oproj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Aucun en particulier</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <div className="seg" role="group" aria-label="Profondeur">
            {TIERS.map((t) => (
              <button key={t.id} type="button" title={t.hint} aria-pressed={tier === t.id} onClick={() => setTier(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <label className="check" htmlFor="oweb">
            <input id="oweb" type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} />
            Recherche web pour les agents
          </label>
        </div>
        <textarea
          id="goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Ex. : Lancer une boutique en ligne de produits capillaires naturels à Dakar en 30 jours : produits, prix en FCFA, pubs Meta, script de vente WhatsApp."
        />
        {error && <div className="alert err">{error}</div>}
        <div className="row">
          <button type="button" className="btn primary" onClick={plan} disabled={busy || goal.trim().length < 10}>
            {busy ? "L'orchestrateur prépare le plan…" : "Construire le plan"}
          </button>
          <span className="muted small">Rien n&apos;est exécuté avant ta validation.</span>
        </div>
      </div>

      <h2 style={{ fontSize: "1.15rem", marginBottom: 12 }}>Plans</h2>
      {runs === null ? (
        <Skeleton />
      ) : runs.length === 0 ? (
        <div className="empty">Aucun plan pour l&apos;instant. Décris un objectif ci-dessus pour obtenir le premier.</div>
      ) : (
        <div className="items">
          {runs.map((r) => (
            <Link key={r.id} href={`/orchestrateur/${r.id}`} className="item">
              <b>{r.goal.length > 140 ? r.goal.slice(0, 140) + "…" : r.goal}</b>
              <span className={`pill ${r.status}`}>{RUN_STATUS[r.status] ?? r.status}</span>
              <span className="sub">
                {r.done}/{r.steps} étapes{r.project_name ? ` · ${r.project_name}` : ""} · {when(r.created_at)} · {usd(r.cost_usd, 3)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

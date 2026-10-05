"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AGENT_BY_SLUG, POLES } from "@/lib/agents";
import Markdown from "@/components/Markdown";
import { api, RUN_STATUS, STEP_STATUS, usd } from "@/components/api";
import Skeleton from "@/components/Skeleton";

type Run = { id: string; goal: string; summary: string; status: string; tier: string; web_search: boolean; error: string | null; active: boolean; project: { id: string; name: string } | null; cost_usd: number };
type Step = { id: string; idx: number; agent_slug: string; mission: string; why: string; status: string; mission_id: string | null; error: string | null; mission_cost: string | null };
type Draft = { agent: string; mission: string; why: string };

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ run: Run; steps: Step[] }>(`/api/runs/${id}`);
    setRun(r.run);
    setSteps(r.steps);
    return r.run;
  }, [id]);

  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await load();
        if (!stop && (r.status === "running" || r.active)) t = setTimeout(tick, 3000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Plan introuvable.");
      }
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [load]);

  const editable = run && run.status !== "running" && run.status !== "done";

  function startEdit() {
    setDraft(steps.map((s) => ({ agent: s.agent_slug, mission: s.mission, why: s.why })));
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/runs/${id}`, { method: "PATCH", body: { steps: draft } });
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/runs/${id}/start`, { method: "POST" });
      // relance le suivi automatique
      const r = await load();
      if (r.status === "running") router.refresh();
      let t: ReturnType<typeof setTimeout>;
      const tick = async () => {
        const x = await load().catch(() => null);
        if (x && (x.status === "running" || x.active)) t = setTimeout(tick, 3000);
        else router.refresh();
      };
      t = setTimeout(tick, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    await api(`/api/runs/${id}/cancel`, { method: "POST" }).catch((e) => setError(e.message));
    await load().catch(() => {});
  }

  async function remove() {
    try {
      await api(`/api/runs/${id}`, { method: "DELETE" });
      router.push("/orchestrateur");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  }

  if (!run) return error ? <div className="alert err">{error}</div> : <Skeleton />;

  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <>
      <div className="vhead">
        <Link href="/orchestrateur" className="small">← Tous les plans</Link>
        <div className="row">
          <h1 style={{ fontSize: "1.45rem" }}>{run.goal.length > 160 ? run.goal.slice(0, 160) + "…" : run.goal}</h1>
        </div>
        <div className="meta">
          <span className={`pill ${run.status}`}>{RUN_STATUS[run.status] ?? run.status}</span>
          <span>{doneCount}/{steps.length} étapes</span>
          {run.project && <span>Projet : {run.project.name}</span>}
          <span>Recherche web : {run.web_search ? "oui" : "non"}</span>
          <span>Coût : {usd(run.cost_usd, 3)}</span>
        </div>
        {run.summary && <p>{run.summary}</p>}
      </div>

      {run.error && <div className="alert err" style={{ marginBottom: 14 }}>{run.error}</div>}
      {error && <div className="alert err" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="row" style={{ marginBottom: 16 }}>
        {editable && !draft && (
          <>
            <button type="button" className="btn primary" onClick={start} disabled={busy}>
              {run.status === "draft" ? "Lancer le plan" : "Reprendre le plan"}
            </button>
            <button type="button" className="btn" onClick={startEdit}>Modifier les étapes</button>
          </>
        )}
        {run.status === "running" && (
          <>
            <span className="muted small">Les agents travaillent. La page se met à jour toute seule ; tu peux la fermer.</span>
            <button type="button" className="btn danger" onClick={cancel}>Annuler le plan</button>
          </>
        )}
        {run.status !== "running" && !draft && (
          confirmDelete ? (
            <span className="row spacer">
              <span className="small">Supprimer ce plan ? Les missions produites restent dans « Missions ».</span>
              <button type="button" className="btn danger sm" onClick={remove}>Supprimer</button>
              <button type="button" className="btn sm" onClick={() => setConfirmDelete(false)}>Garder</button>
            </span>
          ) : (
            <button type="button" className="btn ghost spacer" onClick={() => setConfirmDelete(true)}>Supprimer le plan</button>
          )
        )}
      </div>

      {draft ? (
        <div className="steps">
          {draft.map((d, i) => (
            <div key={i} className="step">
              <span className="n">{i + 1}</span>
              <div className="stack">
                <label className="field" htmlFor={`ag${i}`}>
                  <span>Agent</span>
                  <select id={`ag${i}`} value={d.agent} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, agent: e.target.value } : x)))}>
                    {POLES.map((p) => (
                      <optgroup key={p.id} label={p.name}>
                        {p.agents.map((a) => (
                          <option key={a.slug} value={a.slug}>{a.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor={`mi${i}`}>
                  <span>Mission</span>
                  <textarea id={`mi${i}`} value={d.mission} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, mission: e.target.value } : x)))} />
                </label>
                <div className="row">
                  <button type="button" className="btn sm" disabled={i === 0} onClick={() => { const n = [...draft]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setDraft(n); }}>Monter</button>
                  <button type="button" className="btn sm" disabled={i === draft.length - 1} onClick={() => { const n = [...draft]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setDraft(n); }}>Descendre</button>
                  <button type="button" className="btn sm danger" disabled={draft.length === 1} onClick={() => setDraft(draft.filter((_, j) => j !== i))}>Retirer</button>
                </div>
              </div>
            </div>
          ))}
          <div className="row">
            <button type="button" className="btn" disabled={draft.length >= 10} onClick={() => setDraft([...draft, { agent: "project-manager-senior", mission: "", why: "" }])}>
              Ajouter une étape
            </button>
            <button type="button" className="btn primary" onClick={saveDraft} disabled={busy}>Enregistrer le plan</button>
            <button type="button" className="btn ghost" onClick={() => setDraft(null)}>Annuler les modifications</button>
          </div>
        </div>
      ) : (
        <div className="steps">
          {steps.map((s) => (
            <StepCard key={s.id} step={s} />
          ))}
        </div>
      )}
    </>
  );
}

function StepCard({ step }: { step: Step }) {
  const a = AGENT_BY_SLUG[step.agent_slug];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);

  async function toggle() {
    if (!open && text === null && step.mission_id) {
      const r = await api<{ messages: { role: string; text: string }[] }>(`/api/missions/${step.mission_id}`).catch(() => null);
      const last = r?.messages.filter((m) => m.role === "assistant").pop();
      setText(last?.text ?? "Pas encore de livrable.");
    }
    setOpen(!open);
  }

  return (
    <div className="step">
      <span className="n">{step.idx + 1}</span>
      <div className="stack" style={{ gap: 6 }}>
        <h3>
          <span className="dot" style={{ ["--c" as string]: a?.pole.color }} />
          {a?.name ?? step.agent_slug}
          <span className={`pill ${step.status}`}>{STEP_STATUS[step.status] ?? step.status}</span>
          {step.mission_cost && Number(step.mission_cost) > 0 && <span className="muted small">{usd(step.mission_cost, 3)}</span>}
        </h3>
        <p>{step.mission}</p>
        {step.why && <p className="why">{step.why}</p>}
        {step.error && <p className="small" style={{ color: "var(--err)" }}>{step.error}</p>}
        {step.mission_id && (
          <div className="row">
            {step.status === "done" && (
              <button type="button" className="btn sm" onClick={toggle}>{open ? "Masquer le livrable" : "Voir le livrable"}</button>
            )}
            <Link className="btn sm" href={`/agents?mission=${step.mission_id}`}>Ouvrir la mission</Link>
          </div>
        )}
        {open && text !== null && (
          <div className="deliverable">
            <Markdown text={text} />
          </div>
        )}
      </div>
    </div>
  );
}

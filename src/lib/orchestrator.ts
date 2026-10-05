import "server-only";
import { one, q, tx } from "./db";
import { AGENTS, AGENT_BY_SLUG } from "./agents";
import { askJson, friendlyApiError } from "./claude";
import { costUsd, modelFor, type Tier } from "./pricing";
import { planPrompt } from "./prompt";
import { createMission, executeMission, recordUsage } from "./missions";
import { budgetState } from "./quota";
import type { User } from "./auth";

export type RunRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  goal: string;
  summary: string;
  status: "draft" | "running" | "done" | "failed" | "cancelled";
  tier: Tier;
  web_search: boolean;
  error: string | null;
  created_at: string;
  updated_at: string;
};
export type StepRow = {
  id: string;
  run_id: string;
  idx: number;
  agent_slug: string;
  mission: string;
  why: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  mission_id: string | null;
  error: string | null;
};

type Plan = { resume?: string; etapes?: { agent?: string; mission?: string; pourquoi?: string }[] };

/** Demande un plan à l'orchestrateur et l'enregistre en brouillon. */
export async function createPlan(opts: {
  user: User;
  goal: string;
  projectId: string | null;
  tier: Tier;
  webSearch: boolean;
}): Promise<string> {
  const project = opts.projectId
    ? await one<{ name: string; description: string }>("SELECT name, description FROM projects WHERE id=$1 AND user_id=$2", [opts.projectId, opts.user.id])
    : null;
  const model = modelFor(opts.tier === "rapide" ? "standard" : opts.tier);
  const roster = AGENTS.filter((a) => a.slug !== "agents-orchestrator");
  const { data, usage } = await askJson<Plan>({
    model,
    prompt: planPrompt({ goal: opts.goal, roster, companyContext: opts.user.company_context, project }),
  });
  const steps = (data.etapes ?? [])
    .filter((s) => s && typeof s.agent === "string" && AGENT_BY_SLUG[s.agent] && typeof s.mission === "string" && s.mission.trim())
    .slice(0, 8);
  if (!steps.length) throw new Error("Le plan reçu ne contient aucune étape exploitable. Reformule l'objectif.");

  const runId = await tx(async (c) => {
    const r = await c.query<{ id: string }>(
      "INSERT INTO runs (user_id, project_id, goal, summary, tier, web_search) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [opts.user.id, opts.projectId, opts.goal, String(data.resume ?? ""), opts.tier, opts.webSearch],
    );
    const id = r.rows[0].id;
    for (const [i, s] of steps.entries()) {
      await c.query("INSERT INTO run_steps (run_id, idx, agent_slug, mission, why) VALUES ($1,$2,$3,$4,$5)", [
        id, i, s.agent, s.mission!.trim(), String(s.pourquoi ?? ""),
      ]);
    }
    return id;
  });
  await recordUsage({ userId: opts.user.id, runId, kind: "plan", model, usage, cost: costUsd(model, usage) });
  return runId;
}

// Exécutions actives dans ce processus
const active = new Map<string, { cancelled: boolean }>();

export function cancelRun(runId: string) {
  const a = active.get(runId);
  if (a) a.cancelled = true;
}

const MAX_CONTEXT_PER_STEP = Number(process.env.MAX_CONTEXT_PER_STEP || 14000);

/** Exécute les étapes une par une, chacune recevant les livrables des précédentes. */
export async function executeRun(runId: string) {
  if (active.has(runId)) return;
  const flag = { cancelled: false };
  active.set(runId, flag);
  try {
    const run = await one<RunRow>("SELECT * FROM runs WHERE id=$1", [runId]);
    if (!run) return;
    const user = await one<User>("SELECT id, email, name, role, monthly_budget_usd, active, company_context FROM users WHERE id=$1", [run.user_id]);
    if (!user) return;
    await q("UPDATE runs SET status='running', error=NULL, updated_at=now() WHERE id=$1", [runId]);

    const steps = await q<StepRow>("SELECT * FROM run_steps WHERE run_id=$1 ORDER BY idx", [runId]);
    const deliverables: { agent: string; text: string }[] = [];

    for (const step of steps) {
      if (step.status === "done" && step.mission_id) {
        // Reprise : on réutilise le livrable déjà produit
        const last = await one<{ text: string }>("SELECT text FROM messages WHERE mission_id=$1 AND role='assistant' ORDER BY id DESC LIMIT 1", [step.mission_id]);
        if (last) deliverables.push({ agent: AGENT_BY_SLUG[step.agent_slug]?.name ?? step.agent_slug, text: last.text });
        continue;
      }
      if (step.status === "skipped") continue;
      if (flag.cancelled) {
        await q("UPDATE runs SET status='cancelled', updated_at=now() WHERE id=$1", [runId]);
        return;
      }
      const { budget, spent } = await budgetState(user);
      if (budget != null && spent >= budget) {
        await q("UPDATE run_steps SET status='failed', error=$2 WHERE id=$1", [step.id, "Budget mensuel atteint."]);
        await q("UPDATE runs SET status='failed', error=$2, updated_at=now() WHERE id=$1", [runId, "Budget mensuel atteint avant la fin du plan."]);
        return;
      }

      await q("UPDATE run_steps SET status='running', error=NULL WHERE id=$1", [step.id]);
      const mission = await createMission({
        userId: user.id,
        agentSlug: step.agent_slug,
        projectId: run.project_id,
        title: `${step.idx + 1}. ${step.mission.split("\n")[0]}`,
        tier: run.tier,
        webSearch: run.web_search,
        runId,
        stepIndex: step.idx,
      });
      await q("UPDATE run_steps SET mission_id=$2 WHERE id=$1", [step.id, mission.id]);

      const context = deliverables.length
        ? "\n\n<livrables_precedents>\n" +
          deliverables.map((d, i) => `## Étape ${i + 1} · ${d.agent}\n${d.text.slice(0, MAX_CONTEXT_PER_STEP)}`).join("\n\n") +
          "\n</livrables_precedents>\nAppuie-toi sur ces livrables, sans les répéter."
        : "";
      const userText = `Objectif global du projet : ${run.goal}\n\nTa mission (étape ${step.idx + 1} sur ${steps.length}) :\n${step.mission}${context}`;

      try {
        const res = await executeMission({ user, mission, userText });
        deliverables.push({ agent: AGENT_BY_SLUG[step.agent_slug]?.name ?? step.agent_slug, text: res.text });
        await q("UPDATE run_steps SET status='done' WHERE id=$1", [step.id]);
        await q("UPDATE runs SET updated_at=now() WHERE id=$1", [runId]);
      } catch (e) {
        const msg = friendlyApiError(e);
        await q("UPDATE run_steps SET status='failed', error=$2 WHERE id=$1", [step.id, msg]);
        await q("UPDATE runs SET status=$2, error=$3, updated_at=now() WHERE id=$1", [runId, flag.cancelled ? "cancelled" : "failed", msg]);
        return;
      }
    }
    await q("UPDATE runs SET status='done', updated_at=now() WHERE id=$1", [runId]);
  } catch (e) {
    console.error("executeRun", e);
    await q("UPDATE runs SET status='failed', error=$2, updated_at=now() WHERE id=$1", [runId, "Erreur interne pendant l'exécution."]).catch(() => {});
  } finally {
    active.delete(runId);
  }
}

export function isRunActive(runId: string) {
  return active.has(runId);
}

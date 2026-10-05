import { handle, HttpError, requireUser } from "@/lib/auth";
import { body, isUuid, type Ctx } from "@/lib/http";
import { one, q, tx } from "@/lib/db";
import { AGENT_BY_SLUG } from "@/lib/agents";
import { isRunActive, type RunRow } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownedRun(id: string, userId: string) {
  if (!isUuid(id)) return null;
  return one<RunRow>("SELECT * FROM runs WHERE id=$1 AND user_id=$2", [id, userId]);
}

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const run = await ownedRun(id, user.id);
  if (!run) throw new HttpError(404, "Plan introuvable.");
  const steps = await q(
    `SELECT s.*, m.status AS mission_status, m.cost_usd AS mission_cost
       FROM run_steps s LEFT JOIN missions m ON m.id = s.mission_id
      WHERE s.run_id=$1 ORDER BY s.idx`,
    [id],
  );
  const project = run.project_id ? await one("SELECT id, name FROM projects WHERE id=$1", [run.project_id]) : null;
  const cost = await one<{ c: string }>("SELECT COALESCE(SUM(cost_usd),0) AS c FROM usage WHERE run_id=$1", [id]);
  return Response.json({ run: { ...run, active: isRunActive(id), project, cost_usd: Number(cost?.c ?? 0) }, steps });
});

/** Modifie les étapes d'un plan qui n'est pas en cours d'exécution. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const run = await ownedRun(id, user.id);
  if (!run) throw new HttpError(404, "Plan introuvable.");
  if (run.status === "running") throw new HttpError(409, "Le plan est en cours d'exécution.");
  const b = await body<{ steps?: { agent?: unknown; mission?: unknown; why?: unknown }[] }>(req);
  if (!Array.isArray(b.steps) || b.steps.length < 1 || b.steps.length > 10) throw new HttpError(400, "Entre 1 et 10 étapes.");
  const steps = b.steps.map((s, i) => {
    const agent = String(s.agent ?? "");
    const mission = String(s.mission ?? "").trim();
    if (!AGENT_BY_SLUG[agent]) throw new HttpError(400, `Étape ${i + 1} : agent inconnu.`);
    if (mission.length < 5) throw new HttpError(400, `Étape ${i + 1} : mission trop courte.`);
    return { agent, mission: mission.slice(0, 6000), why: String(s.why ?? "").slice(0, 500) };
  });
  await tx(async (c) => {
    await c.query("DELETE FROM run_steps WHERE run_id=$1", [id]);
    for (const [i, s] of steps.entries()) {
      await c.query("INSERT INTO run_steps (run_id, idx, agent_slug, mission, why) VALUES ($1,$2,$3,$4,$5)", [id, i, s.agent, s.mission, s.why]);
    }
    await c.query("UPDATE runs SET status='draft', error=NULL, updated_at=now() WHERE id=$1", [id]);
  });
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const run = await ownedRun(id, user.id);
  if (!run) throw new HttpError(404, "Plan introuvable.");
  if (run.status === "running") throw new HttpError(409, "Annule le plan avant de le supprimer.");
  await q("DELETE FROM runs WHERE id=$1", [id]);
  return Response.json({ ok: true });
});

import { handle, HttpError, requireUser } from "@/lib/auth";
import { body, str, uuidOrNull } from "@/lib/http";
import { one, q } from "@/lib/db";
import { isTier } from "@/lib/pricing";
import { assertBudget } from "@/lib/quota";
import { createPlan } from "@/lib/orchestrator";
import { friendlyApiError } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = handle(async () => {
  const user = await requireUser();
  const runs = await q(
    `SELECT r.id, r.goal, r.summary, r.status, r.tier, r.web_search, r.error, r.created_at, r.updated_at, p.name AS project_name,
            (SELECT count(*) FROM run_steps s WHERE s.run_id=r.id) AS steps,
            (SELECT count(*) FROM run_steps s WHERE s.run_id=r.id AND s.status='done') AS done,
            (SELECT COALESCE(SUM(cost_usd),0) FROM usage u WHERE u.run_id=r.id) AS cost_usd
       FROM runs r LEFT JOIN projects p ON p.id=r.project_id
      WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 100`,
    [user.id],
  );
  return Response.json({ runs });
});

/** Demande un plan à l'orchestrateur (brouillon à valider avant exécution). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await body(req);
  const goal = str(b.goal, "Objectif", { min: 10, max: 8000 });
  const projectId = uuidOrNull(b.projectId);
  if (projectId && !(await one("SELECT 1 FROM projects WHERE id=$1 AND user_id=$2", [projectId, user.id]))) {
    throw new HttpError(404, "Projet introuvable.");
  }
  await assertBudget(user);
  try {
    const id = await createPlan({ user, goal, projectId, tier: isTier(b.tier) ? b.tier : "standard", webSearch: b.webSearch !== false });
    return Response.json({ id });
  } catch (e) {
    throw new HttpError(502, friendlyApiError(e));
  }
});

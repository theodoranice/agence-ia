import { handle, HttpError, requireUser } from "@/lib/auth";
import { isUuid, type Ctx } from "@/lib/http";
import { one, q } from "@/lib/db";
import { assertBudget } from "@/lib/quota";
import { executeRun, isRunActive } from "@/lib/orchestrator";

export const runtime = "nodejs";

/** Lance (ou relance) l'exécution d'un plan. Le travail continue côté serveur. */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Plan introuvable.");
  const run = await one<{ status: string }>("SELECT status FROM runs WHERE id=$1 AND user_id=$2", [id, user.id]);
  if (!run) throw new HttpError(404, "Plan introuvable.");
  if (run.status === "running" || isRunActive(id)) throw new HttpError(409, "Le plan est déjà en cours.");
  if (run.status === "done") throw new HttpError(409, "Ce plan est déjà terminé.");
  await assertBudget(user);
  // Reprise après échec : les étapes en échec repartent de zéro
  await q("UPDATE run_steps SET status='pending', error=NULL, mission_id=NULL WHERE run_id=$1 AND status IN ('failed','running')", [id]);
  await q("UPDATE runs SET status='running', error=NULL, updated_at=now() WHERE id=$1", [id]);
  void executeRun(id);
  return Response.json({ ok: true });
});

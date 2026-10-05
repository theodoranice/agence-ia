import { handle, HttpError, requireUser } from "@/lib/auth";
import { isUuid, type Ctx } from "@/lib/http";
import { one, q } from "@/lib/db";
import { cancelRun, isRunActive } from "@/lib/orchestrator";
import { stopMission } from "@/lib/missions";

export const runtime = "nodejs";

export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Plan introuvable.");
  const run = await one<{ status: string }>("SELECT status FROM runs WHERE id=$1 AND user_id=$2", [id, user.id]);
  if (!run) throw new HttpError(404, "Plan introuvable.");
  cancelRun(id);
  const step = await one<{ mission_id: string | null }>("SELECT mission_id FROM run_steps WHERE run_id=$1 AND status='running'", [id]);
  if (step?.mission_id) stopMission(step.mission_id);
  if (!isRunActive(id)) await q("UPDATE runs SET status='cancelled', updated_at=now() WHERE id=$1 AND status IN ('running','draft')", [id]);
  return Response.json({ ok: true });
});

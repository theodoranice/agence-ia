import { handle, HttpError, requireUser } from "@/lib/auth";
import type { Ctx } from "@/lib/http";
import { getOwnedMission, stopMission } from "@/lib/missions";

export const runtime = "nodejs";

export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!(await getOwnedMission(id, user.id))) throw new HttpError(404, "Mission introuvable.");
  return Response.json({ stopped: stopMission(id) });
});

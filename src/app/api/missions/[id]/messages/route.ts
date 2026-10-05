import { handle, HttpError, requireUser } from "@/lib/auth";
import { body, str, type Ctx } from "@/lib/http";
import { assertBudget, budgetState } from "@/lib/quota";
import { executeMission, getOwnedMission, isRunning } from "@/lib/missions";
import { friendlyApiError } from "@/lib/claude";
import { sseResponse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Envoie une précision à l'agent dans une mission existante. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const mission = await getOwnedMission(id, user.id);
  if (!mission) throw new HttpError(404, "Mission introuvable.");
  if (isRunning(id)) throw new HttpError(409, "L'agent travaille déjà sur cette mission.");
  const text = str((await body(req)).text, "Message", { min: 1, max: 60000 });
  await assertBudget(user);

  return sseResponse(async (send) => {
    send("mission", { id });
    try {
      const res = await executeMission({ user, mission, userText: text, onEvent: (e) => send(e.type, e) });
      send("done", { sources: res.sources, searches: res.searches, budget: await budgetState(user) });
    } catch (e) {
      send("error", { message: friendlyApiError(e) });
    }
  });
});

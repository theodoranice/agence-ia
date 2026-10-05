import { handle, HttpError, requireUser } from "@/lib/auth";
import { body, type Ctx } from "@/lib/http";
import { q } from "@/lib/db";
import { getOwnedMission, isRunning } from "@/lib/missions";
import { getProgress } from "@/lib/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const m = await getOwnedMission(id, user.id);
  if (!m) throw new HttpError(404, "Mission introuvable.");
  const messages = await q(
    "SELECT id, role, text, sources, searches, model, cost_usd, created_at FROM messages WHERE mission_id=$1 ORDER BY id",
    [id],
  );
  return Response.json({ mission: { ...m, running: isRunning(id), progress: getProgress(id) }, messages });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const m = await getOwnedMission(id, user.id);
  if (!m) throw new HttpError(404, "Mission introuvable.");
  const b = await body(req);
  if (b.status !== undefined) {
    if (!["a_valider", "validee", "archivee"].includes(String(b.status))) throw new HttpError(400, "Statut invalide.");
    if (m.status === "en_cours") throw new HttpError(409, "La mission est en cours.");
    await q("UPDATE missions SET status=$2, updated_at=now() WHERE id=$1", [id, b.status]);
  }
  if (typeof b.title === "string" && b.title.trim()) {
    await q("UPDATE missions SET title=$2 WHERE id=$1", [id, b.title.trim().slice(0, 140)]);
  }
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const m = await getOwnedMission(id, user.id);
  if (!m) throw new HttpError(404, "Mission introuvable.");
  if (isRunning(id)) throw new HttpError(409, "Arrête la mission avant de la supprimer.");
  await q("DELETE FROM missions WHERE id=$1", [id]);
  return Response.json({ ok: true });
});

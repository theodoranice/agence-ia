import { handle, HttpError, requireUser } from "@/lib/auth";
import { body, type Ctx } from "@/lib/http";
import { q } from "@/lib/db";
import { assertBudget } from "@/lib/quota";
import { getOwnedVideo, isScripting, scriptVideo } from "@/lib/studio/service";
import { isRendering } from "@/lib/studio/render";

export const runtime = "nodejs";

/** Réécrit le storyboard, avec des consignes supplémentaires éventuelles. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const v = await getOwnedVideo(id, user.id);
  if (!v) throw new HttpError(404, "Vidéo introuvable.");
  if (isRendering(id) || isScripting(id)) throw new HttpError(409, "La vidéo est déjà en cours de traitement.");
  await assertBudget(user);
  const b = await body<{ notes?: string }>(req).catch(() => ({}) as { notes?: string });
  if (typeof b.notes === "string") {
    await q("UPDATE studio_videos SET brief = jsonb_set(brief, '{notes}', to_jsonb($2::text)) WHERE id=$1", [id, b.notes.slice(0, 3000)]);
  }
  await q("UPDATE studio_videos SET status='scripting', error=NULL, progress=$2, updated_at=now() WHERE id=$1", [
    id,
    JSON.stringify({ phase: "script", label: "Écriture du scénario", startedAt: Date.now() }),
  ]);
  void scriptVideo(id, user);
  return Response.json({ ok: true });
});

import { handle, HttpError, requireUser } from "@/lib/auth";
import type { Ctx } from "@/lib/http";
import { q } from "@/lib/db";
import { getOwnedVideo } from "@/lib/studio/service";
import { cancelRender, isRendering } from "@/lib/studio/render";

export const runtime = "nodejs";

export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const v = await getOwnedVideo(id, user.id);
  if (!v) throw new HttpError(404, "Vidéo introuvable.");
  if (isRendering(id)) cancelRender(id);
  else if (v.status === "rendering") await q("UPDATE studio_videos SET status='cancelled', error='Génération annulée.' WHERE id=$1", [id]);
  return Response.json({ ok: true });
});

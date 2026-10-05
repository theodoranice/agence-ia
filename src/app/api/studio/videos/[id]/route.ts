import { rm } from "fs/promises";
import path from "path";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { body, type Ctx } from "@/lib/http";
import { q } from "@/lib/db";
import { FORMAT_BY_ID } from "@/lib/studio/config";
import { MEDIA_DIR } from "@/lib/studio/media";
import { avatarReady, getProfile } from "@/lib/studio/profile";
import { estimateFor, getOwnedVideo, isScripting } from "@/lib/studio/service";
import { isRendering } from "@/lib/studio/render";
import { sanitize } from "@/lib/studio/storyboard";
import type { Storyboard } from "@/lib/studio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const media = (p: string | null | undefined) => (p ? `/api/studio/media/${p}` : null);

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const v = await getOwnedVideo(id, user.id);
  if (!v) throw new HttpError(404, "Vidéo introuvable.");
  const profile = await getProfile(user.id);
  const sb = v.storyboard;
  const ver = encodeURIComponent(v.updated_at);
  return Response.json({
    video: {
      ...v,
      active: isRendering(id) || isScripting(id),
      output_url: v.output_path ? `${media(v.output_path)}?v=${ver}` : null,
      thumb_url: v.thumb_path ? `${media(v.thumb_path)}?v=${ver}` : null,
      product_urls: (v.brief.product_images ?? []).map(media),
      storyboard: sb && {
        ...sb,
        scenes: sb.scenes.map((s) => ({ ...s, words: undefined, asset_url: media(s.asset), audio_url: media(s.audio) })),
      },
    },
    estimate: sb ? estimateFor(v, sb, profile?.voice_provider ?? "chatterbox") : null,
    avatarReady: avatarReady(profile),
  });
});

/** Enregistre les modifications du storyboard (texte, visuels, consignes). */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const v = await getOwnedVideo(id, user.id);
  if (!v) throw new HttpError(404, "Vidéo introuvable.");
  if (v.status === "rendering" || v.status === "scripting") throw new HttpError(409, "La vidéo est en cours de traitement.");
  const b = await body<{ storyboard?: Partial<Storyboard>; music?: boolean }>(req);
  const brief = { ...v.brief };
  if (typeof b.music === "boolean") brief.music = b.music;
  let sb = v.storyboard;
  if (b.storyboard) {
    const profile = await getProfile(user.id);
    try {
      sb = sanitize(
        { ...b.storyboard, scenes: b.storyboard.scenes },
        { format: FORMAT_BY_ID[v.format], brief: { ...brief, avatar: true, clips: FORMAT_BY_ID[v.format].maxClips }, avatarOk: avatarReady(profile), hasProduct: (brief.product_images?.length ?? 0) > 0 },
        v.storyboard,
      );
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Storyboard invalide.");
    }
  }
  const profile = await getProfile(user.id);
  const est = sb ? estimateFor({ format: v.format, brief }, sb, profile?.voice_provider ?? "chatterbox").total : 0;
  await q(
    "UPDATE studio_videos SET storyboard=$2, brief=$3, title=$4, estimate_usd=$5, status=CASE WHEN status IN ('failed','cancelled') AND $2::jsonb IS NOT NULL THEN 'ready' ELSE status END, updated_at=now() WHERE id=$1",
    [id, sb ? JSON.stringify(sb) : null, JSON.stringify(brief), sb?.title ?? v.title, est],
  );
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const v = await getOwnedVideo(id, user.id);
  if (!v) throw new HttpError(404, "Vidéo introuvable.");
  if (isRendering(id) || isScripting(id)) throw new HttpError(409, "Annule la génération avant de supprimer la vidéo.");
  await q("DELETE FROM studio_videos WHERE id=$1", [id]);
  await rm(path.join(MEDIA_DIR, "videos", id), { recursive: true, force: true });
  return Response.json({ ok: true });
});

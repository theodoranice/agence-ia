import { handle, HttpError, requireUser } from "@/lib/auth";
import type { Ctx } from "@/lib/http";
import { budgetState } from "@/lib/quota";
import { getSetting } from "@/lib/secrets";
import { avatarReady, getProfile } from "@/lib/studio/profile";
import { estimateFor, getOwnedVideo, isScripting } from "@/lib/studio/service";
import { isRendering, renderVideo } from "@/lib/studio/render";
import { ffmpegCheck } from "@/lib/studio/media";
import { q } from "@/lib/db";

export const runtime = "nodejs";

/** Lance la génération de la vidéo. Le travail continue côté serveur. */
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const v = await getOwnedVideo(id, user.id);
  if (!v) throw new HttpError(404, "Vidéo introuvable.");
  if (!v.storyboard) throw new HttpError(409, "Le storyboard n'est pas encore prêt.");
  if (isRendering(id) || isScripting(id) || v.status === "rendering") throw new HttpError(409, "La vidéo est déjà en cours de génération.");

  const profile = await getProfile(user.id);
  const sb = v.storyboard;
  if (sb.scenes.some((s) => s.visual === "avatar") && !avatarReady(profile)) {
    throw new HttpError(400, "Le storyboard utilise ton avatar : ajoute ta photo et ton consentement dans Studio > Mon avatar, ou change ces scènes.");
  }
  const usesEleven = profile?.consent_at && profile.voice_provider === "elevenlabs" && profile.eleven_voice_id;
  if (!(await getSetting("fal_key"))) throw new HttpError(400, "Clé fal.ai manquante : l'administrateur doit l'ajouter dans Administration > Fournisseurs vidéo.");
  if (usesEleven && !(await getSetting("elevenlabs_key"))) throw new HttpError(400, "Clé ElevenLabs manquante pour ta voix clonée.");
  const ff = await ffmpegCheck();
  if (!ff.ok) throw new HttpError(500, `Montage impossible sur ce serveur : ffmpeg incomplet (${ff.missing.join(", ")}).`);

  const est = estimateFor(v, sb, usesEleven ? "elevenlabs" : "chatterbox").total;
  const { budget, spent } = await budgetState(user);
  if (budget != null && spent + est > budget) {
    throw new HttpError(402, `Budget insuffisant : cette vidéo coûterait environ ${est.toFixed(2)} $ et il reste ${(budget - spent).toFixed(2)} $ ce mois-ci.`);
  }
  // statut posé tout de suite pour que l'interface suive la génération dès la réponse
  await q("UPDATE studio_videos SET status='rendering', error=NULL, progress=$2, updated_at=now() WHERE id=$1", [
    id,
    JSON.stringify({ phase: "voice", label: "Préparation", startedAt: Date.now() }),
  ]);
  void renderVideo(id);
  return Response.json({ ok: true, estimate: est });
});

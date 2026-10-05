import { handle, HttpError, requireAdmin } from "@/lib/auth";
import { body } from "@/lib/http";
import { setSetting, settingStatus, type SettingKey } from "@/lib/secrets";
import { ffmpegCheck } from "@/lib/studio/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireAdmin();
  return Response.json({
    fal: await settingStatus("fal_key"),
    elevenlabs: await settingStatus("elevenlabs_key"),
    ffmpeg: await ffmpegCheck(),
  });
});

/** Enregistre ou retire une clé de fournisseur (chiffrée en base). */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ key?: string; value?: string | null }>(req);
  const k = b.key === "fal_key" || b.key === "elevenlabs_key" ? (b.key as SettingKey) : null;
  if (!k) throw new HttpError(400, "Clé inconnue.");
  const v = typeof b.value === "string" ? b.value.trim() : "";
  if (v && (v.length < 10 || v.length > 300 || /\s/.test(v))) throw new HttpError(400, "Format de clé invalide.");
  await setSetting(k, v || null);
  return Response.json({ ok: true, status: await settingStatus(k) });
});

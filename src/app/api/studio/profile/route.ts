import path from "path";
import { readFile } from "fs/promises";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { getProfile, avatarReady, voiceReady } from "@/lib/studio/profile";
import { profileDir, rel, duration, abs } from "@/lib/studio/media";
import { fileField, saveImage, saveVoice } from "@/lib/studio/uploads";
import { cloneVoice } from "@/lib/studio/eleven";
import { ProviderError } from "@/lib/studio/fal";
import { settingStatus } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = handle(async () => {
  const user = await requireUser();
  const p = await getProfile(user.id);
  const voiceSec = p?.voice_sample_path ? Math.round(await duration(abs(p.voice_sample_path)).catch(() => 0)) : 0;
  return Response.json({
    profile: p && {
      display_name: p.display_name,
      voice_provider: p.voice_provider,
      voice_language: p.voice_language,
      consent: !!p.consent_at,
      photo: p.photo_path ? `/api/studio/media/${p.photo_path}?v=${Date.parse(String(p.photo_remote_at ?? p.consent_at ?? 0)) || 0}` : null,
      voice: p.voice_sample_path ? `/api/studio/media/${p.voice_sample_path}?v=${Date.now()}` : null,
      voice_seconds: voiceSec,
      eleven_voice: !!p.eleven_voice_id,
    },
    avatarReady: avatarReady(p),
    voiceReady: voiceReady(p),
    providers: { fal: (await settingStatus("fal_key")).set, elevenlabs: (await settingStatus("elevenlabs_key")).set },
  });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Formulaire invalide.");
  });
  const consent = form.get("consent") === "true";
  const provider = form.get("voice_provider") === "elevenlabs" ? "elevenlabs" : "chatterbox";
  const language = form.get("voice_language") === "english" ? "english" : "french";
  const name = String(form.get("display_name") ?? "").trim().slice(0, 80);
  const photo = fileField(form, "photo");
  const voice = fileField(form, "voice");

  const existing = await getProfile(user.id);
  if ((photo || voice) && !consent) {
    throw new HttpError(400, "Coche la case qui confirme qu'il s'agit de ta propre image et de ta propre voix.");
  }
  await q(
    `INSERT INTO studio_profiles (user_id, display_name, voice_provider, voice_language, consent_at)
     VALUES ($1,$2,$3,$4, CASE WHEN $5 THEN now() ELSE NULL END)
     ON CONFLICT (user_id) DO UPDATE SET display_name=$2, voice_provider=$3, voice_language=$4,
       consent_at = CASE WHEN $5 THEN COALESCE(studio_profiles.consent_at, now()) ELSE NULL END, updated_at=now()`,
    [user.id, name, provider, language, consent],
  );

  const dir = await profileDir(user.id);
  if (photo) {
    const dest = path.join(dir, "photo.jpg");
    await saveImage(photo, dest, 1280);
    await q("UPDATE studio_profiles SET photo_path=$2, photo_remote_url=NULL, photo_remote_at=NULL WHERE user_id=$1", [user.id, rel(dest)]);
  }
  let sampleChanged = false;
  if (voice) {
    const dest = path.join(dir, "voix.wav");
    await saveVoice(voice, dest);
    const sec = await duration(dest);
    if (sec < 8) throw new HttpError(400, `Enregistrement trop court (${Math.round(sec)} s). Il faut au moins 10 secondes de parole.`);
    await q("UPDATE studio_profiles SET voice_sample_path=$2, voice_remote_url=NULL, voice_remote_at=NULL, eleven_voice_id=NULL WHERE user_id=$1", [user.id, rel(dest)]);
    sampleChanged = true;
  }

  // Clonage ElevenLabs : à la première bascule ou quand l'échantillon change
  const p = await getProfile(user.id);
  if (p && p.consent_at && provider === "elevenlabs" && p.voice_sample_path && (sampleChanged || !p.eleven_voice_id || existing?.voice_provider !== "elevenlabs")) {
    try {
      const id = await cloneVoice(name || "Ma voix", await readFile(abs(p.voice_sample_path)), "voix.wav", "audio/wav");
      await q("UPDATE studio_profiles SET eleven_voice_id=$2 WHERE user_id=$1", [user.id, id]);
    } catch (e) {
      throw new HttpError(502, e instanceof ProviderError ? e.message : "Clonage ElevenLabs impossible.");
    }
  }
  if (!consent) {
    // retrait du consentement : on oublie aussi les copies chez les fournisseurs
    await q("UPDATE studio_profiles SET photo_remote_url=NULL, voice_remote_url=NULL, eleven_voice_id=NULL WHERE user_id=$1", [user.id]);
  }
  return Response.json({ ok: true });
});

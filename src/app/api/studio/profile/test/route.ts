import path from "path";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { getProfile, LANG_NAME, remoteVoice, voiceReady } from "@/lib/studio/profile";
import { download, falRun, fileUrl, ProviderError } from "@/lib/studio/fal";
import { speak } from "@/lib/studio/eleven";
import { ffmpeg, profileDir, rel } from "@/lib/studio/media";
import { MODELS } from "@/lib/studio/models";
import { PRICES } from "@/lib/studio/config";
import { recordUsage } from "@/lib/missions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SAMPLE = {
  french: "Bonjour, je teste ma voix pour mes prochaines vidéos. Est-ce que ça sonne vraiment comme moi ?",
  english: "Hi, I'm testing my voice for my next videos. Does this really sound like me?",
};

/** Génère une phrase de test avec la voix clonée. */
export const POST = handle(async () => {
  const user = await requireUser();
  const p = await getProfile(user.id);
  if (!voiceReady(p) || !p) throw new HttpError(400, "Enregistre d'abord un échantillon de voix et coche la case de consentement.");
  const lang = (p.voice_language === "english" ? "english" : "french") as keyof typeof SAMPLE;
  const text = SAMPLE[lang];
  const dir = await profileDir(user.id);
  const out = path.join(dir, "test_voix.mp3");
  try {
    if (p.voice_provider === "elevenlabs" && p.eleven_voice_id) {
      await speak(p.eleven_voice_id, text, out);
    } else {
      const res = await falRun(MODELS.tts, {
        text,
        voice: await remoteVoice(p),
        custom_audio_language: LANG_NAME[lang === "english" ? "en" : "fr"],
        exaggeration: 0.5,
        temperature: 0.7,
      });
      const raw = path.join(dir, "test_voix_raw");
      await download(fileUrl(res, "audio"), raw);
      await ffmpeg(["-i", raw, "-b:a", "128k", out]);
      const cost = (text.length / 1000) * PRICES.ttsPer1kChars;
      await recordUsage({ userId: user.id, kind: "video", model: MODELS.tts, usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, web_searches: 0 }, cost });
    }
  } catch (e) {
    throw new HttpError(502, e instanceof ProviderError ? e.message : e instanceof Error ? e.message : "Test impossible.");
  }
  return Response.json({ url: `/api/studio/media/${rel(out)}?v=${Date.now()}` });
});

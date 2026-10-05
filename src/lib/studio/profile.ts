import "server-only";
import { readFile } from "fs/promises";
import { one } from "../db";
import { q } from "../db";
import { falUpload } from "./fal";
import { abs } from "./media";

export type Profile = {
  user_id: string;
  display_name: string;
  photo_path: string | null;
  photo_remote_url: string | null;
  photo_remote_at: string | null;
  voice_provider: "chatterbox" | "elevenlabs";
  voice_sample_path: string | null;
  voice_remote_url: string | null;
  voice_remote_at: string | null;
  eleven_voice_id: string | null;
  voice_language: string;
  consent_at: string | null;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  return one<Profile>("SELECT * FROM studio_profiles WHERE user_id=$1", [userId]);
}

export const avatarReady = (p: Profile | null) => !!(p?.photo_path && p.consent_at);
export const voiceReady = (p: Profile | null) =>
  !!(p?.consent_at && (p.voice_provider === "elevenlabs" ? p.eleven_voice_id : p.voice_sample_path));

const FRESH_MS = 5 * 24 * 3600_000;
const fresh = (at: string | null) => !!at && Date.now() - new Date(at).getTime() < FRESH_MS;

/** URL publique de la photo de l'avatar chez le fournisseur (renvoyée si besoin). */
export async function remotePhoto(p: Profile): Promise<string> {
  if (!p.photo_path) throw new Error("Aucune photo d'avatar enregistrée.");
  if (p.photo_remote_url && fresh(p.photo_remote_at)) return p.photo_remote_url;
  const url = await falUpload(await readFile(abs(p.photo_path)), "image/jpeg", "avatar.jpg");
  await q("UPDATE studio_profiles SET photo_remote_url=$2, photo_remote_at=now() WHERE user_id=$1", [p.user_id, url]);
  return url;
}

/** URL publique de l'échantillon de voix (clonage Chatterbox). */
export async function remoteVoice(p: Profile): Promise<string> {
  if (!p.voice_sample_path) throw new Error("Aucun échantillon de voix enregistré.");
  if (p.voice_remote_url && fresh(p.voice_remote_at)) return p.voice_remote_url;
  const url = await falUpload(await readFile(abs(p.voice_sample_path)), "audio/wav", "voix.wav");
  await q("UPDATE studio_profiles SET voice_remote_url=$2, voice_remote_at=now() WHERE user_id=$1", [p.user_id, url]);
  return url;
}

export const LANG_NAME: Record<string, string> = { fr: "french", en: "english" };

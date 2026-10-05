import "server-only";
import { writeFile } from "fs/promises";
import { getSetting } from "../secrets";
import { ELEVEN_MODEL, URLS } from "./models";
import { ProviderError } from "./fal";

async function key() {
  const k = await getSetting("elevenlabs_key");
  if (!k) throw new ProviderError("elevenlabs", "Clé ElevenLabs manquante. Ajoute-la dans Administration > Fournisseurs vidéo.");
  return k;
}

async function check(res: Response) {
  if (res.ok) return res;
  const t = (await res.text().catch(() => "")).slice(0, 300);
  if (res.status === 401) throw new ProviderError("elevenlabs", "Clé ElevenLabs refusée.");
  if (/quota|credits|limit/i.test(t)) throw new ProviderError("elevenlabs", "Quota ElevenLabs épuisé pour ce mois.");
  throw new ProviderError("elevenlabs", `ElevenLabs a refusé la requête (${res.status}) : ${t}`);
}

/** Clone une voix à partir d'un échantillon (clonage instantané). */
export async function cloneVoice(name: string, sample: Buffer, fileName: string, mime: string): Promise<string> {
  const form = new FormData();
  form.append("name", name);
  form.append("remove_background_noise", "true");
  form.append("files", new Blob([new Uint8Array(sample)], { type: mime }), fileName);
  const res = await check(await fetch(`${URLS.eleven}/v1/voices/add`, { method: "POST", headers: { "xi-api-key": await key() }, body: form }));
  const j = await res.json();
  if (!j.voice_id) throw new ProviderError("elevenlabs", "ElevenLabs n'a pas renvoyé d'identifiant de voix.");
  return String(j.voice_id);
}

export type WordTime = { word: string; start: number; end: number };

/** Synthèse vocale avec horodatage des caractères, regroupés en mots. */
export async function speak(voiceId: string, text: string, dest: string, signal?: AbortSignal): Promise<WordTime[]> {
  const res = await check(
    await fetch(`${URLS.eleven}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": await key(), "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: ELEVEN_MODEL }),
      signal,
    }),
  );
  const j = await res.json();
  await writeFile(dest, Buffer.from(String(j.audio_base64 || ""), "base64"));
  const a = j.alignment || j.normalized_alignment;
  if (!a?.characters) return [];
  const words: WordTime[] = [];
  let cur: WordTime | null = null;
  a.characters.forEach((ch: string, i: number) => {
    const s = Number(a.character_start_times_seconds[i]);
    const e = Number(a.character_end_times_seconds[i]);
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
    } else if (cur) {
      cur.word += ch;
      cur.end = e;
    } else {
      cur = { word: ch, start: s, end: e };
    }
  });
  if (cur) words.push(cur);
  return words;
}

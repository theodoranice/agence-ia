import "server-only";
import { unlink, writeFile } from "fs/promises";
import { HttpError } from "../auth";
import { ffmpeg } from "./media";

const MAX = 25 * 1024 * 1024;

function asFile(v: FormDataEntryValue | null): File | null {
  return v && typeof v === "object" && "arrayBuffer" in v && (v as File).size > 0 ? (v as File) : null;
}

export function fileField(form: FormData, name: string) {
  return asFile(form.get(name));
}
export function fileFields(form: FormData, name: string) {
  return form.getAll(name).map(asFile).filter((f): f is File => !!f);
}

/** Enregistre une image envoyée en JPEG redimensionné (côté le plus long ≤ maxSide). */
export async function saveImage(file: File, dest: string, maxSide = 1600) {
  if (file.size > MAX) throw new HttpError(413, "Image trop lourde (25 Mo maximum).");
  if (!/^image\//.test(file.type || "image/")) throw new HttpError(400, "Le fichier doit être une image.");
  const raw = `${dest}.upload`;
  await writeFile(raw, Buffer.from(await file.arrayBuffer()));
  try {
    await ffmpeg([
      "-i", raw,
      "-vf", `scale='if(gt(iw,ih),min(${maxSide},iw),-2)':'if(gt(iw,ih),-2,min(${maxSide},ih))'`,
      "-frames:v", "1", "-q:v", "2", dest,
    ]);
  } catch {
    throw new HttpError(400, "Image illisible. Envoie un JPEG ou un PNG.");
  } finally {
    await unlink(raw).catch(() => {});
  }
}

/** Enregistre un échantillon de voix en WAV mono 24 kHz, 30 secondes maximum, niveau normalisé. */
export async function saveVoice(file: File, dest: string) {
  if (file.size > MAX) throw new HttpError(413, "Fichier audio trop lourd (25 Mo maximum).");
  const raw = `${dest}.upload`;
  await writeFile(raw, Buffer.from(await file.arrayBuffer()));
  try {
    await ffmpeg([
      "-i", raw, "-t", "30",
      "-af", "silenceremove=start_periods=1:start_threshold=-45dB,highpass=f=70,loudnorm=I=-18:TP=-2",
      "-ar", "24000", "-ac", "1", dest,
    ]);
  } catch {
    throw new HttpError(400, "Audio illisible. Envoie un MP3, M4A, WAV ou l'enregistrement du navigateur.");
  } finally {
    await unlink(raw).catch(() => {});
  }
}

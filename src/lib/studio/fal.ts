import "server-only";
import { writeFile } from "fs/promises";
import { getSetting } from "../secrets";
import { URLS } from "./models";

export class ProviderError extends Error {
  constructor(public provider: string, message: string) {
    super(message);
  }
}

async function falKey() {
  const k = await getSetting("fal_key");
  if (!k) throw new ProviderError("fal", "Clé fal.ai manquante. Ajoute-la dans Administration > Fournisseurs vidéo.");
  return k;
}

async function falFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}) {
  const key = await falKey();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j).slice(0, 400);
    } catch {
      /* texte brut */
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError("fal", "Clé fal.ai refusée. Vérifie-la dans l'administration.");
    if (res.status === 402 || /balance|credit|insufficient/i.test(detail)) throw new ProviderError("fal", "Crédit fal.ai insuffisant. Recharge ton compte fal.ai.");
    throw new ProviderError("fal", `fal.ai a refusé la requête (${res.status}) : ${detail}`);
  }
  return res;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ProviderError("fal", "Génération annulée."));
    });
  });

/** Lance un modèle via la file d'attente fal.ai et attend le résultat. */
export async function falRun<T = Record<string, unknown>>(
  model: string,
  input: Record<string, unknown>,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const sub = await (await falFetch(`${URLS.falQueue}/${model}`, { method: "POST", body: JSON.stringify(input), signal: opts.signal })).json();
  const requestId = String(sub.request_id || "");
  const base = `${URLS.falQueue}/${model.split("/").slice(0, 2).join("/")}/requests/${requestId}`;
  const statusUrl: string = sub.status_url || `${base}/status`;
  const responseUrl: string = sub.response_url || base;
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
  let delay = 1500;
  for (;;) {
    if (Date.now() > deadline) throw new ProviderError("fal", `Le modèle ${model} a mis trop de temps à répondre.`);
    const st = await (await falFetch(statusUrl, { signal: opts.signal })).json();
    if (st.status === "COMPLETED") break;
    if (st.status === "FAILED" || st.status === "ERROR") throw new ProviderError("fal", `Le modèle ${model} a échoué.`);
    await sleep(delay, opts.signal);
    delay = Math.min(delay * 1.4, 6000);
  }
  return (await (await falFetch(responseUrl, { signal: opts.signal })).json()) as T;
}

/** Envoie un fichier sur le stockage fal.ai et renvoie son URL publique. */
export async function falUpload(data: Buffer, contentType: string, fileName: string): Promise<string> {
  const init = await (
    await falFetch(`${URLS.falRest}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
      method: "POST",
      body: JSON.stringify({ content_type: contentType, file_name: fileName }),
    })
  ).json();
  const put = await fetch(init.upload_url, { method: "PUT", body: new Uint8Array(data), headers: { "Content-Type": contentType } });
  if (!put.ok) throw new ProviderError("fal", `Envoi du fichier vers fal.ai impossible (${put.status}).`);
  return String(init.file_url);
}

/** Télécharge un fichier produit par un fournisseur. */
export async function download(url: string, dest: string, signal?: AbortSignal) {
  if (url.startsWith("data:")) {
    const b64 = url.slice(url.indexOf(",") + 1);
    await writeFile(dest, Buffer.from(b64, "base64"));
    return;
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new ProviderError("fal", `Téléchargement du fichier généré impossible (${res.status}).`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/** Premier fichier trouvé dans une réponse fal (image, vidéo ou audio). */
export function fileUrl(out: Record<string, any>, kind: "image" | "video" | "audio"): string {
  const pick =
    kind === "image" ? out.images?.[0]?.url ?? out.image?.url
    : kind === "video" ? out.video?.url
    : out.audio?.url ?? out.audio_file?.url ?? out.audio_url;
  if (!pick || typeof pick !== "string") throw new ProviderError("fal", `Réponse inattendue du fournisseur (pas de fichier ${kind}).`);
  return pick;
}

import "server-only";
import { spawn } from "child_process";
import { mkdir, stat } from "fs/promises";
import path from "path";

export const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), "media");
export const FONTS_DIR = process.env.FONTS_DIR || path.join(process.cwd(), "assets", "fonts");

export const rel = (abs: string) => path.relative(MEDIA_DIR, abs).split(path.sep).join("/");
export const abs = (relPath: string) => {
  const p = path.resolve(MEDIA_DIR, relPath);
  if (!p.startsWith(path.resolve(MEDIA_DIR) + path.sep)) throw new Error("Chemin de média invalide.");
  return p;
};

export async function videoDir(id: string) {
  const d = path.join(MEDIA_DIR, "videos", id);
  await mkdir(d, { recursive: true });
  return d;
}
export async function profileDir(userId: string) {
  const d = path.join(MEDIA_DIR, "profiles", userId);
  await mkdir(d, { recursive: true });
  return d;
}

export async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Lance une commande (ffmpeg, ffprobe) et renvoie sa sortie standard. */
export function run(cmd: string, args: string[], opts: { cwd?: string; signal?: AbortSignal } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => {
      err += d;
      if (err.length > 20000) err = err.slice(-10000);
    });
    const onAbort = () => p.kill("SIGKILL");
    opts.signal?.addEventListener("abort", onAbort);
    p.on("error", (e) => reject(new Error(`${cmd} introuvable ou impossible à lancer : ${e.message}`)));
    p.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) return reject(new Error("Génération annulée."));
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} a échoué : ${err.split("\n").filter(Boolean).slice(-4).join(" | ")}`));
    });
  });
}

export const ffmpeg = (args: string[], opts?: { cwd?: string; signal?: AbortSignal }) =>
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], opts);

export async function duration(file: string): Promise<number> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  const d = parseFloat(out.trim());
  return Number.isFinite(d) ? d : 0;
}

/** Vérifie que ffmpeg dispose des filtres nécessaires au montage. */
export async function ffmpegCheck() {
  try {
    const out = await run("ffmpeg", ["-hide_banner", "-filters"]);
    const need = ["subtitles", "zoompan", "sidechaincompress", "loudnorm", "tpad"];
    const missing = need.filter((f) => !new RegExp(`\\s${f}\\s`).test(out));
    return { ok: missing.length === 0, missing };
  } catch (e) {
    return { ok: false, missing: ["ffmpeg"], error: e instanceof Error ? e.message : String(e) };
  }
}

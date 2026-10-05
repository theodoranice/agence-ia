import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { abs } from "@/lib/studio/media";
import { getOwnedVideo } from "@/lib/studio/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  mp4: "video/mp4", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", wav: "audio/wav", mp3: "audio/mpeg", ass: "text/plain; charset=utf-8",
};

/** Sert les médias du Studio au propriétaire, avec prise en charge des requêtes partielles (lecture vidéo). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ path: string[] }> }) => {
  const user = await requireUser();
  const parts = (await ctx.params).path;
  if (!parts?.length || parts.some((p) => !p || p === "." || p === ".." || p.includes("\\"))) throw new HttpError(400, "Chemin invalide.");
  const [kind, owner] = parts;
  if (kind === "profiles") {
    if (owner !== user.id) throw new HttpError(404, "Fichier introuvable.");
  } else if (kind === "videos") {
    if (!(await getOwnedVideo(owner, user.id))) throw new HttpError(404, "Fichier introuvable.");
  } else throw new HttpError(404, "Fichier introuvable.");

  const file = abs(parts.join("/"));
  const st = await stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError(404, "Fichier introuvable.");
  const type = TYPES[file.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
  const url = new URL(req.url);
  const disposition: Record<string, string> = {};
  const dl = url.searchParams.get("download");
  if (dl) disposition["Content-Disposition"] = `attachment; filename="${dl.replace(/[^\w.-]+/g, "_")}"`;
  const range = req.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    const start = m[1] ? parseInt(m[1], 10) : Math.max(0, st.size - parseInt(m[2], 10));
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
      status: 206,
      headers: { "Content-Type": type, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", ...disposition },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: { "Content-Type": type, "Content-Length": String(st.size), "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", ...disposition },
  });
});

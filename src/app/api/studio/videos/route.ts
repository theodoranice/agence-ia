import path from "path";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { uuidOrNull } from "@/lib/http";
import { assertBudget } from "@/lib/quota";
import { FORMAT_BY_ID, type FormatId } from "@/lib/studio/config";
import { rel, videoDir } from "@/lib/studio/media";
import { fileFields, saveImage } from "@/lib/studio/uploads";
import { scriptVideo } from "@/lib/studio/service";
import type { Brief } from "@/lib/studio/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = handle(async () => {
  const user = await requireUser();
  const videos = await q(
    `SELECT v.id, v.format, v.title, v.status, v.progress, v.thumb_path, v.output_path, v.cost_usd, v.estimate_usd, v.created_at, v.updated_at,
            v.brief->>'topic' AS topic, p.name AS project_name
       FROM studio_videos v LEFT JOIN projects p ON p.id=v.project_id
      WHERE v.user_id=$1 ORDER BY v.updated_at DESC LIMIT 200`,
    [user.id],
  );
  return Response.json({ videos });
});

const s = (v: FormDataEntryValue | null, max = 2000) => String(v ?? "").trim().slice(0, max);

/** Crée une vidéo : enregistre le brief et les photos produit, puis écrit le storyboard en tâche de fond. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Formulaire invalide.");
  });
  const formatId = s(form.get("format")) as FormatId;
  const format = FORMAT_BY_ID[formatId];
  if (!format) throw new HttpError(400, "Format inconnu.");
  const topic = s(form.get("topic"), 4000);
  if (topic.length < 5) throw new HttpError(400, "Décris le sujet de la vidéo (5 caractères minimum).");
  const projectId = uuidOrNull(s(form.get("project_id")) || null);
  const runId = uuidOrNull(s(form.get("run_id")) || null);
  if (projectId && !(await one("SELECT 1 FROM projects WHERE id=$1 AND user_id=$2", [projectId, user.id]))) throw new HttpError(404, "Projet introuvable.");
  if (runId && !(await one("SELECT 1 FROM runs WHERE id=$1 AND user_id=$2", [runId, user.id]))) throw new HttpError(404, "Plan introuvable.");
  await assertBudget(user);

  const dur = Number(form.get("duration"));
  const brief: Brief = {
    topic,
    audience: s(form.get("audience"), 500),
    goal: s(form.get("goal"), 500),
    cta: s(form.get("cta"), 300),
    tone: s(form.get("tone"), 200),
    language: form.get("language") === "en" ? "en" : "fr",
    duration: Number.isFinite(dur) ? Math.min(format.maxSec, Math.max(format.minSec, Math.round(dur))) : format.defaultSec,
    avatar: form.get("avatar") === "true",
    clips: Math.min(format.maxClips, Math.max(0, Number(form.get("clips")) || 0)),
    music: form.get("music") !== "false",
    notes: s(form.get("notes"), 3000),
    example_urls: s(form.get("examples"), 2000).split(/\s+/).filter((u) => /^https?:\/\//.test(u)).slice(0, 5),
    product: formatId === "short_vente"
      ? { name: s(form.get("product_name"), 200), price: s(form.get("product_price"), 100), description: s(form.get("product_description"), 2000) }
      : undefined,
  };

  const v = await one<{ id: string }>(
    "INSERT INTO studio_videos (user_id, project_id, run_id, format, title, brief) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [user.id, projectId, runId, formatId, topic.slice(0, 120), JSON.stringify(brief)],
  );
  const id = v!.id;
  const images = fileFields(form, "product_images").slice(0, 3);
  if (images.length) {
    const dir = await videoDir(id);
    const paths: string[] = [];
    for (const [i, f] of images.entries()) {
      const dest = path.join(dir, `produit_source_${i}.jpg`);
      await saveImage(f, dest, 1600);
      paths.push(rel(dest));
    }
    brief.product_images = paths;
    await q("UPDATE studio_videos SET brief=$2 WHERE id=$1", [id, JSON.stringify(brief)]);
  }
  void scriptVideo(id, user);
  return Response.json({ id });
});

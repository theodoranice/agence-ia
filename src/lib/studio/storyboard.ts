import "server-only";
import { randomBytes } from "crypto";
import { one, q } from "../db";
import { askJson } from "../claude";
import { costUsd, modelFor } from "../pricing";
import { recordUsage } from "../missions";
import { DEFAULT_COMPANY_CONTEXT } from "../prompt";
import { CHARS_PER_SEC, FORMAT_BY_ID, type Format, type Visual } from "./config";
import type { Brief, Scene, Storyboard, VideoRow } from "./types";

const VISUALS: Visual[] = ["avatar", "image", "product", "clip", "text"];
export const sceneId = () => randomBytes(5).toString("hex");

function formatRules(f: Format, b: Brief, avatarOk: boolean, hasProduct: boolean) {
  const chars = Math.round(b.duration * CHARS_PER_SEC);
  const common = [
    `Durée visée : ${b.duration} secondes, soit environ ${chars} caractères de narration au total (débit ≈ ${CHARS_PER_SEC} caractères/seconde).`,
    `Plans vidéo IA (visual "clip") : ${b.clips} au maximum, réservés aux moments forts.`,
    avatarOk && b.avatar
      ? `Avatar disponible : la personne apparaît face caméra et parle (visual "avatar"). Utilise-le pour l'accroche, la conclusion et au plus une scène au milieu ; au total pas plus de 40 % de la durée. Écris la narration de ces scènes à la première personne, comme si elle parlait directement à la caméra.`
      : `Pas d'avatar : n'utilise jamais le visual "avatar".`,
    hasProduct
      ? `Des photos du produit sont fournies : utilise le visual "product" pour 2 à 4 scènes ; le champ prompt décrit alors la mise en scène autour du produit (décor, lumière, usage), sans redessiner le produit.`
      : `Aucune photo produit : n'utilise jamais le visual "product".`,
  ];
  if (f.id === "long_narration") {
    return [
      ...common,
      `Format horizontal 16:9 pour YouTube. Scènes de 6 à 12 secondes (90 à 180 caractères de narration chacune).`,
      `Structure : accroche forte dans les 15 premières secondes, développement en parties, relances régulières pour la rétention, conclusion avec appel à s'abonner.`,
      `Majorité de scènes "image" ; quelques "text" pour les titres de parties.`,
    ];
  }
  return [
    ...common,
    `Format vertical 9:16 pour TikTok, Reels et YouTube Shorts. 5 à 10 scènes de 2 à 6 secondes (30 à 90 caractères chacune).`,
    `Scène 1 = accroche de moins de 12 mots qui arrête le défilement (question, chiffre réel, affirmation surprenante, problème vécu). Pas de « Bonjour » ni de présentation.`,
    `Rythme rapide : une idée par scène, phrases courtes, langage parlé.`,
    `Dernière scène = appel à l'action clair (${b.cta || "s'abonner, commenter ou passer à l'action"}).`,
    `Champ on_screen : 2 à 6 mots percutants pour l'accroche, les points clés et l'appel à l'action ; vide ailleurs.`,
    f.id === "short_vente"
      ? `Objectif vente : problème → produit comme solution → 2 ou 3 bénéfices concrets → preuve (uniquement des faits fournis) → offre et prix → appel à l'action (commander, écrire sur WhatsApp…).`
      : `Objectif éducatif : une seule idée ou 3 astuces numérotées, concrètes et vérifiables, avec un exemple.`,
  ];
}

export async function generateStoryboard(video: VideoRow, opts: { avatarOk: boolean; companyContext: string }) {
  const f = FORMAT_BY_ID[video.format];
  const b = video.brief;
  const hasProduct = (b.product_images?.length ?? 0) > 0;

  let source = "";
  if (video.run_id) {
    const rows = await q<{ text: string; agent_slug: string }>(
      `SELECT x.text, m.agent_slug FROM run_steps s JOIN missions m ON m.id=s.mission_id
         JOIN LATERAL (SELECT text FROM messages WHERE mission_id=m.id AND role='assistant' ORDER BY id DESC LIMIT 1) x ON true
        WHERE s.run_id=$1 ORDER BY s.idx`,
      [video.run_id],
    );
    source = rows.map((r) => `### ${r.agent_slug}\n${r.text}`).join("\n\n").slice(0, 60000);
  }
  const project = video.project_id
    ? await one<{ name: string; description: string }>("SELECT name, description FROM projects WHERE id=$1", [video.project_id])
    : null;

  const lang = b.language === "en" ? "anglais" : "français";
  const prompt = `Tu es réalisateur et scénariste de vidéos pour les réseaux sociaux et YouTube. Tu écris le storyboard complet d'une vidéo, prêt à être produit automatiquement.

<contexte_entreprise>
${opts.companyContext.trim() || DEFAULT_COMPANY_CONTEXT}
</contexte_entreprise>
${project ? `<projet>\n${project.name} : ${project.description}\n</projet>` : ""}

<brief>
Format : ${f.label} (${f.aspect})
Sujet : ${b.topic}
${b.audience ? `Public : ${b.audience}\n` : ""}${b.goal ? `Objectif : ${b.goal}\n` : ""}${b.tone ? `Ton : ${b.tone}\n` : ""}${b.product?.name ? `Produit : ${b.product.name}${b.product.price ? ` — prix : ${b.product.price}` : ""}\n${b.product.description ? `Description du produit : ${b.product.description}\n` : ""}` : ""}${b.cta ? `Appel à l'action : ${b.cta}\n` : ""}${b.notes ? `Consignes : ${b.notes}\n` : ""}${b.example_urls?.length ? `Vidéos de référence pour le style (tu ne peux pas les voir ; inspire-toi seulement de ce que l'utilisateur en dit dans les consignes) : ${b.example_urls.join(", ")}\n` : ""}Langue de la narration et des textes : ${lang}
</brief>
${source ? `<source>\nScript et recherches déjà produits par l'équipe ; reste fidèle à ce contenu :\n${source}\n</source>` : ""}

Règles :
${formatRules(f, b, opts.avatarOk, hasProduct).map((r) => `- ${r}`).join("\n")}
- N'invente aucun chiffre, avis client, témoignage ou résultat : utilise seulement les faits du brief ou de la source.
- Aucune marque, personnage protégé ou personne réelle dans les visuels (sauf l'avatar de l'utilisateur).
- Pour chaque scène "image" ou "clip", le champ prompt est une description visuelle détaillée EN ANGLAIS (sujet, décor, cadrage, lumière), cohérente avec le style global. Représente fidèlement les personnes et les lieux d'Afrique de l'Ouest quand le sujet s'y prête.
- Pour "clip", ajoute motion : le mouvement en anglais (caméra et sujet), simple et réaliste.
- Pour "avatar" et "text", prompt peut être vide.
- Narration : phrases naturelles à dire à voix haute, sans emoji, sans abréviations, nombres écrits comme on les prononce si besoin.
- caption : texte de publication (2 à 3 phrases + appel à l'action) ; hashtags : 5 à 8 sans le #.
- style : direction artistique commune en anglais (ex. « cinematic warm light, shallow depth of field, realistic photo »).
- music_prompt : ambiance musicale instrumentale en anglais, sans voix.

Réponds uniquement avec un objet JSON :
{"title":"...","caption":"...","hashtags":["..."],"style":"...","music_prompt":"...","scenes":[{"narration":"...","visual":"image","prompt":"...","motion":"","on_screen":""}]}`;

  const model = modelFor("standard");
  const { data, usage } = await askJson<Partial<Storyboard>>({ model, prompt, maxTokens: f.id === "long_narration" ? 16000 : 6000 });
  await recordUsage({ userId: video.user_id, videoId: video.id, kind: "video", model, usage, cost: costUsd(model, usage) });
  await q("UPDATE studio_videos SET cost_usd = cost_usd + $2 WHERE id=$1", [video.id, costUsd(model, usage)]);
  return sanitize(data, { format: f, brief: b, avatarOk: opts.avatarOk, hasProduct });
}

/** Nettoie un storyboard (généré ou modifié à la main) et applique les limites du format. */
export function sanitize(
  data: Partial<Storyboard>,
  ctx: { format: Format; brief: Brief; avatarOk: boolean; hasProduct: boolean },
  previous?: Storyboard | null,
): Storyboard {
  const prevById = new Map((previous?.scenes ?? []).map((s) => [s.id, s]));
  let clips = 0;
  const scenes: Scene[] = (Array.isArray(data.scenes) ? data.scenes : [])
    .slice(0, ctx.format.id === "long_narration" ? 120 : 16)
    .map((raw) => {
      const r = raw as Partial<Scene>;
      let visual = (VISUALS.includes(r.visual as Visual) ? r.visual : "image") as Visual;
      if (visual === "avatar" && !(ctx.avatarOk && ctx.brief.avatar)) visual = "image";
      if (visual === "product" && !ctx.hasProduct) visual = "image";
      if (visual === "clip") {
        clips += 1;
        if (clips > ctx.brief.clips) visual = "image";
      }
      const s: Scene = {
        id: typeof r.id === "string" && /^[0-9a-f]{10}$/.test(r.id) ? r.id : sceneId(),
        narration: String(r.narration ?? "").replace(/\s+/g, " ").trim().slice(0, 600),
        visual,
        prompt: String(r.prompt ?? "").trim().slice(0, 1500),
        motion: String(r.motion ?? "").trim().slice(0, 400),
        on_screen: String(r.on_screen ?? "").trim().slice(0, 60),
      };
      // Conserver les fichiers déjà générés si rien n'a changé
      const prev = prevById.get(s.id);
      if (prev) {
        for (const k of ["audio", "audio_key", "words", "duration", "asset", "asset_key", "remote_image"] as const) {
          if (prev[k] !== undefined) (s as Record<string, unknown>)[k] = prev[k];
        }
      }
      return s;
    })
    .filter((s) => s.narration || s.visual === "text");
  if (!scenes.length) throw new Error("Le storyboard ne contient aucune scène exploitable.");
  return {
    title: String(data.title ?? "").trim().slice(0, 140) || "Vidéo sans titre",
    caption: String(data.caption ?? "").trim().slice(0, 2200),
    hashtags: (Array.isArray(data.hashtags) ? data.hashtags : []).map((h) => String(h).replace(/^#/, "").trim()).filter(Boolean).slice(0, 12),
    style: String(data.style ?? "").trim().slice(0, 400),
    music_prompt: String(data.music_prompt ?? "").trim().slice(0, 400),
    scenes,
    music: previous?.music,
    music_key: previous?.music_key,
  };
}

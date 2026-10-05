"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FORMATS, FORMAT_BY_ID, type FormatId } from "@/lib/studio/config";
import { api } from "@/components/api";

type Project = { id: string; name: string };
type Run = { id: string; goal: string; status: string; project_name: string | null };

const fmtSec = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`);

export default function NewVideoForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [format, setFormat] = useState<FormatId>((params.get("format") as FormatId) in FORMAT_BY_ID ? (params.get("format") as FormatId) : params.get("run") ? "long_narration" : "short_vente");
  const f = FORMAT_BY_ID[format];
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState("");
  const [cta, setCta] = useState("");
  const [tone, setTone] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [duration, setDuration] = useState(f.defaultSec);
  const [avatar, setAvatar] = useState(true);
  const [clips, setClips] = useState(1);
  const [music, setMusic] = useState(true);
  const [notes, setNotes] = useState("");
  const [examples, setExamples] = useState("");
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [projectId, setProjectId] = useState(params.get("project") ?? "");
  const [runId, setRunId] = useState(params.get("run") ?? "");
  const [projects, setProjects] = useState<Project[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [avatarReady, setAvatarReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ projects: Project[] }>("/api/projects").then((r) => setProjects(r.projects)).catch(() => {});
    api<{ runs: Run[] }>("/api/runs").then((r) => setRuns(r.runs.filter((x) => x.status === "done"))).catch(() => {});
    api<{ avatarReady: boolean }>("/api/studio/profile").then((r) => setAvatarReady(r.avatarReady)).catch(() => setAvatarReady(false));
  }, []);

  useEffect(() => {
    setDuration(f.defaultSec);
    setAvatar(f.avatarDefault);
    setClips(f.id === "long_narration" ? 2 : 1);
  }, [f]);

  const previews = useMemo(() => images.map((i) => URL.createObjectURL(i)), [images]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData();
    const add = (k: string, v: string | number | boolean) => fd.append(k, String(v));
    add("format", format);
    add("topic", topic);
    add("audience", audience);
    add("goal", goal);
    add("cta", cta);
    add("tone", tone);
    add("language", language);
    add("duration", duration);
    add("avatar", avatar && !!avatarReady);
    add("clips", clips);
    add("music", music);
    add("notes", notes);
    add("examples", examples);
    add("project_id", projectId);
    if (format === "long_narration") add("run_id", runId);
    if (format === "short_vente") {
      add("product_name", productName);
      add("product_price", productPrice);
      add("product_description", productDesc);
      images.forEach((i) => fd.append("product_images", i));
    }
    try {
      const res = await fetch("/api/studio/videos", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) window.location.href = "/login";
      if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
      router.push(`/studio/${j.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 20, maxWidth: 900 }}>
      <div className="vhead" style={{ marginBottom: 0 }}>
        <Link href="/studio" className="small">← Studio</Link>
        <h1>Nouvelle vidéo</h1>
        <p>Décris ce que tu veux. L&apos;IA écrit un storyboard scène par scène que tu peux corriger avant de lancer la génération (rien n&apos;est facturé avant, à part l&apos;écriture du scénario, quelques centimes).</p>
      </div>

      <div className="fmt-cards" role="radiogroup" aria-label="Format">
        {FORMATS.map((x) => (
          <button key={x.id} type="button" className="fmt" aria-pressed={format === x.id} onClick={() => setFormat(x.id)}>
            <b>{x.label}</b>
            <span>{x.hint}</span>
            <span className="mono">{x.aspect} · {fmtSec(x.minSec)} à {fmtSec(x.maxSec)}</span>
          </button>
        ))}
      </div>

      <div className="panel">
        <label className="field" htmlFor="topic">
          <span>{format === "short_vente" ? "Ce que tu vends et pourquoi on doit l'acheter" : format === "short_edu" ? "Ce que tu veux expliquer ou enseigner" : "Le sujet de la vidéo"}</span>
          <textarea id="topic" required minLength={5} value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder={format === "short_vente" ? "Ex. : Notre crème au karité bio de Kédougou, qui hydrate 24 h, idéale pour la saison sèche." : format === "short_edu" ? "Ex. : 3 erreurs qui font perdre des clients sur WhatsApp Business." : "Ex. : La légende de Mami Wata, entre Afrique de l'Ouest et Europe."} />
        </label>

        {format === "short_vente" && (
          <>
            <div className="grid2">
              <label className="field" htmlFor="pname"><span>Nom du produit</span>
                <input id="pname" type="text" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </label>
              <label className="field" htmlFor="pprice"><span>Prix et offre</span>
                <input id="pprice" type="text" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} placeholder="Ex. : 7 500 FCFA, livraison offerte à Dakar" />
              </label>
            </div>
            <label className="field" htmlFor="pdesc"><span>Caractéristiques et faits vérifiables (l&apos;IA n&apos;invente rien)</span>
              <textarea id="pdesc" value={productDesc} onChange={(e) => setProductDesc(e.target.value)} placeholder="Composition, taille, usages, garantie, avis réels de clients…" />
            </label>
            <div className="field">
              <span>Photos du produit (jusqu&apos;à 3, fond simple de préférence)</span>
              <input type="file" accept="image/*" multiple onChange={(e) => setImages(Array.from(e.target.files ?? []).slice(0, 3))} aria-label="Photos du produit" />
              {previews.length > 0 && <div className="thumbs">{previews.map((u) => <img key={u} src={u} alt="" />)}</div>}
            </div>
          </>
        )}

        <div className="grid2">
          <label className="field" htmlFor="aud"><span>Public visé</span>
            <input id="aud" type="text" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ex. : femmes 25-40 ans à Dakar, commerçants en ligne…" />
          </label>
          <label className="field" htmlFor="cta"><span>Appel à l&apos;action</span>
            <input id="cta" type="text" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex. : Écris-nous sur WhatsApp au 78…, abonne-toi…" />
          </label>
          <label className="field" htmlFor="goal"><span>Objectif</span>
            <input id="goal" type="text" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex. : générer des commandes, gagner des abonnés…" />
          </label>
          <label className="field" htmlFor="tone"><span>Ton</span>
            <input id="tone" type="text" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Ex. : énergique et drôle, calme et expert, mystérieux…" />
          </label>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ fontSize: "1.05rem" }}>Réalisation</h2>
        <div className="row" style={{ gap: 18 }}>
          <div className="seg" role="group" aria-label="Langue">
            <button type="button" aria-pressed={language === "fr"} onClick={() => setLanguage("fr")}>Français</button>
            <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>Anglais</button>
          </div>
          <label className="check" htmlFor="music"><input id="music" type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} /> Musique de fond</label>
          <label className="check" htmlFor="avatar" title={avatarReady ? "" : "Crée d'abord ton avatar"}>
            <input id="avatar" type="checkbox" checked={avatar && !!avatarReady} disabled={!avatarReady} onChange={(e) => setAvatar(e.target.checked)} /> Mon avatar face caméra
          </label>
          {avatarReady === false && <Link href="/studio/avatar" className="small">Créer mon avatar</Link>}
        </div>
        <label className="field" htmlFor="dur">
          <span>Durée visée : {fmtSec(duration)}</span>
          <input id="dur" type="range" min={f.minSec} max={f.maxSec} step={f.maxSec > 120 ? 30 : 5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </label>
        <label className="field" htmlFor="clips">
          <span>Plans vidéo IA (vrai mouvement, ~0,21 $ pièce) : {clips}</span>
          <input id="clips" type="range" min={0} max={f.maxClips} step={1} value={clips} onChange={(e) => setClips(Number(e.target.value))} />
        </label>
        <label className="field" htmlFor="ex">
          <span>Vidéos d&apos;exemple (liens TikTok ou YouTube, optionnel)</span>
          <input id="ex" type="url" value={examples} onChange={(e) => setExamples(e.target.value)} placeholder="https://www.tiktok.com/@…/video/…" />
        </label>
        <label className="field" htmlFor="notes">
          <span>Consignes de style et ce que tu aimes dans ces exemples</span>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex. : accroche choc, texte à l'écran à chaque phrase, plans serrés sur le produit, humour…" />
        </label>
        <div className="grid2">
          <label className="field" htmlFor="proj"><span>Projet</span>
            <select id="proj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Aucun en particulier</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {format === "long_narration" && (
            <label className="field" htmlFor="run"><span>Partir d&apos;un plan terminé (script, recherches)</span>
              <select id="run" value={runId} onChange={(e) => setRunId(e.target.value)}>
                <option value="">Aucun</option>
                {runs.map((r) => <option key={r.id} value={r.id}>{(r.project_name ? `${r.project_name} · ` : "") + r.goal.slice(0, 70)}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      {error && <div className="alert err">{error}</div>}
      <div className="row">
        <button type="submit" className="btn primary" disabled={busy || topic.trim().length < 5}>{busy ? "Envoi…" : "Écrire le storyboard"}</button>
        <span className="small muted">Tu pourras tout modifier avant la génération.</span>
      </div>
    </form>
  );
}

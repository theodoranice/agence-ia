"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CHARS_PER_SEC, FORMAT_BY_ID, VISUALS, type FormatId, type Visual } from "@/lib/studio/config";
import { api, usd, xof } from "@/components/api";
import Skeleton from "@/components/Skeleton";
import { statusPill, VIDEO_STATUS } from "@/components/studio";

type Scene = { id?: string; narration: string; visual: Visual; prompt: string; motion?: string; on_screen?: string; duration?: number; asset_url?: string | null; audio_url?: string | null };
type SB = { title: string; caption: string; hashtags: string[]; style: string; music_prompt: string; scenes: Scene[] };
type Video = {
  id: string; format: FormatId; title: string; status: string; error: string | null; active: boolean;
  progress: { phase?: string; label?: string; done?: number; total?: number; startedAt?: number };
  brief: { topic: string; music: boolean; product_images?: string[] };
  storyboard: SB | null; output_url: string | null; thumb_url: string | null; cost_usd: string; estimate_usd: string; product_urls: string[];
};
type Estimate = { total: number; lines: Record<string, number>; seconds: number; avatarSeconds: number };

const PHASES = [
  { id: "voice", label: "Voix" },
  { id: "visuals", label: "Visuels" },
  { id: "music", label: "Musique" },
  { id: "compose", label: "Montage" },
];

function Clock({ since }: { since?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <span className="mono small muted">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

export default function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [video, setVideo] = useState<Video | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [avatarReady, setAvatarReady] = useState(false);
  const [sb, setSb] = useState<SB | null>(null);
  const [music, setMusic] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const load = useCallback(async () => {
    const r = await api<{ video: Video; estimate: Estimate | null; avatarReady: boolean }>(`/api/studio/videos/${id}`);
    setVideo(r.video);
    setEstimate(r.estimate);
    setAvatarReady(r.avatarReady);
    if (!dirtyRef.current) {
      setSb(r.video.storyboard);
      setMusic(r.video.brief.music);
    }
    return r.video;
  }, [id]);

  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const v = await load();
        if (!stop && (v.status === "scripting" || v.status === "rendering" || v.active)) t = setTimeout(tick, 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Vidéo introuvable.");
      }
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [load, video?.status === "scripting" || video?.status === "rendering"]);

  const f = video ? FORMAT_BY_ID[video.format] : null;
  const editable = video && !["scripting", "rendering"].includes(video.status);

  function edit(i: number, patch: Partial<Scene>) {
    if (!sb) return;
    setSb({ ...sb, scenes: sb.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
    setDirty(true);
  }
  function move(i: number, dir: -1 | 1) {
    if (!sb) return;
    const n = [...sb.scenes];
    [n[i], n[i + dir]] = [n[i + dir], n[i]];
    setSb({ ...sb, scenes: n });
    setDirty(true);
  }
  function remove(i: number) {
    if (!sb || sb.scenes.length <= 1) return;
    setSb({ ...sb, scenes: sb.scenes.filter((_, j) => j !== i) });
    setDirty(true);
  }
  function addAfter(i: number) {
    if (!sb) return;
    const n = [...sb.scenes];
    n.splice(i + 1, 0, { narration: "", visual: "image", prompt: "", on_screen: "" });
    setSb({ ...sb, scenes: n });
    setDirty(true);
  }

  async function save() {
    if (!sb) return true;
    setBusy(true);
    setError("");
    try {
      await api(`/api/studio/videos/${id}`, { method: "PATCH", body: { storyboard: sb, music } });
      setDirty(false);
      dirtyRef.current = false;
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function render() {
    if (dirty && !(await save())) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/studio/videos/${id}/render`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function rewrite() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/studio/videos/${id}/script`, { method: "POST", body: { notes } });
      setDirty(false);
      dirtyRef.current = false;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    await api(`/api/studio/videos/${id}/cancel`, { method: "POST" }).catch(() => {});
    await load().catch(() => {});
  }

  async function del() {
    try {
      await api(`/api/studio/videos/${id}`, { method: "DELETE" });
      router.push("/studio");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* presse-papiers indisponible */
    }
  }

  if (!video || !f) return error ? <div className="alert err">{error}</div> : <Skeleton />;
  const aspect = f.aspect === "9:16" ? "v916" : "v169";
  const phaseIdx = PHASES.findIndex((p) => p.id === video.progress.phase);
  const pct = video.status === "rendering" ? Math.round((Math.max(0, phaseIdx) / PHASES.length + ((video.progress.done ?? 0) / Math.max(1, video.progress.total ?? 1)) / PHASES.length) * 100) : 0;
  const estSec = sb ? Math.round(sb.scenes.reduce((a, s) => a + (s.duration ?? Math.max(1.5, s.narration.length / CHARS_PER_SEC)), 0)) : 0;

  return (
    <>
      <div className="vhead">
        <Link href="/studio" className="small">← Studio</Link>
        <h1 style={{ fontSize: "1.55rem" }}>{sb?.title || video.title || video.brief.topic}</h1>
        <div className="meta">
          <span className={`pill ${statusPill(video.status)}`}>{VIDEO_STATUS[video.status] ?? video.status}</span>
          <span>{f.label} · {f.aspect}</span>
          {sb && <span>{sb.scenes.length} scènes · environ {estSec} s</span>}
          <span>Dépensé : {usd(video.cost_usd)}</span>
        </div>
      </div>

      {error && <div className="alert err" style={{ marginBottom: 14 }}>{error}</div>}
      {video.error && video.status !== "rendering" && <div className="alert err" style={{ marginBottom: 14 }}>{video.error}</div>}

      {video.status === "scripting" && (
        <div className="panel">
          <div className="activity">
            <div className="act-head">
              <span className="act-orb thinking" aria-hidden="true"><i /><i /><i /></span>
              <span className="act-title">Le réalisateur écrit ton storyboard<span className="act-dots" aria-hidden="true"><b>.</b><b>.</b><b>.</b></span></span>
              <span className="act-time"><Clock since={video.progress.startedAt} /></span>
            </div>
            <div className="act-meta small muted"><span>Accroche, scènes, textes à l&apos;écran, visuels : comptes 20 à 60 secondes.</span></div>
          </div>
        </div>
      )}

      {video.status === "rendering" && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="row">
            <h2 style={{ fontSize: "1.05rem" }}>Génération en cours</h2>
            <span className="spacer"><Clock since={video.progress.startedAt} /></span>
          </div>
          <ol className="render-phases">
            {PHASES.map((p, i) => (
              <li key={p.id} className={i < phaseIdx ? "done" : i === phaseIdx ? "now" : ""}>
                <span className="act-pip" />{p.label}
              </li>
            ))}
          </ol>
          <div className="run-bar live"><span style={{ width: `${Math.max(4, pct)}%` }} /></div>
          <div className="row small muted">
            <span>{video.progress.label || "Préparation"}</span>
            <button type="button" className="btn sm danger spacer" onClick={cancel}>Annuler</button>
          </div>
          <span className="small muted">Tu peux fermer la page : la génération continue sur le serveur. Les éléments déjà produits sont gardés si tu relances.</span>
        </div>
      )}

      {video.status === "done" && video.output_url && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="grid2" style={{ alignItems: "start" }}>
            <video className={`player ${aspect}`} src={video.output_url} poster={video.thumb_url ?? undefined} controls playsInline preload="metadata" />
            <div className="stack">
              <h2 style={{ fontSize: "1.05rem" }}>Ta vidéo est prête</h2>
              <div className="row">
                <a className="btn primary" href={`${video.output_url}&download=${encodeURIComponent((sb?.title || "video").slice(0, 60))}.mp4`}>Télécharger le MP4</a>
                {video.thumb_url && <a className="btn" href={`${video.thumb_url}&download=miniature.jpg`}>Miniature</a>}
              </div>
              {sb && (
                <>
                  <label className="field" htmlFor="cap"><span>Texte de publication</span>
                    <textarea id="cap" readOnly value={`${sb.caption}\n\n${sb.hashtags.map((h) => `#${h}`).join(" ")}`} style={{ minHeight: 140 }} />
                  </label>
                  <button type="button" className="btn sm" onClick={() => copy(`${sb.caption}\n\n${sb.hashtags.map((h) => `#${h}`).join(" ")}`)}>Copier le texte et les hashtags</button>
                </>
              )}
              <span className="small muted">Pour publier : télécharge la vidéo puis envoie-la sur TikTok, Instagram ou YouTube depuis ton téléphone. Coche « contenu généré par IA » si la plateforme le demande.</span>
            </div>
          </div>
        </div>
      )}

      {sb && editable && (
        <div className="sb-layout">
          <div className="scenes">
            {sb.scenes.map((s, i) => {
              const sec = s.duration ?? Math.max(1.5, s.narration.length / CHARS_PER_SEC);
              return (
                <div key={s.id ?? `n${i}`} className="scene">
                  <div className={`prev ${aspect}`}>
                    <span className="num">{i + 1}</span>
                    {s.asset_url && /\.mp4/.test(s.asset_url) ? <video src={s.asset_url} muted playsInline loop autoPlay /> : s.asset_url ? <img src={s.asset_url} alt="" /> : <span>{VISUALS.find((v) => v.id === s.visual)?.label}</span>}
                  </div>
                  <div className="stack" style={{ gap: 8 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <select aria-label={`Visuel de la scène ${i + 1}`} value={s.visual} onChange={(e) => edit(i, { visual: e.target.value as Visual })}>
                        {VISUALS.filter((v) => (v.id !== "avatar" || avatarReady || s.visual === "avatar") && (v.id !== "product" || video.product_urls.length || s.visual === "product")).map((v) => (
                          <option key={v.id} value={v.id}>{v.label}</option>
                        ))}
                      </select>
                      <span className="small muted">≈ {sec.toFixed(1)} s</span>
                      {s.audio_url && <audio src={s.audio_url} controls preload="none" style={{ height: 30, maxWidth: 200 }} />}
                      <span className="tools spacer">
                        <button type="button" className="btn sm ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">↑</button>
                        <button type="button" className="btn sm ghost" disabled={i === sb.scenes.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">↓</button>
                        <button type="button" className="btn sm ghost" onClick={() => addAfter(i)}>+ Scène</button>
                        <button type="button" className="btn sm ghost danger" disabled={sb.scenes.length <= 1} onClick={() => remove(i)}>Retirer</button>
                      </span>
                    </div>
                    {s.visual === "avatar" && !avatarReady && <span className="small" style={{ color: "var(--err)" }}>Avatar non configuré : <Link href="/studio/avatar">ajoute ta photo</Link> ou change le visuel.</span>}
                    <textarea aria-label={`Narration de la scène ${i + 1}`} value={s.narration} onChange={(e) => edit(i, { narration: e.target.value })} placeholder="Ce qui est dit pendant cette scène" />
                    <input type="text" aria-label={`Texte à l'écran, scène ${i + 1}`} value={s.on_screen ?? ""} onChange={(e) => edit(i, { on_screen: e.target.value })} placeholder="Texte affiché en haut (optionnel, 2 à 6 mots)" />
                    {(s.visual === "image" || s.visual === "clip" || s.visual === "product") && (
                      <details>
                        <summary>Description visuelle (en anglais, pour le générateur d&apos;images)</summary>
                        <textarea value={s.prompt} onChange={(e) => edit(i, { prompt: e.target.value })} aria-label={`Description visuelle, scène ${i + 1}`} />
                        {s.visual === "clip" && <input type="text" value={s.motion ?? ""} onChange={(e) => edit(i, { motion: e.target.value })} placeholder="Mouvement (ex. slow push in on the product)" aria-label={`Mouvement, scène ${i + 1}`} />}
                      </details>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="panel">
              <h2 style={{ fontSize: "1.05rem" }}>Publication et ambiance</h2>
              <label className="field" htmlFor="caption"><span>Texte de publication</span>
                <textarea id="caption" value={sb.caption} onChange={(e) => { setSb({ ...sb, caption: e.target.value }); setDirty(true); }} />
              </label>
              <label className="field" htmlFor="tags"><span>Hashtags (séparés par des espaces)</span>
                <input id="tags" type="text" value={sb.hashtags.map((h) => `#${h}`).join(" ")} onChange={(e) => { setSb({ ...sb, hashtags: e.target.value.split(/\s+/).map((h) => h.replace(/^#/, "")).filter(Boolean) }); setDirty(true); }} />
              </label>
              <label className="field" htmlFor="style"><span>Direction artistique des images (anglais)</span>
                <input id="style" type="text" value={sb.style} onChange={(e) => { setSb({ ...sb, style: e.target.value }); setDirty(true); }} />
              </label>
              <label className="check" htmlFor="mus"><input id="mus" type="checkbox" checked={music} onChange={(e) => { setMusic(e.target.checked); setDirty(true); }} /> Musique de fond</label>
              {music && (
                <label className="field" htmlFor="mp"><span>Ambiance musicale (anglais)</span>
                  <input id="mp" type="text" value={sb.music_prompt} onChange={(e) => { setSb({ ...sb, music_prompt: e.target.value }); setDirty(true); }} />
                </label>
              )}
            </div>
          </div>

          <aside className="sb-side">
            <div className="panel">
              <span className="small muted">Coût estimé de la génération</span>
              <span className="cost-total">{usd(estimate?.total ?? 0)}</span>
              <span className="small muted">≈ {xof(estimate?.total ?? 0)} · durée ≈ {estimate?.seconds ?? estSec} s</span>
              {estimate && (
                <div className="cost-lines">
                  {Object.entries(estimate.lines).filter(([, v]) => v > 0.0005).map(([k, v]) => (
                    <div key={k}><span>{k[0].toUpperCase() + k.slice(1)}</span><span className="mono">{usd(v, 3)}</span></div>
                  ))}
                </div>
              )}
              <span className="small muted">Les éléments déjà générés et inchangés sont réutilisés sans être refacturés.</span>
              {dirty && <span className="small" style={{ color: "var(--saffron)" }}>Modifications non enregistrées (l&apos;estimation sera mise à jour).</span>}
              <button type="button" className="btn primary" onClick={render} disabled={busy}>
                {video.status === "done" ? "Régénérer la vidéo" : "Générer la vidéo"}
              </button>
              <button type="button" className="btn" onClick={save} disabled={busy || !dirty}>Enregistrer les modifications</button>
            </div>
            <div className="panel">
              <span className="small muted">Pas satisfait du scénario ?</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex. : accroche plus choc, plus court, ton plus drôle…" aria-label="Consignes pour réécrire" style={{ minHeight: 70 }} />
              <button type="button" className="btn" onClick={rewrite} disabled={busy}>Réécrire le storyboard</button>
            </div>
            <div className="row">
              {confirmDel ? (
                <>
                  <span className="small">Supprimer définitivement ?</span>
                  <button type="button" className="btn sm danger" onClick={del}>Supprimer</button>
                  <button type="button" className="btn sm" onClick={() => setConfirmDel(false)}>Garder</button>
                </>
              ) : (
                <button type="button" className="btn sm ghost danger" onClick={() => setConfirmDel(true)}>Supprimer la vidéo</button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

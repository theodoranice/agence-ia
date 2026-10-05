"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FORMAT_BY_ID, type FormatId } from "@/lib/studio/config";
import { api, usd, when } from "@/components/api";
import Skeleton from "@/components/Skeleton";
import { statusPill, VIDEO_STATUS } from "@/components/studio";

type V = { id: string; format: FormatId; title: string; status: string; progress: { label?: string }; thumb_path: string | null; cost_usd: string; estimate_usd: string; updated_at: string; topic: string; project_name: string | null };
type ProfileRes = { profile: { display_name: string; photo: string | null; voice: string | null; consent: boolean } | null; avatarReady: boolean; voiceReady: boolean; providers: { fal: boolean; elevenlabs: boolean } };

export default function StudioPage() {
  const [videos, setVideos] = useState<V[] | null>(null);
  const [prof, setProf] = useState<ProfileRes | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await api<{ videos: V[] }>("/api/studio/videos");
        setVideos(r.videos);
        if (r.videos.some((v) => v.status === "rendering" || v.status === "scripting")) t = setTimeout(load, 4000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur.");
      }
    };
    load();
    api<ProfileRes>("/api/studio/profile").then(setProf).catch(() => {});
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <div className="studio-head">
        <div className="vhead" style={{ marginBottom: 0 }}>
          <span className="mono muted small">Studio vidéo</span>
          <h1>Tes vidéos</h1>
          <p>Shorts de vente ou éducatifs pour TikTok, Reels et YouTube, et vidéos longues narrées. Tu valides le storyboard avant de payer quoi que ce soit.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/studio/avatar">Mon avatar &amp; ma voix</Link>
          <Link className="btn primary" href="/studio/nouvelle">Nouvelle vidéo</Link>
        </div>
      </div>

      {prof && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="avatar-card">
            {prof.profile?.photo ? <img className="avatar-pic" src={prof.profile.photo} alt="Ta photo d'avatar" /> : <div className="avatar-pic" />}
            <div className="stack" style={{ gap: 4 }}>
              <b>{prof.avatarReady ? `Avatar prêt${prof.profile?.display_name ? ` : ${prof.profile.display_name}` : ""}` : "Avatar pas encore créé"}</b>
              <span className="small muted">
                {prof.voiceReady ? "Ta voix clonée est prête." : "Voix clonée pas encore enregistrée : les vidéos utiliseront une voix de synthèse standard."}
              </span>
              {!prof.providers.fal && <span className="small" style={{ color: "var(--err)" }}>Clé fal.ai manquante : l&apos;administrateur doit l&apos;ajouter dans Administration &gt; Fournisseurs vidéo.</span>}
            </div>
            <Link className="btn sm spacer" href="/studio/avatar">{prof.avatarReady ? "Modifier" : "Créer mon avatar"}</Link>
          </div>
        </div>
      )}

      {error && <div className="alert err">{error}</div>}
      {videos === null ? (
        <Skeleton />
      ) : videos.length === 0 ? (
        <div className="empty">
          Aucune vidéo pour l&apos;instant. <Link href="/studio/nouvelle">Crée ta première vidéo</Link> : tu décris le sujet, l&apos;IA écrit le storyboard, tu le corriges, puis tu lances la génération.
        </div>
      ) : (
        <div className="studio-grid">
          {videos.map((v) => {
            const f = FORMAT_BY_ID[v.format];
            return (
              <Link key={v.id} href={`/studio/${v.id}`} className="vcard">
                <div className={`vthumb ${f?.aspect === "16:9" ? "v169" : "v916"}`}>
                  {v.thumb_path ? <img src={`/api/studio/media/${v.thumb_path}?v=${encodeURIComponent(v.updated_at)}`} alt="" /> : <div className="ph">{v.progress?.label || f?.label}</div>}
                  <span className={`pill badge ${statusPill(v.status)}`}>{VIDEO_STATUS[v.status] ?? v.status}</span>
                </div>
                <b>{v.title || v.topic}</b>
                <span className="sub">
                  {f?.label}{v.project_name ? ` · ${v.project_name}` : ""} · {when(v.updated_at)} · {usd(v.cost_usd)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AGENT_BY_SLUG } from "@/lib/agents";
import { api, MISSION_STATUS, usd, when } from "@/components/api";
import Skeleton from "@/components/Skeleton";

type Row = { id: string; agent_slug: string; title: string; status: string; cost_usd: string; updated_at: string; project_name: string | null; replies: string; run_id: string | null };

const FILTERS: [string, string][] = [
  ["actives", "Actives"],
  ["a_valider", "À valider"],
  ["en_cours", "En cours"],
  ["validee", "Validées"],
  ["echec", "Échecs"],
  ["archivee", "Archivées"],
  ["toutes", "Toutes"],
];

export default function MissionsPage() {
  const [filter, setFilter] = useState("actives");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(null);
    api<{ missions: Row[] }>(`/api/missions?status=${filter}`)
      .then((r) => setRows(r.missions))
      .catch((e) => setError(e.message));
  }, [filter]);

  return (
    <>
      <div className="vhead">
        <h1>Missions</h1>
        <p>Toutes les missions confiées à tes agents, directement ou par l&apos;orchestrateur. Ouvre une mission pour relire la réponse, ses sources, ou continuer l&apos;échange.</p>
      </div>
      <div className="chips">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" className="chip" aria-pressed={k === filter} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      {error && <div className="alert err">{error}</div>}
      {rows === null ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <div className="empty">
          {filter === "actives" ? (
            <>Aucune mission pour l&apos;instant. <Link href="/agents">Choisis un agent</Link> et lance ta première mission.</>
          ) : (
            "Aucune mission dans ce filtre."
          )}
        </div>
      ) : (
        <div className="items">
          {rows.map((m) => {
            const a = AGENT_BY_SLUG[m.agent_slug];
            return (
              <Link key={m.id} href={`/agents?mission=${m.id}`} className="item" style={{ ["--c" as string]: a?.pole.color }}>
                <b>{m.title}</b>
                <span className={`pill ${m.status}`}>{MISSION_STATUS[m.status] ?? m.status}</span>
                <span className="sub">
                  {a?.name ?? m.agent_slug}
                  {m.project_name ? ` · ${m.project_name}` : ""}
                  {m.run_id ? " · plan orchestré" : ""} · {when(m.updated_at)} · {m.replies} réponse(s) · {usd(m.cost_usd, 3)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

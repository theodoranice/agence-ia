"use client";
import { useEffect, useState } from "react";

export type LiveProgress = {
  phase: "thinking" | "searching" | "reading" | "writing";
  searches: string[];
  results: number;
  chars: number;
  preview: string;
  elapsedMs: number;
};

const PHASES: { id: LiveProgress["phase"]; label: string }[] = [
  { id: "thinking", label: "Réflexion" },
  { id: "searching", label: "Recherche" },
  { id: "reading", label: "Lecture" },
  { id: "writing", label: "Rédaction" },
];

const TITLE: Record<LiveProgress["phase"], string> = {
  thinking: "Réfléchit à la mission",
  searching: "Cherche sur le web",
  reading: "Lit les résultats",
  writing: "Rédige le livrable",
};

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Indicateur animé de l'avancement d'un agent : phase, requêtes, aperçu du texte, chrono. */
export default function Activity({ progress, color, compact = false }: { progress: LiveProgress | null; color?: string; compact?: boolean }) {
  const p: LiveProgress = progress ?? { phase: "thinking", searches: [], results: 0, chars: 0, preview: "", elapsedMs: 0 };
  // Chrono qui avance entre deux mises à jour du serveur
  const [base, setBase] = useState({ ms: p.elapsedMs, at: Date.now() });
  const [now, setNow] = useState(Date.now());
  useEffect(() => setBase({ ms: p.elapsedMs, at: Date.now() }), [p.elapsedMs]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = base.ms + (now - base.at);

  const current = PHASES.findIndex((x) => x.id === p.phase);
  const words = Math.round(p.chars / 5.5);
  const lastQuery = p.searches.at(-1);

  return (
    <div className={`activity ${compact ? "compact" : ""}`} style={{ ["--c" as string]: color }} role="status" aria-live="polite">
      <div className="act-head">
        <span className={`act-orb ${p.phase}`} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="act-title">
          {TITLE[p.phase]}
          <span className="act-dots" aria-hidden="true">
            <b>.</b>
            <b>.</b>
            <b>.</b>
          </span>
        </span>
        <span className="act-time mono">{fmt(elapsed)}</span>
      </div>

      <ol className="act-steps" aria-label="Étapes de traitement">
        {PHASES.map((ph, i) => {
          const skipped = (ph.id === "searching" || ph.id === "reading") && !p.searches.length && i < current;
          const state = i < current ? (skipped ? "skip" : "done") : i === current ? "now" : "todo";
          return (
            <li key={ph.id} className={state}>
              <span className="act-pip" />
              {ph.label}
            </li>
          );
        })}
      </ol>

      {!compact && (p.phase === "searching" || p.phase === "reading") && p.searches.length > 0 && (
        <div className="act-searches">
          {p.searches.map((q, i) => (
            <span key={i} className={`act-query ${q === lastQuery && i === p.searches.length - 1 ? "live" : ""}`}>
              {q}
            </span>
          ))}
          {p.results > 0 && <span className="muted small">{p.results} pages lues</span>}
        </div>
      )}

      {!compact && p.phase === "writing" && p.preview && (
        <div className="act-preview">
          <p>
            {p.preview.replace(/[#*_`>|-]+/g, " ").replace(/\s+/g, " ").trim()}
            <span className="act-caret" aria-hidden="true" />
          </p>
        </div>
      )}

      <div className="act-meta small muted">
        {p.searches.length > 0 && <span>{p.searches.length} recherche{p.searches.length > 1 ? "s" : ""}</span>}
        {words > 0 && <span>~{words} mots écrits</span>}
        {p.phase === "thinking" && <span>Analyse de la mission et des livrables précédents</span>}
      </div>
    </div>
  );
}

import "server-only";
import type { AgentEvent } from "./claude";

/** État en direct d'une mission en cours (mémoire du processus, effacé à la fin). */
export type Progress = {
  phase: "thinking" | "searching" | "reading" | "writing";
  searches: string[];
  results: number;
  chars: number;
  preview: string; // fin du texte en cours de rédaction
  startedAt: number;
  updatedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __progress: Map<string, Progress> | undefined;
}
const store = (global.__progress ??= new Map<string, Progress>());

export function startProgress(missionId: string) {
  const now = Date.now();
  store.set(missionId, { phase: "thinking", searches: [], results: 0, chars: 0, preview: "", startedAt: now, updatedAt: now });
}

export function trackProgress(missionId: string, e: AgentEvent) {
  const p = store.get(missionId);
  if (!p) return;
  p.updatedAt = Date.now();
  if (e.type === "search") {
    p.phase = "searching";
    p.searches = [...p.searches, e.query].slice(-8);
  } else if (e.type === "results") {
    p.phase = "reading";
    p.results += e.count;
  } else if (e.type === "text") {
    p.chars += e.delta.length;
    p.preview = (p.preview + e.delta).slice(-420);
    if (p.preview.trim()) p.phase = "writing";
  }
}

export function getProgress(missionId: string | null | undefined): (Progress & { elapsedMs: number }) | null {
  const p = missionId ? store.get(missionId) : undefined;
  return p ? { ...p, elapsedMs: Date.now() - p.startedAt } : null;
}

export function endProgress(missionId: string) {
  store.delete(missionId);
}

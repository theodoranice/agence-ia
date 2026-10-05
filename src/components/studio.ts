export const VIDEO_STATUS: Record<string, string> = {
  scripting: "Scénario en cours",
  ready: "Storyboard prêt",
  rendering: "Génération en cours",
  done: "Prête",
  failed: "Échec",
  cancelled: "Annulée",
};
export const statusPill = (s: string) =>
  s === "done" ? "done" : s === "failed" ? "failed" : s === "ready" ? "draft" : s === "cancelled" ? "" : "running";

"use client";

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = "/login";
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erreur ${res.status}`);
  return data as T;
}

/** POST qui renvoie un flux SSE ; appelle `on(event, data)` pour chaque événement. */
export async function streamPost(url: string, payload: unknown, on: (event: string, data: any) => void, signal?: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (res.status === 401) window.location.href = "/login";
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || `Erreur ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let ev = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) ev = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) {
        try {
          on(ev, JSON.parse(data));
        } catch {
          /* événement illisible ignoré */
        }
      }
    }
  }
}

export const usd = (n: number | string | null | undefined, digits = 2) => `${Number(n ?? 0).toFixed(digits)} $`;
export const xof = (n: number | string | null | undefined, rate = 600) =>
  `${Math.round(Number(n ?? 0) * rate).toLocaleString("fr-FR")} FCFA`;
export const when = (d: string) => {
  const x = new Date(d);
  return `${x.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${x.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

export const MISSION_STATUS: Record<string, string> = {
  en_cours: "En cours",
  a_valider: "À valider",
  validee: "Validée",
  archivee: "Archivée",
  echec: "Échec",
};
export const RUN_STATUS: Record<string, string> = {
  draft: "Brouillon",
  running: "En cours",
  done: "Terminé",
  failed: "Échec",
  cancelled: "Annulé",
};
export const STEP_STATUS: Record<string, string> = {
  pending: "À faire",
  running: "En cours",
  done: "Fait",
  failed: "Échec",
  skipped: "Ignorée",
};

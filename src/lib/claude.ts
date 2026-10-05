import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Usage } from "./pricing";

let _client: Anthropic | null = null;
export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manquant dans l'environnement.");
  _client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  return _client;
}

export type Source = { url: string; title: string };

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "search"; query: string }
  | { type: "results"; count: number };

export type AgentResult = {
  text: string;
  content: unknown[]; // blocs bruts, renvoyés tels quels aux tours suivants
  sources: Source[];
  searches: string[];
  usage: Usage;
  stopReason: string | null;
};

// Paramètres d'un tour de conversation : texte simple, ou blocs bruts d'un tour précédent.
export type Turn = { role: "user" | "assistant"; content: string | unknown[] };

const MAX_TOKENS = Number(process.env.MAX_TOKENS || 8000);
const MAX_SEARCHES = Number(process.env.MAX_SEARCHES_PER_MISSION || 5);

function webSearchTool() {
  return {
    type: "web_search_20250305" as const,
    name: "web_search" as const,
    max_uses: MAX_SEARCHES,
    user_location: {
      type: "approximate" as const,
      city: process.env.SEARCH_CITY || "Dakar",
      country: process.env.SEARCH_COUNTRY || "SN",
      timezone: process.env.SEARCH_TIMEZONE || "Africa/Dakar",
    },
  };
}

export async function runAgent(opts: {
  model: string;
  system: string;
  turns: Turn[];
  webSearch: boolean;
  onEvent?: (e: AgentEvent) => void;
  signal?: AbortSignal;
}): Promise<AgentResult> {
  const client = anthropic();
  const emit = opts.onEvent ?? (() => {});
  const tools = opts.webSearch ? [webSearchTool()] : undefined;
  const base = opts.turns as Anthropic.MessageParam[];

  const content: Anthropic.ContentBlock[] = [];
  const usage: Usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, web_searches: 0 };
  const searches: string[] = [];
  let text = "";
  let lastKind: string | null = null;
  let stopReason: string | null = null;

  // Une recherche longue peut s'arrêter en "pause_turn" : on relance avec le contenu déjà produit.
  for (let round = 0; round < 5; round++) {
    const messages: Anthropic.MessageParam[] = content.length
      ? [...base, { role: "assistant", content: content as unknown as Anthropic.ContentBlockParam[] }]
      : base;

    const stream = client.messages.stream(
      {
        model: opts.model,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        messages,
        ...(tools ? { tools } : {}),
      },
      { signal: opts.signal },
    );

    const toolInput: Record<number, string> = {};
    for await (const ev of stream) {
      if (ev.type === "content_block_start") {
        const b = ev.content_block;
        if (b.type === "text") {
          if (lastKind && lastKind !== "text" && text && !text.endsWith("\n\n")) {
            const sep = text.endsWith("\n") ? "\n" : "\n\n";
            text += sep;
            emit({ type: "text", delta: sep });
          }
        } else if (b.type === "server_tool_use") {
          toolInput[ev.index] = "";
        } else if (b.type === "web_search_tool_result") {
          const c = b.content;
          emit({ type: "results", count: Array.isArray(c) ? c.length : 0 });
        }
        lastKind = b.type;
      } else if (ev.type === "content_block_delta") {
        if (ev.delta.type === "text_delta") {
          text += ev.delta.text;
          emit({ type: "text", delta: ev.delta.text });
        } else if (ev.delta.type === "input_json_delta" && toolInput[ev.index] !== undefined) {
          toolInput[ev.index] += ev.delta.partial_json;
        }
      } else if (ev.type === "content_block_stop" && toolInput[ev.index] !== undefined) {
        try {
          const query = String(JSON.parse(toolInput[ev.index] || "{}").query || "");
          if (query) {
            searches.push(query);
            emit({ type: "search", query });
          }
        } catch {
          /* entrée partielle illisible : ignorée */
        }
        delete toolInput[ev.index];
      }
    }

    const msg = await stream.finalMessage();
    content.push(...msg.content);
    usage.input_tokens += msg.usage.input_tokens ?? 0;
    usage.output_tokens += msg.usage.output_tokens ?? 0;
    usage.cache_read_tokens += msg.usage.cache_read_input_tokens ?? 0;
    usage.cache_write_tokens += msg.usage.cache_creation_input_tokens ?? 0;
    usage.web_searches += msg.usage.server_tool_use?.web_search_requests ?? 0;
    stopReason = msg.stop_reason;
    if (msg.stop_reason !== "pause_turn") break;
  }

  if (stopReason === "max_tokens") {
    const note = "\n\n> Réponse coupée par la limite de longueur. Demande « continue » pour avoir la suite.";
    text += note;
    emit({ type: "text", delta: note });
  }

  return { text, content, sources: collectSources(content), searches, usage, stopReason };
}

function collectSources(content: Anthropic.ContentBlock[]): Source[] {
  const seen = new Map<string, Source>();
  for (const b of content) {
    if (b.type === "text" && b.citations) {
      for (const c of b.citations) {
        if (c.type === "web_search_result_location" && c.url && !seen.has(c.url)) {
          seen.set(c.url, { url: c.url, title: c.title || c.url });
        }
      }
    }
  }
  if (seen.size === 0) {
    // Aucune citation explicite : on liste les pages consultées
    for (const b of content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) {
          if (r.type === "web_search_result" && !seen.has(r.url)) seen.set(r.url, { url: r.url, title: r.title || r.url });
        }
      }
    }
  }
  return [...seen.values()].slice(0, 20);
}

/** Appel simple, sans outils, qui doit renvoyer du JSON. */
export async function askJson<T>(opts: { model: string; prompt: string }): Promise<{ data: T; usage: Usage }> {
  const msg = await anthropic().messages.create({
    model: opts.model,
    max_tokens: 4000,
    messages: [{ role: "user", content: opts.prompt }],
  });
  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Réponse du planificateur illisible.");
  const data = JSON.parse(raw.slice(start, end + 1)) as T;
  return {
    data,
    usage: {
      input_tokens: msg.usage.input_tokens ?? 0,
      output_tokens: msg.usage.output_tokens ?? 0,
      cache_read_tokens: msg.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: msg.usage.cache_creation_input_tokens ?? 0,
      web_searches: 0,
    },
  };
}

export function friendlyApiError(e: unknown): string {
  if (e instanceof Anthropic.APIUserAbortError) return "Mission arrêtée.";
  if (e instanceof Anthropic.AuthenticationError) return "Clé API Anthropic invalide. Vérifie ANTHROPIC_API_KEY.";
  if (e instanceof Anthropic.RateLimitError) return "Limite de débit de l'API atteinte. Réessaie dans une minute.";
  if (e instanceof Anthropic.BadRequestError) {
    const m = String((e as Error).message || "");
    if (/credit|billing|balance/i.test(m)) return "Crédit API insuffisant sur le compte Anthropic.";
    return "Requête refusée par l'API : " + m.slice(0, 200);
  }
  if (e instanceof Anthropic.APIError) return "L'API Claude est indisponible pour le moment. Réessaie.";
  return e instanceof Error ? e.message : "Erreur inconnue.";
}

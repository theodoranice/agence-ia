import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { one, q } from "./db";
import { AGENT_BY_SLUG } from "./agents";
import { runAgent, type AgentEvent, type AgentResult, type Turn } from "./claude";
import { costUsd, modelFor, type Tier } from "./pricing";
import { systemPrompt } from "./prompt";
import type { User } from "./auth";

export type MissionRow = {
  id: string;
  user_id: string;
  agent_slug: string;
  project_id: string | null;
  title: string;
  status: string;
  tier: Tier;
  web_search: boolean;
  run_id: string | null;
  step_index: number | null;
  cost_usd: string;
  created_at: string;
  updated_at: string;
};

type MsgRow = { role: "user" | "assistant"; text: string; content: unknown[] | null };

// Missions en cours dans ce processus : permet le bouton « Arrêter ».
const running = new Map<string, AbortController>();
export function stopMission(id: string) {
  running.get(id)?.abort();
  return running.has(id);
}
export function isRunning(id: string) {
  return running.has(id);
}

export async function createMission(opts: {
  userId: string;
  agentSlug: string;
  projectId: string | null;
  title: string;
  tier: Tier;
  webSearch: boolean;
  runId?: string | null;
  stepIndex?: number | null;
}) {
  return (await one<MissionRow>(
    `INSERT INTO missions (user_id, agent_slug, project_id, title, tier, web_search, run_id, step_index, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'en_cours') RETURNING *`,
    [opts.userId, opts.agentSlug, opts.projectId, opts.title.slice(0, 140), opts.tier, opts.webSearch, opts.runId ?? null, opts.stepIndex ?? null],
  ))!;
}

async function history(missionId: string, withBlocks: boolean): Promise<Turn[]> {
  const rows = await q<MsgRow>("SELECT role, text, content FROM messages WHERE mission_id = $1 ORDER BY id", [missionId]);
  const turns: Turn[] = rows.map((r) =>
    r.role === "assistant" && withBlocks && Array.isArray(r.content) && r.content.length
      ? { role: "assistant", content: r.content }
      : { role: r.role, content: r.text || "(vide)" },
  );
  // Garder les 16 derniers tours, en commençant par un tour utilisateur
  let t = turns.slice(-16);
  while (t.length && t[0].role !== "user") t = t.slice(1);
  return t;
}

/**
 * Ajoute le message utilisateur, fait travailler l'agent et enregistre la réponse,
 * le coût et l'usage. Utilisé par les missions directes et par l'orchestrateur.
 */
export async function executeMission(opts: {
  user: Pick<User, "id" | "company_context">;
  mission: MissionRow;
  userText: string;
  onEvent?: (e: AgentEvent) => void;
}): Promise<AgentResult> {
  const { mission, user } = opts;
  const agent = AGENT_BY_SLUG[mission.agent_slug];
  if (!agent) throw new Error("Agent inconnu : " + mission.agent_slug);

  const project = mission.project_id
    ? await one<{ name: string; description: string }>("SELECT name, description FROM projects WHERE id = $1", [mission.project_id])
    : null;

  await q("INSERT INTO messages (mission_id, role, text) VALUES ($1,'user',$2)", [mission.id, opts.userText]);
  await q("UPDATE missions SET status='en_cours', updated_at=now() WHERE id=$1", [mission.id]);

  const model = modelFor(mission.tier);
  const system = systemPrompt({ agent, companyContext: user.company_context, project, webSearch: mission.web_search });
  const ctl = new AbortController();
  running.set(mission.id, ctl);

  try {
    let result: AgentResult;
    try {
      result = await runAgent({ model, system, turns: await history(mission.id, mission.web_search), webSearch: mission.web_search, onEvent: opts.onEvent, signal: ctl.signal });
    } catch (e) {
      // Si l'historique brut est refusé (rare), on réessaie avec un historique texte seul.
      if (e instanceof Anthropic.BadRequestError) {
        result = await runAgent({ model, system, turns: await history(mission.id, false), webSearch: mission.web_search, onEvent: opts.onEvent, signal: ctl.signal });
      } else throw e;
    }
    const cost = costUsd(model, result.usage);
    await q(
      `INSERT INTO messages (mission_id, role, text, content, sources, searches, model, cost_usd)
       VALUES ($1,'assistant',$2,$3,$4,$5,$6,$7)`,
      [mission.id, result.text, JSON.stringify(result.content), JSON.stringify(result.sources), JSON.stringify(result.searches), model, cost],
    );
    await recordUsage({ userId: user.id, missionId: mission.id, runId: mission.run_id, kind: "mission", model, usage: result.usage, cost });
    await q("UPDATE missions SET status='a_valider', cost_usd = cost_usd + $2, updated_at=now() WHERE id=$1", [mission.id, cost]);
    return result;
  } catch (e) {
    await q("UPDATE missions SET status='echec', updated_at=now() WHERE id=$1", [mission.id]);
    throw e;
  } finally {
    running.delete(mission.id);
  }
}

export async function recordUsage(o: {
  userId: string;
  missionId?: string | null;
  runId?: string | null;
  kind: "mission" | "plan";
  model: string;
  usage: AgentResult["usage"];
  cost: number;
}) {
  await q(
    `INSERT INTO usage (user_id, mission_id, run_id, kind, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, cost_usd)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [o.userId, o.missionId ?? null, o.runId ?? null, o.kind, o.model, o.usage.input_tokens, o.usage.output_tokens, o.usage.cache_read_tokens, o.usage.cache_write_tokens, o.usage.web_searches, o.cost],
  );
}

export async function getOwnedMission(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<MissionRow>("SELECT * FROM missions WHERE id = $1 AND user_id = $2", [id, userId]);
}

import { handle, HttpError, requireUser } from "@/lib/auth";
import { body, str, uuidOrNull } from "@/lib/http";
import { q, one } from "@/lib/db";
import { AGENT_BY_SLUG } from "@/lib/agents";
import { isTier } from "@/lib/pricing";
import { assertBudget, budgetState } from "@/lib/quota";
import { createMission, executeMission } from "@/lib/missions";
import { friendlyApiError } from "@/lib/claude";
import { sseResponse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const params: unknown[] = [user.id];
  let where = "m.user_id = $1";
  if (status && ["en_cours", "a_valider", "validee", "archivee", "echec"].includes(status)) {
    params.push(status);
    where += " AND m.status = $2";
  } else if (status === "actives") {
    where += " AND m.status <> 'archivee'";
  }
  const rows = await q(
    `SELECT m.id, m.agent_slug, m.title, m.status, m.tier, m.web_search, m.cost_usd, m.run_id, m.updated_at, m.created_at,
            p.name AS project_name,
            (SELECT count(*) FROM messages x WHERE x.mission_id = m.id AND x.role='assistant') AS replies
       FROM missions m LEFT JOIN projects p ON p.id = m.project_id
      WHERE ${where}
      ORDER BY m.updated_at DESC LIMIT 300`,
    params,
  );
  return Response.json({ missions: rows });
});

/** Crée une mission et diffuse la réponse de l'agent en direct (SSE). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await body(req);
  const agentSlug = str(b.agent, "Agent", { max: 120 });
  if (!AGENT_BY_SLUG[agentSlug]) throw new HttpError(400, "Agent inconnu.");
  const text = str(b.text, "Mission", { min: 3, max: 60000 });
  const tier = isTier(b.tier) ? b.tier : "standard";
  const webSearch = b.webSearch !== false;
  const projectId = uuidOrNull(b.projectId);
  if (projectId && !(await one("SELECT 1 FROM projects WHERE id=$1 AND user_id=$2", [projectId, user.id]))) {
    throw new HttpError(404, "Projet introuvable.");
  }
  await assertBudget(user);

  const mission = await createMission({
    userId: user.id,
    agentSlug,
    projectId,
    title: text.split("\n")[0],
    tier,
    webSearch,
  });

  return sseResponse(async (send) => {
    send("mission", { id: mission.id });
    try {
      const res = await executeMission({ user, mission, userText: text, onEvent: (e) => send(e.type, e) });
      send("done", { sources: res.sources, searches: res.searches, budget: await budgetState(user) });
    } catch (e) {
      send("error", { message: friendlyApiError(e) });
    }
  });
});

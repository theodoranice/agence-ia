"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AGENT_BY_SLUG, DEFAULT_AGENT, POLES, type Agent } from "@/lib/agents";
import { TIERS, type Tier } from "@/lib/pricing";
import Markdown from "@/components/Markdown";
import Activity, { type LiveProgress } from "@/components/Activity";
import { api, MISSION_STATUS, streamPost, usd } from "@/components/api";

type Source = { url: string; title: string };
type Msg = { id?: number; role: "user" | "assistant"; text: string; sources?: Source[]; searches?: string[]; cost_usd?: string };
type Mission = { id: string; agent_slug: string; project_id: string | null; title: string; status: string; tier: Tier; web_search: boolean; cost_usd: string; running?: boolean; run_id: string | null; progress?: LiveProgress | null };
type Project = { id: string; name: string };
type Live = { text: string; searches: string[]; results: number; phase: LiveProgress["phase"]; startedAt: number };

export default function Workspace() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState<Agent>(AGENT_BY_SLUG[params.get("agent") || ""] || AGENT_BY_SLUG[DEFAULT_AGENT]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tier, setTier] = useState<Tier>("standard");
  const [web, setWeb] = useState(true);
  const [text, setText] = useState("");
  const [mission, setMission] = useState<Mission | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const liveId = useRef<string | null>(null);
  const missionParam = params.get("mission");

  useEffect(() => {
    api<{ projects: Project[] }>("/api/projects").then((r) => setProjects(r.projects)).catch(() => {});
  }, []);

  const loadMission = useCallback(async (id: string) => {
    const r = await api<{ mission: Mission; messages: Msg[] }>(`/api/missions/${id}`);
    setMission(r.mission);
    setMessages(r.messages);
    const a = AGENT_BY_SLUG[r.mission.agent_slug];
    if (a) setAgent(a);
    setProjectId(r.mission.project_id || "");
    setTier(r.mission.tier);
    setWeb(r.mission.web_search);
    return r.mission;
  }, []);

  useEffect(() => {
    if (!missionParam) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    // Une mission lancée par l'orchestrateur peut être en cours : on rafraîchit jusqu'à la fin.
    const tick = async () => {
      try {
        const m = await loadMission(missionParam);
        if (!stop && (m.running || m.status === "en_cours")) timer = setTimeout(tick, 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Mission introuvable.");
      }
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [missionParam, loadMission]);

  function pick(a: Agent) {
    if (busy) return;
    setAgent(a);
    if (mission && mission.agent_slug !== a.slug) newMission();
  }

  function newMission() {
    if (busy) return;
    setMission(null);
    setMessages([]);
    setLive(null);
    setError("");
    setText("");
    if (missionParam) router.replace("/agents");
  }

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError("");
    setMessages((m) => [...m, { role: "user", text: t }]);
    setText("");
    setLive({ text: "", searches: [], results: 0, phase: "thinking", startedAt: Date.now() });
    let currentId = mission?.id ?? null;
    try {
      const url = mission ? `/api/missions/${mission.id}/messages` : "/api/missions";
      const payload = mission ? { text: t } : { agent: agent.slug, text: t, projectId: projectId || null, tier, webSearch: web };
      await streamPost(url, payload, (ev, d) => {
        if (ev === "mission") {
          currentId = d.id;
          liveId.current = d.id;
        }
        else if (ev === "text") setLive((l) => (l ? { ...l, text: l.text + d.delta, phase: (l.text + d.delta).trim() ? "writing" : l.phase } : l));
        else if (ev === "search") setLive((l) => (l ? { ...l, searches: [...l.searches, d.query], phase: "searching" } : l));
        else if (ev === "results") setLive((l) => (l ? { ...l, results: l.results + d.count, phase: "reading" } : l));
        else if (ev === "error") setError(d.message);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de connexion.");
      if (!currentId) {
        setMessages((m) => m.slice(0, -1));
        setText(t);
      }
    } finally {
      setLive(null);
      setBusy(false);
      liveId.current = null;
      if (currentId) {
        await loadMission(currentId).catch(() => {});
        if (missionParam !== currentId) router.replace(`/agents?mission=${currentId}`, { scroll: false });
      }
      router.refresh(); // met à jour le compteur de dépense
    }
  }

  async function stop() {
    const id = liveId.current ?? mission?.id;
    if (id) await api(`/api/missions/${id}/stop`, { method: "POST" }).catch(() => {});
  }

  async function setStatus(status: string) {
    if (!mission) return;
    try {
      await api(`/api/missions/${mission.id}`, { method: "PATCH", body: { status } });
      setMission({ ...mission, status });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return POLES.map((p) => ({ p, agents: p.agents.filter((a) => !s || `${a.name} ${a.role} ${a.projects}`.toLowerCase().includes(s)) })).filter((g) => g.agents.length);
  }, [q]);

  const running = busy || mission?.status === "en_cours";

  return (
    <div className="agents">
      <aside className="side">
        <div className="side-top">
          <input type="search" placeholder="Chercher un agent" aria-label="Chercher un agent" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="list">
          {filtered.map(({ p, agents }) => (
            <div key={p.id}>
              <div className="grp">
                <span className="dot" style={{ ["--c" as string]: p.color }} />
                {p.name}
              </div>
              {agents.map((a) => (
                <button key={a.slug} type="button" className="ag" aria-current={a.slug === agent.slug} onClick={() => pick(a)}>
                  <span>{a.name}</span>
                  {a.prio === "P1" && <small>P1</small>}
                </button>
              ))}
            </div>
          ))}
          {!filtered.length && <p className="muted small" style={{ padding: 12 }}>Aucun agent ne correspond.</p>}
        </div>
      </aside>

      <div className="work">
        <div className="ahead" style={{ ["--c" as string]: agent.pole.color }}>
          <div className="meta">
            <span className="row" style={{ gap: 6 }}>
              <span className="dot" style={{ ["--c" as string]: agent.pole.color }} /> {agent.pole.name}
            </span>
            <span>Priorité {agent.prio}</span>
            <span className="mono">{agent.slug}</span>
          </div>
          <h1>{agent.name}</h1>
          <p>{agent.role}</p>
        </div>

        {!mission && (
          <div className="tpls">
            {agent.pole.templates.map((t) => (
              <button
                key={t}
                type="button"
                className="tpl"
                onClick={() => {
                  setText(t);
                  requestAnimationFrame(() => {
                    taRef.current?.focus();
                    taRef.current?.setSelectionRange(t.length, t.length);
                  });
                }}
              >
                {t.replace(/[\s:]+$/, "").replace(/\n/g, " ")}…
              </button>
            ))}
          </div>
        )}

        {mission && (
          <div className="mhead">
            <h2>{mission.title}</h2>
            <div className="row">
              <span className="muted small">{usd(mission.cost_usd, 3)}</span>
              <label className="field" style={{ flexDirection: "row", alignItems: "center" }} htmlFor="mstatus">
                <span>Statut</span>
                <select id="mstatus" value={mission.status} disabled={running} onChange={(e) => setStatus(e.target.value)}>
                  {mission.status === "en_cours" && <option value="en_cours">En cours</option>}
                  {mission.status === "echec" && <option value="echec">Échec</option>}
                  <option value="a_valider">{MISSION_STATUS.a_valider}</option>
                  <option value="validee">{MISSION_STATUS.validee}</option>
                  <option value="archivee">{MISSION_STATUS.archivee}</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {(messages.length > 0 || live) && (
          <div className="thread">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={m.id ?? `u${i}`} className="msg u">
                  <div className="who">{i === 0 ? "Mission" : "Précision"}</div>
                  {m.text}
                </div>
              ) : (
                <AssistantMsg key={m.id ?? `a${i}`} agent={agent} msg={m} />
              ),
            )}
            {live && (
              <div className="msg a">
                <div className="who">
                  <span className="dot" style={{ ["--c" as string]: agent.pole.color }} />
                  {agent.name}
                </div>
                <Activity
                  compact={!!live.text}
                  color={agent.pole.color}
                  progress={{ phase: live.phase, searches: live.searches, results: live.results, chars: live.text.length, preview: "", elapsedMs: Date.now() - live.startedAt }}
                />
                {live.text && (
                  <div style={{ marginTop: 14 }}>
                    <Markdown text={live.text} />
                  </div>
                )}
              </div>
            )}
            {!live && mission?.status === "en_cours" && (
              <div className="msg a">
                <div className="who">
                  <span className="dot" style={{ ["--c" as string]: agent.pole.color }} />
                  {agent.name}
                </div>
                <Activity progress={mission.progress ?? null} color={agent.pole.color} />
              </div>
            )}
          </div>
        )}

        {error && <div className="alert err">{error}</div>}

        <div className="composer">
          {!mission && (
            <div className="row">
              <label className="field" style={{ flexDirection: "row", alignItems: "center" }} htmlFor="proj">
                <span>Projet</span>
                <select id="proj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Aucun en particulier</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <div className="seg" role="group" aria-label="Profondeur">
                {TIERS.map((t) => (
                  <button key={t.id} type="button" title={t.hint} aria-pressed={tier === t.id} onClick={() => setTier(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <label className="check" htmlFor="web">
                <input id="web" type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} />
                Recherche web
              </label>
            </div>
          )}
          <textarea
            ref={taRef}
            id="task"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={mission ? "Demande une modification, la suite, ou une précision à l'agent." : "Décris la mission : ce que tu veux obtenir, le contexte, les contraintes. Colle du code ou un texte si besoin."}
          />
          <div className="row">
            <button type="button" className="btn primary" onClick={send} disabled={running || !text.trim()}>
              {mission ? "Envoyer la précision" : "Lancer la mission"}
            </button>
            {busy && (
              <button type="button" className="btn" onClick={stop}>
                Arrêter
              </button>
            )}
            {mission && (
              <button type="button" className="btn ghost" onClick={newMission} disabled={busy}>
                Nouvelle mission
              </button>
            )}
            <span className="muted small spacer">{busy ? "L'agent travaille…" : "Ctrl + Entrée pour envoyer"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantMsg({ agent, msg }: { agent: Agent; msg: Msg }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* presse-papiers indisponible */
    }
  }
  return (
    <div className="msg a">
      <div className="who">
        <span className="dot" style={{ ["--c" as string]: agent.pole.color }} />
        {agent.name}
        {msg.cost_usd !== undefined && <span>· {usd(msg.cost_usd, 3)}</span>}
      </div>
      {!!msg.searches?.length && (
        <div className="searches">
          {msg.searches.map((s, i) => (
            <span key={i} className="search-chip">Recherche : {s}</span>
          ))}
        </div>
      )}
      <Markdown text={msg.text} />
      {!!msg.sources?.length && (
        <div className="sources">
          <b>Sources</b>
          <ol>
            {msg.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn sm" onClick={copy}>{copied ? "Copié" : "Copier la réponse"}</button>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/api";

type Project = { id: string; name: string; description: string; missions: string };

export default function ProjectsPage() {
  const [items, setItems] = useState<Project[] | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => api<{ projects: Project[] }>("/api/projects").then((r) => setItems(r.projects)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/projects", { body: { name, description: desc } });
      setName("");
      setDesc("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    }
  }

  async function save(id: string) {
    setError("");
    try {
      await api(`/api/projects/${id}`, { method: "PATCH", body: { name: eName, description: eDesc } });
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    }
  }

  async function remove(id: string) {
    await api(`/api/projects/${id}`, { method: "DELETE" }).catch((e) => setError(e.message));
    setConfirm(null);
    load();
  }

  return (
    <>
      <div className="vhead">
        <h1>Projets</h1>
        <p>Chaque projet a une description que les agents lisent avant de travailler. Plus elle est précise (cible, offre, stack, contraintes), plus leurs livrables sont justes.</p>
      </div>

      <form className="panel" onSubmit={create} style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.05rem" }}>Nouveau projet</h2>
        <label className="field" htmlFor="pname">
          <span>Nom</span>
          <input id="pname" type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
        </label>
        <label className="field" htmlFor="pdesc">
          <span>Description pour les agents</span>
          <textarea id="pdesc" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={3000} placeholder="Ce que fait le projet, pour qui, où il en est, la stack, les contraintes à respecter." />
        </label>
        <div className="row">
          <button type="submit" className="btn primary" disabled={name.trim().length < 2}>Créer le projet</button>
        </div>
      </form>

      {error && <div className="alert err" style={{ marginBottom: 14 }}>{error}</div>}

      {items === null ? (
        <p className="muted">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="empty">Aucun projet. Crée le premier ci-dessus pour donner du contexte à tes agents.</div>
      ) : (
        <div className="items">
          {items.map((p) =>
            editing === p.id ? (
              <div key={p.id} className="panel">
                <label className="field" htmlFor={`en${p.id}`}>
                  <span>Nom</span>
                  <input id={`en${p.id}`} type="text" value={eName} onChange={(e) => setEName(e.target.value)} />
                </label>
                <label className="field" htmlFor={`ed${p.id}`}>
                  <span>Description</span>
                  <textarea id={`ed${p.id}`} value={eDesc} onChange={(e) => setEDesc(e.target.value)} />
                </label>
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => save(p.id)}>Enregistrer</button>
                  <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Annuler</button>
                </div>
              </div>
            ) : (
              <div key={p.id} className="item">
                <b>{p.name}</b>
                <span className="row">
                  {confirm === p.id ? (
                    <>
                      <span className="small">Supprimer ? Les missions restent.</span>
                      <button type="button" className="btn sm danger" onClick={() => remove(p.id)}>Supprimer</button>
                      <button type="button" className="btn sm" onClick={() => setConfirm(null)}>Garder</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn sm" onClick={() => { setEditing(p.id); setEName(p.name); setEDesc(p.description); }}>Modifier</button>
                      <button type="button" className="btn sm ghost" onClick={() => setConfirm(p.id)}>Supprimer</button>
                    </>
                  )}
                </span>
                <span className="sub">{p.description || "Pas de description."} · {p.missions} mission(s)</span>
              </div>
            ),
          )}
        </div>
      )}
    </>
  );
}

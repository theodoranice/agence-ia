"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/api";

type Status = { set: boolean; source: "env" | "admin" | null; hint: string };
type Res = { fal: Status; elevenlabs: Status; ffmpeg: { ok: boolean; missing: string[] } };

const KEYS: { id: "fal_key" | "elevenlabs_key"; field: "fal" | "elevenlabs"; label: string; help: string; url: string }[] = [
  { id: "fal_key", field: "fal", label: "fal.ai", help: "Images, plans vidéo, avatar parlant, voix clonée Chatterbox et musique. Paiement à l'usage.", url: "https://fal.ai/dashboard/keys" },
  { id: "elevenlabs_key", field: "elevenlabs", label: "ElevenLabs (optionnel)", help: "Voix clonée plus fine, sur abonnement (à partir du plan Starter).", url: "https://elevenlabs.io/app/settings/api-keys" },
];

/** Clés des fournisseurs du Studio vidéo, stockées chiffrées. */
export default function Providers() {
  const [data, setData] = useState<Res | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  const load = () => api<Res>("/api/admin/providers").then(setData).catch((e) => setMsg(e.message));
  useEffect(() => {
    load();
  }, []);

  async function save(id: string, value: string | null) {
    setMsg("");
    try {
      await api("/api/admin/providers", { body: { key: id, value } });
      setValues({ ...values, [id]: "" });
      await load();
      setMsg(value ? "Clé enregistrée (chiffrée sur le serveur)." : "Clé retirée.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur.");
    }
  }

  if (!data) return null;
  return (
    <div className="panel" style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: "1.05rem" }}>Fournisseurs vidéo</h2>
      {!data.ffmpeg.ok && <div className="alert err">ffmpeg incomplet sur le serveur ({data.ffmpeg.missing.join(", ")}) : le montage vidéo ne fonctionnera pas.</div>}
      {msg && <div className="alert info">{msg}</div>}
      {KEYS.map((k) => {
        const st = data[k.field];
        return (
          <div key={k.id} className="stack" style={{ gap: 6 }}>
            <div className="row">
              <b>{k.label}</b>
              <span className={`pill ${st.set ? "done" : "draft"}`}>{st.set ? `Configurée ${st.hint}` : "Non configurée"}</span>
              {st.source === "env" && <span className="small muted">définie dans le fichier .env du serveur</span>}
            </div>
            <span className="small muted">{k.help} <a href={k.url} target="_blank" rel="noopener noreferrer">Obtenir une clé</a></span>
            {st.source !== "env" && (
              <div className="row">
                <input type="password" autoComplete="off" aria-label={`Clé ${k.label}`} placeholder={st.set ? "Remplacer la clé" : "Colle la clé ici"} value={values[k.id] ?? ""} onChange={(e) => setValues({ ...values, [k.id]: e.target.value })} style={{ flex: 1, minWidth: 220 }} />
                <button type="button" className="btn sm primary" disabled={(values[k.id] ?? "").trim().length < 10} onClick={() => save(k.id, values[k.id].trim())}>Enregistrer</button>
                {st.set && <button type="button" className="btn sm ghost danger" onClick={() => save(k.id, null)}>Retirer</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

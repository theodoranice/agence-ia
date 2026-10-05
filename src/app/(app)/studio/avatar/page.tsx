"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/components/api";
import Skeleton from "@/components/Skeleton";

type P = {
  profile: { display_name: string; voice_provider: "chatterbox" | "elevenlabs"; voice_language: string; consent: boolean; photo: string | null; voice: string | null; voice_seconds: number; eleven_voice: boolean } | null;
  avatarReady: boolean;
  voiceReady: boolean;
  providers: { fal: boolean; elevenlabs: boolean };
};

const READ_FR =
  "Bonjour, je m'appelle comme vous voulez, et je vous parle depuis Dakar. Aujourd'hui, je vais vous montrer quelque chose de simple mais d'utile. Vous allez voir, ça change tout quand on l'applique tous les jours. Si cette vidéo vous aide, abonnez-vous et partagez-la à quelqu'un qui en a besoin. On se retrouve très vite pour la suite.";
const READ_EN =
  "Hi, I'm speaking to you from Dakar today. I'm going to show you something simple but really useful. You'll see, it makes a real difference when you apply it every day. If this video helps you, subscribe and share it with someone who needs it. See you very soon for the next one.";

export default function AvatarPage() {
  const [data, setData] = useState<P | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<"chatterbox" | "elevenlabs">("chatterbox");
  const [language, setLanguage] = useState("french");
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceName, setVoiceName] = useState("");
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testUrl, setTestUrl] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const r = await api<P>("/api/studio/profile");
    setData(r);
    if (r.profile) {
      setName(r.profile.display_name);
      setProvider(r.profile.voice_provider);
      setLanguage(r.profile.voice_language);
      setConsent(r.profile.consent);
    }
  };
  useEffect(() => {
    load().catch((e) => setMsg({ kind: "err", text: e.message }));
  }, []);

  const photoPreview = photo ? URL.createObjectURL(photo) : data?.profile?.photo ?? null;
  const voicePreview = voice ? URL.createObjectURL(voice) : data?.profile?.voice ?? null;

  async function startRec() {
    setMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setVoice(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
        setVoiceName("enregistrement");
      };
      r.start();
      rec.current = r;
      setRecording(true);
      setRecSec(0);
      timer.current = setInterval(() => setRecSec((s) => {
        if (s + 1 >= 45) stopRec();
        return s + 1;
      }), 1000);
    } catch {
      setMsg({ kind: "err", text: "Micro inaccessible. Autorise le micro dans le navigateur, ou envoie un fichier audio." });
    }
  }
  function stopRec() {
    rec.current?.state === "recording" && rec.current.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("display_name", name);
    fd.append("voice_provider", provider);
    fd.append("voice_language", language);
    fd.append("consent", String(consent));
    if (photo) fd.append("photo", photo);
    if (voice) fd.append("voice", voice, voice instanceof File ? voice.name : "enregistrement.webm");
    try {
      const res = await fetch("/api/studio/profile", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
      setPhoto(null);
      setVoice(null);
      await load();
      setMsg({ kind: "ok", text: consent ? "Avatar et voix enregistrés." : "Profil enregistré. Sans consentement, ta photo et ta voix ne seront pas utilisées." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erreur." });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setTesting(true);
    setMsg(null);
    try {
      const r = await api<{ url: string }>("/api/studio/profile/test", { method: "POST" });
      setTestUrl(r.url);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erreur." });
    } finally {
      setTesting(false);
    }
  }

  if (!data) return <Skeleton />;
  return (
    <div className="stack" style={{ gap: 20, maxWidth: 900 }}>
      <div className="vhead" style={{ marginBottom: 0 }}>
        <Link href="/studio" className="small">← Studio</Link>
        <h1>Mon avatar &amp; ma voix</h1>
        <p>Une photo de toi et 20 à 30 secondes de ta voix suffisent. Tes vidéos pourront alors te montrer face caméra et parler avec ta voix, en français comme en anglais.</p>
      </div>

      {!data.providers.fal && <div className="alert info">La clé fal.ai n&apos;est pas encore configurée : tu peux préparer ton avatar, mais les tests et les vidéos ne marcheront qu&apos;une fois la clé ajoutée dans Administration.</div>}
      {msg && <div className={`alert ${msg.kind === "err" ? "err" : "info"}`}>{msg.text}</div>}

      <div className="panel">
        <h2 style={{ fontSize: "1.05rem" }}>1. Ta photo</h2>
        <div className="row" style={{ gap: 20, alignItems: "flex-start" }}>
          {photoPreview ? <img className="avatar-pic lg" src={photoPreview} alt="Aperçu de ta photo" /> : <div className="avatar-pic lg" />}
          <div className="stack" style={{ gap: 8, flex: 1, minWidth: 240 }}>
            <input type="file" accept="image/*" aria-label="Choisir une photo" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Visage de face, regard vers l&apos;objectif, bouche fermée</li>
              <li>Cadrage tête et épaules, bonne lumière, fond simple</li>
              <li>Pas de lunettes de soleil, de main devant le visage ni de filtre</li>
              <li>Format vertical idéal pour les Shorts</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ fontSize: "1.05rem" }}>2. Ta voix</h2>
        <div className="seg" role="group" aria-label="Langue de l'échantillon">
          <button type="button" aria-pressed={language === "french"} onClick={() => setLanguage("french")}>Français</button>
          <button type="button" aria-pressed={language === "english"} onClick={() => setLanguage("english")}>Anglais</button>
        </div>
        <span className="small muted">Lis ce texte calmement, dans une pièce silencieuse, à 20 cm du micro :</span>
        <div className="read-box">{language === "english" ? READ_EN : READ_FR}</div>
        <div className="row">
          {recording ? (
            <button type="button" className="btn danger" onClick={stopRec}><span className="rec"><span className="rec-dot" /> Arrêter ({recSec} s)</span></button>
          ) : (
            <button type="button" className="btn" onClick={startRec}>Enregistrer avec le micro</button>
          )}
          <span className="small muted">ou</span>
          <input type="file" accept="audio/*" aria-label="Envoyer un fichier audio" onChange={(e) => { const f = e.target.files?.[0] ?? null; setVoice(f); setVoiceName(f?.name ?? ""); }} />
        </div>
        {voicePreview && (
          <div className="row">
            <audio src={voicePreview} controls preload="none" />
            <span className="small muted">{voice ? `Nouvel échantillon (${voiceName}), pas encore enregistré` : `Échantillon enregistré : ${data.profile?.voice_seconds ?? 0} s`}</span>
          </div>
        )}
        <div className="field">
          <span>Moteur de voix</span>
          <div className="seg" role="group" aria-label="Moteur de voix">
            <button type="button" aria-pressed={provider === "chatterbox"} onClick={() => setProvider("chatterbox")}>Chatterbox (à l&apos;usage, très peu cher)</button>
            <button type="button" aria-pressed={provider === "elevenlabs"} disabled={!data.providers.elevenlabs} onClick={() => setProvider("elevenlabs")}>ElevenLabs (abonnement)</button>
          </div>
          {!data.providers.elevenlabs && <span className="small muted">ElevenLabs s&apos;active quand sa clé est ajoutée dans Administration.</span>}
        </div>
      </div>

      <div className="panel">
        <h2 style={{ fontSize: "1.05rem" }}>3. Consentement</h2>
        <label className="check" htmlFor="consent" style={{ alignItems: "flex-start" }}>
          <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
          <span>Je certifie que la photo et la voix sont les miennes, et j&apos;accepte qu&apos;elles soient envoyées aux fournisseurs (fal.ai{provider === "elevenlabs" ? ", ElevenLabs" : ""}) pour générer mes vidéos. Je peux retirer ce consentement à tout moment.</span>
        </label>
        <span className="small muted">Les plateformes demandent de signaler les contenus générés par IA : coche l&apos;option prévue au moment de publier.</span>
        <div className="row">
          <button type="button" className="btn primary" onClick={save} disabled={busy || recording}>{busy ? "Enregistrement…" : "Enregistrer mon avatar"}</button>
          {data.voiceReady && (
            <button type="button" className="btn" onClick={test} disabled={testing || !data.providers.fal}>{testing ? "Génération du test…" : "Écouter ma voix clonée"}</button>
          )}
          {testUrl && <audio src={testUrl} controls autoPlay />}
        </div>
      </div>
    </div>
  );
}

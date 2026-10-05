import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { one, q } from "./db";

// Clés des fournisseurs (fal.ai, ElevenLabs) saisies dans l'administration.
// Chiffrées en base avec une clé dérivée d'un secret du serveur.
function key() {
  const base = process.env.SETTINGS_SECRET || process.env.POSTGRES_PASSWORD || process.env.DATABASE_URL || "";
  if (!base) throw new Error("Aucun secret serveur disponible pour chiffrer les réglages.");
  return createHash("sha256").update("agence-ia-settings:" + base).digest();
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

function decrypt(enc: string) {
  const [iv, tag, data] = enc.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

export type SettingKey = "fal_key" | "elevenlabs_key";

const ENV: Record<SettingKey, string> = { fal_key: "FAL_KEY", elevenlabs_key: "ELEVENLABS_API_KEY" };

export async function getSetting(k: SettingKey): Promise<string | null> {
  const fromEnv = process.env[ENV[k]];
  if (fromEnv) return fromEnv;
  const row = await one<{ value_enc: string }>("SELECT value_enc FROM app_settings WHERE key=$1", [k]);
  if (!row) return null;
  try {
    return decrypt(row.value_enc);
  } catch {
    return null;
  }
}

export async function setSetting(k: SettingKey, value: string | null) {
  if (!value) {
    await q("DELETE FROM app_settings WHERE key=$1", [k]);
    return;
  }
  await q(
    `INSERT INTO app_settings (key, value_enc) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value_enc=EXCLUDED.value_enc, updated_at=now()`,
    [k, encrypt(value)],
  );
}

/** État affichable sans révéler la clé. */
export async function settingStatus(k: SettingKey) {
  if (process.env[ENV[k]]) return { set: true, source: "env" as const, hint: mask(process.env[ENV[k]]!) };
  const v = await getSetting(k);
  return v ? { set: true, source: "admin" as const, hint: mask(v) } : { set: false, source: null, hint: "" };
}

function mask(v: string) {
  return v.length <= 8 ? "••••" : `${v.slice(0, 4)}…${v.slice(-4)}`;
}

import "server-only";
import { HttpError } from "./auth";

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const b = await req.json();
    if (!b || typeof b !== "object") throw new Error();
    return b as T;
  } catch {
    throw new HttpError(400, "Corps de requête JSON invalide.");
  }
}

export function str(v: unknown, field: string, { min = 0, max = 20000, optional = false } = {}): string {
  if (v == null || v === "") {
    if (optional) return "";
    throw new HttpError(400, `Champ requis : ${field}.`);
  }
  if (typeof v !== "string") throw new HttpError(400, `Champ invalide : ${field}.`);
  const s = v.trim();
  if (s.length < min) throw new HttpError(400, `${field} : ${min} caractères minimum.`);
  if (s.length > max) throw new HttpError(400, `${field} : ${max} caractères maximum.`);
  return s;
}

export function uuidOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) return v;
  throw new HttpError(400, "Identifiant invalide.");
}

export function isUuid(v: string) {
  return /^[0-9a-f-]{36}$/i.test(v);
}

export type Ctx = { params: Promise<{ id: string }> };

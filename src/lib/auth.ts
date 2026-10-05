import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { one, q } from "./db";

export const SESSION_COOKIE = "agence_session";
const SESSION_DAYS = 30;

export type User = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  monthly_budget_usd: string | null;
  active: boolean;
  company_context: string;
};

let dummyHash: string | undefined;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const row = await one<User & { password_hash: string }>(
    "SELECT * FROM users WHERE email = lower($1)",
    [email.trim()],
  );
  if (!row || !row.active) {
    // même coût de calcul qu'une vraie vérification (évite de révéler quels e-mails existent)
    dummyHash ??= await bcrypt.hash("dummy-password", 12);
    await bcrypt.compare(password, dummyHash);
    return null;
  }
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  const { password_hash: _drop, ...user } = row;
  return user;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await q("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)", [hash(token), userId, expires]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q("DELETE FROM sessions WHERE id = $1", [hash(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one<User>(
    `SELECT u.id, u.email, u.name, u.role, u.monthly_budget_usd, u.active, u.company_context
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now() AND u.active`,
    [hash(token)],
  );
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Session expirée. Reconnecte-toi.");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") throw new HttpError(403, "Réservé à l'administrateur.");
  return u;
}

/** Enveloppe les routes API : erreurs HTTP propres en JSON. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Erreur interne du serveur." }, { status: 500 });
    }
  };
}

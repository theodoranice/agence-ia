import { createSession, handle, HttpError, verifyLogin } from "@/lib/auth";
import { body, str } from "@/lib/http";

export const runtime = "nodejs";

// Limite simple contre les essais de mots de passe en rafale (par e-mail, en mémoire)
const attempts = new Map<string, { n: number; until: number }>();

export const POST = handle(async (req: Request) => {
  const b = await body(req);
  const email = str(b.email, "E-mail", { max: 200 }).toLowerCase();
  const password = str(b.password, "Mot de passe", { max: 200 });

  const a = attempts.get(email);
  if (a && a.n >= 5 && a.until > Date.now()) {
    throw new HttpError(429, "Trop de tentatives. Réessaie dans quelques minutes.");
  }
  const user = await verifyLogin(email, password);
  if (!user) {
    const cur = a && a.until > Date.now() ? a : { n: 0, until: 0 };
    attempts.set(email, { n: cur.n + 1, until: Date.now() + 10 * 60_000 });
    throw new HttpError(401, "E-mail ou mot de passe incorrect.");
  }
  attempts.delete(email);
  await createSession(user.id);
  return Response.json({ ok: true });
});

import { handle, hashPassword, HttpError, requireAdmin } from "@/lib/auth";
import { body, str } from "@/lib/http";
import { one, q } from "@/lib/db";
import { DEFAULT_COMPANY_CONTEXT } from "@/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireAdmin();
  const users = await q(
    `SELECT u.id, u.email, u.name, u.role, u.monthly_budget_usd, u.active, u.created_at,
            COALESCE((SELECT SUM(cost_usd) FROM usage x WHERE x.user_id=u.id AND x.created_at >= date_trunc('month', now())),0) AS spent_month,
            COALESCE((SELECT SUM(web_searches) FROM usage x WHERE x.user_id=u.id AND x.created_at >= date_trunc('month', now())),0) AS searches_month,
            (SELECT count(*) FROM missions m WHERE m.user_id=u.id AND m.created_at >= date_trunc('month', now())) AS missions_month
       FROM users u ORDER BY u.created_at`,
  );
  const totals = await one(
    `SELECT COALESCE(SUM(cost_usd),0) AS cost_usd, COALESCE(SUM(web_searches),0) AS searches, count(*) AS calls
       FROM usage WHERE created_at >= date_trunc('month', now())`,
  );
  const byModel = await q(
    `SELECT model, SUM(cost_usd) AS cost_usd, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
       FROM usage WHERE created_at >= date_trunc('month', now()) GROUP BY model ORDER BY 2 DESC`,
  );
  return Response.json({ users, totals, byModel, usdToXof: Number(process.env.USD_TO_XOF || 600) });
});

function budget(v: unknown): number | null {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, "Budget invalide.");
  return Math.round(n * 100) / 100;
}

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body(req);
  const email = str(b.email, "E-mail", { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "E-mail invalide.");
  const name = str(b.name, "Nom", { min: 2, max: 80 });
  const password = str(b.password, "Mot de passe provisoire", { min: 10, max: 200 });
  const role = b.role === "admin" ? "admin" : "member";
  const context = str(b.companyContext, "Contexte", { max: 4000, optional: true });
  if (await one("SELECT 1 FROM users WHERE email=$1", [email])) throw new HttpError(409, "Un compte existe déjà avec cet e-mail.");
  const u = await one(
    `INSERT INTO users (email, name, password_hash, role, monthly_budget_usd, company_context)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, name, role, monthly_budget_usd, active`,
    [email, name, await hashPassword(password), role, budget(b.monthlyBudgetUsd), context || (role === "admin" ? DEFAULT_COMPANY_CONTEXT : "")],
  );
  return Response.json({ user: u });
});

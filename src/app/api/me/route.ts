import bcrypt from "bcryptjs";
import { handle, hashPassword, HttpError, requireUser } from "@/lib/auth";
import { body, str } from "@/lib/http";
import { one, q } from "@/lib/db";
import { budgetState } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await requireUser();
  const budget = await budgetState(user);
  const usage = await q(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            SUM(cost_usd) AS cost_usd, SUM(web_searches) AS searches, count(*) AS calls
       FROM usage WHERE user_id=$1 AND created_at >= date_trunc('month', now()) - interval '5 months'
      GROUP BY 1 ORDER BY 1`,
    [user.id],
  );
  return Response.json({ user, budget, usage, usdToXof: Number(process.env.USD_TO_XOF || 600) });
});

export const PATCH = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await body(req);
  if (b.name !== undefined) {
    await q("UPDATE users SET name=$2 WHERE id=$1", [user.id, str(b.name, "Nom", { min: 2, max: 80 })]);
  }
  if (b.companyContext !== undefined) {
    await q("UPDATE users SET company_context=$2 WHERE id=$1", [user.id, str(b.companyContext, "Contexte", { max: 4000, optional: true })]);
  }
  if (b.newPassword !== undefined) {
    const current = str(b.currentPassword, "Mot de passe actuel", { max: 200 });
    const next = str(b.newPassword, "Nouveau mot de passe", { min: 10, max: 200 });
    const row = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1", [user.id]);
    if (!row || !(await bcrypt.compare(current, row.password_hash))) throw new HttpError(400, "Mot de passe actuel incorrect.");
    await q("UPDATE users SET password_hash=$2 WHERE id=$1", [user.id, await hashPassword(next)]);
  }
  return Response.json({ ok: true });
});

import { handle, hashPassword, HttpError, requireAdmin } from "@/lib/auth";
import { body, isUuid, str, type Ctx } from "@/lib/http";
import { one, q } from "@/lib/db";

export const runtime = "nodejs";

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await one("SELECT 1 FROM users WHERE id=$1", [id]))) throw new HttpError(404, "Utilisateur introuvable.");
  const b = await body(req);
  const self = id === admin.id;

  if (b.name !== undefined) await q("UPDATE users SET name=$2 WHERE id=$1", [id, str(b.name, "Nom", { min: 2, max: 80 })]);
  if (b.role !== undefined) {
    if (self) throw new HttpError(400, "Tu ne peux pas changer ton propre rôle.");
    await q("UPDATE users SET role=$2 WHERE id=$1", [id, b.role === "admin" ? "admin" : "member"]);
  }
  if (b.active !== undefined) {
    if (self) throw new HttpError(400, "Tu ne peux pas désactiver ton propre compte.");
    await q("UPDATE users SET active=$2 WHERE id=$1", [id, Boolean(b.active)]);
    if (!b.active) await q("DELETE FROM sessions WHERE user_id=$1", [id]);
  }
  if (b.monthlyBudgetUsd !== undefined) {
    const v = b.monthlyBudgetUsd;
    let n: number | null = null;
    if (v !== null && v !== "") {
      n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, "Budget invalide.");
    }
    await q("UPDATE users SET monthly_budget_usd=$2 WHERE id=$1", [id, n]);
  }
  if (b.companyContext !== undefined) {
    await q("UPDATE users SET company_context=$2 WHERE id=$1", [id, str(b.companyContext, "Contexte", { max: 4000, optional: true })]);
  }
  if (b.password !== undefined) {
    await q("UPDATE users SET password_hash=$2 WHERE id=$1", [id, await hashPassword(str(b.password, "Mot de passe", { min: 10, max: 200 }))]);
    if (!self) await q("DELETE FROM sessions WHERE user_id=$1", [id]);
  }
  return Response.json({ ok: true });
});

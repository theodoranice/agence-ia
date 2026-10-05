import "server-only";
import { one } from "./db";
import { HttpError, type User } from "./auth";

export async function spentThisMonth(userId: string): Promise<number> {
  const row = await one<{ s: string | null }>(
    "SELECT COALESCE(SUM(cost_usd),0) AS s FROM usage WHERE user_id = $1 AND created_at >= date_trunc('month', now())",
    [userId],
  );
  return Number(row?.s ?? 0);
}

export async function budgetState(user: Pick<User, "id" | "monthly_budget_usd">) {
  const spent = await spentThisMonth(user.id);
  const budget = user.monthly_budget_usd == null ? null : Number(user.monthly_budget_usd);
  return { spent, budget, remaining: budget == null ? null : Math.max(0, budget - spent) };
}

export async function assertBudget(user: Pick<User, "id" | "monthly_budget_usd">) {
  const { budget, spent } = await budgetState(user);
  if (budget != null && spent >= budget) {
    throw new HttpError(402, `Budget mensuel atteint (${spent.toFixed(2)} $ sur ${budget.toFixed(2)} $). Il se renouvelle le 1er du mois, ou l'administrateur peut l'augmenter.`);
  }
}

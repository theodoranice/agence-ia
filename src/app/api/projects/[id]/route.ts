import { handle, HttpError, requireUser } from "@/lib/auth";
import { body, isUuid, str, type Ctx } from "@/lib/http";
import { one, q } from "@/lib/db";

export const runtime = "nodejs";

async function owned(id: string, userId: string) {
  if (!isUuid(id)) return null;
  return one("SELECT id FROM projects WHERE id=$1 AND user_id=$2", [id, userId]);
}

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!(await owned(id, user.id))) throw new HttpError(404, "Projet introuvable.");
  const b = await body(req);
  const name = str(b.name, "Nom", { min: 2, max: 80 });
  const description = str(b.description, "Description", { max: 3000, optional: true });
  await q("UPDATE projects SET name=$2, description=$3 WHERE id=$1", [id, name, description]);
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!(await owned(id, user.id))) throw new HttpError(404, "Projet introuvable.");
  await q("DELETE FROM projects WHERE id=$1", [id]);
  return Response.json({ ok: true });
});

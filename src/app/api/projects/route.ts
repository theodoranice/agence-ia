import { handle, requireUser } from "@/lib/auth";
import { body, str } from "@/lib/http";
import { one, q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await requireUser();
  const projects = await q(
    `SELECT p.id, p.name, p.description, p.created_at,
            (SELECT count(*) FROM missions m WHERE m.project_id=p.id) AS missions
       FROM projects p WHERE p.user_id=$1 ORDER BY p.name`,
    [user.id],
  );
  return Response.json({ projects });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await body(req);
  const name = str(b.name, "Nom", { min: 2, max: 80 });
  const description = str(b.description, "Description", { max: 3000, optional: true });
  const p = await one("INSERT INTO projects (user_id, name, description) VALUES ($1,$2,$3) RETURNING id, name, description", [user.id, name, description]);
  return Response.json({ project: p });
});

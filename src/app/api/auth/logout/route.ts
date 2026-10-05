import { destroySession, handle } from "@/lib/auth";

export const runtime = "nodejs";

export const POST = handle(async () => {
  await destroySession();
  return Response.json({ ok: true });
});

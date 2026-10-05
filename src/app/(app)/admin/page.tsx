import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const u = await currentUser();
  if (!u || u.role !== "admin") redirect("/agents");
  return <AdminPanel meId={u.id} />;
}

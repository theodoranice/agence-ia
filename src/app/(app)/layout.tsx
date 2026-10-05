import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { budgetState } from "@/lib/quota";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const budget = await budgetState(user);
  return (
    <Shell user={{ name: user.name, role: user.role }} budget={{ spent: budget.spent, budget: budget.budget }}>
      {children}
    </Shell>
  );
}

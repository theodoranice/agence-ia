"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  user: { name: string; role: string };
  budget: { spent: number; budget: number | null };
  children: React.ReactNode;
};

const LINKS = [
  { href: "/agents", label: "Agents" },
  { href: "/orchestrateur", label: "Orchestrateur" },
  { href: "/missions", label: "Missions" },
  { href: "/studio", label: "Studio" },
  { href: "/projets", label: "Projets" },
  { href: "/compte", label: "Compte" },
];

export default function Shell({ user, budget, children }: Props) {
  const path = usePathname();
  const links = user.role === "admin" ? [...LINKS, { href: "/admin", label: "Administration" }] : LINKS;
  const pct = budget.budget ? Math.min(100, (budget.spent / budget.budget) * 100) : 0;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <>
      <header className="bar">
        <div className="bar-in">
          <Link href="/agents" className="brand">
            <b>Agence IA</b>
            <span>{process.env.NEXT_PUBLIC_BRAND || "Tech Teranga"}</span>
          </Link>
          <nav className="nav" aria-label="Navigation principale">
            {links.map((l) => (
              <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="me">
            <div className="meter" title="Dépense du mois">
              <span>
                {budget.spent.toFixed(2)} ${budget.budget != null ? ` / ${budget.budget.toFixed(2)} $` : " ce mois"}
              </span>
              {budget.budget != null && (
                <div className="meter-bar">
                  <span className={pct >= 100 ? "full" : pct >= 80 ? "warn" : ""} style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
            <span className="me-name">{user.name}</span>
            <button type="button" className="btn sm ghost" onClick={logout}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="page enter" key={path.split("/")[1] || "home"}>
        {children}
      </main>
    </>
  );
}

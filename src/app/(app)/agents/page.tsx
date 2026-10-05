import { Suspense } from "react";
import Workspace from "./Workspace";

export default function AgentsPage() {
  return (
    <Suspense fallback={<p className="muted">Chargement…</p>}>
      <Workspace />
    </Suspense>
  );
}

import { Suspense } from "react";
import Workspace from "./Workspace";
import Skeleton from "@/components/Skeleton";

export default function AgentsPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Workspace />
    </Suspense>
  );
}

import { Suspense } from "react";
import NewVideoForm from "./NewVideoForm";
import Skeleton from "@/components/Skeleton";

export default function NewVideoPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <NewVideoForm />
    </Suspense>
  );
}

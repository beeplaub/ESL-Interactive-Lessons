import { CardGridSkeleton } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <CardGridSkeleton count={6} />
    </main>
  );
}

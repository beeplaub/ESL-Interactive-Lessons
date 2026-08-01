import { Bone } from "@/components/loading/Skeleton";

/**
 * AdminShell (app/admin/layout.tsx) stays mounted around this fallback,
 * so only the builder's own content area needs a skeleton here.
 */
export default function Loading() {
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
      <div className="hidden flex-col gap-2 rounded-2xl border border-gray-200 bg-surface p-3 lg:flex">
        <Bone className="h-4 w-20" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-surface p-5">
        <Bone className="h-5 w-40" />
        <Bone className="mt-4 h-48 w-full rounded-xl" />
        <Bone className="mt-4 h-4 w-2/3" />
        <Bone className="mt-2 h-4 w-1/2" />
      </div>
      <div className="hidden flex-col gap-3 rounded-2xl border border-gray-200 bg-surface p-4 lg:flex">
        <Bone className="h-4 w-24" />
        <Bone className="h-24 w-full rounded-xl" />
        <Bone className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}

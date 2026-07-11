import { Bone } from "@/components/loading/Skeleton";

/**
 * AdminShell (app/admin/layout.tsx) stays mounted; this covers every
 * admin route that doesn't define a more specific loading.tsx of its own
 * (e.g. app/admin/lessons/[id]/builder/loading.tsx overrides this one).
 */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <Bone className="h-6 w-40" />
        <Bone className="h-9 w-28 rounded-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="grid gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

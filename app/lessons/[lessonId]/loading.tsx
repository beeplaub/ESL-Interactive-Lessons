import { Bone, LearnerShellSkeleton } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <LearnerShellSkeleton showRightSidebar={false}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Bone className="h-4 w-40" />
          <Bone className="h-4 w-16" />
        </div>
        <div className="rounded-[24px] border border-[var(--br-surface-strong)] bg-white p-6">
          <Bone className="h-7 w-2/3" />
          <Bone className="mt-4 h-4 w-full" />
          <Bone className="mt-2 h-4 w-5/6" />
          <Bone className="mt-2 h-4 w-3/6" />
          <Bone className="mt-8 h-48 w-full rounded-[18px]" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Bone className="h-11 w-24 rounded-xl" />
          <Bone className="h-2 w-1/3 rounded-full" />
          <Bone className="h-11 w-24 rounded-xl" />
        </div>
      </div>
    </LearnerShellSkeleton>
  );
}

import { Bone, LearnerShellSkeleton, PanelSkeleton } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <LearnerShellSkeleton showRightSidebar={false}>
      <div className="grid gap-5">
        <div className="grid grid-cols-1 gap-6 rounded-[24px] border border-[var(--br-surface-strong)] bg-surface p-5 min-[1130px]:grid-cols-[340px_minmax(0,1fr)]">
          <Bone className="h-[230px] w-full rounded-[18px] sm:h-[280px] min-[1130px]:h-full" />
          <div className="flex flex-col justify-center gap-3 py-1">
            <Bone className="h-5 w-24 rounded-md" />
            <Bone className="h-8 w-2/3" />
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-3/4" />
            <Bone className="mt-2 h-11 w-40 rounded-xl" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <PanelSkeleton />
          <PanelSkeleton />
        </div>
      </div>
    </LearnerShellSkeleton>
  );
}

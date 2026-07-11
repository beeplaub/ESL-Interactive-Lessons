import { Bone, CardGridSkeleton, LearnerShellSkeleton, PanelSkeleton } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <LearnerShellSkeleton showRightSidebar>
      <div className="grid gap-5">
        <div className="flex items-center justify-between gap-3">
          <Bone className="h-7 w-64" />
        </div>
        <CardGridSkeleton count={3} />
        <PanelSkeleton />
      </div>
    </LearnerShellSkeleton>
  );
}

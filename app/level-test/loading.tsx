import { HeroSkeleton, LearnerShellSkeleton, PanelSkeleton, Bone } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <LearnerShellSkeleton showRightSidebar>
      <div className="grid gap-5">
        <HeroSkeleton />
        <PanelSkeleton />
        <div className="grid gap-3 sm:grid-cols-2">
          <Bone className="h-28 rounded-[18px]" />
          <Bone className="h-28 rounded-[18px]" />
        </div>
      </div>
    </LearnerShellSkeleton>
  );
}

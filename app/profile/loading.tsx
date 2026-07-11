import { HeroSkeleton, LearnerShellSkeleton, PanelSkeleton } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <LearnerShellSkeleton showRightSidebar>
      <div className="grid gap-5">
        <HeroSkeleton />
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    </LearnerShellSkeleton>
  );
}

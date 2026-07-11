import { HeroSkeleton, LearnerShellSkeleton, PanelSkeleton } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <LearnerShellSkeleton showRightSidebar>
      <div className="grid gap-5">
        <HeroSkeleton />
        <div className="grid gap-4 sm:grid-cols-2">
          <PanelSkeleton />
          <PanelSkeleton />
        </div>
      </div>
    </LearnerShellSkeleton>
  );
}

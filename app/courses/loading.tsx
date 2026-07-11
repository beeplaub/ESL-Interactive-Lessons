import { CardGridSkeleton, HeroSkeleton, LearnerShellSkeleton } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <LearnerShellSkeleton showRightSidebar>
      <div className="grid gap-5">
        <HeroSkeleton />
        <CardGridSkeleton count={6} />
      </div>
    </LearnerShellSkeleton>
  );
}

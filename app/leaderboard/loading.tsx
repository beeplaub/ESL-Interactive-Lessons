import { HeroSkeleton, LearnerShellSkeleton, CardListSkeleton } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <LearnerShellSkeleton showRightSidebar>
      <div className="grid gap-5">
        <HeroSkeleton />
        <CardListSkeleton count={6} />
      </div>
    </LearnerShellSkeleton>
  );
}

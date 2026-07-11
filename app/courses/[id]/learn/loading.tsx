import { Bone, CardListSkeleton, LearnerShellSkeleton } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <LearnerShellSkeleton showRightSidebar={false}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Bone className="h-4 w-40" />
        <Bone className="h-7 w-2/3" />
        <CardListSkeleton count={5} />
      </div>
    </LearnerShellSkeleton>
  );
}

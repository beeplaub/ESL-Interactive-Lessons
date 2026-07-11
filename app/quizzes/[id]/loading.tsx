import { Bone, LearnerShellSkeleton } from "@/components/loading/Skeleton";

export default function Loading() {
  return (
    <LearnerShellSkeleton showRightSidebar>
      <div className="flex flex-col gap-4">
        <div className="rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-5 sm:p-7">
          <div className="animate-pulse space-y-3">
            <Bone className="h-5 w-28 bg-white/10" />
            <Bone className="h-7 w-1/2 bg-white/10" />
            <Bone className="h-4 w-1/3 bg-white/10" />
          </div>
        </div>
        <div className="rounded-[22px] border border-[#ECECF5] bg-white p-6">
          <Bone className="h-4 w-24" />
          <Bone className="mt-5 h-5 w-3/4" />
          <div className="mt-5 grid gap-2.5">
            <Bone className="h-12 w-full rounded-xl" />
            <Bone className="h-12 w-full rounded-xl" />
            <Bone className="h-12 w-full rounded-xl" />
            <Bone className="h-12 w-full rounded-xl" />
          </div>
          <div className="mt-6 flex justify-end">
            <Bone className="h-11 w-28 rounded-xl" />
          </div>
        </div>
      </div>
    </LearnerShellSkeleton>
  );
}

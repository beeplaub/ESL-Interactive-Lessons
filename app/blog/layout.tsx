import { LearnerAppShell } from "@/components/LearnerAppShell";

/** The Journal is public, but it still belongs inside BrenUp's learner shell. */
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <LearnerAppShell active="journal" showRightSidebar={false} contentClassName="flex flex-col gap-5">{children}</LearnerAppShell>;
}

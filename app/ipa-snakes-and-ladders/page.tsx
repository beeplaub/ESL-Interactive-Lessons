import type { Metadata } from "next";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { IpaSnakesAndLaddersGame } from "@/components/games/IpaSnakesAndLaddersGame";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "IPA Snakes and Ladders | BrenUp",
  description: "Practice IPA with a sound-themed snakes and ladders game.",
};

export default async function IpaSnakesAndLaddersPage() {
  const { user } = await requireUser();

  return (
    <LearnerAppShell
      active="games"
      showRightSidebar={false}
      contentClassName="flex flex-col gap-4"
      breadcrumbs={[
        { label: "Home", href: "/account" },
        { label: "Games", href: "/games" },
        { label: "IPA Snakes and Ladders" },
      ]}
    >
      <IpaSnakesAndLaddersGame progressKey={`brenup:ipa-snakes-and-ladders:${user.id}:v1`} />
    </LearnerAppShell>
  );
}

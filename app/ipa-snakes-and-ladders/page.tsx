import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "IPA Snakes and Ladders | BrenUp",
  description: "Practice IPA with a sound-themed snakes and ladders game.",
};

export default async function IpaSnakesAndLaddersPage() {
  await requireUser();

  return (
    <iframe
      title="IPA Snakes and Ladders game"
      src="/ipa-snakes-and-ladders.html"
      className="fixed inset-0 z-[100] h-dvh w-screen border-0 bg-[#f5f6fa]"
      allow="autoplay"
    />
  );
}

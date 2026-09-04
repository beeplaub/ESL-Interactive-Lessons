import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getWordverseData } from "@/lib/wordverse";
import { WordverseExperience } from "@/components/WordverseExperience";

export const metadata: Metadata = {
  title: "Wordverse | BrenUp",
  description: "Explore the living universe of English vocabulary on BrenUp.",
};

export default async function WordversePage() {
  const { user } = await requireUser();
  const data = await getWordverseData(user.id);
  return <WordverseExperience {...data} />;
}

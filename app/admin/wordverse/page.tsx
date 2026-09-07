import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { wordversePages } from "@/lib/wordverse-pages";
import type { AuthoringData } from "@/lib/wordverse-authoring";
import { WordverseManager } from "./manager";

export default async function Page() {
  await requireAdmin();
  const admin = createAdminClient();
  const [topics, words, relationships] = await Promise.all([
    wordversePages((a,b) => admin.from("wordverse_topics").select("*").order("position").order("id").range(a,b)),
    wordversePages((a,b) => admin.from("wordverse_words").select("*").order("word").order("id").range(a,b)),
    wordversePages((a,b) => admin.from("wordverse_relationships").select("*").order("id").range(a,b)),
  ]);
  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Wordverse studio</h1><p className="mt-2 text-sm text-muted">Create galaxies, build word planets, and connect their meanings.</p></div><div className="flex gap-4 text-sm underline"><Link href="/admin/wordverse/import">Import Oxford pack</Link><Link href="/wordverse">Open learner universe</Link></div></header>
    <WordverseManager data={{ topics, words, relationships } as AuthoringData} />
  </div>;
}

import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { wordversePages } from "@/lib/wordverse-pages";
import type { WordverseWord, WordverseTopic, WordverseRelationship } from "@/lib/wordverse";
import Preview from "./preview";

export default async function Page({ searchParams }: { searchParams: Promise<{word?: string}> }) {
  await requireAdmin();
  const {word} = await searchParams;
  const admin = createAdminClient();
  const [topics,words,relationships] = await Promise.all([
    wordversePages((a,b) => admin.from("wordverse_topics").select("*").neq("status","ARCHIVED").order("position").order("id").range(a,b)),
    wordversePages((a,b) => admin.from("wordverse_words").select("*").neq("status","ARCHIVED").order("id").range(a,b)),
    wordversePages((a,b) => admin.from("wordverse_relationships").select("*").order("id").range(a,b)),
  ]);
  const visible = words.filter(w => topics.some(t => t.id===w.topic_id));
  const ids = new Set(visible.map(w=>w.id));
  return <><div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4 text-sm"><span>Admin preview · includes saved drafts · practice does not save learner progress</span><Link className="underline" href="/admin/wordverse">Back to studio</Link></div><Preview initialWordId={word} topics={topics as WordverseTopic[]} words={visible as WordverseWord[]} relationships={relationships.filter(r=>ids.has(r.source_word_id)&&ids.has(r.target_word_id)) as WordverseRelationship[]}/></>;
}

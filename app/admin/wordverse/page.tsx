import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { wordversePages } from "@/lib/wordverse-pages";
import { validateWordversePack, type WordverseContent } from "@/lib/wordverse-content";
import pack from "@/content/wordverse/balanced-advanced.json";
import membership from "@/content/wordverse/oxford-membership.json";
import { WordverseEditor } from "./editor";

export default async function Page() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: topics, error }, words] = await Promise.all([
    admin.from("wordverse_topics").select("id,slug,name").order("position"),
    wordversePages((from, to) => admin.from("wordverse_words").select("*").order("id").range(from, to)),
  ]);
  if (error || !topics) throw new Error("Could not load Wordverse content.");
  const entries = validateWordversePack(pack, membership).map(entry => {
    const stored = words.find(w => w.slug === entry.slug);
    const content = { ...entry };
    if (stored) {
      for (const key of Object.keys(entry) as (keyof WordverseContent)[]) {
        if (key !== "topic_slug" && key !== "related_slugs") Object.assign(content, { [key]: stored[key] });
      }
      content.topic_slug = topics.find(t => t.id === stored.topic_id)?.slug ?? entry.topic_slug;
    }
    return { content, id: stored?.id ?? null, status: stored?.status ?? "NOT_IMPORTED" };
  });
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Wordverse vocabulary</h1><p className="mt-2 text-sm text-muted">Review real vocabulary, save drafts, and publish connected word planets.</p></div><Link className="rounded-lg border border-[var(--br-border)] bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-40" href="/wordverse">Open Wordverse</Link></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{topics.map(t => <div key={t.id} className="rounded-xl border border-[var(--br-border)] bg-surface p-4"><p className="text-sm text-muted">{t.name}</p><p className="mt-1 text-2xl font-semibold">{words.filter(w => w.topic_id === t.id && w.status === "PUBLISHED").length}<span className="ml-2 text-xs font-normal text-muted">published · target 100</span></p></div>)}</div>
    <div className="rounded-xl border border-[var(--br-border)] bg-surface p-4 text-sm"><p>This pack adds 80 words to each smaller galaxy. Its 240 headwords and CEFR levels were checked against the <a className="underline" href="https://www.oxfordlearnersdictionaries.com/external/pdf/wordlists/oxford-3000-5000/The_Oxford_5000.pdf" target="_blank" rel="noreferrer">Oxford 5000 advanced extension</a>. Teaching metadata is original and editable. Unknown fields stay empty.</p><p className="mt-2 text-muted">The advanced extension contains 2,000 words. This pack covers 240; existing entries have not all been verified against that list. Existing words and learner progress are preserved.</p></div>
    <WordverseEditor entries={entries} topics={topics} />
  </div>;
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WordverseContent } from "@/lib/wordverse-content";
import { importWordverseDrafts, publishWordverseDrafts, saveWordverseDraft } from "./actions";

type Entry = { content: WordverseContent; id: string | null; status: string };
const arrayFields = ["examples", "collocations", "word_family", "grammar_patterns", "synonyms", "antonyms", "common_mistakes"] as const;
const optionalFields = ["pronunciation", "translation", "register", "origin", "audio_url"] as const;
function cleanContent(word: WordverseContent) {
  const clean = { ...word };
  for (const key of arrayFields) clean[key] = clean[key].map(s => s.trim()).filter(Boolean);
  return clean;
}
const label = (key: string) => key.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());

export function WordverseEditor({ entries, topics }: { entries: Entry[]; topics: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, WordverseContent>>({});
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(entries[0]?.content.slug ?? "");
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const current = entries.find(e => e.content.slug === selected);
  const word = current ? edits[selected] ?? current.content : null;
  const drafts = entries.filter(e => e.status === "DRAFT");
  const editable = current?.status === "DRAFT" || current?.status === "NOT_IMPORTED";
  const change = (value: Partial<WordverseContent>) => {
    if (!word) return;
    setEdits(prev => ({ ...prev, [selected]: { ...word, ...value } }));
    setReviewed(false);
  };
  const run = (action: () => Promise<{ message: string }>, clearEdits = false) => {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.message);
        if (clearEdits) setEdits({});
        setReviewed(false);
        router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "The action failed. Your edits remain here."); }
    });
  };
  const missing = entries.filter(e => e.status === "NOT_IMPORTED");
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <button className="rounded-lg bg-dark px-4 py-2 text-sm font-semibold text-on-dark disabled:opacity-40" disabled={pending} onClick={() => run(async () => {
        const result = await importWordverseDrafts(entries.map(e => cleanContent(edits[e.content.slug] ?? e.content)));
        setEdits(prev => Object.fromEntries(Object.entries(prev).filter(([slug]) => !missing.some(e => e.content.slug === slug))));
        return result;
      })}>Save pack as drafts{missing.length ? ` (${missing.length} new)` : " / repair links"}</button>
      <span className="text-sm text-muted">{drafts.length} saved drafts · {entries.filter(e => e.status === "PUBLISHED").length} published from this pack</span>
    </div>
    <p role="status" className="min-h-5 text-sm">{pending ? "Saving…" : message}</p>
    <div className="grid gap-4 md:grid-cols-[230px_1fr]">
      <div className="rounded-xl border border-[var(--br-border)] bg-surface p-3"><input className="rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-strong w-full" aria-label="Find a word in the pack" placeholder="Find a word…" value={query} onChange={e => setQuery(e.target.value)} /><div className="mt-3 max-h-[650px] space-y-1 overflow-y-auto">{entries.filter(e => e.content.word.includes(query.trim().toLowerCase())).map(e => <button key={e.content.slug} aria-pressed={selected === e.content.slug} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected === e.content.slug ? "bg-surface-muted text-strong" : "hover:bg-surface-muted"}`} onClick={() => setSelected(e.content.slug)}><span className="block font-medium">{e.content.word}</span><span className="text-xs text-muted">{e.content.cefr_level} · {e.status === "NOT_IMPORTED" ? "Not imported" : e.status.toLowerCase()}</span></button>)}</div></div>
      {word && current ? <div className="rounded-xl border border-[var(--br-border)] bg-surface p-5">
        <div className="mb-4"><h2 className="text-xl font-semibold">{word.word}</h2><p className="text-sm text-muted">{word.word_class} · {word.cefr_level} · {topics.find(t => t.slug === word.topic_slug)?.name}</p></div>
        <fieldset disabled={pending || !editable} className="space-y-4">
          <label className="block text-sm">Definition<textarea className="rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-strong mt-1 min-h-20 w-full" value={word.definition} onChange={e => change({ definition: e.target.value })} /></label>
          {arrayFields.map(key => <label key={key} className="block text-sm">{label(key)} <span className="text-xs text-muted">(one per line)</span><textarea className="rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-strong mt-1 min-h-16 w-full" value={word[key].join("\n")} onChange={e => change({ [key]: e.target.value.split("\n") })} /></label>)}
          <details><summary className="cursor-pointer text-sm font-medium">Additional metadata</summary><div className="mt-4 space-y-4">{optionalFields.map(key => <label key={key} className="block text-sm">{label(key)}<textarea className="rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-strong mt-1 w-full" value={word[key] ?? ""} onChange={e => change({ [key]: e.target.value || null })} /></label>)}</div></details>
        </fieldset>
        <p className="mt-4 text-sm text-muted">Related word connections: {word.related_slugs.join(", ")}</p>
        {current.status === "DRAFT" && current.id ? <button className="rounded-lg border border-[var(--br-border)] bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-40 mt-4" disabled={pending} onClick={() => run(async () => {
          const result = await saveWordverseDraft(current.id!, cleanContent(word));
          setEdits(prev => { const next = { ...prev }; delete next[selected]; return next; });
          return result;
        })}>Save this draft</button> : <p className="mt-4 text-xs text-muted">{current.status === "NOT_IMPORTED" ? "Save the pack to create editable database drafts." : "Published entries are preserved by this import workflow."}</p>}
      </div> : null}
    </div>
    <div className="space-y-3 rounded-xl border border-[var(--br-border)] bg-surface p-5">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={pending || !drafts.length} onChange={e => setReviewed(e.target.checked)} />I have reviewed the saved drafts and want to publish them to Wordverse.</label>
      <p className="text-xs text-muted">Save any edited drafts first. Publication checks stored metadata and requires every word to connect to the published network.</p>
      <button className="rounded-lg bg-dark px-4 py-2 text-sm font-semibold text-on-dark disabled:opacity-40" disabled={pending || !reviewed || !drafts.length || Object.keys(edits).length > 0} onClick={() => run(() => publishWordverseDrafts(drafts.map(e => e.id!)), true)}>Publish {drafts.length} reviewed words</button>
    </div>
  </section>;
}

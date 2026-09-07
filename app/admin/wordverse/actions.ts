"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { wordversePages } from "@/lib/wordverse-pages";
import { validateWordversePack, type WordverseContent } from "@/lib/wordverse-content";
import pack from "@/content/wordverse/balanced-advanced.json";
import membership from "@/content/wordverse/oxford-membership.json";

function fields(word: WordverseContent, topicId: string) {
  const { topic_slug: _topic, related_slugs: _related, ...content } = word;
  void _topic; void _related;
  return { ...content, topic_id: topicId };
}

export async function importWordverseDrafts(input: unknown) {
  await requireAdmin();
  const words = validateWordversePack(input, membership);
  const admin = createAdminClient();
  const { data: topics, error: topicError } = await admin.from("wordverse_topics").select("id,slug");
  if (topicError || !topics) throw new Error("Could not load topics. No words were imported.");
  const topicIds = new Map(topics.map(t => [t.slug, t.id]));
  const existing = await wordversePages((from, to) => admin.from("wordverse_words").select("id,slug,status").order("id").range(from, to));
  const available = new Set(existing.filter(w => w.status === "PUBLISHED").map(w => w.slug));
  for (const word of words) {
    if (!topicIds.has(word.topic_slug)) throw new Error(`Unknown topic: ${word.topic_slug}`);
    if (existing.some(w => w.slug === word.slug && w.status === "ARCHIVED")) throw new Error(`Restore the archived word separately: ${word.slug}`);
    available.add(word.slug);
  }
  for (const word of words) for (const related of word.related_slugs) {
    if (!available.has(related)) throw new Error(`Missing published or imported connection: ${word.slug} → ${related}`);
  }
  // Ignore conflicts: preserve existing IDs, creator edits and publishing state.
  const { error } = await admin.from("wordverse_words").upsert(
    words.map(w => ({ ...fields(w, topicIds.get(w.topic_slug)!), status: "DRAFT", frequency_score: 50 })),
    { onConflict: "slug", ignoreDuplicates: true },
  );
  if (error) throw new Error("Could not save the vocabulary drafts.");
  const records = await wordversePages((from, to) => admin.from("wordverse_words").select("id,slug,status").order("id").range(from, to));
  const bySlug = new Map(records.map(w => [w.slug, w]));
  const links = words.filter(w => bySlug.get(w.slug)?.status === "DRAFT").flatMap(w => w.related_slugs.map(slug => ({
    source_word_id: bySlug.get(w.slug)!.id,
    target_word_id: bySlug.get(slug)!.id,
    relationship_type: "RELATED",
    strength: 60,
  })));
  if (links.length) {
    const { error: linkError } = await admin.from("wordverse_relationships").upsert(links, { onConflict: "source_word_id,target_word_id,relationship_type", ignoreDuplicates: true });
    if (linkError) throw new Error("Drafts were saved, but connections failed. Import again to retry before publishing.");
  }
  revalidatePath("/admin/wordverse");
  return { message: "Drafts and real word connections saved. Existing entries were preserved." };
}

export async function saveWordverseDraft(id: string, input: unknown) {
  await requireAdmin();
  z.string().uuid().parse(id);
  const [word] = validateWordversePack([input], membership);
  const admin = createAdminClient();
  const { data: topic, error: topicError } = await admin.from("wordverse_topics").select("id").eq("slug", word.topic_slug).single();
  if (topicError || !topic) throw new Error("Unknown vocabulary topic.");
  const { data, error } = await admin.from("wordverse_words").update({ ...fields(word, topic.id), updated_at: new Date().toISOString() }).eq("id", id).eq("slug", word.slug).eq("status", "DRAFT").select("id");
  if (error || data?.length !== 1) throw new Error("This draft could not be saved. Refresh to check whether it was published elsewhere.");
  revalidatePath("/admin/wordverse");
  return { message: `Saved ${word.word}.` };
}

export async function enrichWordverseDraftMetadata() {
  await requireAdmin();
  const words = validateWordversePack(pack, membership);
  const admin = createAdminClient();
  const metadata = words.map(word => ({
    slug: word.slug,
    translation: word.translation,
    register: word.register,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    word_family: word.word_family,
    common_mistakes: word.common_mistakes,
    pronunciation: word.pronunciation,
    origin: word.origin,
  }));
  let updated = 0;
  for (const item of metadata) {
    const { data, error } = await admin.from("wordverse_words").update({
      translation: item.translation,
      register: item.register,
      synonyms: item.synonyms,
      antonyms: item.antonyms,
      word_family: item.word_family,
      common_mistakes: item.common_mistakes,
      pronunciation: item.pronunciation,
      origin: item.origin,
      updated_at: new Date().toISOString(),
    }).eq("slug", item.slug).eq("status", "DRAFT").select("id");
    if (error) throw new Error(`Could not enrich ${item.slug}. No draft was published.`);
    updated += data?.length ?? 0;
  }
  revalidatePath("/admin/wordverse");
  revalidatePath("/wordverse");
  return { message: `Enriched ${updated} saved drafts with Bengali meanings and reviewed learner metadata.` };
}

export async function publishWordverseDrafts(input: unknown) {
  await requireAdmin();
  const ids = [...new Set(z.array(z.string().uuid()).min(1).max(500).parse(input))];
  const admin = createAdminClient();
  const { data: drafts, error } = await admin.from("wordverse_words").select("*").in("id", ids);
  if (error || drafts?.length !== ids.length || drafts.some(w => w.status !== "DRAFT")) throw new Error("Some selected drafts changed. Refresh before publishing.");
  const { data: topics, error: topicError } = await admin.from("wordverse_topics").select("id,slug");
  if (topicError || !topics) throw new Error("Could not validate vocabulary topics.");
  const links = await wordversePages((from, to) => admin.from("wordverse_relationships").select("source_word_id,target_word_id").order("id").range(from, to));
  const published = await wordversePages((from, to) => admin.from("wordverse_words").select("id").eq("status", "PUBLISHED").order("id").range(from, to));
  // Every selected draft must be reachable from the real published network.
  const allowed = new Set([...published.map(w => w.id), ...ids]);
  const connected = new Set(published.map(w => w.id));
  const adjacency = new Map<string, string[]>();
  for (const link of links) if (allowed.has(link.source_word_id) && allowed.has(link.target_word_id)) {
    for (const [a, b] of [[link.source_word_id, link.target_word_id], [link.target_word_id, link.source_word_id]]) adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
  }
  const queue = [...connected];
  while (queue.length) for (const next of adjacency.get(queue.pop()!) ?? []) if (!connected.has(next)) { connected.add(next); queue.push(next); }
  for (const draft of drafts) {
    if (!connected.has(draft.id)) throw new Error(`Connect ${draft.word} to the published network before publishing.`);
    const topic = topics.find(t => t.id === draft.topic_id);
    // Validate stored metadata, never trust a client-supplied publishing state.
    const { id: _id, status: _status, topic_id: _topic, frequency_score: _frequency, created_at: _created, updated_at: _updated, ...content } = draft;
    void _id; void _status; void _topic; void _frequency; void _created; void _updated;
    validateWordversePack([{ ...content, topic_slug: topic?.slug, related_slugs: pack.find(w => w.slug === draft.slug)?.related_slugs }], membership);
  }
  const { data: saved, error: publishError } = await admin.from("wordverse_words").update({ status: "PUBLISHED", updated_at: new Date().toISOString() }).in("id", ids).eq("status", "DRAFT").select("id");
  if (publishError || saved?.length !== ids.length) throw new Error("Publication was not fully confirmed. Refresh to check the saved state.");
  revalidatePath("/wordverse");
  revalidatePath("/admin/wordverse");
  return { message: `Published ${saved.length} real words with their semantic connections.` };
}

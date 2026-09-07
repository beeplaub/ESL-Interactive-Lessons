"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorWordSchema, connectionSchema, galaxySchema, publicationIssues } from "@/lib/wordverse-authoring";

function refresh() {
  revalidatePath("/admin/wordverse", "layout");
  revalidatePath("/wordverse");
}
function failure(message: string) {
  if (/duplicate key/.test(message)) return "That slug or connection already exists. Choose a unique slug.";
  return message;
}
export async function saveManagedWord(input: unknown) {
  await requireAdmin();
  const request = z.object({ id: z.string().uuid().nullable(), expected: z.string().nullable(), word: authorWordSchema,
    links: z.array(connectionSchema).max(100), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }).strict().parse(input);
  const keys = request.links.map(l => `${l.target_word_id}:${l.relationship_type}`);
  if (new Set(keys).size !== keys.length) throw new Error("Remove duplicate connections before saving.");
  if (request.links.some(l => l.target_word_id === request.id)) throw new Error("A word cannot connect to itself.");
  if (request.status === "PUBLISHED") {
    const issues = publicationIssues(request.word);
    if (issues.length) throw new Error(issues.join(". "));
  }
  const { data, error } = await createAdminClient().rpc("wordverse_admin_save", {
    p_id: request.id, p_expected: request.expected, p_word: request.word, p_links: request.links, p_status: request.status,
  });
  if (error) throw new Error(failure(error.message));
  refresh();
  return { id: data as string, message: request.status === "PUBLISHED" ? "Published word and connections saved." : "Word and connections saved." };
}
export async function publishManagedWords(input: unknown) {
  await requireAdmin();
  const ids = z.array(z.string().uuid()).min(1).max(500).parse(input);
  const { data, error } = await createAdminClient().rpc("wordverse_admin_publish", { p_ids: [...new Set(ids)] });
  if (error) throw new Error(failure(error.message));
  refresh();
  return { message: `Published ${data} words and their connections.` };
}
export async function saveManagedGalaxy(input: unknown) {
  await requireAdmin();
  const { id, expected, galaxy } = z.object({ id: z.string().uuid().nullable(), expected: z.string().nullable(), galaxy: galaxySchema }).strict().parse(input);
  const admin = createAdminClient();
  const result = id
    ? await admin.from("wordverse_topics").update(galaxy).eq("id", id).eq("updated_at", expected).select("id").single()
    : await admin.from("wordverse_topics").insert(galaxy).select("id").single();
  if (result.error || !result.data) throw new Error(result.error?.code === "PGRST116" ? "This galaxy changed. Reload before saving." : failure(result.error?.message ?? "Could not save galaxy."));
  refresh();
  return { id: result.data.id as string, message: "Galaxy saved." };
}

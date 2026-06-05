"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const questionSchema = z.object({
  section: z.enum(["USE_OF_ENGLISH", "READING"]),
  cefr_band: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  question_text: z.string().min(4),
  option_a: z.string().min(1),
  option_b: z.string().min(1),
  option_c: z.string().min(1),
  option_d: z.string().optional(),
  correct_answer: z.enum(["A", "B", "C", "D"]),
  question_type: z.enum(["MCQ", "TRUE_FALSE"]),
  weight: z.coerce.number().min(0.5).max(2).default(1)
});

export async function createLevelTestQuestion(formData: FormData) {
  await requireAdmin();
  const parsed = questionSchema.parse(Object.fromEntries(formData));
  const admin = createAdminClient();
  await admin.from("level_test_questions").insert({
    ...parsed,
    option_d: parsed.option_d || null,
    reading_passage_id: null
  });
  revalidatePath("/admin/level-test/questions");
}

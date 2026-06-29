import { AlertTriangle } from "lucide-react";
import { LevelTestAdminWorkspace } from "@/components/LevelTestAdminWorkspace";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminLevelTestPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: test, error: testError } = await admin.from("level_tests").select("*").order("created_at").limit(1).maybeSingle();

  if (testError || !test) {
    return (
      <main className="rounded-[20px] border border-amber-200 bg-amber-50 p-6 text-amber-950">
        <AlertTriangle className="size-7" />
        <h1 className="mt-3 text-2xl font-extrabold">Level Test upgrade is ready</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6">
          Run <strong>supabase/migrations/023_configurable_level_tests.sql</strong> in the Supabase SQL Editor once. Then return here to manage the complete test.
        </p>
        {testError?.message ? <p className="mt-3 rounded-lg bg-white/70 p-3 text-xs">{testError.message}</p> : null}
      </main>
    );
  }

  const [{ data: sections }, { data: questions }, { data: passages }, { data: gradeBands }] = await Promise.all([
    admin.from("level_test_sections").select("*").eq("test_id", test.id).order("position"),
    admin.from("level_test_questions").select("*").eq("test_id", test.id).order("position"),
    admin.from("reading_passages").select("*").eq("test_id", test.id).order("position"),
    admin.from("level_test_grade_bands").select("*").eq("test_id", test.id).order("position")
  ]);

  return (
    <LevelTestAdminWorkspace
      test={test}
      sections={sections ?? []}
      questions={questions ?? []}
      passages={passages ?? []}
      gradeBands={gradeBands ?? []}
    />
  );
}

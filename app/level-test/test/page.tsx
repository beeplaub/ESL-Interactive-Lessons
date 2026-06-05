import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildLevelTest } from "@/lib/levelTestBank";
import { LevelTestRunner } from "@/components/LevelTestRunner";

export default async function LevelTestTakingPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent("/level-test/test")}`);

  const test = buildLevelTest();
  return <LevelTestRunner questions={test.questions} passages={test.passages} />;
}

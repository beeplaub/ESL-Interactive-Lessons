import { redirect } from "next/navigation";
import { LevelTestRunner } from "@/components/LevelTestRunner";
import { getPublishedLevelTest } from "@/lib/configurableLevelTest";
import { createClient } from "@/lib/supabase/server";

export default async function LevelTestTakingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/level-test/test")}`);

  const test = await getPublishedLevelTest();
  return (
    <LevelTestRunner
      testId={test.id}
      title={test.title}
      durationSeconds={test.durationSeconds}
      requireAllAnswers={test.requireAllAnswers}
      showQuestionNumbers={test.showQuestionNumbers}
      sections={test.sections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        passages: section.passages,
        questions: section.questions.map((question) => ({
          id: question.id,
          section: question.section,
          cefrBand: question.cefrBand,
          questionType: question.questionType,
          questionText: question.questionText,
          options: question.options,
          passageId: question.passageId
        }))
      }))}
    />
  );
}

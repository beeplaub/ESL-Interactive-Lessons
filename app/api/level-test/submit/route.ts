import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLevelTestForScoring, scoreConfigurableTest } from "@/lib/configurableLevelTest";
import { levelGuidance, type LevelAnswer } from "@/lib/levelTestBank";
import { notifyUser } from "@/lib/notifications";

export const runtime = "nodejs";

type SubmitBody = {
  testId?: string | null;
  questionIds?: string[];
  answers?: Record<string, LevelAnswer | string[]>;
  timeTakenSeconds?: number;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SubmitBody;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!Array.isArray(body.questionIds) || !body.answers) {
    return NextResponse.json({ error: "Invalid level test submission" }, { status: 400 });
  }

  const test = await getLevelTestForScoring(body.testId ?? null, body.questionIds);
  const score = scoreConfigurableTest(test, body.questionIds, body.answers);
  const admin = createAdminClient();
  const resultPayload = {
    user_id: user.id,
    test_id: test.id,
    raw_score: score.rawScore,
    weighted_score: score.weightedScore,
    cefr_level: score.cefrLevel,
    section_scores: score.sectionScores,
    answers: body.answers,
    total_questions: body.questionIds.length,
    maximum_weighted_score: score.maximumWeightedScore,
    percentage: score.percentage,
    test_snapshot: {
      title: test.title,
      gradeBand: score.gradeBand,
      sections: test.sections.map((section) => ({
        title: section.title,
        questionCount: section.questions.length
      }))
    },
    time_taken_seconds: Math.max(0, Math.round(body.timeTakenSeconds ?? 0))
  };

  let { data: result, error } = await admin.from("level_test_results").insert(resultPayload).select("*").single();
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    const legacyPayload = {
      user_id: user.id,
      raw_score: score.rawScore,
      weighted_score: score.weightedScore,
      cefr_level: score.cefrLevel,
      section_scores: score.sectionScores,
      answers: body.answers,
      time_taken_seconds: Math.max(0, Math.round(body.timeTakenSeconds ?? 0))
    };
    const legacyInsert = await admin.from("level_test_results").insert(legacyPayload).select("*").single();
    result = legacyInsert.data;
    error = legacyInsert.error;
  }
  if (error || !result) return NextResponse.json({ error: error?.message ?? "Could not save the result." }, { status: 500 });

  const { data: previousProfile } = await admin.from("profiles").select("cefr_level").eq("id", user.id).maybeSingle();
  await admin.from("profiles").update({ cefr_level: score.cefrLevel }).eq("id", user.id);
  if (previousProfile?.cefr_level !== score.cefrLevel) {
    await notifyUser({
      userId: user.id, type: "LEVEL_CHANGED", title: `Your English level is ${score.cefrLevel}`,
      detail: "Your latest level test result is ready with guidance for what to practise next.", href: `/level-test/result?resultId=${result.id}`,
      tone: "purple", dedupeKey: `level-changed:${user.id}:${result.id}`,
    });
  }

  return NextResponse.json({
    resultId: result.id,
    cefrLevel: score.cefrLevel,
    levelName: levelGuidance[score.cefrLevel].name
  });
}

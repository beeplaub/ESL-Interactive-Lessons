import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { levelGuidance, scoreLevelTest, type LevelAnswer } from "@/lib/levelTestBank";

export const runtime = "nodejs";

type SubmitBody = {
  questionIds?: string[];
  answers?: Record<string, LevelAnswer>;
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

  const score = scoreLevelTest(body.questionIds, body.answers);
  const admin = createAdminClient();
  const resultPayload = {
    user_id: user.id,
    raw_score: score.rawScore,
    weighted_score: score.weightedScore,
    cefr_level: score.cefrLevel,
    section_scores: score.sectionScores,
    answers: body.answers,
    time_taken_seconds: Math.max(0, Math.round(body.timeTakenSeconds ?? 0))
  };

  const { data: result, error } = await admin.from("level_test_results").insert(resultPayload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("profiles").update({ cefr_level: score.cefrLevel }).eq("id", user.id);

  return NextResponse.json({
    resultId: result.id,
    cefrLevel: score.cefrLevel,
    levelName: levelGuidance[score.cefrLevel].name
  });
}

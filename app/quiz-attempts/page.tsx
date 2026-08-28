import { Award } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { RecentQuizAttemptsClient, type QuizAttemptGroup, type QuizAttemptsSummary } from "@/components/RecentQuizAttemptsClient";

type AttemptRow = {
  id: string;
  quiz_id: string | null;
  legacy_quiz_attempt_id?: string | null;
  score: number;
  total: number;
  completed_at: string;
  time_taken_seconds: number | null;
  quizzes?: {
    title?: string | null;
    topic?: string | null;
    level?: string | null;
  } | Array<{
    title?: string | null;
    topic?: string | null;
    level?: string | null;
  }> | null;
};

type PlatformAttemptRow = {
  id?: string;
  legacy_quiz_attempt_id?: string | null;
  quiz_id: string | null;
  score: number;
  total: number;
  completed_at: string;
};

type PointsRow = { user_id: string; points: number | null };

function percent(score: number, total: number) {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

function trendLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildTrend(attempts: AttemptRow[], platformAttempts: PlatformAttemptRow[]) {
  const latest = attempts.slice(0, 5).reverse();
  return latest.map((attempt) => {
    const dayKey = attempt.completed_at.slice(0, 10);
    const sameDay = platformAttempts.filter((row) => row.completed_at?.slice(0, 10) === dayKey && row.total > 0);
    const classAverage = sameDay.length
      ? Math.round(sameDay.reduce((sum, row) => sum + percent(row.score, row.total), 0) / sameDay.length)
      : null;
    return {
      label: trendLabel(attempt.completed_at),
      value: percent(attempt.score, attempt.total),
      classAverage,
    };
  });
}

function buildRank(points: PointsRow[], userId: string) {
  const totals = new Map<string, number>();
  for (const row of points) {
    totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + Number(row.points ?? 0));
  }
  const ranked = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  const index = ranked.findIndex(([candidate]) => candidate === userId);
  return index >= 0 ? index + 1 : null;
}

export default async function QuizAttemptsPage() {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const [{ data: legacyAttempts }, { data: assessmentAttempts }, { data: points }] = await Promise.all([
    admin
      .from("quiz_attempts")
      .select("id,quiz_id,score,total,completed_at,time_taken_seconds,quizzes(title,topic,level)")
      .eq("user_id", user.id)
      .not("quiz_id", "is", null)
      .order("completed_at", { ascending: false }),
    admin
      .from("assessment_attempts")
      .select("id,quiz_id,legacy_quiz_attempt_id,score,maximum_score,completed_at,submitted_at,created_at,time_taken_seconds")
      .eq("user_id", user.id)
      .eq("source_type", "QUIZ")
      .not("quiz_id", "is", null)
      .order("completed_at", { ascending: false }),
    admin.from("quiz_leaderboard_points").select("user_id,points").limit(10000),
  ]);

  const linkedLegacyIds = new Set((assessmentAttempts ?? []).map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
  const legacyById = new Map((legacyAttempts ?? []).map((attempt) => [attempt.id, attempt]));
  const canonicalAttempts: AttemptRow[] = (assessmentAttempts ?? []).map((attempt) => ({
    id: attempt.legacy_quiz_attempt_id ?? attempt.id,
    quiz_id: attempt.quiz_id,
    score: Number(attempt.score ?? 0),
    total: Number(attempt.maximum_score ?? 0),
    completed_at: attempt.completed_at ?? attempt.submitted_at ?? attempt.created_at,
    time_taken_seconds: attempt.time_taken_seconds,
    quizzes: attempt.legacy_quiz_attempt_id ? legacyById.get(attempt.legacy_quiz_attempt_id)?.quizzes : null,
  }));
  const attempts: AttemptRow[] = [
    ...(legacyAttempts ?? []).filter((attempt) => !linkedLegacyIds.has(attempt.id)),
    ...canonicalAttempts,
  ].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  const quizIds = Array.from(new Set(attempts.map((attempt) => attempt.quiz_id).filter((id): id is string => Boolean(id))));
  const [{ data: questionCounts }, { data: platformAttempts }, { data: platformAssessmentAttempts }] = await Promise.all([
    quizIds.length ? admin.from("quiz_questions").select("quiz_id").in("quiz_id", quizIds) : Promise.resolve({ data: [] as { quiz_id: string }[] }),
    quizIds.length
      ? admin.from("quiz_attempts").select("id,quiz_id,score,total,completed_at").in("quiz_id", quizIds).not("quiz_id", "is", null).order("completed_at", { ascending: false }).limit(5000)
      : Promise.resolve({ data: [] as PlatformAttemptRow[] }),
    quizIds.length
      ? admin.from("assessment_attempts").select("id,quiz_id,score,maximum_score,completed_at,submitted_at,created_at,legacy_quiz_attempt_id").eq("source_type", "QUIZ").in("quiz_id", quizIds).not("user_id", "is", null).order("created_at", { ascending: false }).limit(5000)
      : Promise.resolve({ data: [] }),
  ]);

  const platformLinkedLegacyIds = new Set((platformAssessmentAttempts ?? []).map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
  const mergedPlatformAttempts: PlatformAttemptRow[] = [
    ...(platformAttempts ?? []).filter((attempt) => !platformLinkedLegacyIds.has(attempt.id ?? "")),
    ...(platformAssessmentAttempts ?? []).map((attempt) => ({
      quiz_id: attempt.quiz_id,
      score: Number(attempt.score ?? 0),
      total: Number(attempt.maximum_score ?? 0),
      completed_at: attempt.completed_at ?? attempt.submitted_at ?? attempt.created_at,
    })),
  ];

  const questionCountByQuiz = new Map<string, number>();
  for (const row of questionCounts ?? []) {
    questionCountByQuiz.set(row.quiz_id, (questionCountByQuiz.get(row.quiz_id) ?? 0) + 1);
  }

  const grouped = new Map<string, QuizAttemptGroup>();
  for (const attempt of attempts) {
    if (!attempt.quiz_id) continue;
    const quiz = Array.isArray(attempt.quizzes) ? attempt.quizzes[0] : attempt.quizzes;
    const current: QuizAttemptGroup = grouped.get(attempt.quiz_id) ?? {
      quizId: attempt.quiz_id,
      title: quiz?.title ?? "Quiz",
      topic: quiz?.topic ?? null,
      level: quiz?.level ?? null,
      questionCount: questionCountByQuiz.get(attempt.quiz_id) ?? attempt.total,
      attempts: [],
      bestPercent: 0,
      latestPercent: 0,
      averagePercent: 0,
      totalTimeSeconds: 0,
    };
    current.attempts.push({
      id: attempt.id,
      attemptNumber: 0,
      score: attempt.score,
      total: attempt.total,
      percent: percent(attempt.score, attempt.total),
      completedAt: attempt.completed_at,
      timeTakenSeconds: attempt.time_taken_seconds,
    });
    current.totalTimeSeconds += Number(attempt.time_taken_seconds ?? 0);
    grouped.set(attempt.quiz_id, current);
  }

  const groups = Array.from(grouped.values()).map((group) => {
    const chronological = [...group.attempts].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
    const attemptNumberById = new Map(chronological.map((attempt, index) => [attempt.id, index + 1]));
    const attemptsDescending = [...group.attempts]
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .map((attempt) => ({ ...attempt, attemptNumber: attemptNumberById.get(attempt.id) ?? 1 }));
    const percentages = attemptsDescending.map((attempt) => attempt.percent);
    return {
      ...group,
      attempts: attemptsDescending,
      latestPercent: attemptsDescending[0]?.percent ?? 0,
      bestPercent: percentages.length ? Math.max(...percentages) : 0,
      averagePercent: percentages.length ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length) : 0,
    };
  });

  const allAttempts = attempts;
  const allPercents = allAttempts.map((attempt) => percent(attempt.score, attempt.total));
  const totalTimeSeconds = allAttempts.reduce((sum, attempt) => sum + Number(attempt.time_taken_seconds ?? 0), 0);
  const summary: QuizAttemptsSummary = {
    totalAttempts: allAttempts.length,
    averagePercent: allPercents.length ? Math.round(allPercents.reduce((sum, value) => sum + value, 0) / allPercents.length) : 0,
    bestPercent: allPercents.length ? Math.max(...allPercents) : 0,
    totalTimeSeconds,
    rank: buildRank((points ?? []) as PointsRow[], user.id),
    trend: buildTrend(allAttempts, mergedPlatformAttempts),
    topics: Array.from(new Set(groups.map((group) => group.topic).filter((topic): topic is string => Boolean(topic)))).sort(),
    levels: Array.from(new Set(groups.map((group) => group.level).filter((level): level is string => Boolean(level)))).sort(),
  };

  return (
    <LearnerAppShell
      active="quizzes"
      showRightSidebar
      breadcrumbs={[
        { label: "Home", href: "/account" },
        { label: "Quizzes", href: "/quizzes" },
        { label: "Recent Attempts" },
      ]}
    >
      {groups.length ? (
        <RecentQuizAttemptsClient groups={groups} summary={summary} />
      ) : (
        <section className="grid min-h-[60vh] place-items-center rounded-[24px] border border-dashed border-[var(--br-border)] bg-surface p-8 text-center shadow-sm">
          <div>
            <Award className="mx-auto size-10 text-[var(--br-text-muted)]" />
            <h1 className="mt-4 text-2xl font-extrabold text-[var(--br-dark-card)]">No quiz attempts yet.</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--br-text-muted)]">Take a quiz and BrenUp will build your attempt history, score trend, and review links here.</p>
          </div>
        </section>
      )}
    </LearnerAppShell>
  );
}

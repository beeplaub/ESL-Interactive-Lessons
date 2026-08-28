import { getQuizBadge, quizBadges } from "@/lib/quizBadges";
import type { createAdminClient } from "@/lib/supabase/admin";

export type AchievementMilestone = {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  target: number;
  unit: string;
  tone: "purple" | "orange" | "green" | "red";
};

export type LearnerAchievements = {
  points: number;
  streak: number;
  totalAttempts: number;
  bestCourseEvidence: number;
  quizBadge: ReturnType<typeof getQuizBadge>;
  quizBadges: AchievementMilestone[];
  streakMilestones: AchievementMilestone[];
  practiceMilestones: AchievementMilestone[];
  evidenceMilestones: AchievementMilestone[];
  highlights: AchievementMilestone[];
};

function dateKey(value: string) { return new Date(value).toISOString().slice(0, 10); }
function calculateStreak(values: string[]) {
  const days = Array.from(new Set(values.map(dateKey))).sort().reverse();
  if (!days.length) return 0;
  const today = dateKey(new Date().toISOString());
  const yesterday = dateKey(new Date(Date.now() - 86400000).toISOString());
  if (days[0] !== today && days[0] !== yesterday) return 0;
  let total = 1;
  for (let index = 1; index < days.length; index++) {
    if (Math.round((new Date(days[index - 1]).getTime() - new Date(days[index]).getTime()) / 86400000) === 1) total++;
    else break;
  }
  return total;
}

function milestone(id: string, title: string, description: string, icon: string, progress: number, target: number, unit: string, tone: AchievementMilestone["tone"]): AchievementMilestone {
  return { id, title, description, icon, unlocked: progress >= target, progress, target, unit, tone };
}

export async function getLearnerAchievements(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<LearnerAchievements> {
  const [{ data: pointRows }, { data: legacyAttempts }, { data: assessmentAttempts }, { data: courseEvidence }] = await Promise.all([
    admin.from("quiz_leaderboard_points").select("points").eq("user_id", userId),
    admin.from("quiz_attempts").select("id,completed_at").eq("user_id", userId).order("completed_at", { ascending: false }).limit(2000),
    admin.from("assessment_attempts").select("id,legacy_quiz_attempt_id,completed_at,submitted_at,created_at").eq("user_id", userId).order("completed_at", { ascending: false }).limit(2000),
    admin.from("assessment_attempts").select("score,maximum_score,completed_at").eq("user_id", userId).not("course_item_id", "is", null).order("completed_at", { ascending: false }).limit(2000),
  ]);
  const linkedLegacyIds = new Set((assessmentAttempts ?? []).map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
  const allAttempts = [
    ...(legacyAttempts ?? []).filter((attempt) => !linkedLegacyIds.has(attempt.id)),
    ...(assessmentAttempts ?? []),
  ];
  const points = (pointRows ?? []).reduce((sum, row) => sum + Number(row.points ?? 0), 0);
  const totalAttempts = allAttempts?.length ?? 0;
  const streak = calculateStreak((allAttempts ?? []).filter((row) => row.completed_at).map((row) => row.completed_at));
  const bestCourseEvidence = Math.max(0, ...(courseEvidence ?? []).map((row) => Number(row.maximum_score) > 0 ? Math.round((Number(row.score) / Number(row.maximum_score)) * 100) : 0));
  const quizBadge = getQuizBadge(points);
  const quizBadgeMilestones = quizBadges.map((badge) => milestone(`quiz-${badge.name.toLowerCase()}`, badge.name, `${badge.minPoints.toLocaleString()} quiz points`, badge.icon, points, badge.minPoints, "points", "purple"));
  const streakMilestones = [
    [1, "First Flame", "Learn on one active day", "🔥"], [2, "Momentum", "Keep a two-day streak", "⚡"], [3, "Three-Day Flow", "Build a three-day rhythm", "🌟"], [4, "Streak Spark", "Reach four active days", "✨"], [5, "Streak Beast", "Hold a five-day streak", "🔥"], [6, "Flame Keeper", "Keep the fire for six days", "🕯️"], [7, "Week Warrior", "Learn for seven days in a row", "🏆"],
  ].map(([target, title, description, icon]) => milestone(`streak-${target}`, String(title), String(description), String(icon), streak, Number(target), "days", "orange"));
  const practiceMilestones = [
    [1, "First Answer", "Submit your first lesson or quiz attempt", "📝"], [2, "Practice Starter", "Submit two learning attempts", "🌱"], [3, "Steady Learner", "Submit three learning attempts", "📚"], [5, "Perfectionist", "Show up for five learning attempts", "💎"], [10, "Dedicated", "Reach ten learning attempts", "🚀"], [25, "Relentless", "Reach twenty-five learning attempts", "🏅"],
  ].map(([target, title, description, icon]) => milestone(`practice-${target}`, String(title), String(description), String(icon), totalAttempts, Number(target), "attempts", "green"));
  const evidenceMilestones = [50, 60, 70, 80, 90, 100].map((target) => milestone(`evidence-${target}`, target === 50 ? "Evidence Starter" : target === 100 ? "Outcome Champion" : `${target}% Evidence`, `Achieve ${target}% on a scored lesson or quiz inside a course`, target === 100 ? "👑" : "🎯", bestCourseEvidence, target, "%", "red"));
  const highlights = [
    quizBadgeMilestones.filter((item) => item.unlocked).at(-1) ?? quizBadgeMilestones[0],
    streakMilestones.filter((item) => item.unlocked).at(-1) ?? streakMilestones[0],
    practiceMilestones.filter((item) => item.unlocked).at(-1) ?? practiceMilestones[0],
    evidenceMilestones.filter((item) => item.unlocked).at(-1) ?? evidenceMilestones[0],
  ];
  return { points, streak, totalAttempts, bestCourseEvidence, quizBadge, quizBadges: quizBadgeMilestones, streakMilestones, practiceMilestones, evidenceMilestones, highlights };
}

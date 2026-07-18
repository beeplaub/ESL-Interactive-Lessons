import Link from "next/link";
import { Award, Crown, Gamepad2, Medal, Sparkles, Trophy, Users, Zap, Flame, Star, Crown as CrownIcon, Diamond, ShieldAlert, Award as AwardIcon } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getQuizBadge, getNextQuizBadge, quizBadges } from "@/lib/quizBadges";

type Profile = { id: string; full_name: string | null; first_name?: string | null; last_name?: string | null };
type WeekActivityDay = { label: string; active: boolean; isToday: boolean };

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildWeekActivity(activityDates: string[]): WeekActivityDay[] {
  const activeSet = new Set(activityDates);
  const days: WeekActivityDay[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 86400000);
    const key = toDateKey(date);
    days.push({
      label: date.toLocaleDateString("en-US", { weekday: "narrow" }),
      active: activeSet.has(key),
      isToday: offset === 0,
    });
  }
  return days;
}

function calcStreak(dates: string[]) {
  if (!dates.length) return 0;
  const unique = Array.from(new Set(dates)).sort().reverse();
  const today = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 86400000));
  if (unique[0] !== today && unique[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const curr = new Date(unique[i]);
    if (Math.round((prev.getTime() - curr.getTime()) / 86400000) === 1) streak++;
    else break;
  }
  return streak;
}

export default async function LeaderboardPage() {
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch all leaderboard points and profile data
  const [{ data: points }, { data: profiles }] = await Promise.all([
    admin.from("quiz_leaderboard_points").select("user_id, points, quiz_id, created_at").order("created_at", { ascending: false }).limit(5000),
    admin.from("profiles").select("id, full_name, first_name, last_name")
  ]);

  const profileById = new Map((profiles ?? []).map((profile: Profile) => [profile.id, profile]));
  const rows = new Map<string, { userId: string; name: string; points: number; attempts: number; quizzes: Set<string>; initials: string }>();

  for (const row of points ?? []) {
    const profile = profileById.get(row.user_id);
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || "BrenUp learner";
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BU";
    const existing = rows.get(row.user_id) ?? { userId: row.user_id, name, points: 0, attempts: 0, quizzes: new Set<string>(), initials };
    existing.points += Number(row.points ?? 0);
    existing.attempts += 1;
    if (row.quiz_id) existing.quizzes.add(row.quiz_id);
    rows.set(row.user_id, existing);
  }

  const leaders = Array.from(rows.values()).sort((a, b) => b.points - a.points).slice(0, 50);
  const totalPoints = leaders.reduce((sum, leader) => sum + leader.points, 0);
  const topBadge = getQuizBadge(leaders[0]?.points ?? 0);

  // Reorder top 3 for the podium display: #2 on left, #1 in center, #3 on right
  const topThreeRaw = leaders.slice(0, 3);
  const podiumItems = [
    topThreeRaw[1] ? { leader: topThreeRaw[1], rank: 2 } : null,
    topThreeRaw[0] ? { leader: topThreeRaw[0], rank: 1 } : null,
    topThreeRaw[2] ? { leader: topThreeRaw[2], rank: 3 } : null,
  ].filter(Boolean) as Array<{ leader: typeof leaders[0]; rank: number }>;

  // Fetch current user's progress & gamification metrics
  let userStreak = 0;
  let weekActivity: WeekActivityDay[] = buildWeekActivity([]);
  let progressPercent = 0;
  let completedCourses = 0;
  let inProgressCourses = 0;
  let notStartedCourses = 0;
  let currentUserPoints = 0;
  let currentUserBadge = getQuizBadge(0);
  let nextBadge = getNextQuizBadge(0);

  if (user) {
    const [{ data: quizAttempts }, { data: userPoints }, { data: enrollments }, { data: courseProgress }] = await Promise.all([
      admin.from("quiz_attempts").select("completed_at").eq("user_id", user.id).not("quiz_id", "is", null).order("completed_at", { ascending: false }).limit(120),
      admin.from("quiz_leaderboard_points").select("points").eq("user_id", user.id),
      admin.from("course_enrollments").select("course_id,status").eq("user_id", user.id),
      admin.from("course_progress").select("course_id,progress_percent").eq("user_id", user.id),
    ]);

    const activityDates = (quizAttempts ?? []).filter((attempt) => attempt.completed_at).map((attempt) => toDateKey(new Date(attempt.completed_at)));
    userStreak = calcStreak(activityDates);
    weekActivity = buildWeekActivity(activityDates);
    currentUserPoints = (userPoints ?? []).reduce((sum, r) => sum + Number(r.points ?? 0), 0);
    currentUserBadge = getQuizBadge(currentUserPoints);
    nextBadge = getNextQuizBadge(currentUserPoints);

    const progressRows = courseProgress ?? [];
    progressPercent = progressRows.length
      ? Math.round(progressRows.reduce((sum, r) => sum + Number(r.progress_percent ?? 0), 0) / progressRows.length)
      : 0;

    const enrolledCourseIds = new Set((enrollments ?? []).map((r) => r.course_id));
    completedCourses = progressRows.filter((r) => Number(r.progress_percent ?? 0) >= 100).length;
    inProgressCourses = progressRows.filter((r) => Number(r.progress_percent ?? 0) > 0 && Number(r.progress_percent ?? 0) < 100).length;
    notStartedCourses = Math.max(0, enrolledCourseIds.size - completedCourses - inProgressCourses);
  }

  const toLegendPercent = Math.min(100, Math.round((currentUserPoints / 6000) * 100));

  return (
    <LearnerAppShell active="leaderboard" showRightSidebar={false}>
      <div className="max-w-[1440px] mx-auto space-y-6">
        {/* HERO SECTION */}
        <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#1d0061] to-[#5308e7] p-8 md:p-10 text-white shadow-2xl flex flex-col md:flex-row items-center justify-between">
          <div className="absolute -right-16 -top-20 size-60 rounded-full bg-[#6C3BFF]/25 blur-lg" />
          <div className="absolute right-36 top-10 size-20 rounded-full bg-[#3CCEFF]/20 blur-xl" />
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full mb-6 border border-white/20">
              <Sparkles className="size-4 text-amber-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest">Quiz points arena</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 font-sans">Leaderboard</h1>
            <p className="text-base md:text-lg text-white/80 mb-8 max-w-xl leading-relaxed">
              Complete quizzes, earn points, and climb from Bronze to Legend. Accuracy and consistency both matter in the arena of mastery.
            </p>
            <div className="flex gap-4">
              <Link href="/quizzes" className="bg-white text-[#5308e7] hover:bg-white/90 px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-md">
                <Gamepad2 className="size-5" /> Play a quiz
              </Link>
              <Link href="/account" className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/30 px-6 py-3 rounded-xl font-bold transition-all">
                My progress
              </Link>
            </div>
          </div>
          <div className="relative z-10 mt-10 md:mt-0 flex items-center justify-center shrink-0">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full transform -rotate-90">
                <circle className="text-white/10" cx="80" cy="80" fill="transparent" r="70" stroke="currentColor" strokeWidth="8"></circle>
                <circle className="text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.6)] transition-all duration-1000" cx="80" cy="80" fill="transparent" r="70" stroke="currentColor" strokeDasharray="440" strokeDashoffset={440 - (440 * toLegendPercent) / 100} strokeLinecap="round" strokeWidth="8"></circle>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold text-white">{toLegendPercent}%</span>
                <span className="text-[9px] uppercase font-bold text-white/60 tracking-widest mt-0.5">To Legend</span>
              </div>
            </div>
          </div>
        </section>

        {/* STATS QUICK VIEW */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#ECECF5]/60 flex items-center gap-6 group hover:shadow-md transition-all">
            <div className="w-14 h-14 rounded-2xl bg-[#f2ebfb] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="size-6 text-[#5308e7]" />
            </div>
            <div>
              <h4 className="text-3xl font-black text-[#1c1a25]">{leaders.length}</h4>
              <p className="text-sm font-semibold text-[#6E738D]">Ranked players</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#ECECF5]/60 flex items-center gap-6 group hover:shadow-md transition-all">
            <div className="w-14 h-14 rounded-2xl bg-[#ffdbcc] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Zap className="size-6 text-[#873600]" />
            </div>
            <div>
              <h4 className="text-3xl font-black text-[#1c1a25]">{totalPoints.toLocaleString()}</h4>
              <p className="text-sm font-semibold text-[#6E738D]">Points tracked</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#ECECF5]/60 flex items-center gap-6 group hover:shadow-md transition-all">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Award className="size-6 text-emerald-500" />
            </div>
            <div>
              <h4 className="text-3xl font-black text-[#1c1a25]">{topBadge.name}</h4>
              <p className="text-sm font-semibold text-[#6E738D]">Top badge energy</p>
            </div>
          </div>
        </section>

        {/* 2-COLUMN MAIN CONTENT & SIDEBAR */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT SIDE: PODIUM & TABLE */}
          <div className="lg:col-span-8 space-y-6">
            {/* PODIUM SECTION */}
            {podiumItems.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                {podiumItems.map(({ leader, rank }) => {
                  const isFirst = rank === 1;
                  const isSecond = rank === 2;
                  const badge = getQuizBadge(leader.points);
                  const rankColors = isFirst
                    ? { border: "border-yellow-400", bg: "bg-yellow-400/10", text: "text-amber-700", iconBg: "bg-yellow-400" }
                    : isSecond
                    ? { border: "border-slate-300", bg: "bg-slate-100", text: "text-slate-600", iconBg: "bg-slate-300" }
                    : { border: "border-amber-600", bg: "bg-amber-50", text: "text-amber-800", iconBg: "bg-amber-600" };

                  const Icon = isFirst ? Crown : isSecond ? Medal : Trophy;

                  return (
                    <div
                      key={leader.userId}
                      className={`bg-white rounded-3xl p-6 border ${isFirst ? "border-2 border-yellow-400/40 shadow-xl z-10 md:pb-8" : "border-[#ECECF5]/60 shadow-sm"} relative transition-all hover:-translate-y-2 flex flex-col items-center text-center`}
                    >
                      <div className={`absolute top-4 right-4 ${isFirst ? "bg-yellow-400/20 text-yellow-800" : "bg-slate-100 text-slate-500"} font-extrabold text-xs px-2 py-1 rounded-full flex items-center gap-1`}>
                        <Icon className="size-3.5" /> #{rank}
                      </div>

                      <div className="relative mb-4 mt-2">
                        {isFirst && <div className="absolute -inset-4 bg-yellow-400/10 rounded-full blur-xl animate-pulse" />}
                        <div className={`relative z-10 ${isFirst ? "w-24 h-24" : "w-16 h-16"} rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#4E8DFF] border-4 ${isFirst ? "border-yellow-400" : "border-slate-100"} flex items-center justify-center text-white text-xl font-black shadow-md`}>
                          {leader.initials}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 ${rankColors.iconBg} w-8 h-8 rounded-xl border-4 border-white flex items-center justify-center text-[10px] font-black text-white shadow-md z-20`}>
                          {badge.icon}
                        </div>
                      </div>

                      <h4 className="font-bold text-lg text-[#1c1a25] mb-1">{leader.name}</h4>
                      <p className="text-xs font-semibold text-[#6E738D] mb-4">{leader.quizzes.size} quiz{leader.quizzes.size === 1 ? "" : "zes"} · {leader.attempts} attempt{leader.attempts === 1 ? "" : "s"}</p>

                      <div className={`${isFirst ? "bg-yellow-400/10" : "bg-[#F6F7FB]"} w-full rounded-2xl py-3 px-4`}>
                        <p className="text-2xl font-black text-[#1c1a25]">{leader.points.toLocaleString()}</p>
                        <p className={`text-[10px] uppercase font-bold tracking-widest mt-0.5 ${isFirst ? "text-amber-800" : "text-[#6E738D]"}`}>Points · {badge.name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* RANKING TABLE */}
            <div className="bg-white rounded-[32px] shadow-sm border border-[#ECECF5]/60 overflow-hidden">
              <div className="px-6 py-5 border-b border-[#ECECF5]/40 flex justify-between items-center">
                <h3 className="text-xl font-black text-[#1c1a25]">Full Ranking</h3>
                <div className="flex bg-[#F6F7FB] p-1 rounded-xl">
                  <button className="px-5 py-1.5 rounded-lg bg-white shadow-sm text-xs font-bold text-[#5308e7]">All Time</button>
                  <button className="px-5 py-1.5 rounded-lg text-xs font-bold text-[#6E738D] hover:text-[#1c1a25] transition-colors">Monthly</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#F6F7FB] text-[#6E738D] font-extrabold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 border-b border-[#ECECF5]/40">Rank</th>
                      <th className="px-6 py-4 border-b border-[#ECECF5]/40">Player</th>
                      <th className="px-6 py-4 border-b border-[#ECECF5]/40">Badge</th>
                      <th className="px-6 py-4 border-b border-[#ECECF5]/40">Points</th>
                      <th className="px-6 py-4 border-b border-[#ECECF5]/40 text-center">Quizzes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECECF5]/40">
                    {leaders.map((leader, index) => {
                      const rank = index + 1;
                      const badge = getQuizBadge(leader.points);
                      return (
                        <tr key={leader.userId} className="hover:bg-[#F6F7FB]/50 transition-colors group">
                          <td className="px-6 py-5">
                            <span className={`font-black text-xs px-2.5 py-1 rounded-lg ${rank <= 3 ? "bg-[#5308e7]/10 text-[#5308e7]" : "bg-[#F6F7FB] text-[#6E738D]"}`}>
                              #{rank}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6C3BFF] to-[#4E8DFF] text-white font-black flex items-center justify-center text-sm border-2 border-white shadow-sm shrink-0">
                                {leader.initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-[#1c1a25] truncate">{leader.name}</p>
                                <p className="text-[10px] text-[#6E738D] uppercase tracking-tighter mt-0.5">{leader.attempts} attempt{leader.attempts === 1 ? "" : "s"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className={`inline-flex items-center gap-2 bg-gradient-to-br ${badge.gradient} px-2.5 py-1 rounded-xl text-white font-extrabold text-xs shadow-sm`}>
                              <span className="text-[10px] uppercase">{badge.icon}</span>
                              <span>{badge.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className="font-black text-[#1c1a25] text-lg">{leader.points.toLocaleString()}</span>
                          </td>
                          <td className="px-6 py-5 text-center text-[#6E738D] font-bold">
                            {leader.quizzes.size}
                          </td>
                        </tr>
                      );
                    })}
                    {!leaders.length && (
                      <tr>
                        <td colSpan={5} className="p-10 text-center">
                          <Trophy className="mx-auto text-[#5308e7]/30 mb-4" size={40} />
                          <h2 className="text-lg font-black text-[#1c1a25]">No quiz scores yet</h2>
                          <p className="text-sm text-[#6E738D] mt-1">Complete a quiz to claim the first rank.</p>
                          <Link href="/quizzes" className="mt-4 inline-flex rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-5 py-2 text-sm font-bold text-white shadow-md">Play a quiz</Link>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR STATS */}
          <aside className="lg:col-span-4 space-y-6">
            {/* STREAK CARD */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#ECECF5]/60 relative overflow-hidden group">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h4 className="font-bold text-base text-[#1c1a25]">Your Streak</h4>
                  <p className="text-4xl font-black text-orange-500 mt-1">{userStreak} days</p>
                  <p className="text-xs text-[#6E738D] mt-1">{userStreak > 0 ? "Keep the fire burning!" : "Start today!"}</p>
                </div>
                <div className="w-14 h-14 bg-orange-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all shrink-0">
                  <Flame className="size-8 text-orange-500 fill-orange-500" />
                </div>
              </div>
              <div className="flex justify-between">
                {weekActivity.map((day, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-2">
                    <span className={`text-[10px] font-bold ${day.isToday ? "text-orange-500" : "text-[#6E738D]"}`}>{day.label}</span>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${day.active ? "bg-orange-500 text-white shadow-sm" : "bg-[#F6F7FB] border-2 border-transparent"}`}>
                      {day.active ? "✓" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PROGRESS CARD */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#ECECF5]/60">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="font-bold text-base text-[#1c1a25]">Your Progress</h4>
                  <p className="text-xs text-[#6E738D] mt-0.5">Across enrolled courses</p>
                </div>
                <div className="relative w-16 h-16 shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle className="text-[#F6F7FB]" cx="32" cy="32" fill="transparent" r="28" stroke="currentColor" strokeWidth="5"></circle>
                    <circle className="text-emerald-500" cx="32" cy="32" fill="transparent" r="28" stroke="currentColor" stroke-dasharray="176" stroke-dashoffset={176 - (176 * progressPercent) / 100} strokeLinecap="round" strokeWidth="5"></circle>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-[#1c1a25]">{progressPercent}%</div>
                </div>
              </div>
              <ul className="space-y-3.5">
                <li className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-sm font-bold text-[#35405F]">Completed</span>
                  </div>
                  <span className="text-xs font-black text-[#1c1a25]">{completedCourses} course{completedCourses === 1 ? "" : "s"}</span>
                </li>
                <li className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-sm font-bold text-[#35405F]">In progress</span>
                  </div>
                  <span className="text-xs font-black text-[#1c1a25]">{inProgressCourses} course{inProgressCourses === 1 ? "" : "s"}</span>
                </li>
                <li className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                    <span className="text-sm font-bold text-[#35405F]">Not started</span>
                  </div>
                  <span className="text-xs font-black text-[#1c1a25]">{notStartedCourses} course{notStartedCourses === 1 ? "" : "s"}</span>
                </li>
              </ul>
            </div>

            {/* ACHIEVEMENTS */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#ECECF5]/60">
              <div className="flex justify-between items-center mb-6">
                <h4 className="font-bold text-base text-[#1c1a25]">Achievements</h4>
                <Link className="text-[#5308e7] text-xs font-bold hover:underline transition-all" href="/leaderboard">View all</Link>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] text-white flex items-center justify-center shadow-md mb-2 transition-transform hover:scale-110 cursor-help" title="Quiz Master: complete quizzes to level up">
                    <Star className="size-5 fill-white" />
                  </div>
                  <span className="text-[8px] font-extrabold text-center uppercase tracking-tighter text-[#6E738D]">Quiz Master</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FFB545] to-[#FF6B00] text-white flex items-center justify-center shadow-md mb-2 transition-transform hover:scale-110 cursor-help" title="Streak Beast: maintain daily quiz attempts">
                    <Flame className="size-5 fill-white" />
                  </div>
                  <span className="text-[8px] font-extrabold text-center uppercase tracking-tighter text-[#6E738D]">Streak Beast</span>
                </div>
                <div className="flex flex-col items-center opacity-30 grayscale">
                  <div className="w-12 h-12 rounded-xl bg-[#F6F7FB] text-[#6E738D] flex items-center justify-center border border-[#ECECF5] mb-2">
                    <Diamond className="size-5" />
                  </div>
                  <span className="text-[8px] font-extrabold text-center uppercase tracking-tighter text-[#6E738D]">Perfection</span>
                </div>
                <div className="flex flex-col items-center opacity-30 grayscale">
                  <div className="w-12 h-12 rounded-xl bg-[#F6F7FB] text-[#6E738D] flex items-center justify-center border border-[#ECECF5] mb-2">
                    <CrownIcon className="size-5" />
                  </div>
                  <span className="text-[8px] font-extrabold text-center uppercase tracking-tighter text-[#6E738D]">Legend</span>
                </div>
              </div>
            </div>

            {/* QUIZ BADGE NEXT STEP */}
            <div className="bg-[#fdf8ff] p-5 rounded-3xl border border-[#ECECF5]/60 flex items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-sm text-[#1c1a25]">Next Rank</h4>
                {nextBadge ? (
                  <p className="text-xs text-[#6E738D] mt-1">
                    {Math.max(0, nextBadge.minPoints - currentUserPoints).toLocaleString()} points to <span className="text-yellow-600 font-bold">{nextBadge.name}</span>
                  </p>
                ) : (
                  <p className="text-xs text-[#6E738D] mt-1">Maximum rank achieved!</p>
                )}
              </div>
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${currentUserBadge.gradient} flex items-center justify-center font-black text-white shadow-md text-xs shrink-0`}>
                {currentUserBadge.icon}
              </div>
            </div>
          </aside>
        </div>

        {/* BADGE LADDER GRID */}
        <section className="bg-white rounded-[32px] p-6 md:p-8 shadow-sm border border-[#ECECF5]/60">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h3 className="text-xl font-black text-[#1c1a25] mb-1">Badge ladder</h3>
              <p className="text-[#6E738D] text-sm">Points unlock quiz ranks automatically. Reach for the Legend status.</p>
            </div>
            <div className="bg-[#6C3BFF]/10 px-5 py-1.5 rounded-full text-xs font-bold text-[#5308e7] border border-[#6C3BFF]/20">10 rank levels</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {quizBadges.map((badge) => {
              const hasUnlocked = currentUserPoints >= badge.minPoints;
              return (
                <div
                  key={badge.name}
                  className={`p-5 rounded-3xl border transition-all ${
                    hasUnlocked
                      ? "bg-gradient-to-br from-white to-[#F6F7FB] border-[#ECECF5]/80 hover:shadow-lg"
                      : "bg-[#F6F7FB]/40 border-transparent opacity-60"
                  } flex flex-col justify-between h-36 relative group`}
                >
                  {hasUnlocked && (
                    <div className="absolute top-3 right-3 text-emerald-500">
                      <AwardIcon className="size-4" />
                    </div>
                  )}
                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${badge.gradient} flex items-center justify-center text-white font-black text-xs shadow-md shrink-0`}>
                    {badge.icon}
                  </div>
                  <div>
                    <h5 className="font-extrabold text-[#1c1a25] text-sm">{badge.name}</h5>
                    <p className="text-[11px] font-bold text-[#6E738D] mt-0.5">{badge.minPoints.toLocaleString()}+ pts</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </LearnerAppShell>
  );
}

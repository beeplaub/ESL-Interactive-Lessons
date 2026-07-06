import Link from "next/link";
import { Award, Crown, Gamepad2, Medal, Sparkles, Trophy, Users, Zap } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuizBadge, quizBadges } from "@/lib/quizBadges";

type Profile = { id: string; full_name: string | null; first_name?: string | null; last_name?: string | null };

export default async function LeaderboardPage() {
  const admin = createAdminClient();
  const [{ data: points }, { data: profiles }] = await Promise.all([
    admin.from("quiz_leaderboard_points").select("user_id, points, quiz_id, created_at").order("created_at", { ascending: false }).limit(5000),
    admin.from("profiles").select("id, full_name, first_name, last_name")
  ]);

  const profileById = new Map((profiles ?? []).map((profile: Profile) => [profile.id, profile]));
  const rows = new Map<string, { userId: string; name: string; points: number; attempts: number; quizzes: Set<string> }>();

  for (const row of points ?? []) {
    const profile = profileById.get(row.user_id);
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || "BrenUp learner";
    const existing = rows.get(row.user_id) ?? { userId: row.user_id, name, points: 0, attempts: 0, quizzes: new Set<string>() };
    existing.points += Number(row.points ?? 0);
    existing.attempts += 1;
    if (row.quiz_id) existing.quizzes.add(row.quiz_id);
    rows.set(row.user_id, existing);
  }

  const leaders = Array.from(rows.values()).sort((a, b) => b.points - a.points).slice(0, 50);
  const topThree = leaders.slice(0, 3);
  const totalPoints = leaders.reduce((sum, leader) => sum + leader.points, 0);
  const topBadge = getQuizBadge(leaders[0]?.points ?? 0);

  return (
    <LearnerAppShell active="leaderboard">
      <section>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-5 text-white shadow-[0_16px_48px_rgba(20,23,80,.25)] sm:p-6">
            <div className="absolute -right-16 -top-20 size-60 rounded-full bg-[#6C3BFF]/25" />
            <div className="absolute right-36 top-10 size-20 rounded-full bg-[#3CCEFF]/20 blur-xl" />
            <div className="relative z-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
                <Sparkles className="size-4" /> Quiz points arena
              </span>
              <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                Leaderboard
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
                Complete quizzes, earn points, unlock badges, and climb from Bronze to Legend. Accuracy and consistency both matter.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/quizzes" className="inline-flex items-center gap-2 rounded-[14px] bg-white px-5 py-3 text-sm font-extrabold text-[#6C3BFF]">
                  Play a quiz <Gamepad2 className="size-4" />
                </Link>
                <Link href="/account" className="inline-flex items-center gap-2 rounded-[14px] border border-white/20 bg-white/10 px-5 py-3 text-sm font-extrabold text-white">
                  My progress
                </Link>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <HeroStat icon={Users} value={leaders.length} label="Ranked players" tone="purple" />
            <HeroStat icon={Zap} value={totalPoints.toLocaleString()} label="Points tracked" tone="orange" />
            <HeroStat icon={Award} value={topBadge.name} label="Top badge energy" tone="green" />
          </div>
        </div>

        <section className="mt-5 rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)] sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold">Badge ladder</h2>
              <p className="mt-1 text-sm font-semibold text-[#6E738D]">Points unlock quiz ranks automatically.</p>
            </div>
            <span className="rounded-full bg-[#F6F7FB] px-3 py-1.5 text-xs font-bold text-[#6E738D]">10 rank levels</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {quizBadges.map((badge) => (
              <div key={badge.name} className="rounded-[16px] border border-[#ECECF5] bg-[#F6F7FB] p-3">
                <div className={`grid size-11 place-items-center rounded-[14px] bg-gradient-to-br ${badge.gradient} text-xs font-black text-white shadow-sm`}>
                  {badge.icon}
                </div>
                <p className="mt-2 text-sm font-extrabold">{badge.name}</p>
                <p className="text-xs font-semibold text-[#6E738D]">{badge.minPoints.toLocaleString()}+ pts</p>
              </div>
            ))}
          </div>
        </section>

        {topThree.length > 0 ? (
          <section className="mt-5 grid gap-4 lg:grid-cols-3">
            {topThree.map((leader, index) => (
              <PodiumCard key={leader.userId} leader={leader} rank={index + 1} />
            ))}
          </section>
        ) : null}

        <section className="mt-5 overflow-hidden rounded-[20px] border border-[#ECECF5] bg-white shadow-[0_12px_32px_rgba(0,0,0,.06)]">
          <div className="hidden grid-cols-[72px_minmax(260px,1fr)_170px_130px_130px] gap-4 border-b border-[#ECECF5] bg-[#F6F7FB] px-5 py-4 text-xs font-extrabold uppercase tracking-[0.14em] text-[#6E738D] md:grid">
            <span>Rank</span>
            <span>Player</span>
            <span>Badge</span>
            <span>Points</span>
            <span>Quizzes</span>
          </div>
          <div className="divide-y divide-[#ECECF5]">
            {leaders.map((leader, index) => (
              <LeaderboardRow key={leader.userId} leader={leader} rank={index + 1} />
            ))}
          </div>
          {!leaders.length ? (
            <div className="p-10 text-center">
              <Trophy className="mx-auto text-[#6C3BFF]/35" size={36} />
              <h2 className="mt-4 text-lg font-extrabold">No quiz scores yet</h2>
              <p className="mt-2 text-sm text-[#6E738D]">Complete a quiz to claim the first rank.</p>
              <Link href="/quizzes" className="mt-4 inline-flex rounded-[14px] bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-4 py-2.5 text-sm font-extrabold text-white">Play a quiz</Link>
            </div>
          ) : null}
        </section>
      </section>
    </LearnerAppShell>
  );
}

function HeroStat({ icon: Icon, value, label, tone }: { icon: React.ElementType; value: number | string; label: string; tone: "purple" | "orange" | "green" }) {
  const tones = {
    purple: "from-[#6C3BFF] to-[#8A58FF]",
    orange: "from-[#FFB545] to-[#FF8C00]",
    green: "from-[#00C98D] to-[#00B37D]"
  };
  return (
    <div className="rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <div className={`grid size-11 place-items-center rounded-[14px] bg-gradient-to-br ${tones[tone]} text-white`}><Icon className="size-5" /></div>
      <div className="mt-4 text-[32px] font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-xs font-semibold text-[#6E738D]">{label}</div>
    </div>
  );
}

function PodiumCard({ leader, rank }: { leader: { name: string; points: number; attempts: number; quizzes: Set<string> }; rank: number }) {
  const badge = getQuizBadge(leader.points);
  const rankTone = rank === 1 ? "from-[#FFB545] to-[#FF8C00]" : rank === 2 ? "from-[#8890B8] to-[#C8CDDA]" : "from-[#A66A3F] to-[#FF8E53]";
  const Icon = rank === 1 ? Crown : rank === 2 ? Medal : Trophy;
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-[#ECECF5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,.06)]">
      <div className={`absolute -right-8 -top-10 size-32 rounded-full bg-gradient-to-br ${rankTone} opacity-20`} />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <span className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-br ${rankTone} px-3 py-1.5 text-xs font-extrabold text-white`}>
            <Icon className="size-4" /> #{rank}
          </span>
          <h3 className="mt-4 line-clamp-2 text-xl font-extrabold">{leader.name}</h3>
          <p className="mt-1 text-sm font-semibold text-[#6E738D]">{leader.quizzes.size} quiz{leader.quizzes.size === 1 ? "" : "zes"} · {leader.attempts} attempt{leader.attempts === 1 ? "" : "s"}</p>
        </div>
        <div className={`grid size-14 shrink-0 place-items-center rounded-[18px] bg-gradient-to-br ${badge.gradient} text-xs font-black text-white shadow-sm`}>{badge.icon}</div>
      </div>
      <div className="relative z-10 mt-5 rounded-[16px] bg-[#F6F7FB] p-3">
        <div className="text-[30px] font-extrabold leading-none">{leader.points.toLocaleString()}</div>
        <div className="mt-1 text-xs font-bold text-[#6E738D]">total points · {badge.name}</div>
      </div>
    </div>
  );
}

function LeaderboardRow({ leader, rank }: { leader: { userId: string; name: string; points: number; attempts: number; quizzes: Set<string> }; rank: number }) {
  const badge = getQuizBadge(leader.points);
  return (
    <div className="grid gap-3 p-4 md:grid-cols-[72px_minmax(260px,1fr)_170px_130px_130px] md:items-center md:gap-4 md:px-5">
      <div className="flex items-center justify-between md:block">
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-extrabold ${rank <= 3 ? "bg-[#6C3BFF]/10 text-[#6C3BFF]" : "bg-[#F6F7FB] text-[#6E738D]"}`}>
          #{rank}
        </span>
        <span className="md:hidden inline-flex items-center gap-1 text-sm font-extrabold text-[#14172B]">{leader.points.toLocaleString()} pts</span>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-[#6C3BFF] to-[#4E8DFF] text-xs font-black text-white">
          {leader.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BU"}
        </div>
        <div className="min-w-0">
          <p className="truncate font-extrabold text-[#14172B]">{leader.name}</p>
          <p className="mt-0.5 text-xs font-semibold text-[#6E738D] md:hidden">{badge.name} · {leader.quizzes.size} quiz{leader.quizzes.size === 1 ? "" : "zes"}</p>
          <p className="mt-0.5 hidden text-xs font-semibold text-[#6E738D] md:block">{leader.attempts} attempt{leader.attempts === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <span className={`grid size-8 shrink-0 place-items-center rounded-[12px] bg-gradient-to-br ${badge.gradient} text-[10px] font-black text-white`}>{badge.icon}</span>
        <span className="truncate text-sm font-extrabold">{badge.name}</span>
      </div>
      <div className="hidden text-sm font-extrabold md:block">{leader.points.toLocaleString()}</div>
      <div className="hidden text-sm font-bold text-[#6E738D] md:block">{leader.quizzes.size}</div>
    </div>
  );
}

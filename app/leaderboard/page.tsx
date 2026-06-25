import { Trophy } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

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

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-moss/10 text-moss">
            <Trophy size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
            <p className="mt-1 text-sm text-black/55">Earn points by completing quizzes. Accuracy gives you a stronger score.</p>
          </div>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="grid grid-cols-[72px_1fr_110px_110px] gap-3 border-b border-black/10 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-black/45">
          <span>Rank</span>
          <span>Learner</span>
          <span>Points</span>
          <span>Quizzes</span>
        </div>
        {leaders.map((leader, index) => (
          <div key={leader.userId} className="grid grid-cols-[72px_1fr_110px_110px] gap-3 border-b border-black/5 px-4 py-4 text-sm last:border-b-0">
            <span className={`font-bold ${index < 3 ? "text-moss" : "text-black/45"}`}>#{index + 1}</span>
            <span className="font-medium text-ink">{leader.name}</span>
            <span className="font-semibold">{leader.points}</span>
            <span className="text-black/55">{leader.quizzes.size}</span>
          </div>
        ))}
        {!leaders.length ? (
          <div className="p-8 text-center text-sm text-black/55">No quiz scores yet. Complete a quiz to claim the first rank.</div>
        ) : null}
      </section>
    </main>
  );
}

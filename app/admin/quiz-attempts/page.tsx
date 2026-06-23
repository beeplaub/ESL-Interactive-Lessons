import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type SearchParams = Promise<{ quiz?: string; search?: string }>;

export default async function AdminQuizAttemptsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const selectedQuiz = params.quiz ?? "";
  const search = (params.search ?? "").trim().toLowerCase();
  const admin = createAdminClient();

  const [{ data: attempts }, { data: quizzes }, { data: profiles }, { data: usersData }] = await Promise.all([
    admin
      .from("quiz_attempts")
      .select("*, quizzes(id, title, level)")
      .not("quiz_id", "is", null)
      .order("completed_at", { ascending: false })
      .limit(500),
    admin.from("quizzes").select("id, title").order("title", { ascending: true }),
    admin.from("profiles").select("id, full_name, first_name, last_name"),
    admin.auth.admin.listUsers()
  ]);

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const userMap = new Map((usersData?.users ?? []).map((user) => [user.id, user]));
  const filteredAttempts = (attempts ?? []).filter((attempt) => {
    const quiz = attempt.quizzes as { id?: string; title?: string } | null;
    const profile = profileMap.get(attempt.user_id);
    const user = userMap.get(attempt.user_id);
    const name = learnerName(profile);
    const matchesQuiz = !selectedQuiz || quiz?.id === selectedQuiz;
    const matchesSearch = !search || `${name} ${user?.email ?? ""}`.toLowerCase().includes(search);
    return matchesQuiz && matchesSearch;
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Quiz attempts</h1>
        <p className="mt-2 text-sm text-black/60">All learner quiz attempts.</p>
      </div>

      <form className="mb-4 grid gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-sm md:grid-cols-[1fr_260px_auto]">
        <input
          name="search"
          defaultValue={params.search ?? ""}
          placeholder="Search learner name or email"
          className="rounded-md border border-black/15 px-3 py-2 text-sm"
        />
        <select name="quiz" defaultValue={selectedQuiz} className="rounded-md border border-black/15 px-3 py-2 text-sm">
          <option value="">All quizzes</option>
          {(quizzes ?? []).map((quiz) => (
            <option key={quiz.id} value={quiz.id}>{quiz.title}</option>
          ))}
        </select>
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-sm">
        <table className="min-w-[820px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-black/50">
            <tr>
              <th className="p-3">Learner</th>
              <th className="p-3">Email</th>
              <th className="p-3">Quiz</th>
              <th className="p-3">Score</th>
              <th className="p-3">Percentage</th>
              <th className="p-3">Time taken</th>
              <th className="p-3">Completed</th>
            </tr>
          </thead>
          <tbody>
            {filteredAttempts.map((attempt) => {
              const quiz = attempt.quizzes as { title?: string; level?: string } | null;
              const profile = profileMap.get(attempt.user_id);
              const user = userMap.get(attempt.user_id);
              const title = quiz?.title ?? "Quiz";
              const percent = attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0;
              return (
                <tr key={attempt.id} className="border-t border-black/10">
                  <td className="p-3">{learnerName(profile)}</td>
                  <td className="p-3">{user?.email ?? "Unknown"}</td>
                  <td className="p-3">{title}</td>
                  <td className="p-3 font-semibold">{attempt.score}/{attempt.total}</td>
                  <td className="p-3">{percent}%</td>
                  <td className="p-3">{formatTime(attempt.time_taken_seconds)}</td>
                  <td className="p-3">{new Date(attempt.completed_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
            {!filteredAttempts.length ? (
              <tr><td colSpan={7} className="p-6 text-center text-black/55">No quiz attempts found.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function learnerName(profile: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | undefined) {
  return profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Learner";
}

function formatTime(seconds: unknown) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "Not timed";
  const minutes = Math.floor(value / 60);
  const remaining = Math.round(value % 60);
  return `${minutes}m ${String(remaining).padStart(2, "0")}s`;
}

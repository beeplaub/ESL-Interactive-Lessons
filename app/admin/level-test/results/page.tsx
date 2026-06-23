import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminLevelTestResultsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: results }, { data: profiles }, { data: usersData }] = await Promise.all([
    admin.from("level_test_results").select("*").order("completed_at", { ascending: false }).limit(200),
    admin.from("profiles").select("id, full_name, first_name, last_name"),
    admin.auth.admin.listUsers()
  ]);
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const userMap = new Map((usersData?.users ?? []).map((user) => [user.id, user]));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Level test results</h1>
      <p className="mt-2 text-sm text-black/60">Recent learner results and CEFR levels.</p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-black/10 bg-white shadow-sm">
        <table className="min-w-[820px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-black/50">
            <tr>
              <th className="p-3">Learner</th>
              <th className="p-3">Email</th>
              <th className="p-3">CEFR level</th>
              <th className="p-3">Use of English</th>
              <th className="p-3">Reading</th>
              <th className="p-3">Total</th>
              <th className="p-3">Date taken</th>
            </tr>
          </thead>
          <tbody>
            {(results ?? []).map((result) => {
              const profile = profileMap.get(result.user_id);
              const user = userMap.get(result.user_id);
              const sectionScores = asRecord(result.section_scores);
              const name = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Learner";
              return (
                <tr key={result.id} className="border-t border-black/10">
                  <td className="p-3">{name}</td>
                  <td className="p-3">{user?.email ?? "Unknown"}</td>
                  <td className="p-3 font-semibold">{result.cefr_level}</td>
                  <td className="p-3">{Number(sectionScores.use_of_english ?? 0)}/15</td>
                  <td className="p-3">{Number(sectionScores.reading ?? 0)}/10</td>
                  <td className="p-3">{result.raw_score}/25</td>
                  <td className="p-3">{new Date(result.completed_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
            {!results?.length ? <tr><td colSpan={7} className="p-6 text-center text-black/55">No level test results yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminLevelTestResultsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: results } = await admin
    .from("level_test_results")
    .select("*, profiles:user_id(full_name)")
    .order("completed_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Level test results</h1>
      <p className="mt-2 text-sm text-black/60">Recent learner results and CEFR levels.</p>
      <div className="mt-6 overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-black/50">
            <tr>
              <th className="p-3">Learner</th>
              <th className="p-3">Level</th>
              <th className="p-3">Raw score</th>
              <th className="p-3">Weighted</th>
              <th className="p-3">Time</th>
              <th className="p-3">Completed</th>
            </tr>
          </thead>
          <tbody>
            {(results ?? []).map((result) => (
              <tr key={result.id} className="border-t border-black/10">
                <td className="p-3">{result.profiles?.full_name ?? result.user_id}</td>
                <td className="p-3 font-semibold">{result.cefr_level}</td>
                <td className="p-3">{result.raw_score}/25</td>
                <td className="p-3">{Number(result.weighted_score).toFixed(1)}</td>
                <td className="p-3">{Math.round((result.time_taken_seconds ?? 0) / 60)} min</td>
                <td className="p-3">{new Date(result.completed_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!results?.length ? <tr><td colSpan={6} className="p-6 text-center text-black/55">No level test results yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

import { Search, Trash2 } from "lucide-react";
import { createUserManually, deleteUser, updateUserRole } from "@/app/admin/users/actions";
import { DeleteButton } from "@/components/DeleteButton";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const query = q.toLowerCase();
  const admin = createAdminClient();
  const [{ data: profiles }, { data: attempts }, usersResult] = await Promise.all([
    admin.from("profiles").select("*").order("created_at", { ascending: false }),
    admin.from("quiz_attempts").select("user_id"),
    admin.auth.admin.listUsers()
  ]);

  const emailMap = new Map(usersResult.data.users.map((user) => [user.id, user.email ?? ""]));
  const attemptCounts = new Map<string, number>();
  for (const attempt of attempts ?? []) attemptCounts.set(attempt.user_id, (attemptCounts.get(attempt.user_id) ?? 0) + 1);
  const filtered = (profiles ?? []).filter((profile) => {
    const email = emailMap.get(profile.id) ?? "";
    return !query || `${profile.full_name ?? ""} ${email}`.toLowerCase().includes(query);
  });

  return (
    <main>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Users</h1>
        <p className="mt-2 text-sm text-black/60">Manage learner and admin accounts.</p>
      </div>

      <section className="mb-6 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Add User Manually</h2>
        <form action={createUserManually} className="mt-4 grid gap-3 md:grid-cols-6">
          <input name="firstName" placeholder="First Name" required className="rounded-md border border-black/15 px-3 py-2" />
          <input name="lastName" placeholder="Last Name" className="rounded-md border border-black/15 px-3 py-2" />
          <input name="email" type="email" placeholder="Email" required className="rounded-md border border-black/15 px-3 py-2" />
          <input name="password" type="password" placeholder="Password" required className="rounded-md border border-black/15 px-3 py-2" />
          <select name="role" className="rounded-md border border-black/15 px-3 py-2">
            <RoleOptions />
          </select>
          <button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Add user</button>
        </form>
      </section>

      <form className="mb-4 flex max-w-md items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 shadow-sm">
        <Search size={16} className="text-black/40" />
        <input name="q" defaultValue={q} placeholder="Search name or email" className="w-full outline-none" />
      </form>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-sm">
        <table className="min-w-[800px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-black/50">
            <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Level</th><th className="p-3">Role</th><th className="p-3">Joined</th><th className="p-3">Attempts</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((profile) => (
              <tr key={profile.id} className="border-t border-black/10">
                <td className="p-3">{profile.full_name ?? "-"}</td>
                <td className="p-3">{emailMap.get(profile.id) ?? "-"}</td>
                <td className="p-3">{profile.cefr_level ?? "-"}</td>
                <td className="p-3">{profile.role}</td>
                <td className="p-3">{new Date(profile.created_at).toLocaleDateString()}</td>
                <td className="p-3">{attemptCounts.get(profile.id) ?? 0}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <form action={async (formData) => { "use server"; await updateUserRole(profile.id, String(formData.get("role")) as "ADMIN" | "LEARNER" | "TEACHER" | "SCHOOL_ADMIN"); }}>
                      <select name="role" defaultValue={profile.role} className="rounded-md border border-black/15 px-3 py-2 text-xs" aria-label={`Change role for ${profile.full_name ?? "user"}`}>
                        <RoleOptions />
                      </select>
                      <button className="ml-2 rounded-md border border-black/15 px-3 py-2 text-xs">Save</button>
                    </form>
                    <form action={async () => { "use server"; await deleteUser(profile.id); }}>
                      <DeleteButton
                        title="Delete user?"
                        message={`Are you sure you want to permanently delete user "${profile.full_name || profile.email}"? This will terminate their access.`}
                        isSoftDelete={false}
                        className="rounded-md border border-coral/30 p-2 text-coral hover:bg-coral/5"
                      >
                        <Trash2 size={16} />
                      </DeleteButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function RoleOptions() {
  return (
    <>
      <option value="LEARNER">Learner</option>
      <option value="TEACHER">Teacher</option>
      <option value="SCHOOL_ADMIN">School Admin</option>
      <option value="ADMIN">Admin</option>
    </>
  );
}

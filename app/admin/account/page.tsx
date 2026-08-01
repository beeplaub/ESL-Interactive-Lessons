import { KeyRound, Mail, UserRound } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AvatarUploader } from "@/components/AvatarUploader";
import { ProfileForm } from "@/components/ProfileForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

// This is the ADMIN/TEACHER equivalent of /profile. It reuses the exact same
// form components (ProfileForm/AvatarUploader/ChangePasswordForm are already
// generic and prop-driven), but drops every learner-only framing element
// (CEFR badge, streak/"learning status" copy, level test) since neither
// speaks to a creator managing their own account. /profile stays the
// learner-facing version, used only while a staff member is in Learner View.
export default async function StaffAccountPage() {
  const { user, profile } = await requireStaff();
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const provider = authUser?.user?.app_metadata?.provider ?? "email";
  const isEmailUser = provider === "email";

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || "BrenUp creator";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join("") || user.email?.[0]?.toUpperCase() || "U";
  const roleLabel = profile?.role === "ADMIN" ? "Admin" : "Teacher";

  return (
    <main className="min-w-0 overflow-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Account settings</h1>
        <p className="mt-2 text-sm text-black/60">Manage your name, avatar, and password.</p>
      </div>

      <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="content-start">
          <div className="br-card rounded-20 p-6 text-center">
            <AvatarUploader initialUrl={profile?.avatar_url ?? null} initials={initials} />
            <h2 className="mt-5 text-lg font-extrabold text-ink">{displayName}</h2>
            <p className="mt-1 break-words text-sm font-semibold text-slate-500">{user.email}</p>
            <span className="mt-3 inline-flex items-center rounded-full bg-violetglow/10 px-3 py-1 text-xs font-bold text-violetglow">{roleLabel}</span>
          </div>
        </aside>

        <div className="grid gap-5">
          <section className="br-card rounded-20 p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-[14px] bg-[#E7FBF4] text-[var(--br-chart-secondary)]">
                <UserRound className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-ink">Personal details</h2>
                <p className="text-xs font-semibold text-slate-500">Update the name shown across the admin area.</p>
              </div>
            </div>
            <ProfileForm email={user.email ?? ""} firstName={profile?.first_name ?? ""} lastName={profile?.last_name ?? ""} />
          </section>

          <section className="br-card rounded-20 p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className={`grid size-11 place-items-center rounded-[14px] ${isEmailUser ? "bg-[#FFF5E7] text-[#E47A00]" : "bg-slate-100 text-slate-500"}`}>
                <KeyRound className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-ink">Password</h2>
                <p className="text-xs font-semibold text-slate-500">{isEmailUser ? "Change your BrenUp password." : "Managed by your sign-in provider."}</p>
              </div>
            </div>
            {isEmailUser ? (
              <ChangePasswordForm />
            ) : (
              <div className="flex items-start gap-3 rounded-[18px] bg-slate-50 p-4">
                <Mail className="mt-0.5 size-5 shrink-0 text-violetglow" />
                <p className="text-sm font-semibold leading-6 text-slate-600">You signed in with Google. Password management is handled by your Google account.</p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

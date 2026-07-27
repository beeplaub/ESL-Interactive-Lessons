import Link from "next/link";
import { BadgeCheck, ChevronRight, KeyRound, Mail, ShieldCheck, Sparkles, Trophy, UserRound, LogOut } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerPageHero } from "@/components/LearnerPageHero";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AvatarUploader } from "@/components/AvatarUploader";
import { ProfileForm } from "@/components/ProfileForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { levelGuidance, type CefrLevel } from "@/lib/levelTestBank";
import { signOut } from "@/app/auth/actions";

export default async function ProfilePage() {
  const { user, profile } = await requireUser();
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const provider = authUser?.user?.app_metadata?.provider ?? "email";
  const isEmailUser = provider === "email";

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || "BrenUp learner";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join("") || user.email?.[0]?.toUpperCase() || "U";
  const level = profile?.cefr_level as CefrLevel | null;
  const missingName = !profile?.first_name?.trim();
  const providerLabel = provider === "google" ? "Google account" : "Email account";

  return (
    <LearnerAppShell active="profile" showRightSidebar>
      <section className="grid gap-5">
        <LearnerPageHero
          eyebrow="Your BrenUp profile"
          eyebrowIcon={Sparkles}
          title={displayName}
          description="Keep your learning identity, CEFR level, avatar, and account security tidy in one place."
          aside={<div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
              <ProfileMetric icon={BadgeCheck} value={level ?? "--"} label={level ? levelGuidance[level].name : "Level pending"} />
              <ProfileMetric icon={ShieldCheck} value={providerLabel} label="Sign-in method" />
              <ProfileMetric icon={Trophy} value="Active" label="Learning status" />
          </div>}
        />

        {missingName ? (
          <div className="flex items-start gap-3 rounded-[20px] border border-[#BCEBDA] bg-[#F1FFF8] p-4 shadow-[0_8px_22px_rgba(0,0,0,.04)]">
            <UserRound className="mt-0.5 size-5 shrink-0 text-[#00A978]" />
            <div>
              <p className="text-sm font-extrabold text-[#137A5D]">Add your name</p>
              <p className="mt-0.5 text-sm leading-6 text-[#3E6B5E]">This helps BrenUp greet you properly across your dashboard, courses, and quiz results.</p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="grid content-start gap-5">
            <div className="br-learner-card p-6 text-center">
              <AvatarUploader initialUrl={profile?.avatar_url ?? null} initials={initials} />
              <h2 className="mt-5 text-xl font-extrabold">{displayName}</h2>
              <p className="mt-1 break-words text-sm font-semibold text-[#6E738D]">{user.email}</p>
              <form action={signOut} className="mt-5 border-t border-[#ECECF5] pt-4">
                <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100/70 transition">
                  <LogOut size={16} /> Sign out
                </button>
              </form>
            </div>

            <div className="br-learner-card p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-[14px] bg-[#EEEAFB] text-[#6C3BFF]"><BadgeCheck className="size-5" /></span>
                <div>
                  <h2 className="text-lg font-extrabold">Level test result</h2>
                  <p className="text-xs font-semibold text-[#8B90A7]">Your current CEFR reference</p>
                </div>
              </div>
              {level ? (
                <div className="mt-5 rounded-[18px] bg-gradient-to-br from-[#6C3BFF] to-[#4520D9] p-5 text-white">
                  <div className="text-[46px] font-black leading-none">{level}</div>
                  <p className="mt-1 text-sm font-bold text-white/80">{levelGuidance[level].name}</p>
                  <p className="mt-3 text-xs leading-5 text-white/65">{levelGuidance[level].summary}</p>
                </div>
              ) : (
                <p className="mt-4 rounded-[16px] bg-[#F6F7FB] p-4 text-sm font-semibold leading-6 text-[#6E738D]">You have not taken the level test yet.</p>
              )}
              <Link href="/level-test" className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[#6C3BFF] to-[#8A58FF] px-4 py-3 text-xs font-bold text-white">
                {level ? "Retake level test" : "Take level test"} <ChevronRight className="size-4" />
              </Link>
            </div>
          </aside>

          <div className="grid gap-5">
            <section className="br-learner-card p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-[14px] bg-[#E7FBF4] text-[#00A978]"><UserRound className="size-5" /></span>
                <div>
                  <h2 className="text-xl font-extrabold">Personal details</h2>
                  <p className="text-xs font-semibold text-[#8B90A7]">Update the name shown on your learning profile.</p>
                </div>
              </div>
              <ProfileForm email={user.email ?? ""} firstName={profile?.first_name ?? ""} lastName={profile?.last_name ?? ""} />
            </section>

            <section className="br-learner-card p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className={`grid size-11 place-items-center rounded-[14px] ${isEmailUser ? "bg-[#FFF5E7] text-[#E47A00]" : "bg-[#F6F7FB] text-[#6E738D]"}`}><KeyRound className="size-5" /></span>
                <div>
                  <h2 className="text-xl font-extrabold">Password</h2>
                  <p className="text-xs font-semibold text-[#8B90A7]">{isEmailUser ? "Change your BrenUp password." : "Managed by your sign-in provider."}</p>
                </div>
              </div>
              {isEmailUser ? (
                <ChangePasswordForm />
              ) : (
                <div className="flex items-start gap-3 rounded-[18px] bg-[#F6F7FB] p-4">
                  <Mail className="mt-0.5 size-5 shrink-0 text-[#6C3BFF]" />
                  <p className="text-sm font-semibold leading-6 text-[#53607D]">You signed in with Google. Password management is handled by your Google account.</p>
                </div>
              )}
            </section>
          </div>
        </section>
      </section>
    </LearnerAppShell>
  );
}

function ProfileMetric({ icon: Icon, value, label }: { icon: React.ElementType; value: string; label: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/10 p-4 backdrop-blur">
      <Icon className="size-5 text-[#67D9FF]" />
      <div className="mt-3 truncate text-lg font-black">{value}</div>
      <div className="mt-1 text-[11px] font-bold text-white/55">{label}</div>
    </div>
  );
}

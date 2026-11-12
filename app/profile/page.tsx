import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  KeyRound,
  Mail,
  ShieldCheck,
  UserRound,
  LogOut,
} from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerResumeHero } from "@/components/LearnerResumeHero";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AvatarUploader } from "@/components/AvatarUploader";
import { ProfileForm } from "@/components/ProfileForm";
import { ProfileSocialLinks } from "@/components/ProfileSocialLinks";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { levelGuidance, type CefrLevel } from "@/lib/levelTestBank";
import { signOut } from "@/app/auth/actions";
import { isStaff } from "@/lib/auth";

export default async function ProfilePage() {
  const { user, profile } = await requireUser();
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const provider = authUser?.user?.app_metadata?.provider ?? "email";
  const isEmailUser = provider === "email";

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.full_name ||
    "BrenUp learner";
  const initials =
    displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join("") ||
    user.email?.[0]?.toUpperCase() ||
    "U";
  const level = profile?.cefr_level as CefrLevel | null;
  const missingName = !profile?.first_name?.trim();
  return (
    <LearnerAppShell active="profile" showRightSidebar>
      <section className="grid gap-5">
        <LearnerResumeHero
          eyebrow="YOUR BRENUP PROFILE"
          headingLevel="h1"
          title={displayName}
          description="Manage your profile, English level, and account security in one place."
        >
          <Link href="/level-test" className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-[var(--br-action-strong)]">
            {level ? "Retake level test" : "Take level test"} <ArrowRight className="size-4" />
          </Link>
          <form action={signOut} className="flex min-w-0 flex-1 sm:flex-none">
            <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-white/15">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </LearnerResumeHero>

        {missingName ? (
          <div className="flex items-start gap-3 rounded-[20px] border border-[var(--br-success-soft)] bg-[var(--br-success-soft)] p-4 shadow-[var(--br-shadow)]">
            <UserRound className="mt-0.5 size-5 shrink-0 text-[var(--br-chart-secondary)]" />
            <div>
              <p className="text-sm font-extrabold text-[var(--br-success)]">
                Add your name
              </p>
              <p className="mt-0.5 text-sm leading-6 text-[var(--br-text-muted)]">
                This helps BrenUp greet you properly across your dashboard,
                courses, and quiz results.
              </p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="grid content-start gap-5">
            <div className="br-learner-card p-6 text-center">
              <AvatarUploader
                initialUrl={profile?.avatar_url ?? null}
                initials={initials}
              />
              <h2 className="mt-5 text-xl font-extrabold">{displayName}</h2>
              <p className="mt-1 break-words text-sm font-semibold text-[var(--br-text-muted)]">
                {user.email}
              </p>
              <ProfileSocialLinks initialLinks={profile?.social_links} />
            </div>

            <div className="br-learner-card p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-[14px] bg-[var(--br-surface-muted)] text-[var(--br-chart-primary)]">
                  <BadgeCheck className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-extrabold">Level test result</h2>
                  <p className="text-xs font-semibold text-[var(--br-text-muted)]">
                    Your current CEFR reference
                  </p>
                </div>
              </div>
              {level ? (
                <div className="mt-5 rounded-[18px] bg-gradient-to-br from-[var(--br-chart-primary)] to-[var(--br-chart-primary)] p-5 text-on-dark">
                  <div className="text-[46px] font-black leading-none">
                    {level}
                  </div>
                  <p className="mt-1 text-sm font-bold text-white/80">
                    {levelGuidance[level].name}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-white/65">
                    {levelGuidance[level].summary}
                  </p>
                </div>
              ) : (
                <p className="mt-4 rounded-[16px] bg-[var(--br-canvas-elevated)] p-4 text-sm font-semibold leading-6 text-[var(--br-text-muted)]">
                  You have not taken the level test yet.
                </p>
              )}
            </div>
          </aside>

          <div className="grid gap-5">
            <section className="br-learner-card p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-[14px] bg-[color-mix(in_srgb,var(--br-success)_12%,var(--br-surface))] text-[var(--br-chart-secondary)]">
                  <UserRound className="size-5" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold">Personal details</h2>
                  <p className="text-xs font-semibold text-[var(--br-text-muted)]">
                    Update the name shown on your learning profile.
                  </p>
                </div>
              </div>
              <ProfileForm
                email={user.email ?? ""}
                firstName={profile?.first_name ?? ""}
                lastName={profile?.last_name ?? ""}
                label={profile?.label ?? ""}
                allowLabel={isStaff(profile?.role)}
                bio={profile?.bio ?? ""}
              />
            </section>

            <section className="br-learner-card p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <span
                  className={`grid size-11 place-items-center rounded-[14px] ${isEmailUser ? "bg-[var(--br-warning-soft)] text-[var(--br-warning)]" : "bg-[var(--br-canvas-elevated)] text-[var(--br-text-muted)]"}`}
                >
                  <KeyRound className="size-5" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold">Password</h2>
                  <p className="text-xs font-semibold text-[var(--br-text-muted)]">
                    {isEmailUser
                      ? "Change your BrenUp password."
                      : "Managed by your sign-in provider."}
                  </p>
                </div>
              </div>
              {isEmailUser ? (
                <ChangePasswordForm />
              ) : (
                <div className="flex items-start gap-3 rounded-[18px] bg-[var(--br-canvas-elevated)] p-4">
                  <Mail className="mt-0.5 size-5 shrink-0 text-[var(--br-chart-primary)]" />
                  <p className="text-sm font-semibold leading-6 text-[var(--br-text-muted)]">
                    You signed in with Google. Password management is handled by
                    your Google account.
                  </p>
                </div>
              )}
            </section>

            <section className="br-learner-card p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[var(--br-canvas-elevated)] text-[var(--br-chart-primary)]">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold">Privacy and account data</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">
                    You can request deletion of your BrenUp account and associated data through our Privacy Policy.
                  </p>
                  <Link
                    href="/privacy#account-deletion"
                    className="mt-3 inline-flex rounded-lg font-bold text-[var(--br-brand)] underline underline-offset-2 hover:text-[var(--br-brand-strong)]"
                  >
                    Request account deletion
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </section>
      </section>
    </LearnerAppShell>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getFreshProfile, resolvePostLoginPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/LoginForm";
import Link from "next/link";
import { X } from "lucide-react";
import { headers } from "next/headers";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const isAndroidShell = (await headers()).get("user-agent")?.includes("BrenUpAndroid") ?? false;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await getFreshProfile(user.id);
    redirect(resolvePostLoginPath(profile?.role, next));
  }

  if (isAndroidShell) {
    return (
      <main className="relative flex min-h-[calc(100vh-57px)] items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_18%_15%,color-mix(in_srgb,var(--br-brand)_14%,transparent),transparent_42%),linear-gradient(145deg,var(--br-canvas),var(--br-canvas-elevated))] px-4 py-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violetglow/5 via-transparent to-fuchsia-400/10" />
        <div className="relative w-full max-w-[400px] br-card rounded-[26px] border border-[var(--br-border)] p-5 shadow-2xl sm:p-6">
          <h1 className="text-2xl font-extrabold text-ink">Welcome back</h1>
          <p className="mt-2 text-sm font-semibold text-[var(--br-text-muted)]">Sign in or create a learner account to continue.</p>
          <Suspense fallback={null}><LoginForm /></Suspense>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-[calc(100vh-57px)] items-center justify-center overflow-hidden px-4 py-8">
      <section aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_18%_15%,color-mix(in_srgb,var(--br-brand)_14%,transparent),transparent_42%),linear-gradient(145deg,var(--br-canvas),var(--br-canvas-elevated))]">
        <div className="mx-auto h-full max-w-6xl px-6 py-7 opacity-60 blur-[2px] sm:px-10">
          <header className="flex items-center justify-between border-b border-[var(--br-border)]/60 pb-5 text-sm font-semibold text-ink">
            <span className="text-lg font-extrabold text-violetglow">BrenUp</span>
            <nav className="hidden items-center gap-8 md:flex"><span>Learn English</span><span>Live classes</span><span>Community</span><span>Resources</span></nav>
            <span className="rounded-full bg-violetglow/15 px-4 py-2 text-violetglow">My learning</span>
          </header>
          <div className="mt-8 grid gap-6 md:grid-cols-[210px_minmax(0,1fr)]">
            <aside className="space-y-3 rounded-2xl border border-[var(--br-border)]/60 bg-surface/70 p-5 text-sm font-semibold text-[var(--br-text-muted)]">
              <p className="mb-5 text-xs font-extrabold uppercase tracking-wider text-violetglow">Your workspace</p>
              <p className="rounded-xl bg-violetglow/10 px-3 py-2 text-violetglow">Overview</p>
              <p className="px-3 py-2">My courses</p><p className="px-3 py-2">Practice rooms</p><p className="px-3 py-2">Saved lessons</p><p className="px-3 py-2">Achievements</p>
            </aside>
            <div className="space-y-5 rounded-3xl border border-[var(--br-border)]/60 bg-surface/70 p-7 sm:p-10">
              <p className="text-xs font-extrabold uppercase tracking-[.18em] text-violetglow">A little practice goes a long way</p>
              <h2 className="max-w-xl text-4xl font-black leading-tight text-ink">Build confidence in every conversation.</h2>
              <p className="max-w-lg text-base text-[var(--br-text-muted)]">Explore lessons, practice speaking, and keep learning at your own pace.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="h-28 rounded-2xl bg-violetglow/10" /><div className="h-28 rounded-2xl bg-fuchsia-200/40" /><div className="h-28 rounded-2xl bg-indigo-200/40" />
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-4 backdrop-blur-[3px] sm:px-6">
        <section role="dialog" aria-modal="true" aria-labelledby="login-title" className="relative max-h-[calc(100dvh-2rem)] w-full max-w-[400px] overflow-y-auto rounded-[26px] border border-white/60 bg-surface p-5 shadow-2xl sm:p-5">
          <Link href="/" aria-label="Close sign in" className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-[var(--br-action)] text-white transition hover:bg-[var(--br-action-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--br-action)] focus-visible:ring-offset-2">
            <X size={18} aria-hidden="true" />
          </Link>
          <Suspense fallback={null}><LoginForm /></Suspense>
        </section>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isBrenUpAndroidShell } from "@/lib/nativeBridge";

export function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/account";
  const androidShell = isBrenUpAndroidShell();
  const authStatus = searchParams.get("auth");
  const callbackMessage = authStatus === "oauth_failed"
    ? "Sign-in was cancelled or could not complete. Please try again."
    : authStatus === "exchange_failed"
      ? "BrenUp couldn’t finish signing you in. Please try again."
      : authStatus === "missing_code" || authStatus === "session_missing"
        ? "The sign-in link was incomplete. Please start again."
        : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">(
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  );
  const [message, setMessage] = useState<string | null>(callbackMessage);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function authCallbackUrl() {
    const base = isBrenUpAndroidShell()
      ? "com.brenup.app://auth/callback"
      : `${window.location.origin}/auth/callback`;
    return `${base}?next=${encodeURIComponent(nextPath)}`;
  }

  function googleAuthCallbackUrl() {
    // Android OAuth returns through a verified HTTPS App Link. Keep ordinary
    // browser sign-in on the browser callback instead of opening the app.
    const path = isBrenUpAndroidShell() ? "/auth/android-callback" : "/auth/callback";
    return `${window.location.origin}${path}?next=${encodeURIComponent(nextPath)}`;
  }

  async function redirectForRole() {
    const response = await fetch(`/auth/role?next=${encodeURIComponent(nextPath)}`, {
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
    router.refresh();
    router.push(
      data?.redirectTo && data.redirectTo.startsWith("/") ? data.redirectTo : "/account"
    );
  }

  function submit() {
    startTransition(async () => {
      setMessage(null);
      setMagicLinkSent(false);

      if (!email.trim() || !password) {
        setMessage("Enter your email address and password to continue.");
        return;
      }

      if (mode === "signup") {
        const trimmedFirst = firstName.trim();
        const trimmedLast = lastName.trim();
        const fullName = [trimmedFirst, trimmedLast].filter(Boolean).join(" ");

        const result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              first_name: trimmedFirst,
              last_name: trimmedLast,
            },
          },
        });

        if (result.error) {
          setMessage(result.error.message);
          return;
        }

        if (!result.data.session) {
          setMessage("Check your email to confirm your account.");
          return;
        }

        await redirectForRole();
        return;
      }

      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        setMessage(result.error.message);
        return;
      }
      await redirectForRole();
    });
  }

  function sendMagicLink() {
    startTransition(async () => {
      setMessage(null);
      setMagicLinkSent(false);

      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setMessage("Enter your email address first.");
        return;
      }

      const redirectTo = authCallbackUrl();
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMagicLinkSent(true);
    });
  }

  function signInWithGoogle() {
    startTransition(async () => {
      setMessage(null);
      const redirectTo = googleAuthCallbackUrl();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) setMessage(error.message);
    });
  }

  return (
    <div className={androidShell ? "space-y-4" : "space-y-3"}>
      {!androidShell ? (
        <header className="text-center">
          <h1 id="login-title" className="text-2xl font-extrabold text-ink">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-[var(--br-text-muted)]">
            {mode === "signin" ? "Log in to continue learning." : "Join BrenUp and start learning today."}
          </p>
        </header>
      ) : null}

      {/* Google OAuth */}
      <button
        type="button"
        disabled={isPending}
        onClick={signInWithGoogle}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--br-border)] bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violetglow focus-visible:ring-offset-2 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
          <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58Z"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-[var(--br-text-muted)]">
        <span className="h-px flex-1 bg-black/10" />
        or
        <span className="h-px flex-1 bg-black/10" />
      </div>

      {androidShell ? (
        <div className="grid grid-cols-2 rounded-md border border-[var(--br-border)] bg-black/[0.03] p-1 text-sm">
          <button
            type="button"
            onClick={() => { setMode("signin"); setMessage(null); }}
            className={`rounded px-3 py-2 font-medium transition-colors ${
              mode === "signin" ? "bg-surface shadow-sm" : "text-[var(--br-text-muted)] hover:text-[var(--br-text-muted)]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setMessage(null); }}
            className={`rounded px-3 py-2 font-medium transition-colors ${
              mode === "signup" ? "bg-surface shadow-sm" : "text-[var(--br-text-muted)] hover:text-[var(--br-text-muted)]"
            }`}
          >
            Register
          </button>
        </div>
      ) : null}

      <form className={androidShell ? "space-y-4" : "space-y-3"} onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {/* Name fields — register only */}
      {mode === "signup" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            First name
            <input
              className="mt-1.5 w-full rounded-xl border border-[var(--br-surface-strong)] px-3.5 py-2.5 text-sm font-semibold placeholder-[var(--br-text-muted)] focus:border-violetglow focus:outline-none focus:ring-4 focus:ring-violetglow/10 transition"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Maria"
              autoComplete="given-name"
            />
          </label>
          <label className="block text-sm font-medium">
            Last name
            <input
              className="mt-1.5 w-full rounded-xl border border-[var(--br-surface-strong)] px-3.5 py-2.5 text-sm font-semibold placeholder-[var(--br-text-muted)] focus:border-violetglow focus:outline-none focus:ring-4 focus:ring-violetglow/10 transition"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Santos"
              autoComplete="family-name"
            />
          </label>
        </div>
      ) : null}

      <label className="block text-sm font-medium">
        Email{!androidShell ? <span className="ml-1 text-rose-500" aria-hidden="true">*</span> : null}
        <input
          type="email"
          required
          aria-required="true"
          className={`mt-1.5 w-full rounded-xl border border-[var(--br-surface-strong)] px-3.5 text-sm font-semibold placeholder-[var(--br-text-muted)] focus:border-violetglow focus:outline-none focus:ring-4 focus:ring-violetglow/10 transition ${androidShell ? "py-2.5" : "bg-[var(--br-surface-muted)] py-3"}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          autoComplete="email"
        />
      </label>

      <label className="block text-sm font-medium">
        Password{!androidShell ? <span className="ml-1 text-rose-500" aria-hidden="true">*</span> : null}
        <span className="relative mt-1.5 block">
          <input
            type={showPassword ? "text" : "password"}
            required
            aria-required="true"
            className={`w-full rounded-xl border border-[var(--br-surface-strong)] px-3.5 py-3 pr-12 text-sm font-semibold placeholder-[var(--br-text-muted)] focus:border-violetglow focus:outline-none focus:ring-4 focus:ring-violetglow/10 transition ${androidShell ? "" : "bg-[var(--br-surface-muted)]"}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-2 grid w-9 place-items-center rounded-lg text-[var(--br-text-muted)] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violetglow">
            {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </span>
      </label>

      {/* Forgot password link — sign in only */}
      {mode === "signin" ? (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={isPending || !email.trim()}
            onClick={sendMagicLink}
            className={`text-left text-xs font-semibold hover:underline disabled:opacity-50 ${androidShell ? "text-violetglow" : "text-[var(--br-action-strong)]"}`}
          >
            Email me a sign-in link
          </button>
          <Link href="/forgot-password" className={`text-xs hover:underline ${androidShell ? "text-violetglow" : "text-[var(--br-action-strong)]"}`}>
            Forgot password?
          </Link>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className={`w-full px-4 text-sm font-bold text-on-dark shadow-[var(--br-shadow)] disabled:opacity-60 transition ${androidShell ? "rounded-xl bg-violetglow py-2.5 hover:bg-[var(--br-brand-strong)]" : "rounded-full bg-[var(--br-action)] py-3 hover:bg-[var(--br-action-strong)]"}`}
      >
        {isPending ? "Working..." : mode === "signin" ? (androidShell ? "Sign in" : "Log in") : "Create account"}
      </button>

      {message ? (
        <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{message}</p>
      ) : null}

      {magicLinkSent ? (
        <p className="rounded-md bg-moss/10 p-3 text-sm text-moss">
          Check your inbox for a secure BrenUp sign-in link. It may take a moment to arrive.
        </p>
      ) : null}
      </form>

      {!androidShell ? (
        <p className="pt-1 text-center text-sm text-[var(--br-text-muted)]">
          {mode === "signin" ? "New to BrenUp? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); }}
            className={`font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${androidShell ? "text-violetglow focus-visible:ring-violetglow" : "text-[var(--br-action-strong)] focus-visible:ring-[var(--br-action)]"}`}
          >
            {mode === "signin" ? "Create an account" : "Log in"}
          </button>
        </p>
      ) : null}
    </div>
  );
}

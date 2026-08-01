"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/account";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  function signInWithGoogle() {
    startTransition(async () => {
      setMessage(null);
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) setMessage(error.message);
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Google OAuth */}
      <button
        type="button"
        disabled={isPending}
        onClick={signInWithGoogle}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-black/15 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-black/[0.03] disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
          <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58Z"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-black/35">
        <span className="h-px flex-1 bg-black/10" />
        or
        <span className="h-px flex-1 bg-black/10" />
      </div>

      {/* Sign in / Register tabs */}
      <div className="grid grid-cols-2 rounded-md border border-black/10 bg-black/[0.03] p-1 text-sm">
        <button
          type="button"
          onClick={() => { setMode("signin"); setMessage(null); }}
          className={`rounded px-3 py-2 font-medium transition-colors ${
            mode === "signin" ? "bg-white shadow-sm" : "text-black/60 hover:text-black"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setMode("signup"); setMessage(null); }}
          className={`rounded px-3 py-2 font-medium transition-colors ${
            mode === "signup" ? "bg-white shadow-sm" : "text-black/60 hover:text-black"
          }`}
        >
          Register
        </button>
      </div>

      {/* Name fields — register only */}
      {mode === "signup" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            First name
            <input
              className="mt-1.5 w-full rounded-xl border border-[var(--br-surface-strong)] px-3.5 py-2.5 text-sm font-semibold placeholder-[#B0B5C8] focus:border-violetglow focus:outline-none focus:ring-4 focus:ring-violetglow/10 transition"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Maria"
              autoComplete="given-name"
            />
          </label>
          <label className="block text-sm font-medium">
            Last name
            <input
              className="mt-1.5 w-full rounded-xl border border-[var(--br-surface-strong)] px-3.5 py-2.5 text-sm font-semibold placeholder-[#B0B5C8] focus:border-violetglow focus:outline-none focus:ring-4 focus:ring-violetglow/10 transition"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Santos"
              autoComplete="family-name"
            />
          </label>
        </div>
      ) : null}

      <label className="block text-sm font-medium">
        Email
        <input
          type="email"
          className="mt-1.5 w-full rounded-xl border border-[var(--br-surface-strong)] px-3.5 py-2.5 text-sm font-semibold placeholder-[#B0B5C8] focus:border-violetglow focus:outline-none focus:ring-4 focus:ring-violetglow/10 transition"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>

      <label className="block text-sm font-medium">
        Password
        <input
          type="password"
          className="mt-1.5 w-full rounded-xl border border-[var(--br-surface-strong)] px-3.5 py-2.5 text-sm font-semibold placeholder-[#B0B5C8] focus:border-violetglow focus:outline-none focus:ring-4 focus:ring-violetglow/10 transition"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </label>

      {/* Forgot password link — sign in only */}
      {mode === "signin" ? (
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-violetglow hover:underline">
            Forgot password?
          </Link>
        </div>
      ) : null}

      <button
        type="button"
        disabled={isPending}
        onClick={submit}
        className="w-full rounded-xl bg-violetglow px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(124,58,237,0.25)] hover:bg-[#6c2ee5] disabled:opacity-60 transition"
      >
        {isPending ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
      </button>

      {message ? (
        <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{message}</p>
      ) : null}
    </div>
  );
}

"use client";

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
      cache: "no-store"
    });
    const data = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
    router.refresh();
    router.push(data?.redirectTo && data.redirectTo.startsWith("/") ? data.redirectTo : "/account");
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

        // Email confirmation required before session exists
        if (!result.data.session) {
          setMessage("Check your email to confirm your account.");
          return;
        }

        await redirectForRole();
        return;
      }

      // Sign in
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
        options: { redirectTo }
      });
      if (error) setMessage(error.message);
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <button
        type="button"
        disabled={isPending}
        onClick={signInWithGoogle}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-black/[0.03] disabled:opacity-60"
      >
        Continue with Google
      </button>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-black/40">
        <span className="h-px flex-1 bg-black/10" />
        or
        <span className="h-px flex-1 bg-black/10" />
      </div>
      <div className="grid grid-cols-2 rounded-md border border-black/10 bg-black/[0.03] p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`rounded px-3 py-2 ${mode === "signin" ? "bg-white shadow-sm" : ""}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded px-3 py-2 ${mode === "signup" ? "bg-white shadow-sm" : ""}`}
        >
          Register
        </button>
      </div>

      {mode === "signup" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            First name
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Maria"
              autoComplete="given-name"
            />
          </label>
          <label className="block text-sm">
            Last name
            <input
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Santos"
              autoComplete="family-name"
            />
          </label>
        </div>
      ) : null}

      <label className="block text-sm">
        Email
        <input
          type="email"
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>
      <label className="block text-sm">
        Password
        <input
          type="password"
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </label>
      <button
        type="button"
        disabled={isPending}
        onClick={submit}
        className="w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      {message ? (
        <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{message}</p>
      ) : null}
    </div>
  );
}

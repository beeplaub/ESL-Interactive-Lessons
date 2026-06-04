"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      setMessage(null);
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { data: { full_name: fullName } }
            });

      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      router.refresh();
      router.push("/dashboard");
    });
  }

  return (
    <div className="mt-6 space-y-4">
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
        <label className="block text-sm">
          Name
          <input
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
      ) : null}
      <label className="block text-sm">
        Email
        <input
          type="email"
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        Password
        <input
          type="password"
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
      {message ? <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{message}</p> : null}
    </div>
  );
}

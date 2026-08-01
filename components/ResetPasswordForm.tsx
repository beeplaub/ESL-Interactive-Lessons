"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function StrengthBar({ password }: { password: string }) {
  const score = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8)  s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();
  const label = ["", "Weak", "Fair", "Good", "Strong", "Very strong"][score];
  const color  = ["", "bg-coral", "bg-orange-400", "bg-yellow-400", "bg-moss", "bg-moss"][score];
  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1,2,3,4,5].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? color : "bg-black/10"}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-black/45">{label}</p>
    </div>
  );
}

export function ResetPasswordForm() {
  const supabase = createClient();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [show,     setShow]     = useState(false);
  const [message,  setMessage]  = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    if (password.length < 8) { setMessage("Password must be at least 8 characters."); return; }
    if (password !== confirm)  { setMessage("Passwords do not match."); return; }
    startTransition(async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setMessage(error.message); return; }
      setSuccess(true);
      setTimeout(() => router.push("/account"), 2000);
    });
  }

  if (success) {
    return (
      <div className="mt-6 rounded-md bg-moss/10 p-4 text-sm">
        <p className="font-semibold text-moss">Password updated!</p>
        <p className="mt-1 text-black/65">Redirecting you to your account…</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <label className="block text-sm font-medium">
        New password
        <div className="relative mt-1">
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="w-full rounded-md border border-black/15 px-3 py-2 pr-10 font-normal"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 hover:text-black"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <StrengthBar password={password} />
      </label>

      <label className="block text-sm font-medium">
        Confirm password
        <input
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="Repeat your new password"
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
        />
      </label>

      <button
        type="button"
        disabled={isPending || !password || !confirm}
        onClick={submit}
        className="w-full rounded-md bg-dark px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? "Updating..." : "Set new password"}
      </button>

      {message ? (
        <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{message}</p>
      ) : null}
    </div>
  );
}

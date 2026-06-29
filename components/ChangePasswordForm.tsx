"use client";

import { useState, useTransition } from "react";
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
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= score ? color : "bg-[#ECECF5]"}`} />
        ))}
      </div>
      <p className="mt-1 text-xs font-semibold text-[#8B90A7]">{label}</p>
    </div>
  );
}

export function ChangePasswordForm() {
  const supabase = createClient();
  const [current,  setCurrent]  = useState("");
  const [next,     setNext]     = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showCur,  setShowCur]  = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [status,   setStatus]   = useState<"idle" | "success" | "error">("idle");
  const [message,  setMessage]  = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    setStatus("idle");
    if (!current)           { setMessage("Please enter your current password."); return; }
    if (next.length < 8)    { setMessage("New password must be at least 8 characters."); return; }
    if (next !== confirm)   { setMessage("New passwords do not match."); return; }
    if (next === current)   { setMessage("New password must differ from your current password."); return; }

    startTransition(async () => {
      // Step 1: verify current password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setMessage("Session error. Please sign in again."); return; }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (signInError) {
        setStatus("error");
        setMessage("Current password is incorrect.");
        return;
      }

      // Step 2: set the new password
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        setStatus("error");
        setMessage(updateError.message);
        return;
      }

      setStatus("success");
      setMessage("Password changed successfully.");
      setCurrent(""); setNext(""); setConfirm("");
    });
  }

  return (
    <div className="mt-5 grid gap-4">
      {/* Current password */}
      <label className="block text-sm font-extrabold text-[#35405F]">
        Current password
        <div className="relative mt-1">
          <input
            type={showCur ? "text" : "password"}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-[14px] border border-[#ECECF5] bg-[#F8F8FC] px-4 py-3 pr-11 font-semibold outline-none transition focus:border-[#6C3BFF] focus:bg-white"
          />
          <button type="button" onClick={() => setShowCur((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B90A7] hover:text-[#14172B]"
            aria-label={showCur ? "Hide" : "Show"}>
            {showCur ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </label>

      {/* New password */}
      <label className="block text-sm font-extrabold text-[#35405F]">
        New password
        <div className="relative mt-1">
          <input
            type={showNew ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="w-full rounded-[14px] border border-[#ECECF5] bg-[#F8F8FC] px-4 py-3 pr-11 font-semibold outline-none transition focus:border-[#6C3BFF] focus:bg-white"
          />
          <button type="button" onClick={() => setShowNew((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B90A7] hover:text-[#14172B]"
            aria-label={showNew ? "Hide" : "Show"}>
            {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <StrengthBar password={next} />
      </label>

      {/* Confirm new password */}
      <label className="block text-sm font-extrabold text-[#35405F]">
        Confirm new password
        <input
          type={showNew ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="mt-1 w-full rounded-[14px] border border-[#ECECF5] bg-[#F8F8FC] px-4 py-3 font-semibold outline-none transition focus:border-[#6C3BFF] focus:bg-white"
        />
      </label>

      <button
        type="button"
        disabled={isPending || !current || !next || !confirm}
        onClick={submit}
        className="w-fit rounded-[14px] bg-gradient-to-br from-[#14172B] to-[#303751] px-5 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(20,23,43,.18)] disabled:opacity-60"
      >
        {isPending ? "Updating..." : "Change password"}
      </button>

      {message ? (
        <p className={`rounded-[14px] p-3 text-sm font-extrabold ${
          status === "success" ? "bg-[#E7FBF4] text-[#00A978]" : "bg-[#FFF0F2] text-[#D9324A]"
        }`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

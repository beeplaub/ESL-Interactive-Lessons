"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordQuizAttempt } from "@/app/quizzes/actions";

export type PendingAttempt = {
  quizId: string;
  score: number;
  total: number;
  answers: Record<string, unknown>;
};

const STORAGE_KEY = "brenup_pending_quiz_attempt";

export function storePendingAttempt(attempt: PendingAttempt) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(attempt)); } catch {}
}

export function clearPendingAttempt() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function readPendingAttempt(): PendingAttempt | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingAttempt) : null;
  } catch { return null; }
}

// ── Password strength bar ─────────────────────────────────────────────────────
function StrengthBar({ password }: { password: string }) {
  const score = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8)           s++;
    if (password.length >= 12)          s++;
    if (/[A-Z]/.test(password))         s++;
    if (/[0-9]/.test(password))         s++;
    if (/[^A-Za-z0-9]/.test(password))  s++;
    return s;
  })();
  const label = ["", "Weak", "Fair", "Good", "Strong", "Very strong"][score];
  const color  = ["", "bg-coral", "bg-orange-400", "bg-yellow-400", "bg-moss", "bg-moss"][score];
  if (!password) return null;
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[1,2,3,4,5].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? color : "bg-black/10"}`} />
        ))}
      </div>
      <p className="mt-0.5 text-[10px] text-black/40">{label}</p>
    </div>
  );
}

// ── Score header ──────────────────────────────────────────────────────────────
function ScoreHeader({ score, total, onClose }: { score: number; total: number; onClose: () => void }) {
  const percent = total ? Math.round((score / total) * 100) : 0;
  const feedback =
    percent >= 80 ? "Excellent work! 🎉" :
    percent >= 60 ? "Good effort! Keep it up." :
    percent >= 40 ? "A solid start. Practice makes perfect." :
    "Every attempt builds your English. Don't stop!";
  const barColor =
    percent >= 80 ? "bg-moss" :
    percent >= 60 ? "bg-blue-500" :
    percent >= 40 ? "bg-yellow-400" : "bg-coral";
  return (
    <div className="bg-ink px-6 py-5 text-white">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Your score</p>
          <p className="mt-1 text-4xl font-bold tracking-tight">
            {score}
            <span className="text-2xl font-normal text-white/50">/{total}</span>
            <span className="ml-3 text-xl font-semibold text-white/70">{percent}%</span>
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-sm text-white/65">{feedback}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          className="mt-0.5 rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

// ── Main popup ────────────────────────────────────────────────────────────────
export function GuestScorePopup({
  score, total, attempt, onDismiss,
}: {
  score: number; total: number; attempt: PendingAttempt; onDismiss: () => void;
}) {
  const supabase = createClient();
  const router   = useRouter();
  const [tab,       setTab]       = useState<"register" | "signin">("register");
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [message,   setMessage]   = useState<string | null>(null);
  const [saved,     setSaved]     = useState(false);
  const [isPending, startTransition] = useTransition();

  async function onAuthSuccess() {
    try {
      await recordQuizAttempt({ quizId: attempt.quizId, score: attempt.score, total: attempt.total, answers: attempt.answers });
    } catch {}
    clearPendingAttempt();
    setSaved(true);
    setTimeout(() => { router.refresh(); router.push("/account"); }, 1400);
  }

  function submitRegister() {
    const trimFirst = firstName.trim();
    if (!trimFirst)          { setMessage("Please enter your first name."); return; }
    if (!email.trim())       { setMessage("Please enter your email."); return; }
    if (password.length < 8) { setMessage("Password must be at least 8 characters."); return; }
    startTransition(async () => {
      setMessage(null);
      const trimLast = lastName.trim();
      const fullName = [trimFirst, trimLast].filter(Boolean).join(" ");
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: fullName, first_name: trimFirst, last_name: trimLast } },
      });
      if (error) { setMessage(error.message); return; }
      if (!data.session) { setMessage("Please check your email to confirm your account, then sign in."); return; }
      await onAuthSuccess();
    });
  }

  function submitSignIn() {
    if (!email.trim() || !password) { setMessage("Please enter your email and password."); return; }
    startTransition(async () => {
      setMessage(null);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setMessage(error.message); return; }
      await onAuthSuccess();
    });
  }

  function signInWithGoogle() {
    storePendingAttempt(attempt);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/account` },
      });
      if (error) setMessage(error.message);
    });
  }

  if (saved) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <div className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex flex-col items-center gap-3 px-8 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-moss/10">
              <CheckCircle2 size={28} className="text-moss" />
            </div>
            <p className="text-lg font-semibold">Score saved!</p>
            <p className="text-sm text-black/55">Your result is now in your account. Taking you there now…</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onDismiss} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Save your score"
        className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: "90vh", overflowY: "auto" }}>
        <ScoreHeader score={score} total={total} onClose={onDismiss} />
        <div className="px-6 py-5">
          <p className="text-sm font-semibold text-ink">Save your score and build your learning history</p>
          <p className="mt-1 text-xs leading-5 text-black/55">
            A free BrenUp account keeps all your quiz scores, shows your improvement over time,
            and lets you track exactly where your English is getting stronger.
          </p>
          <button type="button" disabled={isPending} onClick={signInWithGoogle}
            className="mt-4 flex w-full items-center justify-center gap-3 rounded-md border border-black/15 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-black/[0.03] disabled:opacity-60">
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
              <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58Z"/>
            </svg>
            Continue with Google
          </button>
          <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-wide text-black/30">
            <span className="h-px flex-1 bg-black/10" />or<span className="h-px flex-1 bg-black/10" />
          </div>
          <div className="mb-3 grid grid-cols-2 rounded-md border border-black/10 bg-black/[0.03] p-0.5 text-xs">
            <button type="button" onClick={() => { setTab("register"); setMessage(null); }}
              className={`rounded py-1.5 font-medium transition-colors ${tab === "register" ? "bg-white shadow-sm text-ink" : "text-black/50 hover:text-black"}`}>
              Create account
            </button>
            <button type="button" onClick={() => { setTab("signin"); setMessage(null); }}
              className={`rounded py-1.5 font-medium transition-colors ${tab === "signin" ? "bg-white shadow-sm text-ink" : "text-black/50 hover:text-black"}`}>
              Sign in
            </button>
          </div>
          {tab === "register" ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium">First name <span className="text-coral">*</span>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Maria" autoComplete="given-name"
                    className="mt-1 w-full rounded-md border border-black/15 px-2.5 py-1.5 text-sm font-normal" />
                </label>
                <label className="block text-xs font-medium">Last name
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Santos" autoComplete="family-name"
                    className="mt-1 w-full rounded-md border border-black/15 px-2.5 py-1.5 text-sm font-normal" />
                </label>
              </div>
              <label className="block text-xs font-medium">Email <span className="text-coral">*</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  className="mt-1 w-full rounded-md border border-black/15 px-2.5 py-1.5 text-sm font-normal" />
              </label>
              <label className="block text-xs font-medium">Password <span className="text-coral">*</span>
                <div className="relative mt-1">
                  <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password" placeholder="At least 8 characters"
                    className="w-full rounded-md border border-black/15 px-2.5 py-1.5 pr-8 text-sm font-normal" />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-black/35 hover:text-black"
                    aria-label={showPw ? "Hide password" : "Show password"}>
                    {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <StrengthBar password={password} />
              </label>
              <button type="button" disabled={isPending} onClick={submitRegister}
                className="w-full rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {isPending ? "Creating account…" : "Create account & save score"}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <label className="block text-xs font-medium">Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  className="mt-1 w-full rounded-md border border-black/15 px-2.5 py-1.5 text-sm font-normal" />
              </label>
              <label className="block text-xs font-medium">Password
                <div className="relative mt-1">
                  <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-md border border-black/15 px-2.5 py-1.5 pr-8 text-sm font-normal" />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-black/35 hover:text-black"
                    aria-label={showPw ? "Hide password" : "Show password"}>
                    {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </label>
              <button type="button" disabled={isPending} onClick={submitSignIn}
                className="w-full rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {isPending ? "Signing in…" : "Sign in & save score"}
              </button>
            </div>
          )}
          {message ? (
            <p className="mt-3 rounded-md bg-coral/10 p-2.5 text-xs text-coral">{message}</p>
          ) : null}
          <button type="button" onClick={onDismiss}
            className="mt-4 w-full text-center text-xs text-black/35 hover:text-black/60">
            No thanks — continue without saving
          </button>
        </div>
      </div>
    </>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { Bot, Check, LoaderCircle, Search, UsersRound } from "lucide-react";
import { saveTutorGrant, searchTutorLearners, setTutorGrantActive } from "@/app/admin/ai-tutor/actions";

type Course = { id: string; title: string; status: string };
type Learner = { id: string; name: string; email: string };
type Grant = {
  id: string; scopeType: "ALL" | "COURSE" | "LEARNER"; targetId: string | null; targetLabel: string; targetDetail: string;
  engine: "GEMINI" | "KOKORO"; maxSessionMinutes: number; dailyMinutesLimit: number | null; totalMinutesLimit: number | null; isActive: boolean; updatedAt: string;
};

export function AiTutorAdminPanel({ courses, grants }: { courses: Course[]; grants: Grant[] }) {
  const [scopeType, setScopeType] = useState<"ALL" | "COURSE" | "LEARNER">("COURSE");
  const [targetId, setTargetId] = useState("");
  const [engine, setEngine] = useState<"GEMINI" | "KOKORO">("GEMINI");
  const [maxSessionMinutes, setMaxSessionMinutes] = useState(5);
  const [dailyLimit, setDailyLimit] = useState("");
  const [totalLimit, setTotalLimit] = useState("");
  const [search, setSearch] = useState("");
  const [learners, setLearners] = useState<Learner[]>([]);
  const [selectedLearner, setSelectedLearner] = useState<Learner | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeCount = grants.filter((grant) => grant.isActive).length;
  const availableCourses = useMemo(() => courses.filter((course) => course.status !== "ARCHIVED"), [courses]);

  function changeScope(value: "ALL" | "COURSE" | "LEARNER") {
    setScopeType(value); setTargetId(""); setSelectedLearner(null); setSearch(""); setLearners([]); setMessage("");
  }

  function lookupLearners(value: string) {
    setSearch(value); setSelectedLearner(null); setTargetId("");
    if (value.trim().length < 2) { setLearners([]); return; }
    startTransition(async () => {
      try { setLearners(await searchTutorLearners(value)); }
      catch { setMessage("Learner search is unavailable right now."); }
    });
  }

  function save() {
    setMessage("");
    startTransition(async () => {
      try {
        await saveTutorGrant({
          scopeType, targetId: targetId || undefined, engine, maxSessionMinutes,
          dailyMinutesLimit: dailyLimit ? Number(dailyLimit) : null,
          totalMinutesLimit: totalLimit ? Number(totalLimit) : null,
        });
        setMessage("AI Tutor access saved.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save access."); }
    });
  }

  function toggleGrant(grant: Grant) {
    startTransition(async () => {
      try { await setTutorGrantActive(grant.id, !grant.isActive); setMessage(grant.isActive ? "Access paused." : "Access enabled."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Could not update access."); }
    });
  }

  function editGrant(grant: Grant) {
    setScopeType(grant.scopeType);
    setTargetId(grant.targetId || "");
    setEngine(grant.engine);
    setMaxSessionMinutes(grant.maxSessionMinutes);
    setDailyLimit(grant.dailyMinutesLimit === null ? "" : String(grant.dailyMinutesLimit));
    setTotalLimit(grant.totalMinutesLimit === null ? "" : String(grant.totalMinutesLimit));
    if (grant.scopeType === "LEARNER" && grant.targetId) {
      setSelectedLearner({ id: grant.targetId, name: grant.targetLabel, email: grant.targetDetail });
      setSearch(grant.targetLabel);
    } else { setSelectedLearner(null); setSearch(""); }
    setMessage("Rule loaded for editing. Save to apply your changes.");
  }

  return <main className="mx-auto w-full max-w-6xl space-y-6 pb-10">
    <header className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--br-brand-soft)] text-[var(--br-brand)]"><Bot size={24}/></span>
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--br-brand)]">Platform controls</p><h1 className="mt-1 text-2xl font-black tracking-tight">AI Tutor access</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--br-text-muted)]">Assign a tutor engine and minute allowances. Individual rules override course rules, and course rules override the default.</p></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-[var(--br-text-muted)]"><span className="rounded-full bg-[var(--br-surface-muted)] px-3 py-1.5">{activeCount} active rules</span><span className="rounded-full bg-[var(--br-surface-muted)] px-3 py-1.5">Minutes are reserved when a session starts</span></div>
    </header>

    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
      <div className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-extrabold">Create or update an access rule</h2>
        <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Grant scope">
          {[ ["COURSE", "Course"], ["LEARNER", "Learner"], ["ALL", "All learners"] ].map(([value, label]) => <button key={value} type="button" onClick={() => changeScope(value as typeof scopeType)} aria-pressed={scopeType === value} className={`rounded-xl border px-2 py-2.5 text-sm font-bold transition ${scopeType === value ? "border-[var(--br-brand)] bg-[var(--br-brand-soft)] text-[var(--br-brand)]" : "border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"}`}>{label}</button>)}
        </div>
        {scopeType === "COURSE" ? <label className="mt-4 block text-sm font-bold">Course<select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas)] px-3 font-normal"><option value="">Choose a course</option>{availableCourses.map((course) => <option key={course.id} value={course.id}>{course.title}{course.status !== "PUBLISHED" ? ` · ${course.status.toLowerCase()}` : ""}</option>)}</select><span className="mt-1 block text-xs font-normal text-[var(--br-text-muted)]">Applies to active and completed course enrollments.</span></label> : null}
        {scopeType === "LEARNER" ? <div className="relative mt-4"><label htmlFor="tutor-learner-search" className="text-sm font-bold">Find learner by name or email</label><div className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas)] px-3"><Search size={16} className="text-[var(--br-text-muted)]"/><input id="tutor-learner-search" value={search} onChange={(event) => lookupLearners(event.target.value)} placeholder="Type at least 2 characters" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></div>{isPending && search.length >= 2 ? <span className="absolute right-3 top-9"><LoaderCircle size={16} className="animate-spin"/></span> : null}{learners.length && !selectedLearner ? <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[var(--br-border)] bg-white p-1 shadow-lg">{learners.map((learner) => <button key={learner.id} type="button" onClick={() => { setSelectedLearner(learner); setTargetId(learner.id); setSearch(learner.name); setLearners([]); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-[var(--br-surface-muted)]"><span className="grid size-8 place-items-center rounded-full bg-[var(--br-brand-soft)] text-[var(--br-brand)]"><UsersRound size={15}/></span><span className="min-w-0"><span className="block truncate text-sm font-bold">{learner.name}</span><span className="block truncate text-xs text-[var(--br-text-muted)]">{learner.email}</span></span></button>)}</div> : null}{selectedLearner ? <p className="mt-1 text-xs text-emerald-700">Selected: {selectedLearner.email || selectedLearner.name}</p> : null}</div> : null}
        {scopeType === "ALL" ? <p className="mt-4 rounded-xl bg-[var(--br-surface-muted)] px-3 py-2.5 text-xs leading-5 text-[var(--br-text-muted)]">This default applies to learners without a matching individual or course rule.</p> : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">Tutor engine<select value={engine} onChange={(event) => setEngine(event.target.value as "GEMINI" | "KOKORO")} className="mt-1.5 h-11 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas)] px-3 font-normal"><option value="GEMINI">Gemini · live voice</option><option value="KOKORO">Kokoro · BrenUp AI voice</option></select></label>
          <label className="text-sm font-bold">Max lesson length<span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas)] px-3"><input type="number" min={1} max={60} value={maxSessionMinutes} onChange={(event) => setMaxSessionMinutes(Number(event.target.value))} className="w-full bg-transparent font-normal outline-none"/><span className="text-xs font-semibold text-[var(--br-text-muted)]">minutes · max 60</span></span></label>
          <label className="text-sm font-bold">Daily allowance<span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas)] px-3"><input type="number" min={1} max={1440} value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} placeholder="Unlimited" className="w-full bg-transparent font-normal outline-none"/><span className="text-xs font-semibold text-[var(--br-text-muted)]">minutes/day</span></span></label>
          <label className="text-sm font-bold">Total allowance<span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas)] px-3"><input type="number" min={1} max={1000000} value={totalLimit} onChange={(event) => setTotalLimit(event.target.value)} placeholder="Unlimited" className="w-full bg-transparent font-normal outline-none"/><span className="text-xs font-semibold text-[var(--br-text-muted)]">minutes total</span></span></label>
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--br-text-muted)]">Leave an allowance blank for no limit. Daily totals reset at 00:00 UTC. A learner’s first matching access rule takes priority.</p>
        {message ? <p role="status" className="mt-3 rounded-lg bg-[var(--br-surface-muted)] px-3 py-2 text-sm font-medium text-[var(--br-text)]">{message}</p> : null}
        <button type="button" disabled={isPending || (scopeType === "COURSE" || scopeType === "LEARNER") && !targetId} onClick={save} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--br-brand)] px-4 text-sm font-extrabold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{isPending ? <LoaderCircle size={16} className="animate-spin"/> : <Check size={16}/>} Save access rule</button>
      </div>

      <div className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">Current access rules</h2><p className="mt-1 text-xs text-[var(--br-text-muted)]">Specific learner rules take priority over course rules.</p></div></div>
        <div className="mt-4 max-h-[690px] space-y-3 overflow-auto pr-1">{grants.map((grant) => <article key={grant.id} className={`rounded-xl border p-4 ${grant.isActive ? "border-[var(--br-border)] bg-[var(--br-canvas)]" : "border-[var(--br-border)] bg-[var(--br-surface-muted)] opacity-70"}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-extrabold">{grant.targetLabel}</p><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">{grant.targetDetail}</p></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => editGrant(grant)} className="rounded-full border border-[var(--br-border)] px-2.5 py-1 text-xs font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]">Edit</button><button type="button" disabled={isPending} onClick={() => toggleGrant(grant)} className={`rounded-full px-2.5 py-1 text-xs font-bold ${grant.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{grant.isActive ? "Active" : "Paused"}</button></div></div>
          <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800">{grant.engine}</span><span className="rounded-full bg-[var(--br-surface-muted)] px-2.5 py-1 text-xs font-semibold">{grant.maxSessionMinutes} min/session</span><span className="rounded-full bg-[var(--br-surface-muted)] px-2.5 py-1 text-xs font-semibold">{grant.dailyMinutesLimit ?? "∞"} min/day</span><span className="rounded-full bg-[var(--br-surface-muted)] px-2.5 py-1 text-xs font-semibold">{grant.totalMinutesLimit ?? "∞"} min total</span></div>
        </article>)}{grants.length === 0 ? <p className="rounded-xl bg-[var(--br-surface-muted)] p-5 text-center text-sm text-[var(--br-text-muted)]">No access rules yet.</p> : null}</div>
      </div>
    </section>
  </main>;
}

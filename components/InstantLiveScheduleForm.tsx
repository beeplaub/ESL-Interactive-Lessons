"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Search, UsersRound } from "lucide-react";

type ScopeOption = { scopeType: "CLASS" | "COURSE"; scopeId: string; title: string; context?: string };
type Learner = { id: string; name: string };

export function InstantLiveScheduleForm({ options }: { options: ScopeOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [duration, setDuration] = useState("60");
  const [roomLocked, setRoomLocked] = useState(false);
  const [accessMode, setAccessMode] = useState<"INVITED" | "LINK">("INVITED");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scopeKeys, setScopeKeys] = useState<string[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const selectedScopes = scopeKeys.map(key => options.find(option => `${option.scopeType}:${option.scopeId}` === key)).filter((item): item is ScopeOption => Boolean(item));
  const visibleLearners = learners.filter(learner => learner.name.toLowerCase().includes(search.toLowerCase()));

  async function toggleScope(option: ScopeOption) {
    const key = `${option.scopeType}:${option.scopeId}`;
    const next = scopeKeys.includes(key) ? scopeKeys.filter(item => item !== key) : [...scopeKeys, key];
    setScopeKeys(next); setError(""); setLoadingAudience(true);
    try {
      if (!next.length) { setLearners([]); setSelected([]); return; }
      const scopes = next.map(scopeKey => { const [scopeType, scopeId] = scopeKey.split(":"); return { scopeType, scopeId }; });
      const response = await fetch("/api/instant-live/audience", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scopes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the class audience.");
      setLearners(data.learners); setSelected(data.learners.map((learner: Learner) => learner.id));
    } catch (err) { setLearners([]); setSelected([]); setError(err instanceof Error ? err.message : "Could not load the class audience."); }
    finally { setLoadingAudience(false); }
  }

  function toggleLearner(id: string) { setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]); }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!scopeKeys.length) { setError("Choose at least one class or course."); return; }
    if (!selected.length) { setError("Choose at least one learner to invite."); return; }
    if (!scheduledLocal || !Number.isFinite(new Date(scheduledLocal).getTime())) { setError("Choose the date and start time."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/instant-live/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        title, description, scheduledStartAt: new Date(scheduledLocal).toISOString(), timezone,
        durationMinutes: Number(duration), roomLocked, accessMode, confirmOpenAccess: confirmOpen,
        scopes: selectedScopes.map(scope => ({ scopeType: scope.scopeType, scopeId: scope.scopeId })), inviteeIds: selected,
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not schedule this class.");
      router.push("/admin/live-classes?status=upcoming"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not schedule this class."); setSaving(false); }
  }

  return <form onSubmit={save} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div className="space-y-5 rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[var(--br-shadow)] sm:p-6">
      <div><h2 className="text-lg font-extrabold">Class details</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">Set a time, choose the learners, and send an invitation.</p></div>
      <label className="block text-sm font-bold">Class title<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal outline-none focus:border-[var(--br-chart-primary)]" placeholder="e.g. Speaking practice: giving directions"/></label>
      <label className="block text-sm font-bold">Short description <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><textarea maxLength={500} rows={2} value={description} onChange={event => setDescription(event.target.value)} className="mt-1.5 block w-full resize-y rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 font-normal outline-none focus:border-[var(--br-chart-primary)]"/></label>
      <div className="grid gap-3 sm:grid-cols-3"><label className="block text-sm font-bold">Date &amp; start time<input required type="datetime-local" value={scheduledLocal} onChange={event => setScheduledLocal(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 text-sm font-normal"/></label><label className="block text-sm font-bold">Duration<select value={duration} onChange={event => setDuration(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 text-sm font-normal"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option></select></label><div className="rounded-xl bg-[var(--br-surface-muted)] p-3 text-sm"><span className="block text-xs font-bold text-[var(--br-text-muted)]">Your timezone</span><span className="mt-1 block font-semibold">{timezone}</span></div></div>
      <fieldset><legend className="text-sm font-bold">Invite from your classes or courses</legend><p className="mt-1 text-xs text-[var(--br-text-muted)]">Only learners on a roster you’re allowed to manage are available.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{options.map(option => { const key = `${option.scopeType}:${option.scopeId}`; const checked = scopeKeys.includes(key); return <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${checked ? "border-[var(--br-chart-primary)] bg-[var(--br-surface-muted)]" : "border-[var(--br-border)]"}`}><input type="checkbox" checked={checked} onChange={() => void toggleScope(option)} className="accent-[var(--br-chart-primary)]"/><span className="min-w-0 flex-1"><span className="block truncate font-bold">{option.title}</span><span className="text-xs text-[var(--br-text-muted)]">{option.scopeType === "CLASS" ? "Class" : "Course"}{option.context ? ` · ${option.context}` : ""}</span></span></label>; })}{!options.length ? <p className="rounded-xl border border-dashed border-[var(--br-border)] p-4 text-sm text-[var(--br-text-muted)]">No eligible classes or courses are available to schedule.</p> : null}</div></fieldset>
      <fieldset><div className="flex flex-wrap items-center justify-between gap-2"><legend className="text-sm font-bold">Learners to invite</legend>{learners.length ? <span className="text-xs font-semibold text-[var(--br-text-muted)]">{selected.length} of {learners.length} selected</span> : null}</div>{loadingAudience ? <p className="mt-2 text-sm text-[var(--br-text-muted)]">Loading learners…</p> : learners.length ? <><div className="mt-2 flex flex-wrap gap-2"><label className="relative min-w-48 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--br-text-muted)]"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a learner" className="w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] py-2 pl-9 pr-3 text-sm"/></label><button type="button" onClick={() => setSelected(selected.length === learners.length ? [] : learners.map(learner => learner.id))} className="rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold">{selected.length === learners.length ? "Clear all" : "Select all"}</button></div><div className="mt-2 max-h-56 overflow-auto rounded-xl border border-[var(--br-border)]">{visibleLearners.map(learner => <label key={learner.id} className="flex cursor-pointer items-center gap-3 border-b border-[var(--br-border)] px-3 py-2 last:border-0"><input type="checkbox" checked={selected.includes(learner.id)} onChange={() => toggleLearner(learner.id)} className="accent-[var(--br-chart-primary)]"/><span className="text-sm font-semibold">{learner.name}</span></label>)}</div></> : <p className="mt-2 text-sm text-[var(--br-text-muted)]">Choose one or more classes/courses to load their eligible learners.</p>}</fieldset>
      <fieldset><legend className="text-sm font-bold">Access</legend><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className={`cursor-pointer rounded-xl border p-3 ${accessMode === "INVITED" ? "border-[var(--br-chart-primary)] bg-[var(--br-surface-muted)]" : "border-[var(--br-border)]"}`}><input type="radio" name="access" checked={accessMode === "INVITED"} onChange={() => setAccessMode("INVITED")} className="mr-2 accent-[var(--br-chart-primary)]"/><span className="text-sm font-bold">Invited learners only</span><span className="mt-1 block pl-6 text-xs text-[var(--br-text-muted)]">Roster invitations are required.</span></label><label className={`cursor-pointer rounded-xl border p-3 ${accessMode === "LINK" ? "border-[var(--br-chart-primary)] bg-[var(--br-surface-muted)]" : "border-[var(--br-border)]"}`}><input type="radio" name="access" checked={accessMode === "LINK"} onChange={() => setAccessMode("LINK")} className="mr-2 accent-[var(--br-chart-primary)]"/><span className="text-sm font-bold">Anyone signed in with link</span><span className="mt-1 block pl-6 text-xs text-[var(--br-text-muted)]">The link can be forwarded.</span></label></div>{accessMode === "LINK" ? <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmOpen} onChange={event => setConfirmOpen(event.target.checked)} className="mt-1 accent-[var(--br-chart-primary)]"/>I understand anyone signed in with this link may join.</label> : null}<label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={roomLocked} onChange={event => setRoomLocked(event.target.checked)} className="accent-[var(--br-chart-primary)]"/>Use a waiting room</label></fieldset>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={saving || loadingAudience || !scopeKeys.length || !selected.length || (accessMode === "LINK" && !confirmOpen)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-chart-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Check size={16}/>{saving ? "Scheduling…" : "Save schedule & invite"}</button><button type="button" onClick={() => router.back()} className="rounded-xl border border-[var(--br-border)] px-4 py-2.5 text-sm font-bold">Cancel</button></div>
    </div>
    <aside className="h-fit rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-[var(--br-shadow)]"><div className="flex items-center gap-2 text-[var(--br-chart-primary)]"><CalendarDays size={18}/><h2 className="font-extrabold">Class summary</h2></div><h3 className="mt-4 font-bold">{title || "Your new class"}</h3><p className="mt-1 text-sm text-[var(--br-text-muted)]">{scheduledLocal ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(scheduledLocal)) : "Choose a date and time"}</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">{duration} min · {timezone}</p><div className="mt-4 border-t border-[var(--br-border)] pt-3"><p className="flex items-center gap-2 text-sm font-bold"><UsersRound size={15}/>{selected.length} invited</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">{selectedScopes.map(scope => scope.title).join(", ") || "Select a class or course"}</p></div></aside>
  </form>;
}

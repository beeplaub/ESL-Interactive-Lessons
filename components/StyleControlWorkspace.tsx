"use client";

import { Check, Eye, Loader2, Palette, RotateCcw, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { DEFAULT_PLATFORM_STYLE, type PlatformStyleSettings } from "@/lib/design-system";
import { restorePlatformStyle, savePlatformStyle } from "@/app/admin/style/actions";

const colorFields: Array<[keyof Pick<PlatformStyleSettings, "brandPrimary" | "action" | "canvas" | "surface" | "tertiary" | "surfaceMuted" | "text" | "textMuted" | "border" | "success" | "danger" | "achievement" | "orgAccent">, string, string]> = [
  ["brandPrimary", "Dusk primary", "Navigation and staff actions"], ["action", "Daybreak action", "Learner calls to action"],
  ["canvas", "Canvas", "Main page background"], ["surface", "Surface", "Cards and overlays"], ["tertiary", "Tertiary / dark cards", "Sidebar, footer, dark panels, and focused surfaces"], ["surfaceMuted", "Muted surface", "Quiet sections and inputs"],
  ["text", "Primary text", "Headings and reading"], ["textMuted", "Muted text", "Support copy"], ["border", "Border", "Structural outlines"],
  ["success", "Success", "Completion and fluency"], ["danger", "Urgency", "Errors and destructive actions"], ["achievement", "Achievement", "Badges and streaks"],
  ["orgAccent", "Organization accent", "Default school branding accent"],
];

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((channel) => parseInt(channel, 16) / 255) ?? [0, 0, 0];
  const values = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function StyleControlWorkspace({ initial, revision, revisions }: { initial: PlatformStyleSettings; revision: number; revisions: Array<{ id: string; revision: number; settings: PlatformStyleSettings; createdAt: string }> }) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const textContrast = contrast(settings.text, settings.canvas);
  const actionContrast = contrast("#ffffff", settings.action);
  const set = <K extends keyof PlatformStyleSettings>(key: K, value: PlatformStyleSettings[K]) => { setSettings((current) => ({ ...current, [key]: value })); setSaved(false); };

  function save() {
    const form = new FormData();
    Object.entries(settings).forEach(([key, value]) => form.set(key, value));
    startTransition(async () => { await savePlatformStyle(form); setSaved(true); window.setTimeout(() => setSaved(false), 2200); });
  }

  function restore(revisionId: string) {
    startTransition(async () => { await restorePlatformStyle(revisionId); window.location.reload(); });
  }

  return <main className="min-w-0 space-y-6">
    <section className="br-panel-dark rounded-[var(--br-radius)] p-5 text-white shadow-xl sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-white/65">Platform design system</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Dusk to Daybreak</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Set guarded global design tokens. Existing pages retain their current styling until they are migrated to semantic BrenUp components.</p></div><div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-mono text-xs">Revision {revision}</div></div>
    </section>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="br-admin-card rounded-[var(--br-radius)] p-4 sm:p-5"><div className="flex items-center gap-2"><Palette size={18} className="text-[var(--br-brand)]" /><div><h2 className="font-bold text-[var(--br-text)]">Token controls</h2><p className="text-xs text-[var(--br-text-muted)]">Validated hexadecimal colors only. Changes publish across semantic components.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{colorFields.map(([key, label, hint]) => <label key={key} className="rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3"><span className="block text-sm font-semibold text-[var(--br-text)]">{label}</span><span className="mt-0.5 block text-xs text-[var(--br-text-muted)]">{hint}</span><span className="mt-3 flex items-center gap-2"><input type="color" value={settings[key]} onChange={(event) => set(key, event.target.value)} className="size-9 cursor-pointer rounded border-0 bg-transparent p-0" /><input value={settings[key]} pattern="#[0-9A-Fa-f]{6}" onChange={(event) => set(key, event.target.value)} className="min-w-0 flex-1 rounded-md border border-[var(--br-border)] px-2 py-1.5 font-mono text-xs uppercase" /></span></label>)}</div><div className="mt-5 grid gap-4 border-t border-[var(--br-border)] pt-5 sm:grid-cols-3"><Select label="Learner density" value={settings.learnerDensity} options={["COMFORTABLE", "COMPACT"]} onChange={(value) => set("learnerDensity", value as PlatformStyleSettings["learnerDensity"])} /><Select label="Admin density" value={settings.adminDensity} options={["COMPACT", "COMFORTABLE"]} onChange={(value) => set("adminDensity", value as PlatformStyleSettings["adminDensity"])} /><Select label="Corner language" value={settings.radius} options={["BALANCED", "SHARP", "SOFT"]} onChange={(value) => set("radius", value as PlatformStyleSettings["radius"])} /></div><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={save} disabled={pending} className="inline-flex items-center gap-2 rounded-md bg-[var(--br-brand)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{pending ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <ShieldCheck size={16} />}{saved ? "Published" : "Publish design tokens"}</button><button type="button" onClick={() => setSettings(DEFAULT_PLATFORM_STYLE)} className="inline-flex items-center gap-2 rounded-md border border-[var(--br-border)] px-4 py-2.5 text-sm font-semibold text-[var(--br-text)]"><RotateCcw size={16} /> Restore Dusk defaults</button></div></section>
      <aside className="space-y-4"><section className="br-admin-card rounded-[var(--br-radius)] p-4"><div className="flex items-center gap-2"><Eye size={17} className="text-[var(--br-brand)]" /><h2 className="font-bold text-[var(--br-text)]">Live preview</h2></div><div className="mt-4 rounded-xl p-4" style={{ background: settings.canvas, color: settings.text }}><p className="text-xs font-bold uppercase tracking-wide" style={{ color: settings.textMuted }}>BrenUp activity</p><h3 className="mt-1 text-lg font-bold">Speak with confidence</h3><p className="mt-2 text-sm leading-5" style={{ color: settings.textMuted }}>A learner-facing card using the selected semantic tokens.</p><button className="mt-4 rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: settings.action }}>Continue learning</button></div></section><section className="br-admin-card rounded-[var(--br-radius)] p-4"><h2 className="font-bold text-[var(--br-text)]">Accessibility checks</h2><ContrastRow label="Text on canvas" value={textContrast} /><ContrastRow label="White on action" value={actionContrast} /><p className="mt-3 text-xs leading-5 text-[var(--br-text-muted)]">AAA needs 7:1 for normal text. Buttons may use large text or a darker action color when this warning appears.</p></section><section className="br-admin-card rounded-[var(--br-radius)] p-4"><h2 className="font-bold text-[var(--br-text)]">Revision history</h2><div className="mt-3 space-y-2">{revisions.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg bg-[var(--br-surface-muted)] px-3 py-2"><div className="min-w-0 flex-1"><p className="text-xs font-bold text-[var(--br-text)]">Revision {item.revision}</p><p className="text-[10px] text-[var(--br-text-muted)]">{new Date(item.createdAt).toLocaleString()}</p></div>{item.revision !== revision ? <button type="button" disabled={pending} onClick={() => restore(item.id)} className="text-xs font-bold text-[var(--br-brand)] disabled:opacity-50">Restore</button> : <span className="text-[10px] font-bold text-[var(--br-success)]">Current</span>}</div>)}{!revisions.length ? <p className="text-xs text-[var(--br-text-muted)]">Your first published change creates a restorable revision.</p> : null}</div></section></aside>
    </div>
  </main>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="text-sm font-semibold text-[var(--br-text)]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2 text-sm">{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function ContrastRow({ label, value }: { label: string; value: number }) { const pass = value >= 7; return <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--br-surface-muted)] px-3 py-2 text-sm"><span className="font-semibold text-[var(--br-text)]">{label}</span><span className={pass ? "font-mono font-bold text-[var(--br-success)]" : "font-mono font-bold text-[var(--br-danger)]"}>{value.toFixed(2)}:1 {pass ? "AAA" : "Review"}</span></div>; }

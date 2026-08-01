"use client";

import { Check, Eye, History, Loader2, Palette, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { DEFAULT_PLATFORM_STYLE, platformStyleVariables, type PlatformStyleSettings, type StyleDensity } from "@/lib/design-system";
import { restorePlatformStyle, savePlatformStyle } from "@/app/admin/style/actions";

type ColorKey =
  | "brandPrimary" | "brandPrimaryStrong" | "action" | "actionStrong" | "tertiary" | "tertiaryContainer"
  | "canvas" | "canvasElevated" | "surface" | "surfaceMuted" | "surfaceStrong" | "text" | "textMuted"
  | "textOnDark" | "border" | "borderStrong" | "success" | "warning" | "danger" | "info" | "achievement"
  | "chartPrimary" | "chartSecondary" | "orgAccent";

type ColorField = { key: ColorKey; label: string; hint: string };
const groups: Array<{ title: string; description: string; fields: ColorField[] }> = [
  { title: "Foundations", description: "Page backgrounds, card layers, text, and boundaries.", fields: [
    { key: "canvas", label: "Page canvas", hint: "Primary page background" }, { key: "canvasElevated", label: "Raised canvas", hint: "Gentle background variation" },
    { key: "surface", label: "Card surface", hint: "Cards, sheets, and overlays" }, { key: "surfaceMuted", label: "Quiet surface", hint: "Inputs and secondary panels" },
    { key: "surfaceStrong", label: "Strong surface", hint: "Selected and emphasized surfaces" }, { key: "text", label: "Main text", hint: "Headings and reading" },
    { key: "textMuted", label: "Supporting text", hint: "Captions and helper copy" }, { key: "border", label: "Default border", hint: "Card and field outlines" }, { key: "borderStrong", label: "Strong border", hint: "Selected and focused outlines" },
  ]},
  { title: "Brand and navigation", description: "BrenUp identity, calls to action, sidebar, footer, and dark spaces.", fields: [
    { key: "brandPrimary", label: "Brand primary", hint: "Navigation and staff actions" }, { key: "brandPrimaryStrong", label: "Brand deep tone", hint: "Hero and dark-gradient depth" },
    { key: "action", label: "Learner action", hint: "Primary learner calls to action" }, { key: "actionStrong", label: "Action hover", hint: "Pressed and hover state" },
    { key: "tertiary", label: "Dark navigation surface", hint: "Learner sidebar, footer, dark cards" }, { key: "tertiaryContainer", label: "Raised dark surface", hint: "Dark cards inside navigation areas" },
    { key: "textOnDark", label: "Text on dark", hint: "Readable text over tertiary surfaces" }, { key: "orgAccent", label: "Default school accent", hint: "Scoped organization branding default" },
  ]},
  { title: "Feedback and achievements", description: "Learning feedback, messages, badges, ranks, and progress moments.", fields: [
    { key: "success", label: "Success", hint: "Completion and correct answers" }, { key: "warning", label: "Warning", hint: "Attention and pending states" },
    { key: "danger", label: "Danger", hint: "Errors and destructive actions" }, { key: "info", label: "Information", hint: "Neutral guidance and links" },
    { key: "achievement", label: "Achievement", hint: "Badges, streaks, and reward moments" }, { key: "chartPrimary", label: "Primary chart", hint: "Performance and progress charts" },
    { key: "chartSecondary", label: "Secondary chart", hint: "Comparison and supporting data" },
  ]},
];

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((channel) => parseInt(channel, 16) / 255) ?? [0, 0, 0];
  const values = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}
function contrast(a: string, b: string) { const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (light + .05) / (dark + .05); }

export function StyleControlWorkspace({ initial, revision, revisions }: { initial: PlatformStyleSettings; revision: number; revisions: Array<{ id: string; revision: number; settings: PlatformStyleSettings; createdAt: string }> }) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [openGroup, setOpenGroup] = useState(groups[0].title);
  const [pending, startTransition] = useTransition();
  const variables = useMemo(() => platformStyleVariables(settings), [settings]);
  const set = <K extends keyof PlatformStyleSettings>(key: K, value: PlatformStyleSettings[K]) => { setSettings((current) => ({ ...current, [key]: value })); setSaved(false); };
  const contrastChecks = [
    ["Main text on canvas", contrast(settings.text, settings.canvas)],
    ["Main text on card", contrast(settings.text, settings.surface)],
    ["Text on dark navigation", contrast(settings.textOnDark, settings.tertiary)],
    ["Text on learner action", contrast(settings.textOnDark, settings.action)],
  ] as const;

  function save() {
    const form = new FormData();
    Object.entries(settings).forEach(([key, value]) => form.set(key, String(value)));
    startTransition(async () => {
      try { await savePlatformStyle(form); setSaved(true); window.setTimeout(() => setSaved(false), 2600); }
      catch { setSaved(false); }
    });
  }
  function restore(revisionId: string) { startTransition(async () => { await restorePlatformStyle(revisionId); window.location.reload(); }); }

  return <main className="min-w-0 space-y-5" style={variables}>
    <section className="br-panel-dark rounded-[var(--br-radius)] p-5 text-[var(--br-text-on-dark)] shadow-xl sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-white/65">Platform design system</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Dusk to Daybreak</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Publish one protected visual language across BrenUp. Controls are grouped by what they change, not by code names.</p></div><div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-mono text-xs">Revision {revision}</div></div>
    </section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
      <section className="br-admin-card rounded-[var(--br-radius)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Palette size={18} className="text-[var(--br-brand)]" /><div><h2 className="font-bold text-[var(--br-text)]">Theme controls</h2><p className="text-xs text-[var(--br-text-muted)]">Draft changes appear in the preview before you publish.</p></div></div><button type="button" onClick={() => { setSettings(DEFAULT_PLATFORM_STYLE); setSaved(false); }} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--br-brand)]"><RotateCcw size={14} /> Dusk default</button></div>
        <div className="mt-5 space-y-3">{groups.map((group) => <section key={group.title} className="overflow-hidden rounded-xl border border-[var(--br-border)]"><button type="button" onClick={() => setOpenGroup(openGroup === group.title ? "" : group.title)} className="flex w-full items-center justify-between gap-4 bg-[var(--br-surface)] px-4 py-3 text-left"><span><span className="block text-sm font-bold text-[var(--br-text)]">{group.title}</span><span className="mt-0.5 block text-xs text-[var(--br-text-muted)]">{group.description}</span></span><span className="text-lg font-semibold text-[var(--br-brand)]">{openGroup === group.title ? "−" : "+"}</span></button>{openGroup === group.title ? <div className="grid gap-3 border-t border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3 sm:grid-cols-2">{group.fields.map((field) => <ColorControl key={field.key} field={field} value={settings[field.key]} onChange={(value) => set(field.key, value)} />)}</div> : null}</section>)}</div>
        <div className="mt-5 grid gap-3 border-t border-[var(--br-border)] pt-5 sm:grid-cols-3"><Select label="Learner density" value={settings.learnerDensity} options={["COMFORTABLE", "COMPACT"]} onChange={(value) => set("learnerDensity", value as StyleDensity)} /><Select label="Creator density" value={settings.adminDensity} options={["COMPACT", "COMFORTABLE"]} onChange={(value) => set("adminDensity", value as StyleDensity)} /><Select label="Corner language" value={settings.radius} options={["BALANCED", "SHARP", "SOFT"]} onChange={(value) => set("radius", value as PlatformStyleSettings["radius"])} /><Select label="Elevation" value={settings.elevation} options={["SUBTLE", "STANDARD", "EXPRESSIVE"]} onChange={(value) => set("elevation", value as PlatformStyleSettings["elevation"])} /></div>
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={save} disabled={pending} className="br-button-admin inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold disabled:opacity-60">{pending ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <ShieldCheck size={16} />}{saved ? "Published" : "Publish theme"}</button><p className="self-center text-xs text-[var(--br-text-muted)]">Publishing creates a restorable revision.</p></div>
      </section>
      <aside className="space-y-4"><Preview settings={settings} /><section className="br-admin-card rounded-[var(--br-radius)] p-4"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-[var(--br-success)]" /><h2 className="font-bold text-[var(--br-text)]">Contrast checks</h2></div>{contrastChecks.map(([label, value]) => <ContrastRow key={label} label={label} value={value} />)}<p className="mt-3 text-xs leading-5 text-[var(--br-text-muted)]">Normal body text should reach 4.5:1. Choose stronger colours before publishing a warning state.</p></section><section className="br-admin-card rounded-[var(--br-radius)] p-4"><div className="flex items-center gap-2"><History size={17} className="text-[var(--br-brand)]" /><h2 className="font-bold text-[var(--br-text)]">Revision history</h2></div><div className="mt-3 space-y-2">{revisions.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg bg-[var(--br-surface-muted)] px-3 py-2"><div className="min-w-0 flex-1"><p className="text-xs font-bold text-[var(--br-text)]">Revision {item.revision}</p><p className="text-[10px] text-[var(--br-text-muted)]">{new Date(item.createdAt).toLocaleString()}</p></div>{item.revision !== revision ? <button type="button" disabled={pending} onClick={() => restore(item.id)} className="text-xs font-bold text-[var(--br-brand)] disabled:opacity-50">Restore</button> : <span className="text-[10px] font-bold text-[var(--br-success)]">Current</span>}</div>)}{!revisions.length ? <p className="text-xs text-[var(--br-text-muted)]">Your first published change creates a restorable revision.</p> : null}</div></section></aside>
    </div>
  </main>;
}

function ColorControl({ field, value, onChange }: { field: ColorField; value: string; onChange: (value: string) => void }) { return <label className="rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] p-3"><span className="block text-sm font-semibold text-[var(--br-text)]">{field.label}</span><span className="mt-0.5 block min-h-8 text-xs text-[var(--br-text-muted)]">{field.hint}</span><span className="mt-2 flex items-center gap-2"><input aria-label={`${field.label} colour`} type="color" value={value} onChange={(event) => onChange(event.target.value)} className="size-9 cursor-pointer rounded border-0 bg-transparent p-0" /><input value={value} pattern="#[0-9A-Fa-f]{6}" onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 rounded-md border border-[var(--br-border)] px-2 py-1.5 font-mono text-xs uppercase" /></span></label>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="text-sm font-semibold text-[var(--br-text)]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2 text-sm">{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function ContrastRow({ label, value }: { label: string; value: number }) { const pass = value >= 4.5; return <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--br-surface-muted)] px-3 py-2 text-sm"><span className="font-semibold text-[var(--br-text)]">{label}</span><span className={pass ? "font-mono font-bold text-[var(--br-success)]" : "font-mono font-bold text-[var(--br-danger)]"}>{value.toFixed(2)}:1 {pass ? "Pass" : "Review"}</span></div>; }
function Preview({ settings }: { settings: PlatformStyleSettings }) { const vars = platformStyleVariables(settings); return <section className="br-admin-card rounded-[var(--br-radius)] p-4" style={vars}><div className="flex items-center gap-2"><Eye size={17} className="text-[var(--br-brand)]" /><h2 className="font-bold text-[var(--br-text)]">Live preview</h2></div><div className="mt-4 overflow-hidden rounded-xl border border-[var(--br-border)]"><div className="flex items-center gap-2 bg-[var(--br-dark-card)] px-3 py-2 text-[var(--br-text-on-dark)]"><Sparkles size={15} /><span className="text-xs font-bold">BrenUp learner shell</span></div><div className="space-y-3 bg-[var(--br-canvas)] p-3"><div className="rounded-lg bg-[var(--br-surface)] p-3 shadow-[var(--br-shadow)]"><p className="text-xs font-bold text-[var(--br-text-muted)]">Vocabulary practice</p><p className="mt-1 font-bold text-[var(--br-text)]">Speak with confidence</p><div className="mt-3 flex items-center gap-2"><button className="rounded-lg bg-[var(--br-action)] px-3 py-2 text-xs font-bold text-[var(--br-text-on-dark)]">Continue</button><span className="rounded-full bg-[var(--br-success)] px-2 py-1 text-[10px] font-bold text-[var(--br-text-on-dark)]">Complete</span></div></div><div className="flex gap-2"><span className="h-2 flex-1 rounded-full bg-[var(--br-chart-primary)]" /><span className="h-2 flex-1 rounded-full bg-[var(--br-chart-secondary)]" /><span className="h-2 flex-1 rounded-full bg-[var(--br-achievement)]" /></div></div></div></section>; }

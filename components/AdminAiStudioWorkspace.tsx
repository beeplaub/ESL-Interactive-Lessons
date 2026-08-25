"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Coins,
  Database,
  Gauge,
  Play,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Terminal,
  XCircle,
  Zap,
} from "lucide-react";
import {
  seedDefaultTemplatesAction,
  testPromptAction,
  toggleFeatureFlagAction,
  updateAiFeatureRolesAction,
  updatePromptTemplateAction,
} from "@/app/admin/lessons/aiActions";

type Template = {
  id: string;
  template_key: string;
  role_description: string;
  prompt_text: string;
  updated_at: string;
};

type Flag = {
  id: string;
  feature_key: string;
  enabled: boolean;
  allowed_roles: string[];
  updated_at: string;
};

type GenerationLog = {
  id: string;
  user_role: string;
  feature_key: string;
  model_used: string;
  provider?: string | null;
  status?: string | null;
  prompt_raw: string | null;
  response_preview: string | null;
  error_message: string | null;
  token_estimate?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cached_tokens?: number | null;
  latency_ms?: number | null;
  retry_count?: number | null;
  estimated_cost_usd?: number | string | null;
  cache_hit?: boolean | null;
  cefr_level?: string | null;
  prompt_version?: string | null;
  created_at: string;
};

type CreditUsage = {
  user_id: string;
  usage_date: string;
  feature_key: string;
  credits_used: number | string;
  request_count: number;
  cache_hit_count: number;
  input_tokens: number | string;
  output_tokens: number | string;
  audio_seconds: number | string;
};

type DailyBalance = {
  user_id: string;
  usage_date: string;
  credits_reserved: number | string;
  credits_used: number | string;
};

type Props = {
  initialTemplates: Template[];
  initialFlags: Flag[];
  initialLogs: GenerationLog[];
  initialCreditUsage: CreditUsage[];
  initialDailyBalances: DailyBalance[];
  totalRequestsToday: number;
  totalTokensToday: number;
};

type View = "overview" | "controls" | "logs";
type TrendMetric = "requests" | "tokens" | "cost" | "cache";
type DateRange = "TODAY" | 7 | 30 | 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_MODELS = [
  "qwen2.5:7b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
];

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 1_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatCost(value: number) {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function providerForLog(log: Pick<GenerationLog, "provider" | "model_used">) {
  const explicit = log.provider?.trim().toLowerCase();
  if (explicit) return explicit;

  const model = log.model_used.trim().toLowerCase();
  if (model.startsWith("openrouter/") || model.startsWith("openrouter-")) return "openrouter";
  if (model.startsWith("openai/") || model.startsWith("groq/") || model.includes("whisper")) return "groq";
  if (model.startsWith("qwen") || model.startsWith("ollama/")) return "ollama";
  if (model.includes("kokoro")) return "kokoro";
  return "google";
}

function formatBdtTimestamp(value: string) {
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value))} BDT`;
}

function readable(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dhakaDateParts(value: string | number | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;
}

function dhakaDateKey(value: string | number | Date) {
  const parts = dhakaDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function logStatus(log: GenerationLog) {
  if (log.error_message || log.status === "FAILED") return "FAILED";
  if (log.cache_hit || log.status === "CACHED") return "CACHED";
  return log.status || "COMPLETED";
}

function logTokens(log: GenerationLog) {
  const measured = num(log.input_tokens) + num(log.output_tokens);
  return measured || num(log.token_estimate);
}

function MetricCard({ icon: Icon, label, value, note, tone = "brand" }: {
  icon: typeof Activity;
  label: string;
  value: string;
  note: string;
  tone?: "brand" | "green" | "amber" | "blue" | "red";
}) {
  const tones = {
    brand: "bg-[var(--br-brand)]/10 text-[var(--br-brand)]",
    green: "bg-[var(--br-success)]/10 text-[var(--br-success)]",
    amber: "bg-[var(--br-achievement)]/12 text-amber-700",
    blue: "bg-[var(--br-chart-secondary)]/10 text-[var(--br-chart-secondary)]",
    red: "bg-[var(--br-danger)]/10 text-[var(--br-danger)]",
  };
  return (
    <article className="min-w-0 rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm">
      <div className={`grid size-9 place-items-center rounded-lg ${tones[tone]}`}><Icon size={17} /></div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">{label}</p>
      <p className="mt-1 truncate text-2xl font-black text-ink">{value}</p>
      <p className="mt-1 text-xs text-[var(--br-text-muted)]">{note}</p>
    </article>
  );
}

function TrendChart({ points, metric }: { points: Array<{ label: string; value: number }>; metric: TrendMetric }) {
  const width = 900;
  const height = 240;
  const left = 76;
  const top = 18;
  const bottom = 34;
  const chartHeight = height - top - bottom;
  const max = Math.max(1, ...points.map((point) => point.value));
  const coords = points.map((point, index) => ({
    ...point,
    x: left + (index / Math.max(1, points.length - 1)) * (width - left * 2),
    y: top + chartHeight - (point.value / max) * chartHeight,
  }));
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${left},${top + chartHeight} ${polyline} ${width - left},${top + chartHeight}`;
  const formatter = metric === "cost" ? formatCost : formatCompact;
  return (
    <div className="overflow-x-auto" aria-label={`${metric} trend chart`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] w-full" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + chartHeight - ratio * chartHeight;
          return (
            <g key={ratio}>
              <line x1={left} x2={width - left} y1={y} y2={y} stroke="var(--br-border)" strokeWidth="1" />
              <text x={left - 10} y={y + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="var(--br-text-muted)">{formatter(max * ratio)}</text>
            </g>
          );
        })}
        <line x1={left} x2={left} y1={top} y2={top + chartHeight} stroke="var(--br-text-muted)" strokeWidth="1" opacity="0.45" />
        <polygon points={area} fill="var(--br-brand)" opacity="0.08" />
        <polyline points={polyline} fill="none" stroke="var(--br-brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r="3.5" fill="var(--br-surface)" stroke="var(--br-brand)" strokeWidth="2">
              <title>{point.label}: {formatter(point.value)}</title>
            </circle>
            {(index === 0 || index === coords.length - 1 || index % Math.max(1, Math.floor(coords.length / 5)) === 0) ? (
              <text x={point.x} y={height - 10} textAnchor="middle" fontSize="10" fill="var(--br-text-muted)">{point.label}</text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function FilterSelect({ value, onChange, children, label }: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="relative min-w-0">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 max-w-full appearance-none rounded-lg border border-[var(--br-border)] bg-surface py-1.5 pl-3 pr-8 text-xs font-bold text-ink outline-none focus:border-[var(--br-brand)]">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--br-text-muted)]" />
    </label>
  );
}

export function AdminAiStudioWorkspace({
  initialTemplates,
  initialFlags,
  initialLogs,
  initialCreditUsage,
  initialDailyBalances,
  totalRequestsToday,
  totalTokensToday,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("overview");
  const [dateRange, setDateRange] = useState<DateRange>("TODAY");
  const [model, setModel] = useState("ALL");
  const [feature, setFeature] = useState("ALL");
  const [provider, setProvider] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("requests");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [templates, setTemplates] = useState(initialTemplates);
  const [flags, setFlags] = useState(initialFlags);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(initialTemplates[0]?.template_key || "creator_lesson_designer");
  const selectedTemplate = templates.find((item) => item.template_key === selectedTemplateKey);
  const [editRole, setEditRole] = useState(selectedTemplate?.role_description || "");
  const [editPrompt, setEditPrompt] = useState(selectedTemplate?.prompt_text || "");
  const [testVars, setTestVars] = useState("{\n  \"topic\": \"Buying groceries\",\n  \"level\": \"A2\"\n}");
  const [testResult, setTestResult] = useState("");
  const [testError, setTestError] = useState("");
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, router]);

  const models = useMemo(() => Array.from(new Set([
    ...KNOWN_MODELS,
    ...initialLogs.map((log) => log.model_used).filter(Boolean),
  ])).sort(), [initialLogs]);
  const features = useMemo(() => Array.from(new Set(initialLogs.map((log) => log.feature_key).filter(Boolean))).sort(), [initialLogs]);
  const providers = useMemo(() => Array.from(new Set([
    "google",
    "ollama",
    "groq",
    "openrouter",
    "kokoro",
    ...initialLogs.map((log) => providerForLog(log)),
  ])).sort(), [initialLogs]);
  const todayKey = dhakaDateKey(Date.now());
  const rollingDays = dateRange === "TODAY" ? 1 : dateRange;
  const cutoff = Date.now() - rollingDays * DAY_MS;

  const filteredLogs = useMemo(() => initialLogs.filter((log) => {
    if (dateRange === "TODAY" ? dhakaDateKey(log.created_at) !== todayKey : new Date(log.created_at).getTime() < cutoff) return false;
    if (model !== "ALL" && log.model_used !== model) return false;
    if (feature !== "ALL" && log.feature_key !== feature) return false;
    const actualProvider = providerForLog(log);
    if (provider !== "ALL" && actualProvider !== provider) return false;
    if (status !== "ALL" && logStatus(log) !== status) return false;
    if (search) {
      const haystack = `${log.feature_key} ${log.model_used} ${providerForLog(log)} ${log.user_role} ${log.response_preview || ""} ${log.error_message || ""}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [cutoff, dateRange, feature, initialLogs, model, provider, search, status, todayKey]);

  const filteredCredits = useMemo(() => initialCreditUsage.filter((row) => {
    if (dateRange === "TODAY" ? row.usage_date !== todayKey : new Date(`${row.usage_date}T00:00:00`).getTime() < cutoff) return false;
    return feature === "ALL" || row.feature_key === feature;
  }), [cutoff, dateRange, feature, initialCreditUsage, todayKey]);

  const metrics = useMemo(() => {
    const completed = filteredLogs.filter((log) => logStatus(log) !== "FAILED");
    const failed = filteredLogs.length - completed.length;
    const cacheHits = filteredLogs.filter((log) => logStatus(log) === "CACHED").length;
    const latencies = filteredLogs.map((log) => num(log.latency_ms)).filter((value) => value > 0);
    return {
      requests: filteredLogs.length,
      successRate: filteredLogs.length ? ((filteredLogs.length - failed) / filteredLogs.length) * 100 : 0,
      cacheHits,
      cacheRate: filteredLogs.length ? (cacheHits / filteredLogs.length) * 100 : 0,
      tokens: filteredLogs.reduce((sum, log) => sum + logTokens(log), 0),
      cost: filteredLogs.reduce((sum, log) => sum + num(log.estimated_cost_usd), 0),
      credits: filteredCredits.reduce((sum, row) => sum + num(row.credits_used), 0),
      audioSeconds: filteredCredits.reduce((sum, row) => sum + num(row.audio_seconds), 0),
      averageLatency: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
      failures: failed,
    };
  }, [filteredCredits, filteredLogs]);

  const trend = useMemo(() => {
    const buckets = new Map<string, { requests: number; tokens: number; cost: number; cache: number }>();
    if (dateRange === "TODAY") {
      for (let hour = 0; hour < 24; hour += 1) buckets.set(String(hour).padStart(2, "0"), { requests: 0, tokens: 0, cost: 0, cache: 0 });
    } else {
      for (let offset = dateRange - 1; offset >= 0; offset -= 1) {
        const date = new Date(Date.now() - offset * DAY_MS);
        buckets.set(dhakaDateKey(date), { requests: 0, tokens: 0, cost: 0, cache: 0 });
      }
    }
    filteredLogs.forEach((log) => {
      const parts = dhakaDateParts(log.created_at);
      const key = dateRange === "TODAY" ? parts.hour : `${parts.year}-${parts.month}-${parts.day}`;
      const bucket = buckets.get(key);
      if (!bucket) return;
      bucket.requests += 1;
      bucket.tokens += logTokens(log);
      bucket.cost += num(log.estimated_cost_usd);
      if (logStatus(log) === "CACHED") bucket.cache += 1;
    });
    return Array.from(buckets.entries()).map(([date, values]) => ({
      label: dateRange === "TODAY" ? `${date}:00` : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value: values[trendMetric],
    }));
  }, [dateRange, filteredLogs, trendMetric]);

  const modelBreakdown = useMemo(() => {
    const rows = new Map<string, { name: string; provider: string; requests: number; success: number; cache: number; tokens: number; cost: number; latency: number[] }>();
    filteredLogs.forEach((log) => {
      const provider = providerForLog(log);
      const key = `${provider}:${log.model_used}`;
      const row = rows.get(key) || { name: log.model_used, provider, requests: 0, success: 0, cache: 0, tokens: 0, cost: 0, latency: [] };
      row.requests += 1;
      if (logStatus(log) !== "FAILED") row.success += 1;
      if (logStatus(log) === "CACHED") row.cache += 1;
      row.tokens += logTokens(log);
      row.cost += num(log.estimated_cost_usd);
      if (num(log.latency_ms) > 0) row.latency.push(num(log.latency_ms));
      rows.set(key, row);
    });
    return Array.from(rows.values()).map((row) => ({
      ...row,
      successRate: row.requests ? (row.success / row.requests) * 100 : 0,
      averageLatency: row.latency.length ? row.latency.reduce((sum, value) => sum + value, 0) / row.latency.length : 0,
    })).sort((a, b) => b.requests - a.requests);
  }, [filteredLogs]);

  const featureBreakdown = useMemo(() => {
    const rows = new Map<string, { requests: number; failures: number; cache: number; tokens: number; cost: number; credits: number; latestAt: string | null }>();
    filteredLogs.forEach((log) => {
      const row = rows.get(log.feature_key) || { requests: 0, failures: 0, cache: 0, tokens: 0, cost: 0, credits: 0, latestAt: null };
      row.requests += 1;
      if (logStatus(log) === "FAILED") row.failures += 1;
      if (logStatus(log) === "CACHED") row.cache += 1;
      row.tokens += logTokens(log);
      row.cost += num(log.estimated_cost_usd);
      if (!row.latestAt || new Date(log.created_at).getTime() > new Date(row.latestAt).getTime()) row.latestAt = log.created_at;
      rows.set(log.feature_key, row);
    });
    filteredCredits.forEach((usage) => {
      const row = rows.get(usage.feature_key) || { requests: 0, failures: 0, cache: 0, tokens: 0, cost: 0, credits: 0, latestAt: null };
      row.credits += num(usage.credits_used);
      rows.set(usage.feature_key, row);
    });
    return Array.from(rows.entries()).map(([name, row]) => ({ name, ...row })).sort((a, b) => b.requests - a.requests || b.credits - a.credits);
  }, [filteredCredits, filteredLogs]);

  const creditUsers = useMemo(() => new Set(initialDailyBalances.filter((row) => dateRange === "TODAY" ? row.usage_date === todayKey : new Date(`${row.usage_date}T00:00:00`).getTime() >= cutoff).map((row) => row.user_id)).size, [cutoff, dateRange, initialDailyBalances, todayKey]);

  function handleTemplateChange(key: string) {
    setSelectedTemplateKey(key);
    const target = templates.find((item) => item.template_key === key);
    if (target) { setEditRole(target.role_description); setEditPrompt(target.prompt_text); }
  }

  function handleSeed() {
    startTransition(async () => {
      try {
        const result = await seedDefaultTemplatesAction();
        setStatusMessage(`Seeded templates: ${result.seeded.join(", ") || "all defaults already exist"}.`);
        router.refresh();
      } catch (error) {
        setStatusMessage(`Seeding failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
  }

  function handleSaveTemplate() {
    if (!selectedTemplate) return;
    startTransition(async () => {
      try {
        await updatePromptTemplateAction(selectedTemplate.id, editRole, editPrompt);
        setTemplates((current) => current.map((item) => item.id === selectedTemplate.id ? { ...item, role_description: editRole, prompt_text: editPrompt } : item));
        setStatusMessage("Prompt template saved.");
      } catch (error) {
        setStatusMessage(`Save failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
  }

  function handleToggleFlag(flag: Flag) {
    startTransition(async () => {
      try {
        await toggleFeatureFlagAction(flag.feature_key, !flag.enabled);
        setFlags((current) => current.map((item) => item.id === flag.id ? { ...item, enabled: !flag.enabled } : item));
        setStatusMessage(`${readable(flag.feature_key)} ${flag.enabled ? "disabled" : "enabled"}.`);
      } catch (error) {
        setStatusMessage(`Update failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
  }

  function handleRoleToggle(flag: Flag, role: "TEACHER" | "SCHOOL_ADMIN") {
    const next = flag.allowed_roles.includes(role) ? flag.allowed_roles.filter((item) => item !== role) : [...flag.allowed_roles, role];
    startTransition(async () => {
      try {
        const result = await updateAiFeatureRolesAction(flag.feature_key, next);
        setFlags((current) => current.map((item) => item.id === flag.id ? { ...item, allowed_roles: result.roles } : item));
        setStatusMessage(`Access updated for ${readable(flag.feature_key)}.`);
      } catch (error) {
        setStatusMessage(`Access update failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
  }

  async function handleRunTest() {
    setTesting(true); setTestError(""); setTestResult("");
    try {
      const result = await testPromptAction(selectedTemplateKey, testVars);
      setTestResult(JSON.stringify(result, null, 2));
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Prompt test failed.");
    } finally {
      setTesting(false);
    }
  }

  const tabItems: Array<{ id: View; label: string; icon: typeof Activity }> = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "controls", label: "Prompts & access", icon: Settings2 },
    { id: "logs", label: "Generation log", icon: Terminal },
  ];

  return (
    <main className="min-w-0 space-y-5 pb-12">
      <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-dark-card)] p-5 text-on-dark shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-white/60"><Sparkles size={13} /> Platform intelligence</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">AI Studio</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/65">Monitor every BrenUp AI model, understand cost and reliability, and manage prompts and feature access.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/8 px-3 text-xs font-bold text-white/80">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} className="accent-[var(--br-success)]" /> Live refresh
            </label>
            <button type="button" onClick={() => router.refresh()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-surface px-3 text-xs font-black text-ink"><RefreshCcw size={14} /> Refresh data</button>
          </div>
        </div>
        <div className="mt-5 flex gap-1 overflow-x-auto border-t border-white/10 pt-4">
          {tabItems.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setView(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition ${view === id ? "bg-surface text-ink" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </section>

      {statusMessage ? <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--br-success)]/20 bg-[var(--br-success)]/8 px-4 py-3 text-sm font-bold text-[var(--br-success)]"><span>{statusMessage}</span><button onClick={() => setStatusMessage("")} aria-label="Dismiss">×</button></div> : null}

      {view !== "controls" ? (
        <section className="flex flex-col gap-3 rounded-xl border border-[var(--br-border)] bg-surface p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-1 overflow-x-auto">
            {(["TODAY", 7, 30, 90] as DateRange[]).map((value) => <button key={value} onClick={() => setDateRange(value)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black ${dateRange === value ? "bg-[var(--br-brand)] text-on-dark" : "bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"}`}>{value === "TODAY" ? "Today" : `${value} days`}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect label="Model" value={model} onChange={setModel}><option value="ALL">All models</option>{models.map((item) => <option key={item}>{item}</option>)}</FilterSelect>
            <FilterSelect label="Feature" value={feature} onChange={setFeature}><option value="ALL">All features</option>{features.map((item) => <option key={item}>{readable(item)}</option>)}</FilterSelect>
            <FilterSelect label="Provider" value={provider} onChange={setProvider}><option value="ALL">All providers</option>{providers.map((item) => <option key={item} value={item}>{readable(item)}</option>)}</FilterSelect>
            <FilterSelect label="Status" value={status} onChange={setStatus}><option value="ALL">All statuses</option><option value="COMPLETED">Completed</option><option value="CACHED">Cached</option><option value="FAILED">Failed</option><option value="STARTED">Started</option></FilterSelect>
          </div>
        </section>
      ) : null}

      {view === "overview" ? (
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-6">
            <MetricCard icon={Activity} label="Requests" value={formatCompact(metrics.requests)} note={`${metrics.failures} failed`} />
            <MetricCard icon={CheckCircle2} label="Success rate" value={`${metrics.successRate.toFixed(1)}%`} note={`${filteredLogs.length - metrics.failures} successful`} tone="green" />
            <MetricCard icon={Zap} label="Cache rate" value={`${metrics.cacheRate.toFixed(1)}%`} note={`${metrics.cacheHits} API calls avoided`} tone="blue" />
            <MetricCard icon={Coins} label="AI credits" value={formatCompact(metrics.credits)} note={`${creditUsers} active users`} tone="amber" />
            <MetricCard icon={Gauge} label="Tokens" value={formatCompact(metrics.tokens)} note={`${Math.round(metrics.audioSeconds / 60)} audio minutes`} />
            <MetricCard icon={CircleDollarSign} label="Estimated cost" value={formatCost(metrics.cost)} note="Known token-priced calls" tone="green" />
          </section>

          {initialCreditUsage.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--br-achievement)]/25 bg-[var(--br-achievement)]/8 p-4 text-sm text-ink">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <div><p className="font-black">No weighted credit events in this reporting window yet.</p><p className="mt-1 text-xs text-[var(--br-text-muted)]">New AI use will populate credit and audio analytics automatically. If it does not, confirm the AI efficiency migration has been run.</p></div>
            </div>
          ) : null}

          <section className="rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-base font-black text-ink">Usage over time</h2><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">{dateRange === "TODAY" ? "Hourly activity today in Bangladesh time." : "Daily activity for the selected filters."}</p></div>
              <div className="flex gap-1 overflow-x-auto">
                {(["requests", "tokens", "cost", "cache"] as TrendMetric[]).map((item) => <button key={item} onClick={() => setTrendMetric(item)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-black ${trendMetric === item ? "bg-[var(--br-brand)] text-on-dark" : "bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"}`}>{readable(item)}</button>)}
              </div>
            </div>
            <div className="mt-4"><TrendChart points={trend} metric={trendMetric} /></div>
          </section>

          <div className="grid gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-ink">Model performance</h2><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">Reliability, latency, tokens, and cost by model.</p></div><Bot className="size-5 text-[var(--br-brand)]" /></div>
              <div className="mt-4 space-y-3">
                {modelBreakdown.map((row) => (
                  <button key={row.name} onClick={() => setModel(row.name)} className="block w-full rounded-xl border border-[var(--br-border)] p-3 text-left transition hover:border-[var(--br-brand)]/35 hover:bg-[var(--br-surface-muted)]/60">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-sm font-black text-ink">{row.name}</p><span className="shrink-0 rounded-full bg-[var(--br-brand)]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--br-brand)]">{readable(row.provider)}</span></div><p className="mt-0.5 text-[11px] text-[var(--br-text-muted)]">{row.requests} requests · {row.cache} cached</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${row.successRate >= 95 ? "bg-[var(--br-success)]/10 text-[var(--br-success)]" : "bg-[var(--br-achievement)]/12 text-amber-700"}`}>{row.successRate.toFixed(1)}% success</span></div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--br-surface-muted)]"><div className="h-full rounded-full bg-[var(--br-brand)]" style={{ width: `${Math.min(100, (row.requests / Math.max(1, modelBreakdown[0]?.requests || 1)) * 100)}%` }} /></div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-[var(--br-text-muted)]"><span>{formatCompact(row.tokens)} tokens</span><span>{row.averageLatency ? `${Math.round(row.averageLatency)}ms avg` : "No latency"}</span><span className="text-right">{formatCost(row.cost)}</span></div>
                  </button>
                ))}
                {!modelBreakdown.length ? <p className="rounded-xl border border-dashed border-[var(--br-border)] p-8 text-center text-sm text-[var(--br-text-muted)]">No model activity matches these filters.</p> : null}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
              <div><h2 className="font-black text-ink">Feature usage</h2><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">Which experiences consume AI capacity.</p></div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead><tr className="border-b border-[var(--br-border)] text-[10px] uppercase tracking-wide text-[var(--br-text-muted)]"><th className="pb-2">Feature</th><th className="pb-2">Latest request</th><th className="pb-2 text-right">Requests</th><th className="pb-2 text-right">Cache</th><th className="pb-2 text-right">Credits</th><th className="pb-2 text-right">Cost</th></tr></thead>
                  <tbody className="divide-y divide-[var(--br-border)]">{featureBreakdown.slice(0, 12).map((row) => <tr key={row.name} className="hover:bg-[var(--br-surface-muted)]/60"><td className="py-3 pr-3"><button onClick={() => setFeature(row.name)} className="max-w-[220px] truncate font-bold text-ink hover:text-[var(--br-brand)]">{readable(row.name)}</button>{row.failures ? <p className="text-[10px] text-[var(--br-danger)]">{row.failures} failed</p> : null}</td><td className="whitespace-nowrap py-3 pr-3 text-[10px] font-bold text-[var(--br-text-muted)]">{row.latestAt ? formatBdtTimestamp(row.latestAt) : "No logged request"}</td><td className="py-3 text-right font-bold">{row.requests}</td><td className="py-3 text-right">{row.cache}</td><td className="py-3 text-right">{formatCompact(row.credits)}</td><td className="py-3 text-right">{formatCost(row.cost)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--br-border)] bg-surface p-4"><p className="text-xs font-bold text-[var(--br-text-muted)]">Today, request ledger</p><p className="mt-1 text-xl font-black">{totalRequestsToday} requests</p><p className="mt-1 text-[10px] text-[var(--br-text-muted)]">Independent daily usage counter</p></div>
            <div className="rounded-xl border border-[var(--br-border)] bg-surface p-4"><p className="text-xs font-bold text-[var(--br-text-muted)]">Today, token ledger</p><p className="mt-1 text-xl font-black">{formatCompact(totalTokensToday)} tokens</p><p className="mt-1 text-[10px] text-[var(--br-text-muted)]">Independent daily usage estimate</p></div>
            <div className="rounded-xl border border-[var(--br-border)] bg-surface p-4"><p className="text-xs font-bold text-[var(--br-text-muted)]">Average response latency</p><p className="mt-1 text-xl font-black">{metrics.averageLatency ? `${Math.round(metrics.averageLatency)} ms` : "Collecting"}</p></div>
          </section>
        </div>
      ) : null}

      {view === "controls" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2"><h2 className="text-xs font-black uppercase tracking-wide text-[var(--br-text-muted)]">Feature access</h2><button onClick={handleSeed} disabled={isPending} title="Seed missing defaults" className="grid size-8 place-items-center rounded-lg border border-[var(--br-border)]"><Database size={14} /></button></div>
              <div className="mt-3 space-y-2">{flags.map((flag) => <article key={flag.id} className="rounded-lg border border-[var(--br-border)] p-3"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-black text-ink">{readable(flag.feature_key)}</p><p className="mt-0.5 truncate text-[10px] text-[var(--br-text-muted)]">{flag.allowed_roles.join(", ")}</p></div><button onClick={() => handleToggleFlag(flag)} className={`relative h-5 w-9 shrink-0 rounded-full ${flag.enabled ? "bg-[var(--br-success)]" : "bg-[var(--br-border)]"}`} aria-label={`Toggle ${flag.feature_key}`}><span className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-transform ${flag.enabled ? "translate-x-4" : "translate-x-0.5"}`} /></button></div>{flag.feature_key === "creator_voiceover" ? <div className="mt-2 flex gap-1 border-t border-[var(--br-border)] pt-2">{(["TEACHER", "SCHOOL_ADMIN"] as const).map((role) => <button key={role} onClick={() => handleRoleToggle(flag, role)} className={`rounded-full px-2 py-1 text-[9px] font-black ${flag.allowed_roles.includes(role) ? "bg-[var(--br-brand)] text-on-dark" : "bg-[var(--br-surface-muted)] text-[var(--br-text-muted)]"}`}>{role === "TEACHER" ? "Teachers" : "Schools"}</button>)}</div> : null}</article>)}</div>
            </section>
            <section className="rounded-xl border border-[var(--br-border)] bg-surface p-3 shadow-sm"><p className="px-1 pb-2 text-xs font-black uppercase tracking-wide text-[var(--br-text-muted)]">Prompt templates</p><div className="max-h-[440px] space-y-1 overflow-y-auto">{templates.map((template) => <button key={template.id} onClick={() => handleTemplateChange(template.template_key)} className={`block w-full truncate rounded-lg px-3 py-2 text-left text-xs font-bold ${selectedTemplateKey === template.template_key ? "bg-[var(--br-brand)] text-on-dark" : "text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"}`}>{readable(template.template_key)}</button>)}</div></section>
          </aside>
          <section className="min-w-0 space-y-5">
            {selectedTemplate ? <>
              <div className="rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-3 border-b border-[var(--br-border)] pb-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="truncate text-lg font-black text-ink">{readable(selectedTemplate.template_key)}</h2><p className="text-xs text-[var(--br-text-muted)]">Changes affect the next uncached generation. Cache keys change with prompt content.</p></div><button onClick={handleSaveTemplate} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--br-dark-card)] px-4 py-2 text-xs font-black text-on-dark"><Save size={14} /> Save prompt</button></div><div className="mt-4 grid gap-4"><label className="text-xs font-bold text-[var(--br-text-muted)]">System role<textarea rows={3} value={editRole} onChange={(event) => setEditRole(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface p-3 text-sm font-medium text-ink outline-none focus:border-[var(--br-brand)]" /></label><label className="text-xs font-bold text-[var(--br-text-muted)]">Prompt text<textarea rows={12} value={editPrompt} onChange={(event) => setEditPrompt(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-surface p-3 font-mono text-xs leading-5 text-ink outline-none focus:border-[var(--br-brand)]" /></label></div></div>
              <div className="rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5"><div className="flex items-center gap-2"><Terminal size={16} className="text-[var(--br-success)]" /><h2 className="font-black text-ink">Prompt test</h2></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><label className="text-xs font-bold text-[var(--br-text-muted)]">Input variables JSON<textarea rows={8} value={testVars} onChange={(event) => setTestVars(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-3 font-mono text-xs outline-none" /></label><div><p className="text-xs font-bold text-[var(--br-text-muted)]">Gemini response</p><pre className="mt-1.5 max-h-[220px] min-h-[180px] overflow-auto rounded-lg bg-[var(--br-dark-card)] p-3 font-mono text-[10px] leading-5 text-white/80">{testError ? `Error: ${testError}` : testResult || "Run a test to inspect the structured response."}</pre></div></div><button onClick={handleRunTest} disabled={testing} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--br-success)] px-4 py-2 text-xs font-black text-on-dark"><Play size={13} /> {testing ? "Generating…" : "Run test"}</button></div>
            </> : <div className="rounded-xl border border-dashed border-[var(--br-border)] p-12 text-center text-sm text-[var(--br-text-muted)]">Seed prompt templates to begin.</div>}
          </section>
        </div>
      ) : null}

      {view === "logs" ? (
        <section className="rounded-xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-ink">Generation log</h2><p className="mt-0.5 text-xs text-[var(--br-text-muted)]">{filteredLogs.length} events match the active filters.</p></div><label className="relative block sm:w-80"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--br-text-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search feature, model, role or error" className="h-10 w-full rounded-lg border border-[var(--br-border)] bg-surface pl-9 pr-3 text-xs outline-none focus:border-[var(--br-brand)]" /></label></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead><tr className="border-b border-[var(--br-border)] text-[10px] uppercase tracking-wide text-[var(--br-text-muted)]"><th className="pb-2">Time</th><th className="pb-2">Feature</th><th className="pb-2">Model / provider</th><th className="pb-2">Status</th><th className="pb-2 text-right">Tokens</th><th className="pb-2 text-right">Latency</th><th className="pb-2 text-right">Cost</th><th className="pb-2">Response / error</th></tr></thead><tbody className="divide-y divide-[var(--br-border)]">{filteredLogs.map((log) => { const state = logStatus(log); return <tr key={log.id} className="align-top hover:bg-[var(--br-surface-muted)]/60"><td className="whitespace-nowrap py-3 pr-4 text-[var(--br-text-muted)]">{new Date(log.created_at).toLocaleString()}</td><td className="max-w-[190px] py-3 pr-4"><p className="truncate font-bold text-ink">{readable(log.feature_key)}</p><p className="text-[10px] text-[var(--br-text-muted)]">{log.user_role}{log.cefr_level ? ` · ${log.cefr_level}` : ""}</p></td><td className="max-w-[180px] py-3 pr-4"><p className="truncate font-mono text-[10px]">{log.model_used}</p><p className="text-[10px] text-[var(--br-text-muted)]">{readable(providerForLog(log))}</p></td><td className="py-3 pr-4"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black ${state === "FAILED" ? "bg-[var(--br-danger)]/10 text-[var(--br-danger)]" : state === "CACHED" ? "bg-[var(--br-chart-secondary)]/10 text-[var(--br-chart-secondary)]" : "bg-[var(--br-success)]/10 text-[var(--br-success)]"}`}>{state === "FAILED" ? <XCircle size={10} /> : <CheckCircle2 size={10} />}{state}</span></td><td className="py-3 text-right font-mono">{formatCompact(logTokens(log))}</td><td className="py-3 text-right">{log.latency_ms ? `${log.latency_ms}ms` : "—"}</td><td className="py-3 text-right">{formatCost(num(log.estimated_cost_usd))}</td><td className="max-w-[300px] py-3 pl-4"><p className={`line-clamp-2 font-mono text-[10px] leading-4 ${log.error_message ? "text-[var(--br-danger)]" : "text-[var(--br-text-muted)]"}`}>{log.error_message || log.response_preview || "No response preview"}</p>{num(log.retry_count) ? <p className="mt-1 text-[9px] font-bold text-amber-700">{log.retry_count} retries</p> : null}</td></tr>; })}</tbody></table>{!filteredLogs.length ? <p className="py-12 text-center text-sm text-[var(--br-text-muted)]">No generation events match these filters.</p> : null}</div>
        </section>
      ) : null}
    </main>
  );
}

"use client";

import { useState, useTransition } from "react";
import { 
  Play, 
  Save, 
  Settings, 
  Sparkles, 
  Terminal, 
  CheckCircle, 
  XCircle, 
  RefreshCcw, 
  Database,
  Flame
} from "lucide-react";
import { 
  seedDefaultTemplatesAction, 
  updatePromptTemplateAction, 
  toggleFeatureFlagAction, 
  testPromptAction,
  updateAiFeatureRolesAction,
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
  prompt_raw: string | null;
  response_preview: string | null;
  error_message: string | null;
  created_at: string;
};

type Props = {
  initialTemplates: Template[];
  initialFlags: Flag[];
  initialLogs: GenerationLog[];
  totalRequestsToday: number;
  totalTokensToday: number;
};

export function AdminAiStudioWorkspace({
  initialTemplates,
  initialFlags,
  initialLogs,
  totalRequestsToday,
  totalTokensToday
}: Props) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [flags, setFlags] = useState<Flag[]>(initialFlags);
  const [logs, setLogs] = useState<GenerationLog[]>(initialLogs);
  
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>(
    templates[0]?.template_key || "creator_lesson_designer"
  );
  
  const selectedTemplate = templates.find(t => t.template_key === selectedTemplateKey);

  // Edit states for selected template
  const [editRole, setEditRole] = useState(selectedTemplate?.role_description || "");
  const [editPrompt, setEditPrompt] = useState(selectedTemplate?.prompt_text || "");

  // Update edit fields when template changes
  const handleTemplateChange = (key: string) => {
    setSelectedTemplateKey(key);
    const target = templates.find(t => t.template_key === key);
    if (target) {
      setEditRole(target.role_description);
      setEditPrompt(target.prompt_text);
    }
  };

  // Prompt testing panel states
  const [testVars, setTestVars] = useState<string>("{\n  \"topic\": \"Buying groceries\",\n  \"level\": \"A2\"\n}");
  const [testResult, setTestResult] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");

  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState("");

  // Seed DB tables if empty
  const handleSeed = () => {
    startTransition(async () => {
      try {
        const res = await seedDefaultTemplatesAction();
        setStatusMessage(`Seeded default templates: ${res.seeded.join(", ")}`);
        // Refresh page or reload
        window.location.reload();
      } catch (err: any) {
        setStatusMessage(`Seeding failed: ${err.message}`);
      }
    });
  };

  // Save template edits
  const handleSaveTemplate = () => {
    if (!selectedTemplate) return;
    startTransition(async () => {
      try {
        await updatePromptTemplateAction(selectedTemplate.id, editRole, editPrompt);
        setTemplates(prev => prev.map(t => t.id === selectedTemplate.id ? { ...t, role_description: editRole, prompt_text: editPrompt } : t));
        setStatusMessage("Template updated successfully!");
      } catch (err: any) {
        setStatusMessage(`Update failed: ${err.message}`);
      }
    });
  };

  // Toggle feature flag
  const handleToggleFlag = (key: string, currentVal: boolean) => {
    startTransition(async () => {
      try {
        await toggleFeatureFlagAction(key, !currentVal);
        setFlags(prev => prev.map(f => f.feature_key === key ? { ...f, enabled: !currentVal } : f));
        setStatusMessage(`Flag "${key}" toggled to ${!currentVal ? "ON" : "OFF"}`);
      } catch (err: any) {
        setStatusMessage(`Toggle failed: ${err.message}`);
      }
    });
  };

  const handleRoleToggle = (flag: Flag, role: "TEACHER" | "SCHOOL_ADMIN") => {
    const nextRoles = flag.allowed_roles.includes(role)
      ? flag.allowed_roles.filter((value) => value !== role)
      : [...flag.allowed_roles, role];
    startTransition(async () => {
      try {
        const result = await updateAiFeatureRolesAction(flag.feature_key, nextRoles);
        setFlags((current) => current.map((item) => item.id === flag.id ? { ...item, allowed_roles: result.roles } : item));
        setStatusMessage(`Access updated for ${flag.feature_key.replaceAll("_", " ")}.`);
      } catch (error) {
        setStatusMessage(`Access update failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
  };

  // Run test prompt
  const handleRunTest = async () => {
    setTesting(true);
    setTestError("");
    setTestResult("");
    try {
      const response = await testPromptAction(selectedTemplateKey, testVars);
      setTestResult(JSON.stringify(response, null, 2));
    } catch (err: any) {
      setTestError(err.message || "Failed to execute prompt test.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="space-y-6 pb-12">
      {/* 1. Header Hero Card */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface p-6 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-moss-500/5 pointer-events-none" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
              <Sparkles size={12} /> Gemini Studio Dashboard (Free Tier Only)
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">BrenUp AI Playground</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--br-text-muted)]">
              Manage system prompt templates, audit token counters, configure rate quotas, and live-test Gemini outputs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSeed}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--br-border)] bg-surface px-4 py-2.5 text-sm font-semibold text-[var(--br-text-muted)] hover:bg-surface-muted disabled:opacity-50"
            >
              <Database size={16} /> Seed Templates
            </button>
          </div>
        </div>

        {/* Aggregate usage metrics */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--br-border)] pt-5 md:grid-cols-4">
          <div className="rounded-xl bg-surface-muted p-4 border border-[var(--br-border)]">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--br-text-muted)]">API Limit</p>
            <p className="mt-1 text-xl font-bold text-ink">Free Tier</p>
            <p className="text-[10px] text-amber-600 font-medium">Shared Studio Quota (15 RPM)</p>
          </div>
          <div className="rounded-xl bg-surface-muted p-4 border border-[var(--br-border)]">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--br-text-muted)]">Requests Today</p>
            <p className="mt-1 text-xl font-bold text-ink">{totalRequestsToday}</p>
            <p className="text-[10px] text-[var(--br-text-muted)]">Aggregated usage logs</p>
          </div>
          <div className="rounded-xl bg-surface-muted p-4 border border-[var(--br-border)]">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--br-text-muted)]">Est. Tokens Today</p>
            <p className="mt-1 text-xl font-bold text-ink">{totalTokensToday.toLocaleString()}</p>
            <p className="text-[10px] text-[var(--br-text-muted)] font-mono">Input + output volume</p>
          </div>
          <div className="rounded-xl bg-surface-muted p-4 border border-[var(--br-border)]">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--br-text-muted)]">Gemini Defaults</p>
            <p className="mt-1 text-xl font-bold text-ink">gemini-3.5-flash</p>
            <p className="text-[10px] text-moss font-semibold">Fast structured engine</p>
          </div>
        </div>
      </section>

      {statusMessage && (
        <div className="rounded-xl border border-moss/20 bg-moss/5 px-4 py-3 text-sm font-medium text-moss flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage("")} className="text-moss/60 hover:text-moss font-bold">×</button>
        </div>
      )}

      {/* 2. Feature Flags & Prompt Templates split view */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left Sidebar: list of flags and templates */}
        <aside className="space-y-5">
          {/* A. Feature Flags Toggles */}
          <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--br-text-muted)]">Feature Flags</h2>
            <div className="space-y-3">
              {flags.map((flag) => (
                <div key={flag.id} className="rounded-lg border border-[var(--br-border)] p-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                    <p className="truncate font-semibold text-ink">{flag.feature_key.replaceAll("_", " ")}</p>
                    <p className="text-[10px] text-[var(--br-text-muted)]">Roles: {flag.allowed_roles.join(", ")}</p>
                    </div>
                    <button
                      onClick={() => handleToggleFlag(flag.feature_key, flag.enabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${flag.enabled ? "bg-moss" : "bg-slate-200"}`}
                    >
                      <span className={`pointer-events-none inline-block size-4 transform rounded-full bg-surface shadow ring-0 transition duration-200 ease-in-out ${flag.enabled ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>
                  {flag.feature_key === "creator_voiceover" ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--br-border)] pt-2">
                      {(["TEACHER", "SCHOOL_ADMIN"] as const).map((role) => (
                        <button key={role} type="button" disabled={isPending} onClick={() => handleRoleToggle(flag, role)} className={`rounded-full px-2 py-1 text-[10px] font-bold ${flag.allowed_roles.includes(role) ? "bg-[var(--br-brand)] text-on-dark" : "bg-surface-muted text-[var(--br-text-muted)]"}`}>
                          {role === "SCHOOL_ADMIN" ? "School admins" : "Teachers"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {flags.length === 0 && <p className="text-xs text-[var(--br-text-muted)]">No feature flags found. Try Seeding.</p>}
            </div>
          </section>

          {/* B. Prompt Templates Selector List */}
          <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--br-text-muted)]">Prompt Keys</h2>
            <div className="space-y-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTemplateChange(t.template_key)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm font-semibold transition truncate block
                    ${selectedTemplateKey === t.template_key ? "bg-purple-50 text-purple-700 border border-purple-200/50" : "text-[var(--br-text-muted)] hover:bg-surface-muted"}`}
                >
                  {t.template_key}
                </button>
              ))}
              {templates.length === 0 && <p className="text-xs text-[var(--br-text-muted)]">No templates found. Try Seeding.</p>}
            </div>
          </section>
        </aside>

        {/* Right workspace: Edit Panel + Test Terminal */}
        <section className="space-y-6">
          {selectedTemplate ? (
            <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--br-border)] pb-4">
                <div>
                  <h2 className="text-lg font-bold text-ink">Edit: {selectedTemplateKey}</h2>
                  <p className="text-xs text-[var(--br-text-muted)]">Modify the active system rules and variables for this AI feature.</p>
                </div>
                <button
                  onClick={handleSaveTemplate}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-dark px-4 py-2 text-sm font-bold text-on-dark hover:bg-black/90 disabled:opacity-50"
                >
                  <Save size={16} /> Save Changes
                </button>
              </div>

              <div className="grid gap-4">
                <label className="text-sm font-semibold text-[var(--br-text-muted)] block">
                  System Role Description (AI persona setup)
                  <textarea
                    rows={2}
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    placeholder="e.g. You are an expert CEFR English Examiner."
                    className="mt-1.5 w-full rounded-xl border border-[var(--br-border)] px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-purple-500/25 focus:border-purple-500 outline-none"
                  />
                </label>

                <label className="text-sm font-semibold text-[var(--br-text-muted)] block">
                  Prompt Text (supports variable substitutions like {"{topic}"})
                  <textarea
                    rows={8}
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Provide your prompts here..."
                    className="mt-1.5 w-full font-mono rounded-xl border border-[var(--br-border)] px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-purple-500/25 focus:border-purple-500 outline-none"
                  />
                </label>
              </div>

              {/* 3. Live Test Terminal Section */}
              <div className="border-t border-[var(--br-border)] pt-5 space-y-4">
                <div className="flex items-center gap-1.5">
                  <Terminal size={18} className="text-moss" />
                  <h3 className="font-bold text-ink">Live Generation Test</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-xs font-semibold text-[var(--br-text-muted)] block">
                    1. Input Variables JSON
                    <textarea
                      rows={5}
                      value={testVars}
                      onChange={(e) => setTestVars(e.target.value)}
                      className="mt-1 w-full font-mono rounded-xl border border-[var(--br-border)] bg-surface-muted px-3 py-2 text-xs focus:outline-none"
                    />
                  </label>

                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-[var(--br-text-muted)] mb-1 flex items-center justify-between">
                      2. Real-Time Gemini Response
                      {testing && <span className="text-moss font-semibold animate-pulse">Querying...</span>}
                    </span>
                    <pre className="flex-1 font-mono text-[10px] rounded-xl border border-[var(--br-border)] bg-black text-emerald-400 p-3 overflow-auto max-h-[160px]">
                      {testError ? `Error: ${testError}` : testResult || "// Click Run Test to query Google AI Studio"}
                    </pre>
                  </div>
                </div>

                <button
                  onClick={handleRunTest}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-moss px-4 py-2 text-sm font-bold text-on-dark hover:bg-moss/90 disabled:opacity-50"
                >
                  <Play size={14} /> Run Test with Gemini
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--br-border)] bg-surface-muted p-12 text-center">
              <Sparkles size={32} className="mx-auto text-[var(--br-text-muted)] mb-3" />
              <h2 className="text-lg font-bold text-ink">No Prompts Seeded</h2>
              <p className="text-sm text-[var(--br-text-muted)] mt-1 max-w-sm mx-auto">
                Seed the database with the default system instruction parameters to start building.
              </p>
              <button
                onClick={handleSeed}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-dark px-4 py-2 text-sm font-bold text-on-dark hover:bg-black/90"
              >
                Seed Tables
              </button>
            </div>
          )}
        </section>
      </div>

      {/* 3. Generation Audits Logs list */}
      <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--br-border)] pb-3">
          <div className="flex items-center gap-1.5">
            <Flame size={18} className="text-purple-600" />
            <h2 className="text-lg font-bold text-ink">Recent Generation Logs</h2>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-surface-muted"
          >
            <RefreshCcw size={14} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--br-border)] text-xs font-semibold text-[var(--br-text-muted)]">
                <th className="pb-2">Feature Key</th>
                <th className="pb-2">Model</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Preview / Error</th>
                <th className="pb-2 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {logs.map((log) => (
                <tr key={log.id} className="align-top text-xs text-[var(--br-text-muted)] hover:bg-surface-muted/50">
                  <td className="py-2.5 font-bold text-ink">{log.feature_key}</td>
                  <td className="py-2.5 font-mono">{log.model_used}</td>
                  <td className="py-2.5">
                    {log.error_message ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                        <XCircle size={12} /> Failure
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                        <CheckCircle size={12} /> Success
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 max-w-[320px] truncate font-mono text-[10px]">
                    {log.error_message || log.response_preview || "No content output preview."}
                  </td>
                  <td className="py-2.5 text-right font-medium text-[var(--br-text-muted)]">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[var(--br-text-muted)]">
                    No generation logs found in ai_generations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

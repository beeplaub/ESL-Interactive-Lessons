"use client";

import { useState, useTransition } from "react";
import { Sparkles, X, ChevronRight, AlertCircle, CheckCircle } from "lucide-react";
import { generateActivityQuestionsAction } from "@/app/admin/lessons/aiActions";
import { insertGeneratedQuestionsAction } from "@/app/admin/lessons/actions";
import type { Json } from "@/types/database.types";

type Activity = {
  id: string;
  lesson_id: string;
  slide_number: number;
  activity_type: string;
  activity_data: Json | null;
  needs_review: boolean;
  raw_text: string | null;
};

type Props = {
  lessonId: string;
  slideId: string;
  slideNumber: number;
  slideActivities: Activity[];
  onClose: () => void;
};

export default function AiActivityGeneratorModal({
  lessonId,
  slideId,
  slideNumber,
  slideActivities,
  onClose,
}: Props) {
  const [activityType, setActivityType] = useState<"MCQ" | "MULTIPLE_SELECT" | "TRUE_FALSE" | "MATCHING">("MCQ");
  const [guidelines, setGuidelines] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Step tracking: 'setup' | 'preview'
  const [step, setStep] = useState<"setup" | "preview">("setup");
  const [generatedData, setGeneratedData] = useState<any>(null);
  
  const [isPending, startTransition] = useTransition();

  // Find existing activities of the selected type on this slide
  const matchingActivities = slideActivities.filter(
    (act) => act.activity_type === activityType
  );
  
  const [appendActivityId, setAppendActivityId] = useState<string>(
    matchingActivities[0]?.id || ""
  );
  const [shouldAppend, setShouldAppend] = useState(matchingActivities.length > 0);

  // Automatically update append defaults when activityType changes
  const handleTypeChange = (type: "MCQ" | "MULTIPLE_SELECT" | "TRUE_FALSE" | "MATCHING") => {
    setActivityType(type);
    const matches = slideActivities.filter((act) => act.activity_type === type);
    if (matches.length > 0) {
      setAppendActivityId(matches[0].id);
      setShouldAppend(true);
    } else {
      setAppendActivityId("");
      setShouldAppend(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateActivityQuestionsAction({
        slideId,
        activityType,
        guidelines: guidelines.trim(),
      });

      if (!result.success) {
        setError(result.error || "Failed to generate questions. Please try again.");
      } else {
        setGeneratedData(result.data);
        setStep("preview");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during generation.");
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await insertGeneratedQuestionsAction({
          lessonId,
          slideId,
          slideNumber,
          activityType,
          generatedData,
          appendActivityId: shouldAppend ? appendActivityId : undefined,
        });

        if (!result.success) {
          setError(result.error || "Failed to insert generated questions.");
        } else {
          onClose();
        }
      } catch (err: any) {
        setError(err?.message || "An error occurred while inserting questions.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-3 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-surface p-5 shadow-2xl transition-all duration-300">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--br-border)] pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-[var(--br-chart-primary)]/10 p-2 text-[var(--br-chart-primary)]">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--br-chart-primary)]">AI Assistant</p>
              <h3 className="text-lg font-bold text-ink">Generate Questions with AI</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--br-border)] p-1.5 text-[var(--br-text-muted)] hover:bg-black/5 hover:text-[var(--br-text-muted)]"
            aria-label="Close generator"
          >
            <X size={16} />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
            <AlertCircle className="mt-0.5 shrink-0 text-red-600" size={16} />
            <p className="font-medium leading-relaxed">{error}</p>
          </div>
        )}

        {/* Content Area */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex min-h-[250px] flex-col items-center justify-center p-6 text-center">
              <div className="size-10 animate-spin rounded-full border-4 border-[var(--br-chart-primary)] border-t-transparent" />
              <p className="mt-4 font-semibold text-ink">Analyzing slide content...</p>
              <p className="mt-1 text-sm text-[var(--br-text-muted)]">Gemini is designing highly relevant ESL questions.</p>
            </div>
          ) : step === "setup" ? (
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-semibold text-ink">
                  Activity Type
                  <select
                    value={activityType}
                    onChange={(e) => handleTypeChange(e.target.value as any)}
                    className="mt-1.5 w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm bg-surface focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)]"
                  >
                    <option value="MCQ">Multiple Choice (MCQ)</option>
                    <option value="MULTIPLE_SELECT">Multiple Select</option>
                    <option value="TRUE_FALSE">True / False</option>
                    <option value="MATCHING">Matching Activity</option>
                  </select>
                </label>
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink">
                  Guidance / Instructions (Optional)
                  <textarea
                    rows={3}
                    value={guidelines}
                    onChange={(e) => setGuidelines(e.target.value)}
                    placeholder="e.g. Focus on future continuous tense, or ask about the objects in the image block."
                    className="mt-1.5 w-full rounded-md border border-[var(--br-border)] px-3 py-2 text-sm placeholder-black/35 focus:border-[var(--br-chart-primary)] focus:ring-1 focus:ring-[var(--br-chart-primary)]"
                  />
                </label>
                <p className="mt-1 text-xs text-[var(--br-text-muted)]">
                  The AI reads all text, reading passages, dialogues, images, and audio blocks on this slide to write content.
                </p>
              </div>

              {matchingActivities.length > 0 && (
                <div className="rounded-lg border border-[var(--br-chart-primary)]/20 bg-[var(--br-chart-primary)]/5 p-3.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="shouldAppendCheckbox"
                      checked={shouldAppend}
                      onChange={(e) => setShouldAppend(e.target.checked)}
                      className="rounded text-[var(--br-chart-primary)] focus:ring-[var(--br-chart-primary)]"
                    />
                    <label htmlFor="shouldAppendCheckbox" className="text-sm font-semibold text-ink select-none cursor-pointer">
                      Append generated questions to an existing activity
                    </label>
                  </div>
                  {shouldAppend && (
                    <select
                      value={appendActivityId}
                      onChange={(e) => setAppendActivityId(e.target.value)}
                      className="mt-2 w-full rounded-md border border-[var(--br-border)] bg-surface px-3 py-1.5 text-xs focus:border-[var(--br-chart-primary)]"
                    >
                      {matchingActivities.map((act, index) => (
                        <option key={act.id} value={act.id}>
                          Activity {index + 1} ({act.activity_type})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="rounded-lg border border-[var(--br-success)]/20 bg-[var(--br-success)]/5 p-3.5 text-sm text-[var(--br-chart-secondary)] flex items-start gap-2">
                <CheckCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Questions generated successfully!</p>
                  <p className="mt-0.5 text-xs text-[var(--br-chart-secondary)]/80">Please review the generated preview below before adding them.</p>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--br-border)] bg-surface-muted p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--br-text-muted)] mb-2">Prompt / Title</p>
                <p className="text-sm font-semibold text-ink mb-4">{generatedData?.prompt || "Check your understanding."}</p>

                <p className="text-xs font-bold uppercase tracking-wider text-[var(--br-text-muted)] mb-2">Generated items</p>
                
                {activityType === "MCQ" && (
                  <div className="space-y-3">
                    {generatedData?.questions?.map((q: any, idx: number) => (
                      <div key={idx} className="rounded border border-[var(--br-border)] bg-surface p-3 text-sm">
                        <p className="font-semibold">{idx + 1}. {q.text}</p>
                        <ul className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--br-text-muted)]">
                          {Object.entries(q.options || {}).map(([key, val]) => (
                            <li key={key} className={q.answer === key ? "font-bold text-[var(--br-success)]" : ""}>
                              {key}: {String(val)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {activityType === "MULTIPLE_SELECT" && (
                  <div className="space-y-3">
                    {generatedData?.questions?.map((q: any, idx: number) => (
                      <div key={idx} className="rounded border border-[var(--br-border)] bg-surface p-3 text-sm">
                        <p className="font-semibold">{idx + 1}. {q.text}</p>
                        <ul className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--br-text-muted)]">
                          {Object.entries(q.options || {}).map(([key, val]) => (
                            <li key={key} className={q.answers?.includes(key) ? "font-bold text-[var(--br-success)]" : ""}>
                              {key}: {String(val)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {activityType === "TRUE_FALSE" && (
                  <div className="space-y-2">
                    {generatedData?.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center rounded border border-[var(--br-border)] bg-surface p-2.5 text-sm">
                        <span>{idx + 1}. {item.statement}</span>
                        <span className={`rounded px-2 py-0.5 text-xs font-bold ${item.answer ? "bg-[var(--br-success)]/15 text-[var(--br-chart-secondary)]" : "bg-red-50 text-red-600"}`}>
                          {item.answer ? "True" : "False"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {activityType === "MATCHING" && (
                  <div className="space-y-2">
                    {generatedData?.questions?.[0]?.correct_answer?.map((pair: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded border border-[var(--br-border)] bg-surface p-2 text-sm">
                        <span className="font-medium text-ink">{pair.a}</span>
                        <span className="text-xs text-[var(--br-text-muted)]">↔</span>
                        <span className="font-medium text-[var(--br-chart-primary)]">{pair.b}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-[var(--br-border)] pt-3">
          {step === "setup" ? (
            <>
              <p className="text-xs text-[var(--br-text-muted)]">Powered by Gemini Flash</p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--br-chart-primary)] px-4 py-2 text-sm font-semibold text-on-dark shadow-sm hover:bg-[var(--br-brand-strong)] disabled:opacity-50"
              >
                Generate <ChevronRight size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep("setup")}
                disabled={isPending}
                className="rounded-lg border border-[var(--br-border)] px-4 py-2 text-sm font-semibold text-[var(--br-text-muted)] hover:bg-black/5 disabled:opacity-50"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleInsert}
                disabled={isPending}
                className="rounded-lg bg-[var(--br-chart-primary)] px-5 py-2 text-sm font-semibold text-on-dark shadow-sm hover:bg-[var(--br-brand-strong)] disabled:opacity-50"
              >
                {isPending ? "Adding..." : shouldAppend ? "Append to existing" : "Add as new activity"}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { CALLOUT_BACKGROUNDS, calloutBackgroundKey, type CalloutBackgroundKey } from "@/lib/calloutBackgrounds";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function CalloutLanguageFields({ data, onBackgroundChange }: { data: Record<string, unknown>; onBackgroundChange?: (key: CalloutBackgroundKey) => void }) {
  const [language, setLanguage] = useState<"en" | "bn">("en");
  const [background, setBackground] = useState<CalloutBackgroundKey>(calloutBackgroundKey(data.background_color));
  const selectedClass = "rounded-lg bg-[var(--br-brand)] px-3 py-1.5 text-xs font-bold text-on-dark shadow-sm";
  const idleClass = "rounded-lg px-3 py-1.5 text-xs font-bold text-[var(--br-text-muted)] transition hover:bg-white hover:text-[var(--br-brand)]";

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-ink">Callout language</p>
        <div className="grid w-36 shrink-0 gap-1.5">
          <div className="flex w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-1" role="group" aria-label="Choose callout editing language">
            <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")} className={`${language === "en" ? selectedClass : idleClass} flex-1`}>English</button>
            <button type="button" aria-pressed={language === "bn"} onClick={() => setLanguage("bn")} className={`${language === "bn" ? selectedClass : idleClass} flex-1`}>বাংলা</button>
          </div>
          <input type="hidden" name="callout_background" value={background} />
          <div className="grid w-full grid-cols-4 gap-1" role="group" aria-label="Choose callout background color">
            {Object.entries(CALLOUT_BACKGROUNDS).map(([key, option]) => (
              <button
                key={key}
                type="button"
                aria-label={option.label}
                aria-pressed={background === key}
                title={option.label}
                onClick={() => {
                  const next = key as CalloutBackgroundKey;
                  setBackground(next);
                  onBackgroundChange?.(next);
                }}
                className={`h-5 min-w-0 rounded-md border transition ${background === key ? "border-[var(--br-brand)] ring-2 ring-[var(--br-brand)] ring-offset-1" : "border-black/10 hover:border-[var(--br-brand)]"}`}
                style={{ backgroundColor: option.color }}
              />
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: language === "en" ? "grid" : "none" }} className="gap-3">
        <label className="text-sm">Callout title <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="title" defaultValue={asString(data.title)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Callout text<textarea name="body" rows={5} defaultValue={asString(data.body ?? data.text)} placeholder="Supports line breaks, **bold**, _italic_, __underline__, and lists." className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
      </div>
      <div style={{ display: language === "bn" ? "grid" : "none" }} className="gap-3" lang="bn">
        <label className="text-sm">কলআউটের শিরোনাম <span className="font-normal text-[var(--br-text-muted)]">(ঐচ্ছিক)</span><input name="title_bn" defaultValue={asString(data.title_bn)} placeholder="যেমন: মনে রাখুন" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">কলআউটের লেখা<textarea name="body_bn" rows={5} defaultValue={asString(data.body_bn)} placeholder="শিক্ষার্থীদের জন্য বাংলা নোট লিখুন…" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
      </div>
      <p className="text-xs leading-5 text-[var(--br-text-muted)]" lang={language}>
        {language === "en" ? "Add a Bengali version too; learners can switch languages in the lesson." : "বাংলা লেখাটি আলাদা করে সংরক্ষিত থাকবে; শিক্ষার্থীরা lesson-এ ভাষা বদলাতে পারবে।"}
      </p>
    </div>
  );
}

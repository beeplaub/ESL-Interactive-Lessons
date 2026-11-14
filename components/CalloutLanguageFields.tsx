"use client";

import { useState } from "react";
import { CALLOUT_BACKGROUNDS, calloutBackgroundKey } from "@/lib/calloutBackgrounds";
import { BlockLanguageStyleSection, type BlockEditorLanguage } from "@/components/BilingualBlockFields";
import { BlockBackgroundColorPicker, type BlockBackgroundColorPreset } from "@/components/BlockBackgroundColorPicker";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

const CALLOUT_COLOR_PRESETS: readonly BlockBackgroundColorPreset[] = [
  { label: "No background", value: "" },
  ...Object.values(CALLOUT_BACKGROUNDS).map((option) => ({ label: option.label, value: option.color })),
];

export function CalloutLanguageFields({ data, onBackgroundChange, onContentChange }: { data: Record<string, unknown>; onBackgroundChange?: (color: string) => void; onContentChange?: (field: string, value: string) => void }) {
  const [language, setLanguage] = useState<BlockEditorLanguage>("en");
  const legacyBackgroundKey = calloutBackgroundKey(data.background_color);
  const storedBackground = asString(data.block_background_color);
  const hasCustomBackground = Object.prototype.hasOwnProperty.call(data, "block_background_color");
  const [background, setBackground] = useState(hasCustomBackground ? (/^#[0-9a-fA-F]{6}$/.test(storedBackground) ? storedBackground : "") : CALLOUT_BACKGROUNDS[legacyBackgroundKey].color);

  return (
    <BlockLanguageStyleSection
      label="Callout content"
      language={language}
      onLanguageChange={setLanguage}
      languageLabel="Choose callout editing language"
      backgroundControl={
        <>
          <input type="hidden" name="callout_background" value={legacyBackgroundKey} />
          <BlockBackgroundColorPicker
            label="Background"
            name="block_background_color"
            value={background}
            presets={CALLOUT_COLOR_PRESETS}
            onChange={(color) => {
              setBackground(color);
              onBackgroundChange?.(color);
            }}
          />
        </>
      }
    >
      <div style={{ display: language === "en" ? "grid" : "none" }} className="gap-3">
        <label className="text-sm">Callout title <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="title" defaultValue={asString(data.title)} onChange={(event) => onContentChange?.("title", event.target.value)} className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">Callout text<textarea name="body" rows={5} defaultValue={asString(data.body ?? data.text)} onChange={(event) => onContentChange?.("body", event.target.value)} placeholder="Supports line breaks, **bold**, _italic_, __underline__, and lists." className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
      </div>
      <div style={{ display: language === "bn" ? "grid" : "none" }} className="gap-3" lang="bn">
        <label className="text-sm">কলআউটের শিরোনাম <span className="font-normal text-[var(--br-text-muted)]">(ঐচ্ছিক)</span><input name="title_bn" defaultValue={asString(data.title_bn)} onChange={(event) => onContentChange?.("title_bn", event.target.value)} placeholder="যেমন: মনে রাখুন" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
        <label className="text-sm">কলআউটের লেখা<textarea name="body_bn" rows={5} defaultValue={asString(data.body_bn)} onChange={(event) => onContentChange?.("body_bn", event.target.value)} placeholder="শিক্ষার্থীদের জন্য বাংলা নোট লিখুন…" className="mt-1 w-full rounded-md border border-[var(--br-border)] px-3 py-2" /></label>
      </div>
      <p className="text-xs leading-5 text-[var(--br-text-muted)]" lang={language}>
        {language === "en" ? "Add a Bengali version too; learners can switch languages in the lesson." : "বাংলা লেখাটি আলাদা করে সংরক্ষিত থাকবে; শিক্ষার্থীরা lesson-এ ভাষা বদলাতে পারবে।"}
      </p>
    </BlockLanguageStyleSection>
  );
}

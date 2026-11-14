"use client";

import { useState, type ReactNode } from "react";
import { InlineRichTextField } from "@/components/InlineRichTextField";
import { BlockBackgroundColorPicker } from "@/components/BlockBackgroundColorPicker";

export type BlockEditorLanguage = "en" | "bn";
type BilingualBlockKind = "heading" | "text" | "bullets" | "instruction";

type BlockStyle = {
  text_color: string;
  block_background_color: string;
};

function colorValue(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "";
}

export function BlockLanguageStyleSection({
  label,
  language,
  onLanguageChange,
  languageLabel,
  backgroundControl,
  children,
}: {
  label: string;
  language: BlockEditorLanguage;
  onLanguageChange: (language: BlockEditorLanguage) => void;
  languageLabel: string;
  backgroundControl: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1 text-sm font-semibold text-ink">{label}</p>
        <div className="grid w-[min(16.125rem,58vw)] shrink-0 gap-1.5 sm:w-[16.125rem]">
          <div className="inline-flex w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-1" role="group" aria-label={languageLabel}>
            <button type="button" aria-pressed={language === "en"} onClick={() => onLanguageChange("en")} className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition ${language === "en" ? "bg-[var(--br-brand)] text-on-dark shadow-sm" : "text-[var(--br-text-muted)] hover:bg-white hover:text-[var(--br-brand)]"}`}>English</button>
            <button type="button" aria-pressed={language === "bn"} onClick={() => onLanguageChange("bn")} className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition ${language === "bn" ? "bg-[var(--br-brand)] text-on-dark shadow-sm" : "text-[var(--br-text-muted)] hover:bg-white hover:text-[var(--br-brand)]"}`}>বাংলা</button>
          </div>
          {backgroundControl}
        </div>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

export function BlockTextStyleControls({
  data,
  onStyleChange,
}: {
  data: Record<string, unknown>;
  onStyleChange?: (style: BlockStyle) => void;
}) {
  const textColor = colorValue(data.text_color);
  const [backgroundColor, setBackgroundColor] = useState(() => colorValue(data.block_background_color));

  function updateBackground(nextBackgroundColor: string) {
    setBackgroundColor(nextBackgroundColor);
    onStyleChange?.({ text_color: textColor, block_background_color: nextBackgroundColor });
  }

  return <BlockBackgroundColorPicker label="Background" name="block_background_color" value={backgroundColor} onChange={updateBackground} />;
}

function textValue(data: Record<string, unknown>, name: string, fallback = "") {
  return typeof data[name] === "string" ? data[name] as string : fallback;
}

function linesValue(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("\n") : typeof value === "string" ? value : "";
}

export function BilingualBlockFields({
  kind,
  data,
  onContentChange,
  onStyleChange,
}: {
  kind: BilingualBlockKind;
  data: Record<string, unknown>;
  onContentChange?: (field: string, value: string) => void;
  onStyleChange?: (style: BlockStyle) => void;
}) {
  const [language, setLanguage] = useState<BlockEditorLanguage>("en");
  const heading = kind === "heading";
  const text = kind === "text";
  const bullets = kind === "bullets";
  const englishField = heading ? "text" : bullets ? "items" : "body";
  const bengaliField = heading ? "text_bn" : bullets ? "items_bn" : "body_bn";
  const headingLevel = typeof data.level === "string" ? data.level : "H2";
  const titleLabel = heading ? "Heading content" : text ? "Text content" : bullets ? "Bullet points content" : "Instruction content";

  return (
    <div className="grid gap-3">
      <BlockLanguageStyleSection
        label={titleLabel}
        language={language}
        onLanguageChange={setLanguage}
        languageLabel={`Choose ${heading ? "heading" : text ? "text" : bullets ? "bullet points" : "instruction"} editing language`}
        backgroundControl={<BlockTextStyleControls data={data} onStyleChange={onStyleChange} />}
      >
        <div style={{ display: language === "en" ? "grid" : "none" }} className="gap-3">
          {!heading ? <>
            {bullets ? <>
              <label className="block text-sm">Section label <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><input name="eyebrow" type="text" defaultValue={textValue(data, "eyebrow")} onChange={(event) => onContentChange?.("eyebrow", event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/15" placeholder="Key points, Review, or your own label" /></label>
              <label className="block text-sm">List title<input name="title" type="text" defaultValue={textValue(data, "title")} onChange={(event) => onContentChange?.("title", event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/15" placeholder="Key points" /></label>
            </> : <label className="block text-sm">{text ? "Text title (optional)" : "Title (optional)"}
              <input name="title" type="text" defaultValue={textValue(data, "title")} onChange={(event) => onContentChange?.("title", event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/15" placeholder={text ? "Optional title" : "Before you begin"} />
            </label>}
          </> : null}
          {bullets ? <label className="block text-sm">Bullet points <span className="font-normal text-[var(--br-text-muted)]">(one per line)</span><textarea name={englishField} rows={5} defaultValue={linesValue(data[englishField])} onChange={(event) => onContentChange?.(englishField, event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/15" /></label> : <div className="text-sm">{heading ? "Heading text" : text ? "Body text" : "Instruction text"}
            <InlineRichTextField name={englishField} label={heading ? "Heading text" : text ? "Body text" : "Instruction text"} rows={heading ? 2 : 4} value={textValue(data, englishField, !heading && text ? textValue(data, "text") : "")} onChange={(value) => onContentChange?.(englishField, value)} />
            {text ? <p className="mt-1 text-xs text-[var(--br-text-muted)]">Use <code className="rounded bg-[var(--br-surface-muted)] px-1">{"⟦visual-blank⟧"}</code> for a non-interactive five-character blank. <code className="rounded bg-[var(--br-surface-muted)] px-1">___</code> remains an interactive gap.</p> : null}
          </div>}
        </div>
        <div style={{ display: language === "bn" ? "grid" : "none" }} className="gap-3" lang="bn">
          {!heading ? <>
            {bullets ? <>
              <label className="block text-sm">বিভাগের লেবেল <span className="font-normal text-[var(--br-text-muted)]">(ঐচ্ছিক)</span><input name="eyebrow_bn" type="text" defaultValue={textValue(data, "eyebrow_bn")} onChange={(event) => onContentChange?.("eyebrow_bn", event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/15" placeholder="মূল বিষয়, পর্যালোচনা, অথবা নিজের লেবেল" /></label>
              <label className="block text-sm">তালিকার শিরোনাম<input name="title_bn" type="text" defaultValue={textValue(data, "title_bn")} onChange={(event) => onContentChange?.("title_bn", event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/15" placeholder="মূল বিষয়গুলো" /></label>
            </> : <label className="block text-sm">{text ? "Text title (Bengali, optional)" : "শিরোনাম (ঐচ্ছিক)"}
              <input name="title_bn" type="text" defaultValue={textValue(data, "title_bn")} onChange={(event) => onContentChange?.("title_bn", event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 text-sm outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/15" placeholder={text ? "শিরোনাম (ঐচ্ছিক)" : "কাজ শুরু করার আগে"} />
            </label>}
          </> : null}
          {bullets ? <label className="block text-sm">বুলেট পয়েন্ট <span className="font-normal text-[var(--br-text-muted)]">(প্রতি লাইনে একটি)</span><textarea name={bengaliField} rows={5} defaultValue={linesValue(data[bengaliField])} onChange={(event) => onContentChange?.(bengaliField, event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/15" /></label> : <div className="text-sm">{heading ? "Heading text (Bengali)" : text ? "Body text (Bengali)" : "নির্দেশনা"}
            <InlineRichTextField name={bengaliField} label={heading ? "Heading text (Bengali)" : text ? "Body text (Bengali)" : "নির্দেশনা"} rows={heading ? 2 : 4} lang="bn" value={textValue(data, bengaliField)} onChange={(value) => onContentChange?.(bengaliField, value)} />
          </div>}
        </div>
      </BlockLanguageStyleSection>
      {heading ? <label className="text-sm">Heading level<select name="level" defaultValue={headingLevel} className="mt-1 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2.5 sm:max-w-40"><option value="H1">H1</option><option value="H2">H2</option><option value="H3">H3</option><option value="H4">H4</option></select></label> : null}
    </div>
  );
}

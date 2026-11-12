"use client";

import { useEffect, useRef, useState } from "react";
import { BlockLanguageStyleSection, BlockTextStyleControls, type BlockEditorLanguage } from "@/components/BilingualBlockFields";
import { LessonBlockPreview, type PreviewLessonBlock } from "@/components/LessonBlockPreview";
import type { Json } from "@/types/database.types";

type SampleField = { label: string; value: string; multiline?: boolean; editable?: boolean };
type BlockSample = {
  label: string;
  type: string;
  content: Record<string, unknown>;
  fields: SampleField[];
  fieldsBn?: SampleField[];
  contentBn?: Record<string, unknown>;
};

const samples: BlockSample[] = [
  {
    label: "Review checklist", type: "REVIEW_CHECKLIST",
    content: { title: "Now, I can…", items: ["I can use the target language.", "I can understand the key idea."] },
    fields: [
      { label: "Checklist title", value: "Now, I can…" },
      { label: "Review statements", value: "I can use the target language.\nI can understand the key idea.", multiline: true },
    ],
  },
  {
    label: "Quote", type: "QUOTE",
    content: { body: "A little progress each day adds up to big results.", attribution: "Daily reminder", text_align: "left" },
    fields: [
      { label: "Quote text", value: "A little progress each day adds up to big results.", multiline: true },
      { label: "Attribution (optional)", value: "Daily reminder" },
      { label: "Text alignment", value: "Left" },
    ],
  },
  {
    label: "Sticky note", type: "STICKY_NOTE",
    content: { title: "Remember this", body: "Use ‘could’ for polite requests.", card_size: 100 },
    fields: [
      { label: "Title (optional)", value: "Remember this" },
      { label: "Note text", value: "Use ‘could’ for polite requests.", multiline: true },
      { label: "Card size", value: "100%" },
    ],
  },
  {
    label: "Image + Text", type: "IMAGE_TEXT",
    content: { heading: "Describe the scene", body: "Look at the picture and say what is happening.", image_path: "/images/learner-hero.png", alt: "Learners studying together", caption: "What do you notice?", image_position: "left", text_align: "left", vertical_align: "center" },
    fields: [
      { label: "Image", value: "Learner illustration · /images/learner-hero.png" },
      { label: "Alt text", value: "Learners studying together" },
      { label: "Caption", value: "What do you notice?" },
      { label: "Heading", value: "Describe the scene" },
      { label: "Text", value: "Look at the picture and say what is happening.", multiline: true },
      { label: "Image position", value: "Left" },
    ],
  },
  {
    label: "Vocabulary list", type: "VOCABULARY",
    content: { title: "New word", entries: [{ word: "curious", pronunciation: "/ˈkjʊriəs/", meaning: "eager to learn", example: "She is curious about space.", notes: "adjective" }] },
    fields: [
      { label: "Word", value: "curious" },
      { label: "Pronunciation", value: "/ˈkjʊriəs/" },
      { label: "Meaning", value: "eager to learn" },
      { label: "Example", value: "She is curious about space.", multiline: true },
      { label: "Word type / note", value: "adjective" },
    ],
  },
  {
    label: "Grammar", type: "GRAMMAR",
    content: { title: "Present perfect", explanation: "Use it to talk about life experiences.", examples: ["I have visited Dhaka.", "She has tried sushi."], notes: "The exact time is not important.", reveal_hidden: true },
    fields: [
      { label: "Title", value: "Present perfect" },
      { label: "Explanation", value: "Use it to talk about life experiences.", multiline: true },
      { label: "Examples", value: "I have visited Dhaka.\nShe has tried sushi.", multiline: true },
      { label: "Notes", value: "The exact time is not important.", multiline: true },
      { label: "Hide until revealed", value: "On" },
    ],
  },
  {
    label: "Reading passage", type: "READING",
    content: { title: "A morning walk", passage: "Mina walks to school every morning. She enjoys seeing the city wake up.", translation: "মিনা প্রতিদিন সকালে হেঁটে স্কুলে যায়। শহরকে জেগে উঠতে দেখতে তার ভালো লাগে।", glossary: [], questions: [] },
    fields: [
      { label: "Title", value: "A morning walk" },
      { label: "Passage", value: "Mina walks to school every morning. She enjoys seeing the city wake up.", multiline: true },
      { label: "Bengali translation", value: "মিনা প্রতিদিন সকালে হেঁটে স্কুলে যায়। শহরকে জেগে উঠতে দেখতে তার ভালো লাগে।", multiline: true },
    ],
  },
  {
    label: "Dialogue", type: "DIALOGUE",
    content: { title: "Asking for help", turns: [{ speaker: "A", line: "Could you help me?" }, { speaker: "B", line: "Of course. What do you need?" }] },
    fields: [
      { label: "Dialogue title", value: "Asking for help" },
      { label: "Speaker A", value: "Could you help me?" },
      { label: "Speaker B", value: "Of course. What do you need?" },
    ],
  },
  {
    label: "Table", type: "TABLE",
    content: { caption: "Regular verbs", headers: ["Base form", "Past form"], rows: [["walk", "walked"], ["clean", "cleaned"]], reveal_hidden: true },
    fields: [
      { label: "Caption", value: "Regular verbs" },
      { label: "Column headings", value: "Base form | Past form" },
      { label: "Rows", value: "walk | walked\nclean | cleaned", multiline: true },
      { label: "Hide until revealed", value: "On" },
    ],
  },
  {
    label: "Common mistake", type: "COMMON_MISTAKE",
    content: { title: "Subject–verb agreement", mistake: "She go to work.", correction: "She goes to work.", explanation: "Use goes with she, he, or it." },
    fields: [
      { label: "Title", value: "Subject–verb agreement" },
      { label: "Incorrect sentence", value: "She go to work." },
      { label: "Correct sentence", value: "She goes to work." },
      { label: "Explanation", value: "Use goes with she, he, or it.", multiline: true },
    ],
  },
  {
    label: "Contrast pair", type: "CONTRAST_PAIR",
    content: { pairs: [{ title: "Say vs. Tell", left_term: "say", left_meaning: "speak words", left_examples: ["She said hello."], right_term: "tell", right_meaning: "give information", right_examples: ["Tell me the answer."] }] },
    fields: [
      { label: "Pair title (editable)", value: "Say vs. Tell" },
      { label: "First term and meaning", value: "say · speak words" },
      { label: "First example", value: "She said hello." },
      { label: "Second term and meaning", value: "tell · give information" },
      { label: "Second example", value: "Tell me the answer." },
    ],
  },
  {
    label: "Tongue twister", type: "TONGUE_TWISTER",
    content: { title: "Sea Shells", instruction: "Start slowly, then build up your speed.", items: [{ title: "Sea Shells", context: "Practise /s/ and /sh/.", text: "She sells sea shells by the sea shore.", target_sound: "/s/ and /ʃ/", highlights: [], chunks: [], pronunciation_note: "Keep the target sounds clear.", difficult_words: [], audio_path: "", hide_reveal_enabled: false }] },
    fields: [
      { label: "Activity title", value: "Sea Shells" },
      { label: "Instruction", value: "Start slowly, then build up your speed.", multiline: true },
      { label: "Practice sentence", value: "She sells sea shells by the sea shore.", multiline: true },
      { label: "Target sounds", value: "/s/ and /ʃ/" },
      { label: "Practice context", value: "Practise /s/ and /sh/." },
    ],
  },
  {
    label: "Steps", type: "STEPS",
    content: { title: "Start a conversation", instruction: "Follow these steps.", steps: [{ title: "Greet", description: "Say hello in a friendly way." }, { title: "Ask", description: "Ask a simple question." }, { title: "Respond", description: "Listen and reply." }] },
    contentBn: { title: "কথোপকথন শুরু করুন", instruction: "এই ধাপগুলো অনুসরণ করুন।", steps: [{ title: "অভিবাদন জানান", description: "বন্ধুত্বপূর্ণভাবে হ্যালো বলুন।" }, { title: "প্রশ্ন করুন", description: "সহজ একটি প্রশ্ন করুন।" }, { title: "উত্তর দিন", description: "মন দিয়ে শুনে উত্তর দিন।" }] },
    fields: [
      { label: "Title", value: "Start a conversation" },
      { label: "Instruction", value: "Follow these steps." },
      { label: "Step 1", value: "Greet · Say hello in a friendly way." },
      { label: "Step 2", value: "Ask · Ask a simple question." },
      { label: "Step 3", value: "Respond · Listen and reply." },
    ],
    fieldsBn: [
      { label: "শিরোনাম", value: "কথোপকথন শুরু করুন" },
      { label: "নির্দেশনা", value: "এই ধাপগুলো অনুসরণ করুন।" },
      { label: "ধাপ ১", value: "অভিবাদন জানান · বন্ধুত্বপূর্ণভাবে হ্যালো বলুন।" },
      { label: "ধাপ ২", value: "প্রশ্ন করুন · সহজ একটি প্রশ্ন করুন।" },
      { label: "ধাপ ৩", value: "উত্তর দিন · মন দিয়ে শুনে উত্তর দিন।" },
    ],
  },
];

function CreatorField({ field, onChange }: { field: SampleField; onChange?: (value: string) => void }) {
  return <label className="block text-xs font-semibold text-[var(--br-text-muted)]">
    {field.label}
    {field.multiline ? <textarea readOnly={!field.editable} rows={Math.min(4, Math.max(2, field.value.split("\n").length))} value={field.value} onChange={field.editable ? (event) => onChange?.(event.target.value) : undefined} className="mt-1.5 w-full resize-none rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2 text-sm font-normal leading-6 text-[var(--br-text)]" /> : <input readOnly={!field.editable} value={field.value} onChange={field.editable ? (event) => onChange?.(event.target.value) : undefined} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2 text-sm font-normal text-[var(--br-text)]" />}
  </label>;
}

function BlockPair({ sample, index }: { sample: BlockSample; index: number }) {
  const [language, setLanguage] = useState<BlockEditorLanguage>("en");
  const [learnerLanguage, setLearnerLanguage] = useState<BlockEditorLanguage>("en");
  const [background, setBackground] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [pairTitle, setPairTitle] = useState("Say vs. Tell");
  const previewRef = useRef<HTMLDivElement>(null);
  const [actionRoot, setActionRoot] = useState<HTMLElement | null>(null);
  const canCollapse = ["REVIEW_CHECKLIST", "GRAMMAR", "TABLE", "CONTRAST_PAIR", "STEPS"].includes(sample.type);
  const hasLanguageButton = sample.type !== "TONGUE_TWISTER";
  const actionPositionClass = !expanded && canCollapse
    ? "right-2 top-1/2 -translate-y-1/2"
    : sample.type === "DIALOGUE" ? "right-2 top-0"
      : ["READING", "TABLE", "GRAMMAR"].includes(sample.type) ? "right-2 top-4"
        : sample.type === "REVIEW_CHECKLIST" ? "right-2 top-3"
        : sample.type === "IMAGE_TEXT" ? "right-1 top-1"
            : sample.type === "STICKY_NOTE" ? "right-5 top-6"
              : "right-2 top-2";
  const baseContent = sample.type === "CONTRAST_PAIR" ? {
    ...sample.content,
    pairs: Array.isArray(sample.content.pairs) ? sample.content.pairs.map((pair, pairIndex) => pairIndex === 0 ? { ...(pair as Record<string, unknown>), title: pairTitle } : pair) : [],
  } : sample.content;
  const activeContent = learnerLanguage === "bn" && sample.contentBn ? sample.contentBn : baseContent;
  const learnerContent = {
    ...activeContent,
    block_background_color: background || undefined,
    ...(["GRAMMAR", "TABLE"].includes(sample.type) ? { reveal_hidden: false } : {}),
  };
  const block: PreviewLessonBlock = { id: `review-${sample.type}`, position: index + 1, block_type: sample.type, content: learnerContent as unknown as Json };
  const activePairTitle = Array.isArray(activeContent.pairs)
    ? String((activeContent.pairs[0] as Record<string, unknown> | undefined)?.title ?? "")
    : "";
  const collapsedTitle = sample.type === "CONTRAST_PAIR"
    ? activePairTitle || "Say vs. Tell"
    : sample.type === "REVIEW_CHECKLIST"
      ? "Now, I can…"
    : String(activeContent.title ?? activeContent.caption ?? sample.label);
  const creatorFields = language === "bn" && sample.fieldsBn ? sample.fieldsBn : sample.fields;
  const visibleCreatorFields = sample.type === "CONTRAST_PAIR"
    ? creatorFields.map((field) => field.label.startsWith("Pair title") ? { ...field, value: pairTitle, editable: true } : field)
    : creatorFields;

  useEffect(() => {
    const root = previewRef.current?.querySelector<HTMLElement>(".lesson-block-preview > *")
      ?? previewRef.current?.querySelector<HTMLElement>("[data-learner-action-root]");
    if (!root) { setActionRoot(null); return; }
    const oldPosition = root.style.position;
    if (getComputedStyle(root).position === "static") root.style.position = "relative";
    setActionRoot(root);
    return () => { root.style.position = oldPosition; };
  }, [expanded, sample.type]);

  useEffect(() => {
    if (!actionRoot) return;
    const oldBackground = actionRoot.style.backgroundColor;
    actionRoot.style.backgroundColor = background;
    return () => { actionRoot.style.backgroundColor = oldBackground; };
  }, [actionRoot, background]);

  return <section id={`block-${sample.type.toLowerCase()}`} className="scroll-mt-16 overflow-hidden rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] shadow-sm">
    <header className="flex items-center gap-3 border-b border-[var(--br-border)] px-4 py-3 sm:px-5">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--br-brand)] text-xs font-black text-on-dark">{index + 1}</span>
      <h2 className="text-sm font-extrabold text-[var(--br-brand)] sm:text-base">{sample.label}</h2>
    </header>
    <div className="grid items-start lg:grid-cols-2">
      <div className="min-w-0 p-4 sm:p-5 lg:border-r lg:border-[var(--br-border)]">
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-text-muted)]">Creator / Admin view</p>
        {hasLanguageButton ? <BlockLanguageStyleSection
          label="Language and background"
          language={language}
          onLanguageChange={setLanguage}
          languageLabel={`Sample editing language for ${sample.label}`}
          backgroundControl={<BlockTextStyleControls data={{ block_background_color: background }} onStyleChange={(style) => setBackground(style.block_background_color)} />}
        >
          <div className="grid gap-3">{visibleCreatorFields.map((field) => <CreatorField key={field.label} field={field} onChange={setPairTitle} />)}</div>
          <p className="text-[10px] leading-4 text-[var(--br-text-muted)]">Sample fields are read-only; language and background controls are for previewing their placement.</p>
        </BlockLanguageStyleSection> : <section className="grid gap-3 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] p-3">
          <p className="text-sm font-semibold text-ink">Background</p>
          <BlockTextStyleControls data={{ block_background_color: background }} onStyleChange={(style) => setBackground(style.block_background_color)} />
          <div className="grid gap-3">{sample.fields.map((field) => <CreatorField key={field.label} field={field} />)}</div>
          <p className="text-[10px] leading-4 text-[var(--br-text-muted)]">Tongue twister has no Bengali control.</p>
        </section>}
      </div>
      <div className="min-w-0 border-t border-[var(--br-border)] p-4 sm:p-5 lg:border-t-0">
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--br-text-muted)]">Learner view</p>
        <div ref={previewRef} className="rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] p-3 sm:p-4">
          {canCollapse && !expanded ? <div data-learner-action-root className="relative rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] px-4 py-3 pr-32 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--br-action)]">{sample.type === "REVIEW_CHECKLIST" ? "Learner reflection" : sample.label}</p>
            <p className="mt-1 truncate text-sm font-bold text-[var(--br-dark-card)]">{collapsedTitle}</p>
            {hasLanguageButton || canCollapse ? <LearnerActionButtons sample={sample} learnerLanguage={learnerLanguage} setLearnerLanguage={setLearnerLanguage} expanded={expanded} setExpanded={setExpanded} positionClass={actionPositionClass} /> : null}
          </div> : <div data-learner-action-root data-block-type={sample.type} className={`relative ${sample.type === "DIALOGUE" ? "learn-block-pairs-dialogue" : sample.type === "QUOTE" ? "learn-block-pairs-quote" : ""}`}>
            <LessonBlockPreview blocks={[block]} alwaysOpen={canCollapse && sample.type !== "REVIEW_CHECKLIST"} />
            {hasLanguageButton || canCollapse ? (sample.type === "REVIEW_CHECKLIST" ? null : <LearnerActionButtons sample={sample} learnerLanguage={learnerLanguage} setLearnerLanguage={setLearnerLanguage} expanded={expanded} setExpanded={setExpanded} positionClass={actionPositionClass} />) : null}
          </div>}
        </div>
      </div>
    </div>
  </section>;
}

function LearnerActionButtons({ sample, learnerLanguage, setLearnerLanguage, expanded, setExpanded, positionClass, inline = false }: {
  sample: BlockSample;
  learnerLanguage: BlockEditorLanguage;
  setLearnerLanguage: (language: BlockEditorLanguage | ((current: BlockEditorLanguage) => BlockEditorLanguage)) => void;
  expanded: boolean;
  setExpanded: (expanded: boolean | ((current: boolean) => boolean)) => void;
  positionClass: string;
  inline?: boolean;
}) {
  const hasLanguageButton = sample.type !== "TONGUE_TWISTER";
  const canCollapse = ["REVIEW_CHECKLIST", "GRAMMAR", "TABLE", "CONTRAST_PAIR", "STEPS"].includes(sample.type);
  return <div className={`${inline ? "inline-flex w-full" : `absolute ${positionClass}`} z-30 overflow-hidden rounded-lg border border-amber-200 bg-white/90 shadow-sm`} role="group" aria-label={`${sample.label} learner preview actions`}>
    {hasLanguageButton ? <button type="button" onClick={() => { if (sample.contentBn) setLearnerLanguage((value) => value === "en" ? "bn" : "en"); }} title={sample.contentBn ? (learnerLanguage === "en" ? "বাংলায় দেখুন" : "View in English") : "Language button placement preview"} aria-label={sample.contentBn ? (learnerLanguage === "en" ? "Switch to Bengali" : "Switch to English") : "Language button placement preview"} className={`${canCollapse ? "border-r border-amber-200" : ""} inline-flex h-7 w-16 shrink-0 items-center justify-center whitespace-nowrap bg-[var(--br-brand)] px-1.5 text-center text-xs font-bold text-on-dark transition hover:brightness-95`}>{learnerLanguage === "en" ? "বাংলা" : "English"}</button> : null}
    {canCollapse ? <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="inline-flex h-7 min-w-[4.75rem] shrink-0 items-center justify-center whitespace-nowrap bg-[var(--br-action-strong)] px-1.5 text-center text-xs font-bold text-on-dark transition hover:brightness-95">{expanded ? "Close" : "Open"}</button> : null}
  </div>;
}

export default function LearnBlockPairsPreviewPage() {
  return <main className="min-h-screen bg-[var(--br-surface-muted)] px-4 py-7 text-[var(--br-text)] sm:px-7">
    <style jsx global>{`.learn-block-pairs-dialogue .lesson-block-preview > div > h3 { box-sizing: border-box; display: flex; align-items: center; min-height: 2.25rem; padding-right: 11rem; } .learn-block-pairs-quote .lesson-block-preview > figure { padding-top: 3rem; }`}</style>
    <div className="mx-auto max-w-7xl">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-brand)]">Local review preview · 13 blocks</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Creator view ↔ Learner view</h1>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--br-text-muted)]">বামে Creator/Admin controls, ডানে learner view-এর মধ্যে button placement। Contrast pair-এর pair title edit করে ও background বদলে দেখো; Steps-এ English/বাংলা ও Open/Close আছে। Tongue twister-এ বাংলা control নেই। এটি local preview—sample fields read-only, শুধু contrast title edit করা যায়; কিছু save হয় না।</p>
      <nav aria-label="Jump to a block" className="sticky top-0 z-20 -mx-4 mt-5 flex gap-2 overflow-x-auto border-y border-[var(--br-border)] bg-[var(--br-surface-muted)]/95 px-4 py-2 backdrop-blur sm:-mx-7 sm:px-7">
        {samples.map((sample, index) => <a key={sample.type} href={`#block-${sample.type.toLowerCase()}`} className="shrink-0 rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--br-brand)] hover:border-[var(--br-brand)]">{index + 1}. {sample.label}</a>)}
      </nav>
      <div className="mt-5 space-y-5">
        {samples.map((sample, index) => <BlockPair key={sample.type} sample={sample} index={index} />)}
      </div>
    </div>
  </main>;
}

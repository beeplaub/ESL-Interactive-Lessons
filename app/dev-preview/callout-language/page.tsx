"use client";

import { useState } from "react";
import { CalloutLanguageFields } from "@/components/CalloutLanguageFields";
import { LessonBlockPreview, type PreviewLessonBlock } from "@/components/LessonBlockPreview";
import type { Json } from "@/types/database.types";
import type { CalloutBackgroundKey } from "@/lib/calloutBackgrounds";

const sampleContent = {
  title: "Remember the context",
  body: "A word can have different meanings in different situations. Read the full sentence before choosing its meaning.",
  title_bn: "প্রসঙ্গটি মনে রাখুন",
  body_bn: "একটি শব্দ ভিন্ন পরিস্থিতিতে ভিন্ন অর্থ প্রকাশ করতে পারে। শব্দের অর্থ বেছে নেওয়ার আগে পুরো বাক্যটি পড়ুন।",
};

export default function CalloutLanguagePreviewPage() {
  const [hideUntilRevealed, setHideUntilRevealed] = useState(true);
  const [background, setBackground] = useState<CalloutBackgroundKey>("ivory");
  const sampleBlock: PreviewLessonBlock = {
    id: "callout-language-demo",
    position: 1,
    block_type: "CALLOUT",
    content: { ...sampleContent, background_color: background, reveal_hidden: hideUntilRevealed } as unknown as Json,
  };

  return (
    <main className="min-h-screen bg-[var(--br-surface-muted)] px-4 py-8 text-[var(--br-text)] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-brand)]">Local prototype</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Bilingual Callout</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--br-text-muted)]">Creator-এর ভাষা switch আর learner-এর একই Callout card-এ বাংলা/English switch—দুটিই এখানে দেখা যাবে।</p>

        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Creator view</p>
              <h2 className="mt-1 text-lg font-extrabold">Edit both language versions</h2>
            </div>
            <div className="grid gap-5">
              <CalloutLanguageFields data={{ ...sampleContent, background_color: background }} onBackgroundChange={setBackground} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reveal_hidden" checked={hideUntilRevealed} onChange={(event) => setHideUntilRevealed(event.target.checked)} /> Hide text until the learner reveals it</label>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Learner view</p>
              <h2 className="mt-1 text-lg font-extrabold">Switch language instantly</h2>
            </div>
            <LessonBlockPreview key={hideUntilRevealed ? "hidden" : "visible"} blocks={[sampleBlock]} />
          </section>
        </div>
      </div>
    </main>
  );
}

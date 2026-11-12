"use client";

import { useState } from "react";
import { BilingualBlockFields } from "@/components/BilingualBlockFields";
import { CalloutLanguageFields } from "@/components/CalloutLanguageFields";
import { LessonBlockPreview, type PreviewLessonBlock } from "@/components/LessonBlockPreview";
import type { Json } from "@/types/database.types";

const initialHeading = {
  text: "Small steps build strong habits",
  text_bn: "ছোট ছোট পদক্ষেপ গড়ে তোলে ভালো অভ্যাস",
  level: "H2",
  text_color: "",
  block_background_color: "",
  text_align: "left",
};

const initialText = {
  title: "Try it in your own words",
  body: "Read the example once. Then say it aloud and make one sentence of your own.",
  title_bn: "নিজের ভাষায় বলার চেষ্টা করুন",
  body_bn: "উদাহরণটি একবার পড়ুন। তারপর জোরে বলুন এবং নিজের একটি বাক্য তৈরি করুন।",
  text_color: "",
  block_background_color: "",
  text_align: "left",
};

const previewCallout = {
  title: "Practice tip",
  title_bn: "অনুশীলনের পরামর্শ",
  body: "Pause after each sentence and repeat it in your own words.",
  body_bn: "প্রতিটি বাক্যের পর একটু থামুন এবং নিজের ভাষায় আবার বলুন।",
  reveal_hidden: true,
  background_color: "sky",
};

const previewRevealOnly = {
  title: "Key points",
  eyebrow: "Quick review",
  items: ["Read the example", "Say it aloud"],
  title_bn: "মূল বিষয়গুলো",
  eyebrow_bn: "দ্রুত পর্যালোচনা",
  items_bn: ["উদাহরণটি পড়ুন", "জোরে বলুন"],
  block_background_color: "",
  reveal_hidden: true,
};

const previewInstruction = {
  title: "Before you begin",
  body: "Read the dialogue, then choose the best response.",
  title_bn: "শুরু করার আগে",
  body_bn: "সংলাপটি পড়ুন, তারপর সেরা উত্তরটি বেছে নিন।",
  block_background_color: "",
};

export default function BilingualBlocksPreviewPage() {
  const [heading, setHeading] = useState(initialHeading);
  const [text, setText] = useState(initialText);
  const [bullets, setBullets] = useState(previewRevealOnly);
  const [instruction, setInstruction] = useState(previewInstruction);
  const [callout, setCallout] = useState(previewCallout);
  const blocks: PreviewLessonBlock[] = [
    { id: "heading-preview", position: 1, block_type: "HEADING", content: heading as unknown as Json },
    { id: "text-preview", position: 2, block_type: "TEXT", content: text as unknown as Json },
    { id: "bullet-preview", position: 3, block_type: "BULLETS", content: bullets as unknown as Json },
    { id: "instruction-preview", position: 4, block_type: "INSTRUCTION", content: instruction as unknown as Json },
    { id: "callout-preview", position: 5, block_type: "CALLOUT", content: callout as unknown as Json },
  ];

  return (
    <main className="min-h-screen bg-[var(--br-surface-muted)] px-4 py-8 text-[var(--br-text)] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-brand)]">Local prototype</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Bilingual block controls</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--br-text-muted)]">Creator side-এ English ও বাংলা আলাদা করে লিখুন। Learner preview-তে language button পরের ভাষা দেখায়; reveal করা যায় এমন block-এ Open/Close-ও একই button group-এ থাকে।</p>

        <div className="mt-7 grid items-start gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Creator controls</p>
              <h2 className="mt-1 text-lg font-extrabold">Edit the block examples</h2>
            </div>
            <div className="grid gap-6">
              <div className="rounded-xl border border-[var(--br-border)] p-4">
                <BilingualBlockFields
                  kind="heading"
                  data={heading}
                  onContentChange={(field, value) => setHeading((current) => ({ ...current, [field]: value }))}
                  onStyleChange={(style) => setHeading((current) => ({ ...current, ...style }))}
                />
              </div>
              <div className="rounded-xl border border-[var(--br-border)] p-4">
                <BilingualBlockFields
                  kind="text"
                  data={text}
                  onContentChange={(field, value) => setText((current) => ({ ...current, [field]: value }))}
                  onStyleChange={(style) => setText((current) => ({ ...current, ...style }))}
                />
              </div>
              <div className="rounded-xl border border-[var(--br-border)] p-4">
                <BilingualBlockFields kind="bullets" data={bullets} onContentChange={(field, value) => setBullets((current) => ({ ...current, [field]: field === "items" || field === "items_bn" ? value.split(/\r?\n/).filter(Boolean) : value }))} onStyleChange={(style) => setBullets((current) => ({ ...current, ...style }))} />
              </div>
              <div className="rounded-xl border border-[var(--br-border)] p-4">
                <BilingualBlockFields kind="instruction" data={instruction} onContentChange={(field, value) => setInstruction((current) => ({ ...current, [field]: value }))} onStyleChange={(style) => setInstruction((current) => ({ ...current, ...style }))} />
              </div>
              <div className="rounded-xl border border-[var(--br-border)] p-4">
                <CalloutLanguageFields data={callout} onBackgroundChange={(background_color) => setCallout((current) => ({ ...current, background_color }))} onContentChange={(field, value) => setCallout((current) => ({ ...current, [field]: value }))} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Learner preview</p>
              <h2 className="mt-1 text-lg font-extrabold">All five learner blocks</h2>
            </div>
            <LessonBlockPreview blocks={blocks} />
          </section>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { LessonBlockPreview, type PreviewLessonBlock } from "@/components/LessonBlockPreview";
import type { Json } from "@/types/database.types";

const samples: Array<{ label: string; type: string; content: Record<string, unknown>; reveal?: boolean }> = [
  { label: "Heading", type: "HEADING", content: { text: "Small steps build strong habits", text_bn: "ছোট ছোট পদক্ষেপ গড়ে তোলে ভালো অভ্যাস", level: "H2" } },
  { label: "Text", type: "TEXT", content: { title: "Try it in your own words", body: "Read the example once, then say it aloud.", title_bn: "নিজের ভাষায় বলার চেষ্টা করুন", body_bn: "উদাহরণটি পড়ুন, তারপর জোরে বলুন।" } },
  { label: "Bullet points", type: "BULLETS", content: { eyebrow: "Quick review", title: "Key points", items: ["Read the example", "Say it aloud"], eyebrow_bn: "দ্রুত পর্যালোচনা", title_bn: "মূল বিষয়গুলো", items_bn: ["উদাহরণটি পড়ুন", "জোরে বলুন"], reveal_hidden: true } },
  { label: "Instruction", type: "INSTRUCTION", content: { title: "Before you begin", body: "Read the dialogue, then choose the best response.", title_bn: "শুরু করার আগে", body_bn: "সংলাপটি পড়ুন, তারপর সেরা উত্তরটি বেছে নিন।" } },
  { label: "Review checklist", type: "REVIEW_CHECKLIST", content: { title: "I can now…", intro: "Check each statement you can do confidently.", items: ["I can use the target language.", "I can understand the key idea."] } },
  { label: "Quote", type: "QUOTE", content: { body: "A little progress each day adds up to big results.", attribution: "Daily reminder" } },
  { label: "Callout", type: "CALLOUT", content: { title: "Practice tip", title_bn: "অনুশীলনের পরামর্শ", body: "Pause after each sentence and repeat it.", body_bn: "প্রতিটি বাক্যের পর থামুন এবং আবার বলুন।", reveal_hidden: true, background_color: "sky" } },
  { label: "Sticky note", type: "STICKY_NOTE", content: { title: "Remember this", body: "Use ‘could’ for polite requests.", card_size: 100 } },
  { label: "Image + Text", type: "IMAGE_TEXT", content: { heading: "Describe the scene", body: "Look at the picture and say what is happening.", image_position: "left" } },
  { label: "Vocabulary list", type: "VOCABULARY", content: { entries: [{ word: "curious", pronunciation: "/ˈkjʊriəs/", meaning: "eager to learn", example: "She is curious about space.", notes: "adjective" }] } },
  { label: "Grammar", type: "GRAMMAR", reveal: true, content: { title: "Present perfect", explanation: "Use it to talk about life experiences.", examples: ["I have visited Dhaka.", "She has tried sushi."], notes: "The exact time is not important.", reveal_hidden: true } },
  { label: "Reading passage", type: "READING", content: { title: "A morning walk", passage: "Mina walks to school every morning. She enjoys seeing the city wake up.", glossary: [], questions: [] } },
  { label: "Dialogue", type: "DIALOGUE", content: { title: "Asking for help", turns: [{ speaker: "A", line: "Could you help me?" }, { speaker: "B", line: "Of course. What do you need?" }] } },
  { label: "Table", type: "TABLE", reveal: true, content: { caption: "Regular verbs", headers: ["Base form", "Past form"], rows: [["walk", "walked"], ["clean", "cleaned"]], reveal_hidden: true } },
  { label: "Common mistake", type: "COMMON_MISTAKE", content: { title: "Subject–verb agreement", mistake: "She go to work.", correction: "She goes to work.", explanation: "Use goes with she, he, or it." } },
  { label: "Contrast pair", type: "CONTRAST_PAIR", reveal: true, content: { title: "Say vs. Tell", pairs: [{ left_term: "say", left_meaning: "speak words", left_examples: ["She said hello."], right_term: "tell", right_meaning: "give information", right_examples: ["Tell me the answer."] }] } },
  { label: "Tongue twister", type: "TONGUE_TWISTER", content: { title: "Sea Shells", instruction: "Start slowly, then build up your speed.", items: [{ title: "Sea Shells", context: "Practise /s/ and /sh/.", text: "She sells sea shells by the sea shore.", target_sound: "/s/ and /ʃ/", highlights: [], chunks: [], pronunciation_note: "Keep the target sounds clear.", difficult_words: [], audio_path: "", hide_reveal_enabled: false }] } },
  { label: "Steps", type: "STEPS", content: { title: "Start a conversation", instruction: "Follow these steps.", steps: [{ title: "Greet", description: "Say hello in a friendly way." }, { title: "Ask", description: "Ask a simple question." }, { title: "Respond", description: "Listen and reply." }] } },
];

function ActionPlacement({ language, reveal, onLanguageChange }: { language: "en" | "bn"; reveal: boolean; onLanguageChange: () => void }) {
  return <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-amber-200 bg-white/80 shadow-sm" role="group" aria-label="Proposed learner button placement">
    <button type="button" onClick={onLanguageChange} className="inline-flex h-7 min-w-16 items-center justify-center border-r border-amber-200 bg-[var(--br-brand)] px-2 text-xs font-bold text-on-dark">{language === "en" ? "বাংলা" : "English"}</button>
    {reveal ? <button type="button" className="inline-flex h-7 min-w-[4.75rem] items-center justify-center bg-[var(--br-action-strong)] px-2 text-xs font-bold text-on-dark">{language === "en" ? "Open" : "খুলুন"}</button> : null}
  </div>;
}

function OriginalBlockCard({ sample, index }: { sample: (typeof samples)[number]; index: number }) {
  const [language, setLanguage] = useState<"en" | "bn">("en");
  const block: PreviewLessonBlock = { id: `original-${index}`, position: index + 1, block_type: sample.type, content: sample.content as unknown as Json };
  return <article className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-sm sm:p-5">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-extrabold text-[var(--br-brand)]">{sample.label}</h2>
      {!["HEADING", "TEXT", "BULLETS", "INSTRUCTION", "CALLOUT"].includes(sample.type) ? <ActionPlacement language={language} reveal={false} onLanguageChange={() => setLanguage((current) => current === "en" ? "bn" : "en")} /> : null}
    </div>
    <LessonBlockPreview blocks={[block]} />
  </article>;
}

export default function LearnOriginalPreviewPage() {
  return <main className="min-h-screen bg-[var(--br-surface-muted)] px-4 py-8 text-[var(--br-text)] sm:px-8">
    <div className="mx-auto max-w-6xl">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-brand)]">Local learner preview</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Original Learn block designs</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--br-text-muted)]">এখানে প্রতিটি block-এর আসল learner design রাখা হয়েছে। উপরের ডান পাশের button group শুধু placement-এর নমুনা; reveal block-এ ভাষা ও Open/Close পাশাপাশি দেখানো হয়েছে। এখনো এটি আসল block editor বা save flow-এর সঙ্গে যুক্ত নয়।</p>
      <div className="mt-6 grid items-start gap-4 xl:grid-cols-2">{samples.map((sample, index) => <OriginalBlockCard key={sample.type} sample={sample} index={index} />)}</div>
    </div>
  </main>;
}

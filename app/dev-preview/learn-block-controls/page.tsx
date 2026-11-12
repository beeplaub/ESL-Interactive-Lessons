"use client";

import { useState } from "react";
import { BlockLanguageStyleSection, BlockTextStyleControls, type BlockEditorLanguage } from "@/components/BilingualBlockFields";

type Example = { type: string; enLabel: string; bnLabel: string; en: string; bn: string; rows?: number };

const examples: Example[] = [
  { type: "Heading", enLabel: "Heading text", bnLabel: "শিরোনাম", en: "Small steps build strong habits", bn: "ছোট ছোট পদক্ষেপ গড়ে তোলে ভালো অভ্যাস", rows: 2 },
  { type: "Text", enLabel: "Body text", bnLabel: "মূল লেখা", en: "Read the example once, then say it in your own words.", bn: "উদাহরণটি একবার পড়ুন, তারপর নিজের ভাষায় বলুন।", rows: 3 },
  { type: "Bullet points", enLabel: "Points (one per line)", bnLabel: "বুলেট পয়েন্ট (প্রতি লাইনে একটি)", en: "Read the example\nSay it aloud", bn: "উদাহরণটি পড়ুন\nজোরে বলুন", rows: 3 },
  { type: "Instruction", enLabel: "Instruction", bnLabel: "নির্দেশনা", en: "Read the dialogue, then choose the best response.", bn: "সংলাপটি পড়ুন, তারপর সেরা উত্তরটি বেছে নিন।", rows: 3 },
  { type: "Review checklist", enLabel: "Checklist text", bnLabel: "পর্যালোচনার তালিকা", en: "I can use the new phrase.\nI can understand the main idea.", bn: "আমি নতুন বাক্যাংশটি ব্যবহার করতে পারি।\nআমি মূল ভাবটি বুঝতে পারি।", rows: 3 },
  { type: "Quote", enLabel: "Quote", bnLabel: "উক্তি", en: "A little progress each day adds up to big results.", bn: "প্রতিদিনের সামান্য অগ্রগতিই বড় ফল এনে দেয়।", rows: 3 },
  { type: "Callout", enLabel: "Callout text", bnLabel: "কলআউটের লেখা", en: "Pause after each sentence and repeat it.", bn: "প্রতিটি বাক্যের পর একটু থামুন এবং আবার বলুন।", rows: 3 },
  { type: "Sticky note", enLabel: "Note text", bnLabel: "নোটের লেখা", en: "Remember: use could for polite requests.", bn: "মনে রাখুন: ভদ্রভাবে অনুরোধ করতে could ব্যবহার করুন।", rows: 3 },
  { type: "Image + Text", enLabel: "Text beside image", bnLabel: "ছবির পাশের লেখা", en: "Look at the picture and describe what is happening.", bn: "ছবিটি দেখে কী ঘটছে তা বর্ণনা করুন।", rows: 3 },
  { type: "Vocabulary list", enLabel: "Word · meaning · example", bnLabel: "শব্দ · অর্থ · উদাহরণ", en: "curious · eager to learn · She is curious about space.", bn: "কৌতূহলী · জানতে আগ্রহী · সে মহাকাশ সম্পর্কে কৌতূহলী।", rows: 3 },
  { type: "Grammar", enLabel: "Explanation and examples", bnLabel: "ব্যাখ্যা ও উদাহরণ", en: "Use the present perfect for experiences.\nI have visited Dhaka.", bn: "অভিজ্ঞতা বোঝাতে present perfect ব্যবহার করুন।\nআমি ঢাকা ঘুরে এসেছি।", rows: 3 },
  { type: "Reading passage", enLabel: "Passage", bnLabel: "অনুচ্ছেদ", en: "Mina walks to school every morning. She enjoys seeing the city wake up.", bn: "মিনা প্রতিদিন সকালে হেঁটে স্কুলে যায়। শহরকে জেগে উঠতে দেখতে তার ভালো লাগে।", rows: 3 },
  { type: "Dialogue", enLabel: "Dialogue lines", bnLabel: "সংলাপ", en: "A: Could you help me?\nB: Of course. What do you need?", bn: "ক: আপনি কি আমাকে সাহায্য করবেন?\nখ: অবশ্যই। আপনার কী দরকার?", rows: 3 },
  { type: "Table", enLabel: "Table text", bnLabel: "টেবিলের লেখা", en: "Base form | Past form\ngo | went\nsee | saw", bn: "বর্তমান রূপ | অতীত রূপ\ngo | went\nsee | saw", rows: 4 },
  { type: "Common mistake", enLabel: "Correction and explanation", bnLabel: "সংশোধন ও ব্যাখ্যা", en: "Incorrect: She go to work.\nCorrect: She goes to work.", bn: "ভুল: She go to work.\nসঠিক: She goes to work।", rows: 3 },
  { type: "Contrast pair", enLabel: "Terms and examples", bnLabel: "শব্দের পার্থক্য ও উদাহরণ", en: "Say: speak a language.\nTell: give someone information.", bn: "Say: কোনো ভাষায় কথা বলা।\nTell: কাউকে কোনো তথ্য বলা।", rows: 3 },
  { type: "Tongue twister", enLabel: "Practice text", bnLabel: "উচ্চারণের অনুশীলন", en: "She sells sea shells by the sea shore.", bn: "She sells sea shells by the sea shore.", rows: 2 },
  { type: "Steps", enLabel: "Steps and descriptions", bnLabel: "ধাপ ও বর্ণনা", en: "1. Greet the person.\n2. Ask a friendly question.\n3. Listen and respond.", bn: "১. মানুষটিকে অভিবাদন জানান।\n২. বন্ধুত্বপূর্ণ একটি প্রশ্ন করুন।\n৩. শুনে উত্তর দিন।", rows: 4 },
];

function LearnBlockExample({ example }: { example: Example }) {
  const [language, setLanguage] = useState<BlockEditorLanguage>("en");
  const [english, setEnglish] = useState(example.en);
  const [bengali, setBengali] = useState(example.bn);
  const [background, setBackground] = useState("");
  const shownText = language === "bn" ? bengali : english;
  return (
    <article className="grid gap-3 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface)] p-4 shadow-sm">
      <h3 className="text-sm font-extrabold text-[var(--br-brand)]">{example.type}</h3>
      <BlockLanguageStyleSection
        label="Language and background"
        language={language}
        onLanguageChange={setLanguage}
        languageLabel={`Editing language for ${example.type}`}
        backgroundControl={<BlockTextStyleControls data={{ block_background_color: background }} onStyleChange={(style) => setBackground(style.block_background_color)} />}
      >
        <label className="grid gap-1 text-xs font-semibold text-[var(--br-text-muted)]" lang={language}>
          {language === "bn" ? example.bnLabel : example.enLabel}
          <textarea rows={example.rows ?? 3} value={language === "bn" ? bengali : english} onChange={(event) => language === "bn" ? setBengali(event.target.value) : setEnglish(event.target.value)} className="w-full rounded-lg border border-[var(--br-border)] bg-[var(--br-surface)] px-3 py-2 text-sm font-normal leading-6 text-[var(--br-text)] outline-none focus:border-[var(--br-brand)] focus:ring-2 focus:ring-[var(--br-brand)]/15" />
        </label>
      </BlockLanguageStyleSection>
      <div className="flex items-start gap-3 rounded-xl border border-[var(--br-action)]/20 p-4 shadow-sm" style={{ backgroundColor: background || "var(--br-surface)" }} lang={language}>
        <p className="min-w-0 flex-1 whitespace-pre-line text-sm leading-6 text-[var(--br-text)]">{shownText}</p>
        {english.trim() && bengali.trim() ? <button type="button" onClick={() => setLanguage((current) => current === "en" ? "bn" : "en")} className="shrink-0 rounded-lg bg-[var(--br-brand)] px-3 py-1.5 text-xs font-bold text-on-dark">{language === "en" ? "বাংলা" : "English"}</button> : null}
      </div>
    </article>
  );
}

export default function LearnBlockControlsPreviewPage() {
  return (
    <main className="min-h-screen bg-[var(--br-surface-muted)] px-4 py-8 text-[var(--br-text)] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-brand)]">Local prototype</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Learn block language and background controls</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--br-text-muted)]">প্রতিটি Learn block-এ একই English/বাংলা edit control ও background picker কেমন দেখাবে, এখানে একে একে দেখা যাবে। Creator preview-তে ভাষা বদলে লেখা সম্পাদনা করুন; নিচের learner card-এ ফল সঙ্গে সঙ্গে দেখুন।</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">{examples.map((example) => <LearnBlockExample key={example.type} example={example} />)}</div>
      </div>
    </main>
  );
}

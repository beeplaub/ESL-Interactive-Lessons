import type { Json, SlideType } from "@/types/database.types";

export type SlideInput = {
  id: string;
  slide_number: number;
  title: string;
  section_label: string | null;
  raw_text: string;
  type: SlideType;
};

export type ExtractedActivity = {
  activity_type: SlideType | "ERROR_CORRECTION";
  prompt: string;
  items: Json;
  answer_key: Json | null;
};

const optionLetters = ["A", "B", "C", "D", "E", "F"];

function lines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function promptFromSlide(slide: SlideInput, fallback: string) {
  const firstInstruction = lines(slide.raw_text).find((line) =>
    /match|complete|choose|answer|discuss|write|listen|correct|talk|play|predict/i.test(line)
  );
  return firstInstruction ?? slide.title ?? fallback;
}

export function parseAnswerKey(text: string): Record<string, string> {
  const key: Record<string, string> = {};
  const compact = text.replace(/\s+/g, " ");
  const pairMatches = compact.matchAll(/(?:^|\s)(\d{1,2})[\).:\s-]+([A-F]|TRUE|FALSE|T|F|[a-zA-Z][\w'-]*)/gi);

  for (const match of pairMatches) {
    key[match[1]] = match[2].toUpperCase() === "T" ? "TRUE" : match[2].toUpperCase() === "F" ? "FALSE" : match[2];
  }

  return key;
}

function extractMatching(slide: SlideInput): ExtractedActivity {
  const slideLines = lines(slide.raw_text);
  const left = slideLines
    .map((line) => line.match(/^(\d{1,2})[\).]\s*(.+)$/))
    .filter(Boolean)
    .map((match) => ({ id: Number(match![1]), text: match![2].trim() }))
    .filter((item) => item.text.length > 1);

  const right = slideLines
    .map((line) => line.match(/^([A-F])[\).]\s*(.+)$/i))
    .filter(Boolean)
    .map((match) => ({ id: match![1].toUpperCase(), text: match![2].trim() }));

  return {
    activity_type: "MATCHING",
    prompt: promptFromSlide(slide, "Match the word to the definition."),
    items: { left, right },
    answer_key: null
  };
}

function extractGapFill(slide: SlideInput): ExtractedActivity {
  const items = lines(slide.raw_text)
    .map((line) => {
      const cleaned = line.replace(/^(\d{1,2})[\).]\s*/, "");
      const optionMatch = cleaned.match(/(.+?)\s+([a-zA-Z][\w'-]*(?:\s*\/\s*[a-zA-Z][\w'-]*){1,5})$/);
      if (!optionMatch) return null;
      const options = optionMatch[2].split("/").map((option) => option.trim());
      const sentence = optionMatch[1].replace(/_{2,}|\.{3,}|\b___\b/g, "____").trim();
      return {
        sentence: sentence.includes("____") ? sentence : sentence.replace(/\s([.!?])?$/, " ____$1"),
        options
      };
    })
    .filter(Boolean);

  return {
    activity_type: "GAP_FILL",
    prompt: promptFromSlide(slide, "Complete the sentences."),
    items: { items },
    answer_key: null
  };
}

function extractMcq(slide: SlideInput): ExtractedActivity {
  const slideLines = lines(slide.raw_text);
  const questions: Array<{ id: number; text: string; options: string[] }> = [];
  let current: { id: number; text: string; options: string[] } | null = null;

  for (const line of slideLines) {
    const questionMatch = line.match(/^(\d{1,2})[\).]\s*(.+\?)$/);
    const letterMatch = line.match(/^([a-f])[\).]\s*(.+)$/i);

    if (questionMatch) {
      current = { id: Number(questionMatch[1]), text: questionMatch[2], options: [] };
      questions.push(current);
    } else if (letterMatch && current) {
      current.options.push(letterMatch[2].trim());
    } else if (current && optionLetters.some((letter) => new RegExp(`\\b${letter.toLowerCase()}[\\).]\\s+`, "i").test(line))) {
      const inlineOptions = [...line.matchAll(/\b[a-f][\).]\s*([^a-f]+?)(?=\s+[a-f][\).]|$)/gi)].map((match) => match[1].trim());
      current.options.push(...inlineOptions);
    }
  }

  return {
    activity_type: "MCQ",
    prompt: promptFromSlide(slide, "Choose the best answer."),
    items: { questions },
    answer_key: null
  };
}

function extractTrueFalse(slide: SlideInput): ExtractedActivity {
  const questions = lines(slide.raw_text)
    .map((line) => line.match(/^(\d{1,2})[\).]\s*(.+?)(?:\s+TRUE\s*\/\s*FALSE|\s+T\s*\/\s*F)?$/i))
    .filter(Boolean)
    .map((match) => ({ id: Number(match![1]), text: match![2].trim(), options: ["TRUE", "FALSE"] }));

  return {
    activity_type: "TRUE_FALSE",
    prompt: promptFromSlide(slide, "Mark each sentence true or false."),
    items: { questions },
    answer_key: null
  };
}

function extractOpen(slide: SlideInput): ExtractedActivity {
  const questions = lines(slide.raw_text)
    .filter((line) => /\?|^\d{1,2}[\).]/.test(line))
    .slice(0, 8);

  const checklist = lines(slide.raw_text).filter((line) => /words|idioms|tone|reported speech|include|use/i.test(line)).slice(0, 6);

  return {
    activity_type: slide.type,
    prompt: promptFromSlide(slide, slide.title),
    items: { questions, checklist },
    answer_key: null
  };
}

export function extractActivity(slide: SlideInput): ExtractedActivity | null {
  if (slide.type === "INFO" || slide.type === "ANSWERS") return null;
  if (slide.type === "MATCHING") return extractMatching(slide);
  if (slide.type === "GAP_FILL") return extractGapFill(slide);
  if (slide.type === "MCQ") return extractMcq(slide);
  if (slide.type === "TRUE_FALSE") return extractTrueFalse(slide);
  return extractOpen(slide);
}

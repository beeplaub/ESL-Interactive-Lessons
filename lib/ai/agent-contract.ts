import { z } from "zod";
import { ALL_ACTIVITIES_REFERENCE, ALL_CONTENT_BLOCK_REFERENCE } from "@/lib/allActivitiesReference";
import { LESSON_ACTIVITY_CATALOG } from "@/lib/lessonActivityCatalog";
import { CONTENT_LEVELS } from "@/lib/levels";

export type Data = Record<string, any>;
export type AgentBlock = { id: string; block_type: string; content: Data };
export type AgentActivity = { id: string; activity_type: string; activity_data: Data; needs_review: boolean };
export type AgentSlide = { id: string; title: string; section_label: string; raw_text: string; type: string; content_order: string; require_practice_before_learn: boolean; blocks: AgentBlock[]; activities: AgentActivity[] };
export type LessonDocument = { lesson: { id: string; title: string; topic: string; level: string; description: string; subtitle: string; category: string }; slides: AgentSlide[] };

const extraBlocks = [
  { blockType: "INSTRUCTION", content: { title: "Instructions", body: "Read and discuss." } },
  { blockType: "REVIEW_CHECKLIST", content: { title: "Review", intro: "Check your learning.", items: ["I can introduce myself."], require_completion: false } },
  { blockType: "IMAGE_PAIR", content: { left_path: "", right_path: "", left_alt: "Before", right_alt: "After" } },
  { blockType: "TONGUE_TWISTER", content: { title: "Pronunciation", items: [{ text: "Red lorry, yellow lorry.", audio_path: "" }] } },
];
export const BLOCK_REFERENCES = [...ALL_CONTENT_BLOCK_REFERENCE, ...extraBlocks];
export const ACTIVITY_REFERENCES = ALL_ACTIVITIES_REFERENCE;
const object = z.record(z.unknown());
const short = z.string().max(1000);
export const operationSchema = z.object({
  op: z.enum(["add", "edit", "delete", "move", "copy", "clear"]),
  entity: z.enum(["lesson", "slide", "block", "activity"]),
  slide: z.number().int().positive().optional(),
  index: z.number().int().positive().optional(),
  toSlide: z.number().int().positive().optional(),
  position: z.number().int().positive().optional(),
  type: short.optional(),
  fields: object.optional(),
  content: object.optional(),
}).strict();
export type Operation = z.infer<typeof operationSchema>;

export const decisionSchema = z.object({
  action: z.enum(["create_lesson", "search_lessons", "open_lesson", "edit_lesson", "schema", "finish"]),
  message: z.string().max(6000),
  arguments: object.default({}),
  continue: z.boolean().default(false),
}).strict();

export const DECISION_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["action", "message", "arguments", "continue"],
  properties: {
    action: { type: "string", enum: ["create_lesson", "search_lessons", "open_lesson", "edit_lesson", "schema", "finish"] },
    message: { type: "string" }, arguments: { type: "object" }, continue: { type: "boolean" },
  },
};

export function decisionFormat(createdThisTurn: boolean) {
  if (!createdThisTurn) return DECISION_JSON_SCHEMA;
  return { ...DECISION_JSON_SCHEMA, properties: { ...DECISION_JSON_SCHEMA.properties, action: { type: "string", enum: ["edit_lesson", "schema", "open_lesson", "finish"] } } };
}

export function schemaReference(types: string[] = []) {
  return {
    levels: CONTENT_LEVELS,
    blocks: BLOCK_REFERENCES.filter(x => !types.length || types.includes(x.blockType)),
    activities: ACTIVITY_REFERENCES.filter(x => !types.length || types.includes(x.type)),
    activityTypes: LESSON_ACTIVITY_CATALOG.map(x => x.type),
  };
}

// Validate the renderer's actual nested shapes. Extra presentation fields are
// preserved; permission/state fields are never mapped into database columns.
function checkShape(value: unknown, sample: unknown, path: string): void {
  if (sample === null || sample === undefined) return;
  if (Array.isArray(sample)) {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
    if (value.length > 200) throw new Error(`${path} has too many items.`);
    if (sample.length) for (const item of value) checkShape(item, sample[0], `${path}[]`);
  } else if (typeof sample === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object.`);
    for (const [key, expected] of Object.entries(sample)) {
      // Examples are references, not a requirement to include all optional fields.
      if (key in (value as Data)) checkShape((value as Data)[key], expected, `${path}.${key}`);
    }
  } else if (typeof value !== typeof sample && !(typeof sample === "number" && typeof value === "string" && path.endsWith(".id"))) {
    throw new Error(`${path} must be ${typeof sample}.`);
  }
}

function safeData(value: unknown, depth = 0): void {
  if (depth > 16) throw new Error("Content is nested too deeply.");
  if (typeof value === "string" && (/^(javascript|data:text\/html):/i.test(value.trim()) || /<script[\s>]/i.test(value))) throw new Error("Executable content is not allowed.");
  if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Unsafe content key.");
    safeData(child, depth + 1);
  }
}

export function validateContent(kind: "block" | "activity", type: string, data: Data): string[] {
  safeData(data);
  if (JSON.stringify(data).length > 100_000) throw new Error("One content element is too large.");
  const ref = kind === "block" ? BLOCK_REFERENCES.find(x => x.blockType === type)?.content : ACTIVITY_REFERENCES.find(x => x.type === type)?.data;
  if (!ref) throw new Error(`Unsupported ${kind} type ${type}. Request its schema before editing.`);
  checkShape(data, ref, type);
  const required: Record<string, string[]> = {
    TEXT: ["body"], HEADING: ["text"], INSTRUCTION: ["body"], BULLETS: ["items"], REVIEW_CHECKLIST: ["items"],
    QUOTE: ["body"], CALLOUT: ["body"], VOCABULARY: ["entries"], GRAMMAR: ["explanation", "examples"], READING: ["passage"],
    DIALOGUE: ["turns"], FLASHCARD: ["front", "back"], TABLE: ["headers", "rows"], COMMON_MISTAKE: ["mistake", "correction"], STEPS: ["steps"],
  };
  for (const key of kind === "block" ? required[type] ?? [] : ["prompt"]) {
    if (data[key] === undefined || data[key] === null || data[key] === "" || (Array.isArray(data[key]) && !data[key].length)) throw new Error(`${type}.${key} is required.`);
  }
  const warnings: string[] = [];
  if (kind === "activity") {
    const collections: Record<string, string[]> = { MCQ: ["questions"], TRUE_FALSE: ["items"], GAP_FILL: ["items"], MATCHING: ["questions"], MULTIPLE_SELECT: ["questions"], REORDERING: ["questions"], ERROR_CORRECTION: ["items"], TABLE_COMPLETION: ["columns", "rows"], ORAL_RESPONSE: ["questions"], HEADINGS_MATCHING: ["paragraphs", "headings"], PRONUNCIATION: ["targets"] };
    for (const key of collections[type] ?? []) if (!data[key] || (Array.isArray(data[key]) && !data[key].length)) throw new Error(`${type}.${key} is required.`);
    for (const q of data.questions ?? []) {
      if (!q || typeof q !== "object") throw new Error("Each question must be an object.");
      if (q.options && !Array.isArray(q.options) && q.answer !== undefined && !(String(q.answer) in q.options)) throw new Error("Question answer must identify an existing option.");
      if (q.answers && (!Array.isArray(q.answers) || q.answers.some((answer: unknown) => !q.options || !(String(answer) in q.options)))) throw new Error("Answers must identify existing options.");
      if (q.correct_order) {
        const ids = (q.items ?? []).map((x: Data) => String(x.id));
        if (!Array.isArray(q.correct_order) || q.correct_order.length !== ids.length || new Set(q.correct_order.map(String)).size !== ids.length || q.correct_order.some((x: unknown) => !ids.includes(String(x)))) throw new Error("Reordering answers must include each item exactly once.");
      }
      if (q.question_type === "MATCHING") {
        const a = q.options?.a_items, b = q.options?.b_items;
        if (!Array.isArray(a) || !Array.isArray(b) || !Array.isArray(q.correct_answer)) throw new Error("Matching needs a_items, b_items and correct_answer pairs.");
        for (const pair of q.correct_answer) if (!Number.isInteger(pair.a) || pair.a < 1 || pair.a > a.length || typeof pair.b !== "string" || pair.b.length !== 1 || pair.b.charCodeAt(0) - 65 < 0 || pair.b.charCodeAt(0) - 65 >= b.length) throw new Error("Matching answer points outside its choices.");
      }
    }
    if (type === "TRUE_FALSE" && data.items.some((x: Data) => typeof x.answer !== "boolean")) throw new Error("True/false answers must be booleans.");
    if (type === "MCQ" && data.questions.some((x: Data) => !x.text || !x.options || x.answer === undefined)) throw new Error("Every MCQ needs text, options, and an answer.");
    if (LESSON_ACTIVITY_CATALOG.find(x => x.type === type)?.aiEnhanced) warnings.push(`${type} requires a separate learner AI service. Authoring does not enable or pay for it.`);
    warnings.push("Review generated answers and CEFR suitability before publishing.");
  }
  for (const [key, value] of Object.entries(data)) if (/^(path|image_path|audio_url|media_url|url)$/.test(key) && value === "") warnings.push(`${type}: attach the missing media before publishing.`);
  return warnings;
}

export function newLesson(input: unknown): LessonDocument {
  const fields = z.object({ title: z.string().min(2).max(250), topic: z.string().min(2).max(250), level: z.enum(CONTENT_LEVELS), description: z.string().max(12000).default(""), subtitle: short.default(""), category: short.default("") }).strict().parse(input);
  return { lesson: { id: crypto.randomUUID(), ...fields }, slides: [] };
}

export function applyOperations(original: LessonDocument, input: unknown): { document: LessonDocument; warnings: string[]; needsConfirmation: boolean; summary: string[] } {
  const ops = z.array(operationSchema).min(1).max(100).parse(input);
  const document = structuredClone(original);
  const warnings: string[] = [], summary: string[] = [];
  let needsConfirmation = false;
  function slideAt(n?: number) { const s = document.slides[(n ?? 0) - 1]; if (!s) throw new Error(`Slide ${n} does not exist. Read the lesson again.`); return s; }
  const titleFields = z.object({ title: z.string().min(1).max(250).optional(), section_label: short.optional(), raw_text: z.string().max(20000).optional(), content_order: z.enum(["LEARN_FIRST", "PRACTICE_FIRST"]).optional(), require_practice_before_learn: z.boolean().optional() }).strict();
  for (const op of ops) {
    summary.push(`${op.op} ${op.entity}${op.slide ? ` on slide ${op.slide}` : ""}${op.index ? ` #${op.index}` : ""}`);
    if (op.entity === "lesson") {
      if (op.op !== "edit") throw new Error("Lesson supports edit only; use create_lesson for a new lesson.");
      const { id: existingId, ...existingFields } = document.lesson;
      const merged = newLesson({ ...existingFields, ...op.fields });
      document.lesson = { ...merged.lesson, id: existingId };
      continue;
    }
    if (op.entity === "slide") {
      if (op.op === "add") {
        const fields = titleFields.parse(op.fields ?? {});
        const slide: AgentSlide = { id: crypto.randomUUID(), title: "New slide", section_label: "", raw_text: "", type: "INFO", content_order: "LEARN_FIRST", require_practice_before_learn: false, blocks: [], activities: [], ...fields };
        const position = op.position ?? document.slides.length + 1;
        if (position > document.slides.length + 1) throw new Error("Slide position is outside the lesson.");
        document.slides.splice(position - 1, 0, slide);
      } else {
        const slide = slideAt(op.slide);
        if (op.op === "edit") Object.assign(slide, titleFields.parse(op.fields ?? {}));
        else if (op.op === "clear") { slide.blocks = []; slide.activities = []; slide.raw_text = ""; needsConfirmation = true; }
        else if (op.op === "delete") { document.slides.splice(op.slide! - 1, 1); needsConfirmation = true; }
        else {
          const copied = structuredClone(slide);
          if (op.op === "copy") { copied.id = crypto.randomUUID(); copied.blocks.forEach(x => x.id = crypto.randomUUID()); copied.activities.forEach(x => x.id = crypto.randomUUID()); }
          else document.slides.splice(op.slide! - 1, 1);
          const position = op.position ?? document.slides.length + 1;
          if (position > document.slides.length + 1) throw new Error("Slide position is outside the lesson.");
          document.slides.splice(position - 1, 0, copied);
        }
      }
      continue;
    }
    const slide = slideAt(op.slide);
    const list: Array<AgentBlock | AgentActivity> = op.entity === "block" ? slide.blocks : slide.activities;
    if (op.op === "clear") { list.splice(0); needsConfirmation = true; continue; }
    if (op.op === "add") {
      if (!op.type || !op.content) throw new Error("Adding an element requires type and content.");
      warnings.push(...validateContent(op.entity, op.type, op.content));
      const item = op.entity === "block" ? { id: crypto.randomUUID(), block_type: op.type, content: op.content } : { id: crypto.randomUUID(), activity_type: op.type, activity_data: op.content, needs_review: true };
      const position = op.position ?? list.length + 1;
      if (position > list.length + 1) throw new Error("Element position is outside the slide.");
      list.splice(position - 1, 0, item);
    } else {
      const item = list[(op.index ?? 0) - 1];
      if (!item) throw new Error(`${op.entity} ${op.index} does not exist on slide ${op.slide}.`);
      if (op.op === "delete") { list.splice(op.index! - 1, 1); needsConfirmation = true; }
      else if (op.op === "edit") {
        const oldType = "block_type" in item ? item.block_type : item.activity_type;
        const type = op.type ?? oldType;
        const previous = "content" in item ? item.content : item.activity_data;
        const content = { ...(type === oldType ? previous : {}), ...op.content };
        warnings.push(...validateContent(op.entity, type, content));
        if ("block_type" in item) { item.block_type = type; item.content = content; }
        else { item.activity_type = type; item.activity_data = content; item.needs_review = true; }
      } else {
        const target = slideAt(op.toSlide ?? op.slide);
        const targetList: Array<AgentBlock | AgentActivity> = op.entity === "block" ? target.blocks : target.activities;
        const copied = structuredClone(item);
        if (op.op === "copy") copied.id = crypto.randomUUID(); else list.splice(op.index! - 1, 1);
        const position = op.position ?? targetList.length + 1;
        if (position > targetList.length + 1) throw new Error("Element position is outside the destination slide.");
        targetList.splice(position - 1, 0, copied);
      }
    }
  }
  if (document.slides.length > 100 || document.slides.some(s => s.blocks.length + s.activities.length > 100)) throw new Error("Split this task into smaller lessons (100 slides/elements maximum).");
  if (JSON.stringify(document).length > 1_000_000) throw new Error("Lesson draft exceeds the size limit.");
  return { document, warnings: [...new Set(warnings)], needsConfirmation, summary };
}

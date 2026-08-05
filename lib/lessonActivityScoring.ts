import type { Json } from "@/types/database.types";
import { asRecord, type ScoredQuestion } from "@/lib/quizScoring";

export type LessonScoredQuestion = ScoredQuestion & { id: string; question_number: number };

function text(value: unknown) {
  return String(value ?? "");
}

function questionId(row: Record<string, unknown>, index: number) {
  return text(row.id || row.question_id || row.question_number || index + 1);
}

function common(row: Record<string, unknown>, index: number, type: LessonScoredQuestion["question_type"], correctAnswer: unknown, options: Json | null = null): LessonScoredQuestion {
  return {
    id: questionId(row, index),
    question_number: Number(row.question_number ?? index + 1),
    question_type: type,
    options,
    correct_answer: (correctAnswer ?? null) as Json,
    max_points: row.max_points == null ? null : Number(row.max_points),
  };
}

function rows(data: Record<string, unknown>, key: "questions" | "items") {
  const value = data[key];
  return Array.isArray(value) ? value.map((item) => asRecord(item as Json)) : [];
}

function writingRows(data: Record<string, unknown>, type: LessonScoredQuestion["question_type"], defaultInstruction: string, build: (row: Record<string, unknown>) => { options: Record<string, unknown>; answer: unknown }) {
  const sourceRows = rows(data, "questions");
  const list = sourceRows.length ? sourceRows : [data];
  return list.map((row, index) => {
    const fields = build(row);
    const instruction = text(row.instruction || data.instruction || defaultInstruction);
    const prompt = row.prompt ?? (list.length === 1 ? data.prompt : null);
    return common(row, index, type, fields.answer, {
      ...fields.options,
      prompt_body: prompt == null ? undefined : text(prompt),
      allow_self_graded: (row.allow_self_graded ?? data.allow_self_graded) !== false,
      allow_ai_feedback: (row.allow_ai_feedback ?? data.allow_ai_feedback) !== false,
      allow_teacher_review: (row.allow_teacher_review ?? data.allow_teacher_review) !== false,
      instruction,
    } as Json);
  });
}

export function lessonScoredQuestions(activityType: string, value: Json | null): LessonScoredQuestion[] {
  const data = asRecord(value);

  if (activityType === "MCQ" || activityType === "INFERENCE_DETECTION" || activityType === "MULTIPLE_SELECT") {
    return rows(data, "questions").map((row, index) => {
      const raw = row.answers ?? row.correct_answer ?? row.answer ?? [];
      const answer = activityType === "MULTIPLE_SELECT"
        ? (Array.isArray(raw) ? raw.map((item) => text(item).toUpperCase()).sort() : [text(raw).toUpperCase()])
        : text(raw).toUpperCase();
      const options = activityType === "INFERENCE_DETECTION"
        ? { ...asRecord(row.options as Json), passage: text(data.passage) }
        : asRecord(row.options as Json);
      return common(row, index, activityType, answer, options as Json);
    });
  }

  if (activityType === "SHORT_ANSWER") {
    return rows(data, "questions").map((row, index) => common(row, index, "SHORT_ANSWER", null, {
      min_words: Number(row.min_words ?? 0),
      required_words: Array.isArray(row.required_words) ? row.required_words.map(text) : [],
      show_required_words: row.show_required_words !== false,
      sample_answer: text(row.sample_answer),
      allow_self_graded: (row.allow_self_graded ?? data.allow_self_graded) !== false,
      allow_ai_feedback: (row.allow_ai_feedback ?? data.allow_ai_feedback) !== false,
      allow_teacher_review: (row.allow_teacher_review ?? data.allow_teacher_review) !== false,
    } as Json));
  }

  if (activityType === "GAP_FILL" || activityType === "LISTEN_AND_GAP_FILL") {
    const sourceRows = rows(data, "items").length ? rows(data, "items") : rows(data, "questions");
    return sourceRows.map((row, index) => {
      const rawAnswer = row.correct_answer ?? row.answer ?? "";
      const answer = Array.isArray(rawAnswer) ? rawAnswer.map(text) : [text(rawAnswer)];
      const sentence = text(row.question_text || row.sentence || row.text);
      return common(row, index, activityType === "GAP_FILL" ? "FILL" : "LISTEN_AND_GAP_FILL", answer, {
        text: sentence,
        level: row.level === "paragraph" ? "paragraph" : "sentence",
        blank_count: Math.max(1, (sentence.match(/___/g) ?? []).length, answer.length),
        audio_url: data.audio_url ?? data.media_url ?? null,
      } as Json);
    });
  }

  if (activityType === "TRUE_FALSE") {
    const sourceRows = rows(data, "items").length ? rows(data, "items") : rows(data, "questions");
    return sourceRows.map((row, index) => common(row, index, "TRUE_FALSE", Boolean(row.correct_answer ?? row.answer), null));
  }

  if (activityType === "MATCHING") {
    const sourceRows = rows(data, "questions");
    if (sourceRows.length) return sourceRows.map((row, index) => common(row, index, "MATCHING", row.correct_answer ?? row.answer ?? {}, row.options as Json ?? null));
    return [common(data, 0, "MATCHING", data.correct_answer ?? data.pairs ?? {}, {
      a_items: data.a_items ?? data.left ?? [],
      b_items: data.b_items ?? data.right ?? [],
    } as unknown as Json)];
  }

  if (activityType === "ERROR_CORRECTION") {
    return rows(data, "items").map((row, index) => common(row, index, "ERROR_CORRECTION", {
      error_span: text(row.error_span || row.incorrect),
      correction: text(row.correction || row.correct),
    }, { mode: row.mode === "spot_and_fix" ? "spot_and_fix" : "rewrite" } as Json));
  }

  if (activityType === "REORDERING") {
    const blocks = rows(data, "questions").length ? rows(data, "questions") : [data];
    return blocks.map((row, index) => {
      const items = Array.isArray(row.items) ? row.items : [];
      const normalizedItems = items.map((item, itemIndex) => typeof item === "string"
        ? { id: String(itemIndex + 1), text: item }
        : { id: text(asRecord(item as Json).id || itemIndex + 1), text: text(asRecord(item as Json).text) });
      const order = Array.isArray(row.correct_order) ? row.correct_order.map((item) => {
        const match = normalizedItems.find((entry) => entry.id === text(item) || entry.text === item);
        return match?.id ?? text(item);
      }) : normalizedItems.map((item) => item.id);
      return common(row, index, "REORDERING", order, { items: normalizedItems, level: row.level ?? data.level ?? "sentence" } as unknown as Json);
    });
  }

  if (activityType === "DRAG_DROP" || activityType === "CATEGORIZATION") {
    const sourceItems = Array.isArray(data.items) ? data.items : [];
    const items = sourceItems.map((item, index) => {
      const row = asRecord(item as Json);
      return { id: text(row.id || index + 1), text: text(row.text), target: text(row.target) };
    });
    if (!items.length && Array.isArray(data.categories)) {
      for (const [categoryIndex, categoryValue] of data.categories.entries()) {
        const category = asRecord(categoryValue as Json);
        for (const [itemIndex, item] of (Array.isArray(category.items) ? category.items : []).entries()) {
          items.push({ id: `${categoryIndex + 1}-${itemIndex + 1}`, text: text(item), target: text(category.name) });
        }
      }
    }
    const correct: Record<string, string> = {};
    items.forEach((item) => { correct[item.id] = item.target; });
    return [common(data, 0, activityType, correct, {
      items: items.map(({ id, text: itemText }) => ({ id, text: itemText })),
      targets: Array.isArray(data.targets) ? data.targets.map(text) : Array.from(new Set(items.map((item) => item.target).filter(Boolean))),
    } as Json)];
  }

  if (activityType === "PRONUNCIATION") {
    const targets = Array.isArray(data.targets) ? data.targets.map((item, index) => {
      const row = asRecord(item as Json);
      return { id: text(row.id || index + 1), text: text(row.text) };
    }) : [];
    return [common(data, 0, "PRONUNCIATION", targets.map((target) => target.id), { targets, level: data.level ?? "word" } as unknown as Json)];
  }

  if (activityType === "DICTATION") return [common(data, 0, "DICTATION", text(data.correct_answer), { ignore_punctuation: data.ignore_punctuation !== false } as Json)];
  if (activityType === "LISTEN_AND_SELECT" || activityType === "SOUND_DISCRIMINATION") return [common(data, 0, activityType, text(data.correct_answer ?? "0"), { choices: data.choices ?? data.pairs ?? [] } as unknown as Json)];
  if (activityType === "SHADOWING") return [common(data, 0, "SHADOWING", text(data.target_text || data.correct_answer), { target_text: data.target_text ?? data.correct_answer } as Json)];
  if (activityType === "NOTE_TAKING_CHALLENGE") return [common(data, 0, "NOTE_TAKING_CHALLENGE", asRecord(data.correct_answer as Json), { questions: data.questions ?? [] } as unknown as Json)];
  if (activityType === "SUMMARIZATION") return [common(data, 0, "SUMMARIZATION", true, { max_words: data.max_words ?? 0, sample_answer: data.sample_answer ?? "" } as unknown as Json)];

  const writingTypes: Record<string, { type: LessonScoredQuestion["question_type"], prompt: string }> = {
    SENTENCE_COMPLETION: { type: "SENTENCE_COMPLETION", prompt: "Complete the sentence stem." },
    ESSAY_WRITING: { type: "ESSAY_WRITING", prompt: "Write an essay responding to the prompt." },
    EMAIL_LETTER_WRITING: { type: "EMAIL_LETTER_WRITING", prompt: "Write a formal email based on the situation." },
    TRANSLATION: { type: "TRANSLATION", prompt: "Translate the sentence into the target language." },
    PARAPHRASE_PRACTICE: { type: "PARAPHRASE_PRACTICE", prompt: "Paraphrase the original sentence in your own words." },
    SENTENCE_COMBINING: { type: "SENTENCE_COMBINING", prompt: "Combine the simple sentences into a complex sentence." },
    CREATIVE_WRITING: { type: "CREATIVE_WRITING", prompt: "Write a creative story based on the prompt." },
    PEER_REVIEW_EDITING: { type: "PEER_REVIEW_EDITING", prompt: "Edit the sample peer text and provide constructive feedback." },
    DIALOGUE_WRITING: { type: "DIALOGUE_WRITING", prompt: "Write a dialogue responding to the scenario." },
  };
  const writing = writingTypes[activityType];
  if (writing) {
    return writingRows(data, writing.type, writing.prompt, (row) => ({
      options: { ...row },
      answer: row.model_answer ?? row.sample_essay ?? row.model_email ?? row.correct_answer ?? row.model_paraphrase ?? row.model_combined_sentence ?? row.model_story ?? row.model_edited_draft ?? row.model_dialogue ?? null,
    }));
  }

  return rows(data, "questions").map((row, index) => common(row, index, (row.question_type || activityType) as LessonScoredQuestion["question_type"], row.correct_answer ?? row.answer ?? null, row.options as Json ?? null));
}

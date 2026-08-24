import { GoogleGenAI } from "@google/genai";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type AiCallContext,
  type AiUsage,
  claimAiGeneration,
  defaultCacheTtl,
  estimateModelCost,
  featureCredits,
  getCachedAiResponse,
  markAiCacheHit,
  releaseAiCredits,
  releaseAiGeneration,
  reserveAiCredits,
  saveAiResponseCache,
  settleAiCredits,
  stableHash,
  waitForCachedAiResponse,
} from "@/lib/ai/efficiency";

// Initialize Gemini client lazily when first called
let aiClient: GoogleGenAI | null = null;

const AI_GENERATION_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function getGeminiClient(): GoogleGenAI {
  if (aiClient) return aiClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not defined. Please add it to your .env.local file."
    );
  }

  aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

// 1. Default fallback prompt templates in case DB isn't seeded yet
export const DEFAULT_PROMPTS: Record<string, { role_description: string; prompt_text: string }> = {
  creator_course_architect: {
    role_description: "You are an expert ESL Curriculum Architect.",
    prompt_text: `Create a structured ESL course path on the topic: "{topic}" at CEFR level: {level}.
Target audience: {audience}.
Course length: {length}.
Additional requirements: {requirements}.

Your response must follow this JSON schema exactly:
{
  "title": "Course Title",
  "subtitle": "Short subtitle explaining what this course achieves",
  "description": "Comprehensive course description and overview",
  "outcomes": ["Detailed student learning outcome 1", "Detailed student learning outcome 2"],
  "faqs": [
    {"question": "FAQ Question 1", "answer": "FAQ Answer 1"}
  ],
  "sections": [
    {
      "title": "Section Title",
      "position": 1,
      "items": [
        {
          "title": "Lesson/Quiz Title",
          "item_type": "LESSON",
          "position": 1,
          "description": "What will be covered in this lesson/quiz"
        }
      ]
    }
  ]
}`
  },

  creator_lesson_designer: {
    role_description: "You are a professional ESL Lesson Content Designer.",
    prompt_text: `Generate a complete ESL lesson draft about: "{topic}" at CEFR level: {level}.
Lesson outcomes: {outcomes}.
Teaching style: {style}.
Number of slides requested: {slideCount}.

Create a sequence of slides. Each slide contains visual blocks and/or interactive activities.
Ensure that the language is perfectly appropriate for level {level}.

IMPORTANT CONTENT RULES:
- Every slide MUST contain at least one non-empty content block in its blocks array. Never return blocks: [] or an empty content object.
- Use the slide title as the slide header; do not repeat it as a HEADING block.
- Use only these block_type values: TEXT, HEADING, BULLETS, QUOTE, CALLOUT, IMAGE, IMAGE_TEXT, AUDIO, VIDEO, VOCABULARY, GRAMMAR, READING, DIALOGUE, FLASHCARD, TABLE, COMMON_MISTAKE, CONTRAST_PAIR, DIVIDER.
- TEXT content is {"body":"..."}; BULLETS is {"title":"...","items":["...","..."]}; GRAMMAR is {"title":"...","explanation":"...","examples":["..."],"notes":"..."}; READING is {"title":"...","passage":"...","questions":[]}; DIALOGUE is {"title":"...","speakers":["..."],"turns":[{"speaker":"...","line":"..."}]}.
- For a media slide, include a non-empty TEXT instruction before the AUDIO or VIDEO block. Do not invent media URLs; use an empty media URL and explain what the creator should provide.
- Every block must contain real learner-facing content, not placeholders such as "Text here" or "Add content".
- Activities must use the top-level key prompt, not instruction. Include complete questions, options, and answer keys when the activity is objectively gradable.
- Return exactly the requested number of slides, numbered sequentially from 1.

Your response must follow this JSON schema exactly:
{
  "title": "Lesson Title",
  "topic": "Lesson Topic",
  "description": "Short explanation of lesson content",
  "slides": [
    {
      "slide_number": 1,
      "title": "Slide Title",
      "section_label": "e.g. Vocabulary / Grammar / Reading / Discussion",
      "blocks": [
        {
          "block_type": "HEADING",
          "content": {"text": "Header Text", "level": "H1"}
        },
        {
          "block_type": "TEXT",
          "content": {"body": "Paragraph of text"}
        }
      ],
      "activities": [
        {
          "activity_type": "MCQ",
          "activity_data": {
            "prompt": "Choose the correct sentence.",
            "questions": [
              {
                "id": 1,
                "text": "Question text?",
                "options": {"A": "Choice A", "B": "Choice B", "C": "Choice C", "D": "Choice D"},
                "answer": "A"
              }
            ]
          }
        }
      ]
    }
  ]
}`
  },

  creator_quiz_builder: {
    role_description: "You are an expert ESL Assessment Designer.",
    prompt_text: `Generate a standalone ESL quiz about: "{topic}" at CEFR level: {level}.
Number of questions: {questionCount}.
Include question types: {types}.

Ensure the correct answers are accurate and all distractors are plausible but incorrect.

Your response must follow this JSON schema exactly:
{
  "title": "Quiz Title",
  "topic": "Quiz Topic",
  "level": "CEFR Level",
  "questions": [
    {
      "question_text": "Question prompt or sentence",
      "question_type": "MCQ",
      "options": {"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"},
      "correct_answer": "A",
      "explanation": "Why A is correct and other choices are wrong."
    }
  ]
}`
  },

  learner_roleplay_coach: {
    role_description: "You are an interactive ESL conversation roleplay partner.",
    prompt_text: `You are playing the character: "{character}" in this scenario: "{scenario}".
Target CEFR level: {level}.
The learner's response is: "{learnerResponse}".
Conversation history: {history}.

Generate the next character turn in the conversation. The tone must be natural and appropriate for {level} level.
Also, analyze the learner's response for any grammar, spelling, vocabulary, or pronunciation errors. Provide helpful corrections if needed.

Your response must follow this JSON schema exactly:
{
  "character_reply": "Your spoken reply in character",
  "corrections": {
    "has_errors": true,
    "errors": [
      {
        "original": "learner's segment with error",
        "corrected": "corrected segment",
        "explanation": "Short, clear explanation of why this was corrected."
      }
    ]
  }
}`
  },

  learner_roleplay_evaluator: {
    role_description: "You are an expert ESL Speaking Assessor.",
    prompt_text: `Evaluate the following completed spoken English roleplay conversation:
Scenario: "{scenario}"
Target level: {level}
Conversation transcript: {transcript}

Grade the learner's spoken performance, not written English. Encourage the learner first and keep feedback selective. Do not penalize punctuation, spelling, capitalization, or transcript imperfections. Assess fluency, pronunciation clarity only when the transcript supports a reasonable inference, vocabulary range, sentence structure, and task achievement. Do not invent pronunciation problems from text alone. Give one or two useful next steps, not a long error list.

Your response must follow this JSON schema exactly:
{
  "scores": {
    "task_achievement": 80,
    "vocabulary_range": 75,
    "grammar_accuracy": 85,
    "overall": 80
  },
  "feedback": {
    "strengths": ["Strong points here"],
    "weaknesses": ["Errors or weak sentences here"],
    "cefr_alignment": "Analysis of their performance against target CEFR",
    "improvement_tips": ["Concrete tip 1", "Concrete tip 2"]
  }
}`
  },

  learner_hint_coach: {
    role_description: "You are a supportive ESL Tutor giving hints.",
    prompt_text: `Question context: "{questionText}"
Learner is stuck and needs a hint. Do NOT give the direct answer. Provide a helpful hint or clue that guides them to think.
CEFR level: {level}.

Your response must follow this JSON schema:
{
  "hint": "Clue text"
}`
  },

  learner_answer_explainer: {
    role_description: "You are an encouraging ESL Teacher explaining answers.",
    prompt_text: `Question context: "{questionText}"
Correct answer: "{correctAnswer}"
Learner's answer: "{learnerAnswer}"

Explain why the correct answer is correct and why the learner's response was incorrect in simple, CEFR-appropriate English.

Your response must follow this JSON schema:
{
  "explanation": "Clear explanation of the answer rules."
}`
  },

  learner_writing_feedback: {
    role_description: "You are a professional CEFR Writing Examiner.",
    prompt_text: `Writing prompt: "{prompt}"
Learner writing submission: "{submission}"
Target level: {level}.

Evaluate the writing against IELTS/CEFR rubrics.

Your response must follow this JSON schema exactly:
{
  "scores": {
    "task_response": 80,
    "coherence": 75,
    "lexical_resource": 70,
    "grammar_range": 80,
    "overall": 76
  },

  "feedback": "Overall review summary",
  "corrections": [
    {"original": "original text", "corrected": "corrected text", "explanation": "Why"}
  ]
}`
  },

  learner_writing_grading_v1: {
    role_description: "You are a careful CEFR writing assessor. Judge only the submitted writing and never invent evidence.",
    prompt_text: `Writing task: "{prompt}"
Learner submission: "{submission}"
Target CEFR level: {level}.

Assess task response, coherence, lexical resource, and grammar range against the target CEFR level. Give concise, actionable feedback. Do not use IELTS band assumptions unless the task explicitly asks for IELTS.

Return a score from 0 to 100 and learner-friendly feedback with exactly 1-3 strengths, 1-3 improvements, and either one useful example correction or null. Keep the summary concise and do not repeat the rubric scores in the learner-facing text.

Return only the JSON shape requested by the response schema.`
  },

  learner_oral_response_grading_v1: {
    role_description: "You are a fair CEFR speaking assessor evaluating an automatic speech-recognition transcript.",
    prompt_text: `Speaking task: "{prompt}"
Automatic transcript of the learner's spoken response: "{submission}"
Target CEFR level: {level}.

Judge communicative fluency signals, vocabulary, spoken clarity signals visible in the transcript, sentence structure, and task achievement. Ignore punctuation, capitalization, formatting, and likely speech-recognition spelling or homophone errors. Never claim to have heard pronunciation or audio because only a transcript is available.

Return a score from 0 to 100 and learner-friendly feedback with exactly 1-3 strengths, 1-3 improvements, and either one useful example correction or null. Keep the summary concise and do not claim to evaluate audio pronunciation.

Return only the JSON shape requested by the response schema.`
  },

  learner_oral_response_transcription_v1: {
    role_description: "You are an accurate English speech transcription assistant.",
    prompt_text: `Transcribe the attached learner recording exactly as spoken.
Return only the words that were spoken in English. Do not summarize, translate, correct grammar, add punctuation that changes meaning, or describe the audio.
If the recording contains silence, ignore the silence. If a word is unclear, use the most likely word from the audio.

Return only the JSON shape requested by the response schema.`
  },

  learner_dialogue_grading_v1: {
    role_description: "You are a careful CEFR dialogue assessor. Judge interactional language without inventing context.",
    prompt_text: `Dialogue task and context: "{prompt}"
Learner dialogue: "{submission}"
Target CEFR level: {level}.

Assess turn-taking flow, grammar accuracy, pragmatic tone, task achievement, and appropriate use of any stated target phrases.

Return a score from 0 to 100 and learner-friendly feedback with exactly 1-3 strengths, 1-3 improvements, and either one useful example correction or null. Keep the summary concise and do not repeat the rubric scores in the learner-facing text.

Return only the JSON shape requested by the response schema.`
  },

  learner_short_answer_feedback: {
    role_description: "You are a professional ESL Coach giving brief writing corrections.",
    prompt_text: `Writing prompt: "{prompt}"
Student's submission: "{submission}"
Model sample answer: "{sampleAnswer}"

Provide a brief correction and feedback.
Your response must follow this JSON schema exactly:
{
  "corrected_text": "The full corrected text (or original text if it is perfect)",
  "explanation": "Brief explanation of the correction or praise if perfect"
}`
  },

  creator_activity_generator: {
    role_description: "You are an expert ESL Curriculum Content Developer.",
    prompt_text: `Based on the following slide content and optional guidelines, generate high-quality ESL activity questions.
Slide Content:
{slideContent}

Optional creator guidelines:
{guidelines}

Activity Type to generate: {activityType}
`
  }
};

// 2. Core callGemini function with structured validation and retries
export async function callGemini<T>({
  templateKey,
  variables,
  responseSchema,
  fallbackModel,
  context,
  media,
}: {
  templateKey: string;
  variables: Record<string, string>;
  responseSchema?: unknown;
  fallbackModel?: string;
  context?: AiCallContext;
  media?: { mimeType: string; data: string };
}): Promise<T> {
  const primaryModel = fallbackModel || process.env.GEMINI_DEFAULT_MODEL || "gemini-3.5-flash";
  const modelCandidates = [primaryModel, "gemini-2.5-flash"]
    .filter((val, index, self) => self.indexOf(val) === index);

  const ai = getGeminiClient();
  const supabase = createAdminClient();

  // A. Fetch template from DB, fallback to code default if not present
  let roleDescription = "";
  let promptText = "";

  try {
    const { data: dbTemplate } = await supabase
      .from("ai_prompt_templates")
      .select("role_description, prompt_text")
      .eq("template_key", templateKey)
      .maybeSingle();

    if (dbTemplate) {
      roleDescription = dbTemplate.role_description;
      promptText = dbTemplate.prompt_text;
    }
  } catch {
    // If table read fails or doesn't exist, proceed with defaults
  }

  if (!roleDescription || !promptText) {
    const codeDefault = DEFAULT_PROMPTS[templateKey];
    if (!codeDefault) {
      throw new Error(`AI prompt template key "${templateKey}" is not defined in database or code defaults.`);
    }
    roleDescription = codeDefault.role_description;
    promptText = codeDefault.prompt_text;
  }

  // B. Inject variables into prompt text
  let finalPrompt = promptText;
  for (const [key, value] of Object.entries(variables)) {
    finalPrompt = finalPrompt.replace(new RegExp(`{${key}}`, "g"), value);
  }

  const featureKey = context?.featureKey || templateKey;
  const promptVersion = context?.promptVersion || stableHash({ roleDescription, promptText }).slice(0, 16);
  const requestedTtl = typeof context?.cache === "object" ? context.cache.ttlSeconds : undefined;
  const cacheTtl = context?.cache === false ? 0 : requestedTtl ?? defaultCacheTtl(featureKey);
  const inputHash = stableHash({
    roleDescription,
    finalPrompt,
    responseSchema,
    media: media ? { mimeType: media.mimeType, dataHash: stableHash(media.data) } : null,
  });
  const cacheKey = stableHash({ featureKey, inputHash, primaryModel, promptVersion });
  const startedAt = Date.now();
  const reservedCredits = featureCredits(featureKey);
  let creditReserved = false;
  let lockOwner: string | null = null;
  let retryCount = 0;

  const audit = async (input: {
    model: string;
    provider: string;
    status: "COMPLETED" | "FAILED" | "CACHED";
    usage?: AiUsage;
    responsePreview?: string | null;
    error?: unknown;
    cacheHit?: boolean;
  }) => {
    const usage = input.usage ?? { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    const payload = {
      user_id: context?.userId ?? null,
      user_role: context?.userRole ?? "SYSTEM",
      feature_key: featureKey,
      model_used: input.model,
      provider: input.provider,
      status: input.status,
      prompt_raw: finalPrompt,
      response_preview: input.responsePreview?.slice(0, 500) ?? null,
      token_estimate: usage.inputTokens + usage.outputTokens,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cached_tokens: usage.cachedTokens,
      latency_ms: Date.now() - startedAt,
      retry_count: retryCount,
      estimated_cost_usd: estimateModelCost(input.model, usage),
      cache_hit: input.cacheHit ?? false,
      cache_key: cacheTtl > 0 ? cacheKey : null,
      cefr_level: context?.cefrLevel ?? null,
      prompt_version: promptVersion,
      error_message: input.error instanceof Error ? input.error.message : input.error ? String(input.error) : null,
      completed_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("ai_generations").insert(payload);
    if (error) {
      await supabase.from("ai_generations").insert({
        user_id: context?.userId ?? null,
        user_role: context?.userRole ?? "SYSTEM",
        feature_key: featureKey,
        model_used: input.model,
        prompt_raw: finalPrompt,
        response_preview: input.responsePreview?.slice(0, 500) ?? null,
        token_estimate: usage.inputTokens + usage.outputTokens,
        error_message: input.error instanceof Error ? input.error.message : input.error ? String(input.error) : null,
      });
    }
  };

  if (cacheTtl > 0) {
    const cached = await getCachedAiResponse<T>(cacheKey);
    if (cached) {
      await Promise.all([
        markAiCacheHit(cacheKey),
        context?.userId ? settleAiCredits({ userId: context.userId, featureKey, reservedCredits: 0, actualCredits: 0, cacheHit: true }) : Promise.resolve(),
        audit({ model: primaryModel, provider: "cache", status: "CACHED", responsePreview: JSON.stringify(cached), cacheHit: true }),
      ]);
      return cached;
    }

    const lock = await claimAiGeneration(cacheKey);
    if (lock.claimed) {
      lockOwner = lock.ownerToken;
    } else {
      const shared = await waitForCachedAiResponse<T>(cacheKey, 20_000);
      if (shared) {
        await Promise.all([
          markAiCacheHit(cacheKey),
          context?.userId ? settleAiCredits({ userId: context.userId, featureKey, reservedCredits: 0, actualCredits: 0, cacheHit: true }) : Promise.resolve(),
          audit({ model: primaryModel, provider: "cache", status: "CACHED", responsePreview: JSON.stringify(shared), cacheHit: true }),
        ]);
        return shared;
      }
      throw new Error("An identical AI request is still being generated. Please try again in a moment.");
    }
  }

  if (context?.userId) {
    const reservation = await reserveAiCredits(context.userId, context.userRole, reservedCredits);
    if (!reservation.allowed) {
      if (lockOwner) await releaseAiGeneration(cacheKey, lockOwner);
      throw new Error("You have reached today's AI credit limit. Your allowance resets tomorrow.");
    }
    creditReserved = reservation.supported;
  }

  // C. Execute generative call with structured JSON parameters over model candidates
  let lastError: unknown = null;
  let rawText = "";
  let successfulModel = "";
  let successfulUsage: AiUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };

  try {
  for (const modelName of modelCandidates) {
    const generateCall = async (promptOverride?: string): Promise<{ text: string; usage: AiUsage }> => {
      const contentText = promptOverride || finalPrompt;
      const contents = media
        ? [
            { text: contentText },
            { inlineData: { mimeType: media.mimeType, data: media.data } },
          ]
        : contentText;
      const response = await withTimeout(ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: roleDescription,
          responseMimeType: "application/json",
          responseSchema: responseSchema // Passes JSON schema constraints directly to Gemini
        }
      }), AI_GENERATION_TIMEOUT_MS, "AI grading timed out while waiting for a response.");

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned an empty response.");
      }
      const metadata = response.usageMetadata;
      return {
        text,
        usage: {
          inputTokens: Number(metadata?.promptTokenCount ?? 0),
          outputTokens: Number(metadata?.candidatesTokenCount ?? 0),
          cachedTokens: Number(metadata?.cachedContentTokenCount ?? 0),
        },
      };
    };

    // D. Execution with retry/repair loop for Free Tier limits
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const generated = await generateCall();
        rawText = generated.text;
        successfulUsage = generated.usage;
        
        // Basic JSON validation before returning
        const parsed = JSON.parse(rawText);
        successfulModel = modelName;
        if (cacheTtl > 0) await saveAiResponseCache({ cacheKey, featureKey, model: modelName, promptVersion, inputHash, response: parsed, ttlSeconds: cacheTtl });
        if (context?.userId && creditReserved) await settleAiCredits({ userId: context.userId, featureKey, reservedCredits, usage: successfulUsage });
        await audit({ model: modelName, provider: "google", status: "COMPLETED", usage: successfulUsage, responsePreview: rawText });
        return parsed as T;
      } catch (error: unknown) {
        lastError = error;
        const apiError = error as { status?: number; message?: string };

        // Handle Free Tier 429 Rate Limit (RPM/RPD)
        if (apiError?.status === 429 || apiError?.message?.includes("429")) {
          retryCount += 1;
          // A daily/project quota will not recover during this request. Move directly to
          // the supported fallback model instead of making the learner wait on a dead retry.
          break;
        }

        // If it's a 503 Service Unavailable or other temporary error, fall back to next model
        if (apiError?.status === 503 || apiError?.message?.includes("503") || apiError?.message?.toLowerCase().includes("unavailable")) {
          retryCount += 1;
          break; // break the attempt loop to try next modelName
        }

        // If it was a JSON parse error, trigger a repair instruction for attempt 2
        if (error instanceof SyntaxError && attempt < 2) {
          const repairPrompt = `${finalPrompt}\n\nCRITICAL ERROR: Your previous response was not valid JSON: "${rawText}".\nPlease fix any missing brackets, trailing commas, or escape characters. Output ONLY valid JSON.`;
          try {
            const repaired = await generateCall(repairPrompt);
            rawText = repaired.text;
            successfulUsage = repaired.usage;
            const parsed = JSON.parse(rawText);
            successfulModel = modelName;
            retryCount += 1;
            if (cacheTtl > 0) await saveAiResponseCache({ cacheKey, featureKey, model: modelName, promptVersion, inputHash, response: parsed, ttlSeconds: cacheTtl });
            if (context?.userId && creditReserved) await settleAiCredits({ userId: context.userId, featureKey, reservedCredits, usage: successfulUsage });
            await audit({ model: modelName, provider: "google", status: "COMPLETED", usage: successfulUsage, responsePreview: rawText });
            return parsed as T;
          } catch (repairError) {
            lastError = repairError;
          }
        }
      }
    }
  }

  // F. Final fallback: OpenRouter (if API key is present)
  if (process.env.OPENROUTER_API_KEY && !context?.assessmentCritical) {
    try {
      console.log("Gemini models exhausted. Attempting fallback via OpenRouter...");
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://brenup.com",
          "X-Title": "BrenUp ESL"
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash:free",
          messages: [
            { role: "system", content: roleDescription },
            { role: "user", content: finalPrompt }
          ],
          response_format: responseSchema ? { type: "json_object" } : undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content.trim());
          successfulModel = "openrouter/google/gemini-2.5-flash:free";
          const usage: AiUsage = {
            inputTokens: Number(data.usage?.prompt_tokens ?? 0),
            outputTokens: Number(data.usage?.completion_tokens ?? 0),
            cachedTokens: 0,
          };
          if (cacheTtl > 0) await saveAiResponseCache({ cacheKey, featureKey, model: successfulModel, promptVersion, inputHash, response: parsed, ttlSeconds: cacheTtl });
          if (context?.userId && creditReserved) await settleAiCredits({ userId: context.userId, featureKey, reservedCredits, usage });
          await audit({ model: successfulModel, provider: "openrouter", status: "COMPLETED", usage, responsePreview: content });
          return parsed as T;
        }
      } else {
        const errorText = await response.text();
        console.error(`OpenRouter API failed: ${response.status} - ${errorText}`);
      }
    } catch (openRouterError: any) {
      console.error("OpenRouter fallback failed:", openRouterError);
      lastError = openRouterError;
    }
  }

  if (context?.userId && creditReserved) await releaseAiCredits(context.userId, reservedCredits);
  await audit({ model: successfulModel || primaryModel, provider: "google", status: "FAILED", usage: successfulUsage, responsePreview: rawText, error: lastError });

  throw new Error(
    `Failed to get a valid response from Gemini after retries. Error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
  } finally {
    if (lockOwner) await releaseAiGeneration(cacheKey, lockOwner);
  }
}

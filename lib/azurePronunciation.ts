type AzurePhoneme = {
  Phoneme?: string;
  PronunciationAssessment?: {
    AccuracyScore?: number;
    NBestPhonemes?: Array<{ Phoneme?: string; Score?: number }>;
  };
};

type AzureWord = {
  Word?: string;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
  Syllables?: Array<{ Syllable?: string; PronunciationAssessment?: { AccuracyScore?: number } }>;
  Phonemes?: AzurePhoneme[];
};

type AzureResult = {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: Array<{
    Words?: AzureWord[];
    PronunciationAssessment?: {
      AccuracyScore?: number;
      FluencyScore?: number;
      CompletenessScore?: number;
      PronScore?: number;
      ProsodyScore?: number;
    };
  }>;
};

export class AzurePronunciationError extends Error {
  readonly code: "no_match" | "missing_assessment";
  readonly recognitionStatus?: string;

  constructor(code: "no_match" | "missing_assessment", message: string, recognitionStatus?: string) {
    super(message);
    this.name = "AzurePronunciationError";
    this.code = code;
    this.recognitionStatus = recognitionStatus;
  }
}

export type PronunciationAssessment = {
  transcript: string;
  overallScore: number;
  accuracyScore: number;
  fluencyScore?: number;
  completenessScore?: number;
  prosodyScore?: number;
  words: Array<{
    text: string;
    score: number;
    errorType?: string;
    syllables: Array<{ text: string; score?: number }>;
    phonemes: Array<{
      expected: string;
      score: number;
      spoken?: string;
      alternatives?: Array<{ phoneme: string; score: number }>;
    }>;
  }>;
};

function score(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export async function assessPronunciation(audio: ArrayBuffer, referenceText: string, locale = "en-US"): Promise<PronunciationAssessment> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("Azure pronunciation assessment is not configured.");

  const params = Buffer.from(JSON.stringify({
    ReferenceText: referenceText,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    PhonemeAlphabet: "IPA",
    NBestPhonemeCount: 3,
    Dimension: "Comprehensive",
    EnableMiscue: true,
  }), "utf8").toString("base64");
  const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(locale)}&format=detailed`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      "Ocp-Apim-Subscription-Key": key,
      "Pronunciation-Assessment": params,
    },
    body: audio,
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Azure pronunciation assessment failed with status ${response.status}`);
  const result = await response.json() as AzureResult;
  const best = result.NBest?.[0];
  const assessment = best?.PronunciationAssessment;
  if (result.RecognitionStatus !== "Success" || !best) {
    console.warn("Azure pronunciation returned no recognized speech", {
      recognitionStatus: result.RecognitionStatus ?? "missing",
      displayTextLength: String(result.DisplayText ?? "").length,
      nBestCount: result.NBest?.length ?? 0,
    });
    throw new AzurePronunciationError("no_match", "Azure did not detect clear speech in this recording.", result.RecognitionStatus);
  }
  if (!assessment) {
    console.error("Azure pronunciation returned speech without assessment", {
      recognitionStatus: result.RecognitionStatus,
      displayTextLength: String(result.DisplayText ?? "").length,
      wordCount: best.Words?.length ?? 0,
    });
    throw new AzurePronunciationError("missing_assessment", "Azure recognized speech but did not return pronunciation assessment data.", result.RecognitionStatus);
  }

  return {
    transcript: String(result.DisplayText ?? "").trim().slice(0, 2_000),
    overallScore: score(assessment.PronScore),
    accuracyScore: score(assessment.AccuracyScore),
    fluencyScore: assessment.FluencyScore == null ? undefined : score(assessment.FluencyScore),
    completenessScore: assessment.CompletenessScore == null ? undefined : score(assessment.CompletenessScore),
    prosodyScore: assessment.ProsodyScore == null ? undefined : score(assessment.ProsodyScore),
    words: (best.Words ?? []).map((word) => ({
      text: String(word.Word ?? ""),
      score: score(word.PronunciationAssessment?.AccuracyScore),
      errorType: word.PronunciationAssessment?.ErrorType,
      syllables: (word.Syllables ?? []).map((syllable) => ({ text: String(syllable.Syllable ?? ""), score: syllable.PronunciationAssessment?.AccuracyScore == null ? undefined : score(syllable.PronunciationAssessment.AccuracyScore) })),
      phonemes: (word.Phonemes ?? []).map((phoneme) => ({
        expected: String(phoneme.Phoneme ?? ""),
        score: score(phoneme.PronunciationAssessment?.AccuracyScore),
        spoken: phoneme.PronunciationAssessment?.NBestPhonemes?.[0]?.Phoneme,
        alternatives: phoneme.PronunciationAssessment?.NBestPhonemes?.map((candidate) => ({ phoneme: String(candidate.Phoneme ?? ""), score: score(candidate.Score) })),
      })),
    })),
  };
}

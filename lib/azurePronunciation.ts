type AzurePhoneme = {
  Phoneme?: string;
  AccuracyScore?: number;
  PronunciationAssessment?: {
    AccuracyScore?: number;
    NBestPhonemes?: Array<{ Phoneme?: string; Score?: number }>;
  };
};

type AzureSyllable = {
  Syllable?: string;
  AccuracyScore?: number;
  PronunciationAssessment?: { AccuracyScore?: number };
};

type AzureWord = {
  Word?: string;
  AccuracyScore?: number;
  ErrorType?: string;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
  Syllables?: AzureSyllable[];
  Phonemes?: AzurePhoneme[];
};

type AzureResult = {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: Array<{
    Display?: string;
    AccuracyScore?: number;
    FluencyScore?: number;
    CompletenessScore?: number;
    PronScore?: number;
    ProsodyScore?: number;
    PronunciationAssessment?: {
      AccuracyScore?: number;
      FluencyScore?: number;
      CompletenessScore?: number;
      PronScore?: number;
      ProsodyScore?: number;
    };
    Words?: AzureWord[];
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

function optionalScore(...values: unknown[]): number | undefined {
  const value = values.find((candidate) => typeof candidate === "number" && Number.isFinite(candidate));
  return value === undefined ? undefined : score(value);
}

export async function assessPronunciation(audio: ArrayBuffer, referenceText: string, locale = "en-US"): Promise<PronunciationAssessment> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("Azure pronunciation assessment is not configured.");

  // Use Azure's short-audio HTTPS endpoint to avoid WebSocket connection failures
  // in serverless runtimes. The caller converts recordings to 16 kHz mono PCM WAV.
  const endpoint = new URL(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`);
  endpoint.searchParams.set("language", locale);
  endpoint.searchParams.set("format", "detailed");

  const assessmentOptions = {
    ReferenceText: referenceText,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    EnableMiscue: "True",
    EnableProsodyAssessment: locale.toLowerCase() === "en-us" ? "True" : "False",
    PhonemeAlphabet: "IPA",
    NBestPhonemeCount: 3,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      "Ocp-Apim-Subscription-Key": key,
      "Pronunciation-Assessment": Buffer.from(JSON.stringify(assessmentOptions)).toString("base64"),
    },
    body: Buffer.from(audio),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    // Azure error bodies can contain request details. Log status only, never audio,
    // credentials, reference text, transcripts, or the response body.
    console.error("Azure pronunciation REST request failed", { status: response.status, region });
    throw new Error(`Azure pronunciation request failed with HTTP ${response.status}.`);
  }

  const result = await response.json() as AzureResult;
  const best = result.NBest?.[0];
  const assessment = best?.PronunciationAssessment ?? best;
  const recognitionStatus = String(result.RecognitionStatus ?? "Unknown");
  const transcript = String(result.DisplayText ?? best?.Display ?? "").trim();

  if (recognitionStatus !== "Success" || !best || !transcript) {
    console.warn("Azure pronunciation returned no recognized speech", {
      recognitionStatus,
      transcriptLength: transcript.length,
      nBestCount: result.NBest?.length ?? 0,
    });
    throw new AzurePronunciationError("no_match", "Azure did not detect clear speech in this recording.", recognitionStatus);
  }
  if (optionalScore(assessment?.PronScore, assessment?.AccuracyScore) === undefined) {
    console.error("Azure pronunciation returned speech without assessment", {
      recognitionStatus,
      transcriptLength: transcript.length,
      wordCount: best.Words?.length ?? 0,
    });
    throw new AzurePronunciationError("missing_assessment", "Azure recognized speech but did not return pronunciation assessment data.", recognitionStatus);
  }

  return {
    transcript: transcript.slice(0, 2_000),
    overallScore: score(assessment?.PronScore ?? assessment?.AccuracyScore),
    accuracyScore: score(assessment?.AccuracyScore),
    fluencyScore: optionalScore(assessment?.FluencyScore),
    completenessScore: optionalScore(assessment?.CompletenessScore),
    prosodyScore: optionalScore(assessment?.ProsodyScore),
    words: (best.Words ?? []).map((word) => ({
      text: String(word.Word ?? ""),
      score: score(word.PronunciationAssessment?.AccuracyScore ?? word.AccuracyScore),
      errorType: word.PronunciationAssessment?.ErrorType ?? word.ErrorType,
      syllables: (word.Syllables ?? []).map((syllable) => ({
        text: String(syllable.Syllable ?? ""),
        score: optionalScore(syllable.PronunciationAssessment?.AccuracyScore, syllable.AccuracyScore),
      })),
      phonemes: (word.Phonemes ?? []).map((phoneme) => ({
        expected: String(phoneme.Phoneme ?? ""),
        score: score(phoneme.PronunciationAssessment?.AccuracyScore ?? phoneme.AccuracyScore),
        spoken: phoneme.PronunciationAssessment?.NBestPhonemes?.[0]?.Phoneme,
        alternatives: phoneme.PronunciationAssessment?.NBestPhonemes?.map((candidate) => ({ phoneme: String(candidate.Phoneme ?? ""), score: score(candidate.Score) })),
      })),
    })),
  };
}

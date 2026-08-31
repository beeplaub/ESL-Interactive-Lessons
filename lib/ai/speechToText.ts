import { providerAvailable, providerFailed, providerSucceeded } from "@/lib/ai/providerHealth";

export async function transcribeWithGroq(file: File) {
  if (process.env.GROQ_STT_ENABLED !== "true" || !process.env.GROQ_API_KEY) throw new Error("Speech transcription is not configured.");
  if (!providerAvailable("groq")) throw new Error("Speech transcription is temporarily busy. Please try again shortly.");
  const groqForm = new FormData();
  groqForm.append("file", file, file.name || "roleplay-turn.webm");
  groqForm.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
  groqForm.append("language", "en");
  groqForm.append("response_format", "json");
  groqForm.append("temperature", "0");
  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: groqForm,
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Groq transcription failed with status ${response.status}`);
    const result = await response.json() as { text?: unknown };
    const transcript = typeof result.text === "string" ? result.text.trim().slice(0, 2_000) : "";
    if (!transcript) throw new Error("No speech was detected. Please try again.");
    providerSucceeded("groq");
    return transcript;
  } catch (error) {
    providerFailed("groq");
    throw error;
  }
}

/** The 30 prebuilt Gemini TTS voices supported by Gemini's speech generation API. */
export const IPA_GEMINI_VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
  "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia",
  "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix",
  "Sadachbia", "Sadaltager", "Sulafat",
] as const;

export type IpaGeminiVoice = typeof IPA_GEMINI_VOICES[number];
export type IpaVoiceGender = "Female" | "Male" | "Unspecified";

/** Google publishes descriptors for these voices, but not gender metadata.
 * The first eight use the voice presentation already established in BrenUp's
 * voiceover catalog; the remaining voices stay honestly unclassified.
 */
export const IPA_GEMINI_VOICE_DETAILS: Record<IpaGeminiVoice, { style: string; gender: IpaVoiceGender }> = {
  Zephyr: { style: "Bright", gender: "Unspecified" },
  Puck: { style: "Upbeat", gender: "Male" },
  Charon: { style: "Informative", gender: "Male" },
  Kore: { style: "Firm", gender: "Female" },
  Fenrir: { style: "Excitable", gender: "Male" },
  Leda: { style: "Youthful", gender: "Female" },
  Orus: { style: "Firm", gender: "Unspecified" },
  Aoede: { style: "Breezy", gender: "Female" },
  Callirrhoe: { style: "Easy-going", gender: "Unspecified" },
  Autonoe: { style: "Bright", gender: "Unspecified" },
  Enceladus: { style: "Breathy", gender: "Unspecified" },
  Iapetus: { style: "Clear", gender: "Unspecified" },
  Umbriel: { style: "Easy-going", gender: "Unspecified" },
  Algieba: { style: "Smooth", gender: "Unspecified" },
  Despina: { style: "Smooth", gender: "Unspecified" },
  Erinome: { style: "Clear", gender: "Unspecified" },
  Algenib: { style: "Gravelly", gender: "Unspecified" },
  Rasalgethi: { style: "Informative", gender: "Unspecified" },
  Laomedeia: { style: "Upbeat", gender: "Unspecified" },
  Achernar: { style: "Soft", gender: "Unspecified" },
  Alnilam: { style: "Firm", gender: "Unspecified" },
  Schedar: { style: "Even", gender: "Unspecified" },
  Gacrux: { style: "Mature", gender: "Female" },
  Pulcherrima: { style: "Forward", gender: "Unspecified" },
  Achird: { style: "Friendly", gender: "Unspecified" },
  Zubenelgenubi: { style: "Casual", gender: "Unspecified" },
  Vindemiatrix: { style: "Gentle", gender: "Unspecified" },
  Sadachbia: { style: "Lively", gender: "Unspecified" },
  Sadaltager: { style: "Knowledgeable", gender: "Unspecified" },
  Sulafat: { style: "Warm", gender: "Female" },
};

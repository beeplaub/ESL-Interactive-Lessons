export const VOICEOVER_VOICES = [
  {
    name: "Aoede", label: "Aoede", description: "Breezy and natural", presentation: "Female", kokoroVoice: "af_heart",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/system/kokoro-samples/af_heart.wav",
  },
  {
    name: "Kore", label: "Kore", description: "Clear and confident", presentation: "Female", kokoroVoice: "af_bella",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/system/kokoro-samples/af_bella.wav",
  },
  {
    name: "Leda", label: "Leda", description: "Youthful and bright", presentation: "Female", kokoroVoice: "af_nova",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/system/kokoro-samples/af_nova.wav",
  },
  {
    name: "Gacrux", label: "Gacrux", description: "Mature and composed", presentation: "Female", kokoroVoice: "bf_emma",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/system/kokoro-samples/bf_emma.wav",
  },
  {
    name: "Sulafat", label: "Sulafat", description: "Warm and encouraging", presentation: "Female", kokoroVoice: "af_sarah",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/system/kokoro-samples/af_sarah.wav",
  },
  {
    name: "Puck", label: "Puck", description: "Upbeat and lively", presentation: "Male", kokoroVoice: "am_puck",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/system/kokoro-samples/am_puck.wav",
  },
  {
    name: "Charon", label: "Charon", description: "Informative and steady · UK", presentation: "Male", kokoroVoice: "bm_george",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/system/kokoro-samples/bm_george.wav",
  },
  {
    name: "Fenrir", label: "Fenrir", description: "Energetic and expressive", presentation: "Male", kokoroVoice: "am_fenrir",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/system/kokoro-samples/am_fenrir.wav",
  },
  { name: "Heart", label: "Heart · US", description: "Warm and natural", presentation: "Female", kokoroVoice: "af_heart" },
  { name: "Alloy", label: "Alloy · US", description: "Clear and neutral", presentation: "Female", kokoroVoice: "af_alloy" },
  { name: "Aoede Kokoro", label: "Aoede · US", description: "Bright and expressive", presentation: "Female", kokoroVoice: "af_aoede" },
  { name: "Bella", label: "Bella · US", description: "Rich and polished", presentation: "Female", kokoroVoice: "af_bella" },
  { name: "Jessica", label: "Jessica · US", description: "Friendly and light", presentation: "Female", kokoroVoice: "af_jessica" },
  { name: "Kore Kokoro", label: "Kore · US", description: "Focused and confident", presentation: "Female", kokoroVoice: "af_kore" },
  { name: "Nicole", label: "Nicole · US", description: "Soft and intimate", presentation: "Female", kokoroVoice: "af_nicole" },
  { name: "Nova Kokoro", label: "Nova · US", description: "Youthful and bright", presentation: "Female", kokoroVoice: "af_nova" },
  { name: "River", label: "River · US", description: "Calm and measured", presentation: "Female", kokoroVoice: "af_river" },
  { name: "Sarah Kokoro", label: "Sarah · US", description: "Warm and encouraging", presentation: "Female", kokoroVoice: "af_sarah" },
  { name: "Sky", label: "Sky · US", description: "Light and youthful", presentation: "Female", kokoroVoice: "af_sky" },
  { name: "Adam", label: "Adam · US", description: "Deep and deliberate", presentation: "Male", kokoroVoice: "am_adam" },
  { name: "Echo", label: "Echo · US", description: "Neutral and steady", presentation: "Male", kokoroVoice: "am_echo" },
  { name: "Eric", label: "Eric · US", description: "Plain and conversational", presentation: "Male", kokoroVoice: "am_eric" },
  { name: "Liam", label: "Liam · US", description: "Young and relaxed", presentation: "Male", kokoroVoice: "am_liam" },
  { name: "Michael", label: "Michael · US", description: "Measured and natural · ideal for slow lessons", presentation: "Male", kokoroVoice: "am_michael" },
  { name: "Onyx", label: "Onyx · US", description: "Low and composed", presentation: "Male", kokoroVoice: "am_onyx" },
  { name: "Santa", label: "Santa · US", description: "Characterful and playful", presentation: "Male", kokoroVoice: "am_santa" },
  { name: "Alice", label: "Alice · UK", description: "Clear and gentle", presentation: "Female", kokoroVoice: "bf_alice" },
  { name: "Emma", label: "Emma · UK", description: "Polished and warm", presentation: "Female", kokoroVoice: "bf_emma" },
  { name: "Isabella", label: "Isabella · UK", description: "Elegant and expressive", presentation: "Female", kokoroVoice: "bf_isabella" },
  { name: "Lily", label: "Lily · UK", description: "Light and friendly", presentation: "Female", kokoroVoice: "bf_lily" },
  { name: "Daniel", label: "Daniel · UK", description: "Clear and formal", presentation: "Male", kokoroVoice: "bm_daniel" },
  { name: "Fable", label: "Fable · UK", description: "Storytelling and expressive", presentation: "Male", kokoroVoice: "bm_fable" },
  { name: "George", label: "George · UK", description: "Slow-friendly and steady", presentation: "Male", kokoroVoice: "bm_george" },
  { name: "Lewis", label: "Lewis · UK", description: "Deep and composed", presentation: "Male", kokoroVoice: "bm_lewis" },
] as const;

export const VOICEOVER_STYLES = ["Natural", "Warm teacher", "Calm narration", "Energetic", "Conversational", "Storytelling"] as const;
export const VOICEOVER_PACES = ["Very slow", "Slow", "Natural", "Brisk"] as const;

export type VoiceoverVoice = (typeof VOICEOVER_VOICES)[number];

/** Voices with verified R2 samples are the safe dialogue-generation set. */
export const DIALOGUE_KOKORO_VOICES = VOICEOVER_VOICES.filter((voice) => Boolean("sampleUrl" in voice && voice.sampleUrl));

export type LessonActivitySkill = "CORE" | "READING" | "WRITING" | "LISTENING" | "SPEAKING";

export type LessonActivityDefinition = {
  type: string;
  label: string;
  description: string;
  skills: LessonActivitySkill[];
  aiEnhanced?: boolean;
};

export const LESSON_ACTIVITY_SKILLS: Array<{ id: "ALL" | LessonActivitySkill; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "CORE", label: "Core practice" },
  { id: "READING", label: "Reading" },
  { id: "WRITING", label: "Writing" },
  { id: "LISTENING", label: "Listening" },
  { id: "SPEAKING", label: "Speaking" },
];

export const LESSON_ACTIVITY_CATALOG: LessonActivityDefinition[] = [
  { type: "MCQ", label: "Multiple Choice", description: "Choose one correct answer.", skills: ["CORE", "READING", "LISTENING"] },
  { type: "TRUE_FALSE", label: "True or False", description: "Judge statements as true or false.", skills: ["CORE", "READING", "LISTENING"] },
  { type: "GAP_FILL", label: "Gap Fill", description: "Complete missing words or phrases.", skills: ["CORE", "READING", "WRITING"] },
  { type: "TABLE_COMPLETION", label: "Table Completion", description: "Complete missing table information by typing or selecting answers.", skills: ["CORE", "READING", "LISTENING", "WRITING"] },
  { type: "MATCHING", label: "Matching", description: "Connect related items efficiently.", skills: ["CORE", "READING"] },
  { type: "MULTIPLE_SELECT", label: "Multiple Select", description: "Choose every answer that applies.", skills: ["CORE", "READING", "LISTENING"] },
  { type: "DRAG_DROP", label: "Categorization", description: "Sort items into meaningful groups.", skills: ["CORE", "READING"] },
  { type: "CATEGORIZATION", label: "Categorization", description: "Sort items into meaningful groups.", skills: ["CORE", "READING"] },
  { type: "REORDERING", label: "Reordering", description: "Put words, sentences, or steps in order.", skills: ["CORE", "READING", "WRITING"] },
  { type: "ERROR_CORRECTION", label: "Error Correction", description: "Find and correct language errors.", skills: ["CORE", "WRITING"] },
  { type: "SHORT_ANSWER", label: "Short Answer", description: "Respond briefly in the learner's own words.", skills: ["CORE", "READING", "WRITING", "LISTENING"] },
  { type: "SUMMARIZATION", label: "Summarization", description: "Capture the main ideas concisely.", skills: ["READING", "WRITING", "LISTENING"] },
  { type: "INFERENCE_DETECTION", label: "Inference Detection", description: "Identify what a text implies.", skills: ["READING", "LISTENING"] },
  { type: "HEADINGS_MATCHING", label: "Headings Matching", description: "Match headings to text sections.", skills: ["READING"] },
  { type: "SKIM_CHALLENGE", label: "Skimming Challenge", description: "Read quickly for gist and structure.", skills: ["READING"] },
  { type: "PARAPHRASE_ID", label: "Paraphrase Identification", description: "Recognize equivalent meanings.", skills: ["READING", "CORE"] },
  { type: "SENTENCE_COMPLETION", label: "Sentence Completion", description: "Complete or expand sentence ideas.", skills: ["WRITING", "CORE"] },
  { type: "ESSAY_WRITING", label: "Essay Writing", description: "Write against a structured rubric.", skills: ["WRITING"] },
  { type: "EMAIL_LETTER_WRITING", label: "Email or Letter", description: "Practice purpose, tone, and register.", skills: ["WRITING"] },
  { type: "TRANSLATION", label: "Translation", description: "Translate between the learner's languages.", skills: ["WRITING", "CORE"] },
  { type: "PARAPHRASE_PRACTICE", label: "Paraphrasing Tool", description: "Express the same idea in a new way.", skills: ["WRITING", "READING"] },
  { type: "SENTENCE_COMBINING", label: "Sentence Combining", description: "Join ideas into fluent sentences.", skills: ["WRITING", "CORE"] },
  { type: "CREATIVE_WRITING", label: "Creative Writing", description: "Develop an original response to a prompt.", skills: ["WRITING"] },
  { type: "PEER_REVIEW_EDITING", label: "Peer Review and Editing", description: "Review and improve a written response.", skills: ["WRITING"] },
  { type: "DIALOGUE_WRITING", label: "Dialogue Writing", description: "Create a purposeful conversation.", skills: ["WRITING", "SPEAKING"] },
  { type: "DICTATION", label: "Dictation", description: "Listen and type exactly what is heard.", skills: ["LISTENING", "WRITING"] },
  { type: "LISTEN_AND_SELECT", label: "Listen and Select", description: "Listen and choose the correct option.", skills: ["LISTENING"] },
  { type: "SHADOWING", label: "Shadowing", description: "Listen, repeat, and build fluency.", skills: ["LISTENING", "SPEAKING"] },
  { type: "NOTE_TAKING_CHALLENGE", label: "Note-Taking Challenge", description: "Capture useful details while listening.", skills: ["LISTENING", "WRITING"] },
  { type: "SOUND_DISCRIMINATION", label: "Sound Discrimination", description: "Identify differences between sounds.", skills: ["LISTENING", "SPEAKING"] },
  { type: "LISTEN_AND_GAP_FILL", label: "Listening Gap Fill", description: "Complete gaps while listening.", skills: ["LISTENING", "WRITING"] },
  { type: "PRONUNCIATION", label: "Pronunciation Practice", description: "Record and compare spoken language.", skills: ["SPEAKING", "LISTENING"] },
  { type: "ORAL_RESPONSE", label: "Oral Response", description: "Answer a prompt by speaking.", skills: ["SPEAKING"] },
  { type: "AI_ROLEPLAY", label: "AI Conversation Roleplay", description: "Hold a guided conversation with AI.", skills: ["SPEAKING", "LISTENING"], aiEnhanced: true },
  { type: "AI_INTERVIEW", label: "Interview with AI", description: "Answer spoken questions from a context-aware AI interviewer.", skills: ["SPEAKING", "LISTENING"], aiEnhanced: true },
  { type: "LIVE_SPEAK_TRANSLATE", label: "Live Bangla to English", description: "Speak in Bangla and hear natural English.", skills: ["SPEAKING", "LISTENING"], aiEnhanced: true },
];

export function lessonActivityDefinition(type: string) {
  return LESSON_ACTIVITY_CATALOG.find((activity) => activity.type === type);
}

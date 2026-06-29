export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type LevelAnswer = "A" | "B" | "C" | "D" | string;

export type LevelTestQuestion = {
  id: string;
  section: "USE_OF_ENGLISH" | "READING";
  cefrBand: CefrLevel;
  questionType: "MCQ" | "TRUE_FALSE" | "MULTIPLE_SELECT" | "FILL";
  questionText: string;
  options: Array<{ key: LevelAnswer; text: string }>;
  correctAnswer: LevelAnswer;
  weight: number;
  passageId?: string;
};

export type ReadingPassage = {
  id: string;
  cefrBand: "A1_B1" | "B2_C2";
  title: string;
  body: string;
};

export const levelGuidance: Record<CefrLevel, { name: string; summary: string; guidance: string }> = {
  A1: {
    name: "Beginner",
    summary: "Basic phrases and very simple interactions.",
    guidance:
      "You're at the very start of your English journey. Focus on everyday vocabulary: greetings, numbers, colours, and family. Short, simple sentences are your goal right now. Try A1 and A2 quizzes on this site to build your foundation."
  },
  A2: {
    name: "Elementary",
    summary: "Familiar topics and simple direct exchange.",
    guidance:
      "You can handle familiar topics and simple conversations. Your next step is expanding vocabulary around daily life: shopping, travel, and routines. A2 and B1 quizzes here will stretch you just the right amount."
  },
  B1: {
    name: "Intermediate",
    summary: "Main points of clear standard input, travel, and work.",
    guidance:
      "You've reached a confident intermediate level. You can follow the main points of clear speech and writing. Now focus on accuracy: verb tenses, connecting ideas, and richer vocabulary. B1 quizzes are your core; dip into B2 when you're ready."
  },
  B2: {
    name: "Upper-Intermediate",
    summary: "Complex text and fluent interaction with native speakers.",
    guidance:
      "Strong upper-intermediate. You can read complex texts and express yourself with reasonable fluency. Work on precision: collocations, advanced grammar, and nuanced vocabulary. B2 and C1 quizzes will push your English toward near-native quality."
  },
  C1: {
    name: "Advanced",
    summary: "Demanding texts and spontaneous fluent expression.",
    guidance:
      "You're operating at an advanced level. Your English is flexible and effective in demanding situations. Focus on style, register, and idiomatic expression. C1 quizzes will sharpen what you already do well; C2 materials will expose you to the highest level."
  },
  C2: {
    name: "Mastery",
    summary: "Everything with ease and precision.",
    guidance:
      "Exceptional. You use English with the ease and precision of an educated native speaker. Your focus now is style, cultural nuance, and specialised vocabulary. Explore C1 and C2 quizzes to keep your skills razor-sharp."
  }
};

const useQuestions: LevelTestQuestion[] = [
  q("u1", "A1", "She ____ a teacher.", ["is", "are", "be", "am"], "A"),
  q("u2", "A1", "I have ____ apple in my bag.", ["a", "an", "the", "-"], "B"),
  q("u3", "A1", "They ____ from Canada.", ["is", "am", "are", "be"], "C"),
  q("u4", "A2", "We ____ football every Saturday.", ["play", "are play", "playing", "played"], "A"),
  q("u5", "A2", "I went to the shop ____ buy some milk.", ["for", "to", "because", "so"], "B"),
  q("u6", "A2", "There isn't ____ sugar left.", ["many", "much", "few", "some"], "B"),
  q("u7", "A2", "She ____ her homework before dinner yesterday.", ["finish", "finishes", "finished", "has finish"], "C"),
  q("u8", "B1", "If it rains tomorrow, we ____ at home.", ["stay", "stayed", "will stay", "would stay"], "C"),
  q("u9", "B1", "I've lived here ____ 2020.", ["for", "since", "during", "from"], "B"),
  q("u10", "B1", "He asked me where I ____.", ["live", "lived", "am living", "will live"], "B"),
  q("u11", "B1", "The meeting was ____ because the manager was ill.", ["put off", "put out", "put on", "put up"], "A"),
  q("u12", "B2", "By the time we arrived, the film ____.", ["started", "has started", "had started", "was started"], "C", 1.5),
  q("u13", "B2", "The report ____ by the end of the week.", ["will finish", "will be finished", "has finished", "finishes"], "B", 1.5),
  q("u14", "B2", "She's highly skilled, ____ she lacks confidence.", ["despite", "although", "however", "whereas"], "B", 1.5),
  q("u15", "B2", "Choose the best collocation: make ____.", ["a decision", "a homework", "a research", "an advice"], "A", 1.5),
  q("u16", "C1", "His argument was persuasive, albeit somewhat ____.", ["flawed", "flaw", "flawing", "flawlessly"], "A", 1.5),
  q("u17", "C1", "No sooner ____ the announcement than the room fell silent.", ["he made", "had he made", "he had made", "did he made"], "B", 1.5),
  q("u18", "C1", "The proposal was rejected on the grounds that it was not ____.", ["feasible", "feasibility", "feasibly", "feasibleness"], "A", 1.5),
  q("u19", "C2", "Her response was so ____ that even her critics praised it.", ["incisive", "incision", "incised", "incisively"], "A", 1.5),
  q("u20", "A2", "I don't mind ____ early.", ["get up", "getting up", "to getting up", "got up"], "B"),
  q("u21", "B1", "You ____ smoke in this building. It's forbidden.", ["mustn't", "don't have to", "couldn't", "shouldn't have"], "A"),
  q("u22", "B2", "Had I known about the delay, I ____ later.", ["will leave", "would leave", "would have left", "had left"], "C", 1.5),
  q("u23", "C1", "The findings are consistent ____ previous research.", ["to", "with", "for", "by"], "B", 1.5),
  q("u24", "A1", "This is my brother. ____ name is Sam.", ["His", "Her", "Their", "Your"], "A"),
  q("u25", "A2", "We ____ to the beach if the weather is nice.", ["go", "went", "will go", "have gone"], "C"),
  q("u26", "B1", "I used to ____ coffee, but now I prefer tea.", ["drink", "drinking", "drank", "drunk"], "A"),
  q("u27", "B2", "The company denied ____ the river.", ["pollute", "to pollute", "polluting", "polluted"], "C", 1.5),
  q("u28", "C1", "The speaker's remarks were widely interpreted ____ a criticism of policy.", ["as", "like", "for", "to"], "A", 1.5),
  q("u29", "A1", "What time ____ it?", ["is", "are", "has", "does"], "A"),
  q("u30", "A2", "She's taller ____ her sister.", ["that", "than", "as", "from"], "B"),
  q("u31", "B1", "I look forward to ____ from you.", ["hear", "hearing", "to hear", "heard"], "B"),
  q("u32", "B2", "The issue needs to be dealt ____ immediately.", ["with", "for", "to", "about"], "A", 1.5),
  q("u33", "C1", "The results were ____ inconclusive.", ["largely", "large", "largeness", "larger"], "A", 1.5),
  q("u34", "B1", "She said she ____ busy the following day.", ["is", "was", "will be", "has been"], "B"),
  q("u35", "B2", "Rarely ____ such a clear explanation.", ["I have heard", "have I heard", "I heard", "did I heard"], "B", 1.5),
  q("u36", "C2", "His prose is elegant without being ____.", ["ostentatious", "ostentation", "ostentatiously", "ostensible"], "A", 1.5),
  q("u37", "A2", "Can you ____ me your pen?", ["borrow", "lend", "take", "rent"], "B"),
  q("u38", "B1", "The train ____ when we got to the station.", ["left", "has left", "had left", "leaves"], "C"),
  q("u39", "B2", "It was such ____ useful advice that I wrote it down.", ["a", "an", "the", "-"], "D", 1.5),
  q("u40", "C1", "The policy is intended to ____ economic growth.", ["foster", "founder", "flounder", "filter"], "A", 1.5)
];

export const readingPassages: ReadingPassage[] = [
  {
    id: "p-a",
    cefrBand: "A1_B1",
    title: "A New Class",
    body:
      "Mina started an English class on Monday. At first, she felt nervous because she did not know anyone. The teacher asked students to work in pairs and talk about their hobbies. Mina met Carlos, who likes cooking and cycling. By the end of the lesson, Mina felt more relaxed and decided to practise English for ten minutes every evening."
  },
  {
    id: "p-b",
    cefrBand: "A1_B1",
    title: "The Community Garden",
    body:
      "Every Saturday morning, people in Hill Street meet in a small community garden. They grow tomatoes, herbs, and flowers. Last month, the group invited local children to plant seeds. The children learned how plants need water, light, and time. The garden is now a friendly place where neighbours talk and share food."
  },
  {
    id: "p-c",
    cefrBand: "B2_C2",
    title: "Remote Work and Connection",
    body:
      "Remote work has given employees greater flexibility, but it has also changed how teams build trust. Informal conversations that once happened naturally now require deliberate planning. Some companies have introduced online social spaces, while others encourage regular office days. The most successful teams appear to combine autonomy with structured opportunities for collaboration."
  },
  {
    id: "p-d",
    cefrBand: "B2_C2",
    title: "The Problem with Fast News",
    body:
      "In a digital environment shaped by speed, news can travel further than verification. A dramatic headline may attract attention before the facts are established. Responsible readers therefore need more than access to information; they need habits of evaluation. Checking sources, comparing reports, and noticing emotional language can reduce the spread of misleading claims."
  }
];

const readingQuestions: LevelTestQuestion[] = [
  rq("r1", "p-a", "A2", "How did Mina feel at the start of class?", ["Excited", "Nervous", "Angry", "Bored"], "B"),
  rq("r2", "p-a", "A2", "Carlos likes cooking and cycling.", ["True", "False", "Not given"], "A", "TRUE_FALSE"),
  rq("r3", "p-a", "B1", "What helped Mina feel more relaxed?", ["Working with another student", "Leaving early", "Reading a book", "Changing class"], "A"),
  rq("r4", "p-a", "B1", "Mina plans to practise English every evening.", ["True", "False", "Not given"], "A", "TRUE_FALSE"),
  rq("r5", "p-a", "B1", "The text mainly describes ____.", ["a difficult exam", "a first lesson experience", "a cooking class", "a cycling club"], "B"),
  rq("r6", "p-b", "A2", "When do people meet in the garden?", ["Monday evening", "Friday afternoon", "Saturday morning", "Sunday night"], "C"),
  rq("r7", "p-b", "A2", "The garden only grows flowers.", ["True", "False", "Not given"], "B", "TRUE_FALSE"),
  rq("r8", "p-b", "B1", "Why were children invited?", ["To sell vegetables", "To plant seeds", "To clean the street", "To cook lunch"], "B"),
  rq("r9", "p-b", "B1", "The garden helps neighbours connect.", ["True", "False", "Not given"], "A", "TRUE_FALSE"),
  rq("r10", "p-b", "B1", "Which title best fits the text?", ["A Shared Local Space", "A Dangerous Street", "A New Supermarket", "A Cooking Competition"], "A"),
  rq("r11", "p-c", "B2", "What is one benefit of remote work?", ["Less flexibility", "Greater flexibility", "No collaboration", "Lower trust"], "B"),
  rq("r12", "p-c", "B2", "Informal conversations now often need planning.", ["True", "False", "Not given"], "A", "TRUE_FALSE"),
  rq("r13", "p-c", "C1", "The best teams balance autonomy with ____.", ["strict silence", "structured collaboration", "permanent isolation", "less communication"], "B"),
  rq("r14", "p-c", "C1", "All companies now require regular office days.", ["True", "False", "Not given"], "C", "TRUE_FALSE"),
  rq("r15", "p-c", "C1", "The writer's tone is mainly ____.", ["balanced", "furious", "comic", "dismissive"], "A"),
  rq("r16", "p-d", "B2", "What can travel faster than verification?", ["News", "Books", "Gardens", "Classes"], "A"),
  rq("r17", "p-d", "B2", "Readers need habits of evaluation.", ["True", "False", "Not given"], "A", "TRUE_FALSE"),
  rq("r18", "p-d", "C1", "Which habit can reduce misleading claims?", ["Ignoring sources", "Sharing quickly", "Checking sources", "Reading only headlines"], "C"),
  rq("r19", "p-d", "C1", "Emotional language may be worth noticing.", ["True", "False", "Not given"], "A", "TRUE_FALSE"),
  rq("r20", "p-d", "C1", "The text argues that digital news requires ____.", ["less reading", "critical judgment", "more speed", "no comparison"], "B")
];

export const levelTestQuestions = [...useQuestions, ...readingQuestions];

export function buildLevelTest() {
  const useByBand = {
    A1: pick(useQuestions.filter((item) => item.cefrBand === "A1"), 3),
    A2: pick(useQuestions.filter((item) => item.cefrBand === "A2"), 3),
    B1: pick(useQuestions.filter((item) => item.cefrBand === "B1"), 4),
    B2: pick(useQuestions.filter((item) => item.cefrBand === "B2"), 3),
    C1: pick(useQuestions.filter((item) => item.cefrBand === "C1"), 1),
    C2: pick(useQuestions.filter((item) => item.cefrBand === "C2"), 1)
  };
  const passageA = pick(readingPassages.filter((item) => item.cefrBand === "A1_B1"), 1)[0];
  const passageB = pick(readingPassages.filter((item) => item.cefrBand === "B2_C2"), 1)[0];
  const reading = [...pick(readingQuestions.filter((item) => item.passageId === passageA.id), 5), ...pick(readingQuestions.filter((item) => item.passageId === passageB.id), 5)];

  return {
    passages: [passageA, passageB],
    questions: [...useByBand.A1, ...useByBand.A2, ...useByBand.B1, ...useByBand.B2, ...useByBand.C1, ...useByBand.C2, ...reading]
  };
}

export function scoreLevelTest(questionIds: string[], answers: Record<string, LevelAnswer | undefined>) {
  const selected = questionIds.map((id) => levelTestQuestions.find((question) => question.id === id)).filter(Boolean) as LevelTestQuestion[];
  let rawScore = 0;
  let weightedScore = 0;
  let useOfEnglish = 0;
  let reading = 0;

  for (const question of selected) {
    if (answers[question.id] !== question.correctAnswer) continue;
    rawScore += 1;
    weightedScore += question.weight;
    if (question.section === "USE_OF_ENGLISH") useOfEnglish += 1;
    else reading += 1;
  }

  return {
    rawScore,
    weightedScore,
    cefrLevel: levelFromRawScore(rawScore),
    sectionScores: { use_of_english: useOfEnglish, reading }
  };
}

function levelFromRawScore(score: number): CefrLevel {
  if (score <= 4) return "A1";
  if (score <= 8) return "A2";
  if (score <= 13) return "B1";
  if (score <= 18) return "B2";
  if (score <= 22) return "C1";
  return "C2";
}

function q(id: string, cefrBand: CefrLevel, questionText: string, options: string[], correctAnswer: LevelAnswer, weight = 1): LevelTestQuestion {
  return {
    id,
    section: "USE_OF_ENGLISH",
    cefrBand,
    questionType: "MCQ",
    questionText,
    options: options.map((text, index) => ({ key: ["A", "B", "C", "D"][index] as LevelAnswer, text })),
    correctAnswer,
    weight
  };
}

function rq(id: string, passageId: string, cefrBand: CefrLevel, questionText: string, options: string[], correctAnswer: LevelAnswer, questionType: "MCQ" | "TRUE_FALSE" = "MCQ"): LevelTestQuestion {
  return {
    id,
    section: "READING",
    cefrBand,
    questionType,
    questionText,
    options: options.map((text, index) => ({ key: ["A", "B", "C", "D"][index] as LevelAnswer, text })),
    correctAnswer,
    weight: 1,
    passageId
  };
}

function pick<T>(items: T[], count: number) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

import { IPA_CHARTS, plainWord, type IpaAccent, type IpaGroup, type IpaSound } from "@/lib/ipa/chart";

export type IpaPracticeExample = {
  word: string;
  ipa: string;
  soundId: string;
  symbol: string;
  soundName: string;
  group: IpaGroup;
  voiced: boolean;
};

export type IpaMinimalPair = {
  left: IpaPracticeExample;
  right: IpaPracticeExample;
  leftSymbol: string;
  rightSymbol: string;
};

export type IpaPracticeMode = "conversion" | "compare" | "sort";
export type IpaConversionDirection = "both" | "ipa-to-word" | "word-to-ipa";
export type IpaSortMode = "kind" | "voicing" | "group";
export type IpaCustomExample = { word: string; ipa: string; accent: IpaAccent };
export type IpaPracticeItem = {
  id: string;
  prompt: string;
  expected: string;
  direction?: "ipa-to-word" | "word-to-ipa";
  target?: string;
  options?: string[];
  pair?: IpaMinimalPair;
  sortMode?: IpaSortMode;
  cue?: string;
};

const STRESS_MARKS = new Set(["ˈ", "ˌ"]);

export function ipaPairKey(pair: IpaMinimalPair): string {
  return [pair.left.word, pair.right.word].sort().join("|");
}

export function getIpaPracticeExamples(accent: IpaAccent): IpaPracticeExample[] {
  const examples: IpaPracticeExample[] = [];
  const seen = new Set<string>();

  for (const sound of IPA_CHARTS[accent]) {
    for (const example of sound.examples) {
      const word = plainWord(example).toLowerCase();
      const key = `${word}|${example.ipa}`;
      if (!word || seen.has(key) || !/^[a-z]+(?:['-][a-z]+)*$/.test(word)) continue;
      seen.add(key);
      examples.push({ word, ipa: example.ipa, soundId: sound.id, symbol: sound.symbol, soundName: sound.name, group: sound.group, voiced: sound.voiced });
    }
  }

  return examples;
}

export function tokenizeIpa(ipa: string, accent: IpaAccent): string[] {
  const inventory = [...new Set(IPA_CHARTS[accent].map(sound => sound.symbol))].sort((a, b) => b.length - a.length);
  const tokens: string[] = [];
  for (let index = 0; index < ipa.length;) {
    const character = ipa[index];
    if (STRESS_MARKS.has(character)) {
      tokens.push(character);
      index += 1;
      continue;
    }
    const match = inventory.find(symbol => ipa.startsWith(symbol, index));
    if (match) {
      tokens.push(match);
      index += match.length;
    } else {
      tokens.push(character);
      index += 1;
    }
  }
  return tokens;
}

export function getIpaMinimalPairs(accent: IpaAccent): IpaMinimalPair[] {
  const examples = getIpaPracticeExamples(accent);
  const sounds = IPA_CHARTS[accent];
  const tokensByWord = new Map(examples.map(example => [example.word, tokenizeIpa(example.ipa, accent)]));
  const pairs: IpaMinimalPair[] = [];
  const seen = new Set<string>();

  for (let leftIndex = 0; leftIndex < examples.length; leftIndex += 1) {
    const left = examples[leftIndex];
    const leftTokens = tokensByWord.get(left.word) ?? [];
    for (let rightIndex = leftIndex + 1; rightIndex < examples.length; rightIndex += 1) {
      const right = examples[rightIndex];
      if (left.word === right.word) continue;
      const rightTokens = tokensByWord.get(right.word) ?? [];
      if (leftTokens.length !== rightTokens.length) continue;

      let differenceIndex = -1;
      let differenceCount = 0;
      for (let tokenIndex = 0; tokenIndex < leftTokens.length; tokenIndex += 1) {
        if (leftTokens[tokenIndex] === rightTokens[tokenIndex]) continue;
        differenceIndex = tokenIndex;
        differenceCount += 1;
        if (differenceCount > 1) break;
      }
      if (differenceCount !== 1) continue;

      const leftSymbol = leftTokens[differenceIndex];
      const rightSymbol = rightTokens[differenceIndex];
      if (!sounds.some(sound => sound.symbol === leftSymbol) || !sounds.some(sound => sound.symbol === rightSymbol)) continue;
      const key = [left.word, right.word].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ left, right, leftSymbol, rightSymbol });
    }
  }

  return pairs.sort((a, b) => Math.max(a.left.word.length, a.right.word.length) - Math.max(b.left.word.length, b.right.word.length)
    || Math.max(a.left.ipa.length, a.right.ipa.length) - Math.max(b.left.ipa.length, b.right.ipa.length));
}

export function normalizeIpaAnswer(value: string): string {
  return value.toLowerCase().replace(/[\/\s.]/g, "").replace(/g/g, "ɡ");
}

export function normalizeWordAnswer(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function phonemeSound(accent: IpaAccent, symbol: string): IpaSound | undefined {
  return IPA_CHARTS[accent].find(sound => sound.symbol === symbol);
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const swap = hash % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function sortBucket(sound: IpaSound, mode: IpaSortMode): string {
  if (mode === "kind") return sound.group === "consonant" ? "Consonant" : "Vowel";
  if (mode === "voicing") return sound.voiced ? "Voiced" : "Voiceless";
  if (sound.group === "consonant") return "Consonant";
  if (sound.group === "rhotic") return "R-colored vowel";
  return sound.group === "diphthong" ? "Diphthong" : "Monophthong";
}

export function generateIpaPracticeItems(config: {
  accent: IpaAccent;
  mode: IpaPracticeMode;
  direction?: IpaConversionDirection;
  sortMode?: IpaSortMode;
  selectedWords?: string[];
  selectedPairs?: string[];
  selectedSounds?: string[];
  targetSoundIds?: string[];
  customExamples?: IpaCustomExample[];
  count?: number;
  seed?: string;
}): IpaPracticeItem[] {
  const count = Math.max(1, Math.min(12, Math.trunc(config.count ?? 6)));
  const seed = `${config.seed ?? "ipa-practice"}:${config.accent}:${config.mode}:${config.direction ?? "both"}:${config.sortMode ?? "kind"}`;
  const targetSounds = IPA_CHARTS[config.accent].filter(sound => config.targetSoundIds?.includes(sound.id));
  const targetSymbols = new Set(targetSounds.map(sound => sound.symbol));

  if (config.mode === "conversion") {
    const chartExamples = getIpaPracticeExamples(config.accent);
    const customExamples = (config.customExamples ?? [])
      .filter(example => example.accent === config.accent)
      .map(example => ({
        word: example.word.trim().toLowerCase(),
        ipa: example.ipa.trim().replace(/^\/(.*)\/$/, "$1"),
        soundId: `custom-${example.word.toLowerCase()}`,
        symbol: "",
        soundName: "Custom word",
        group: "consonant" as const,
        voiced: true,
      }))
      .filter(example => example.word && example.ipa);
    const availableExamples = [...chartExamples, ...customExamples].filter(example => !targetSymbols.size || tokenizeIpa(example.ipa, config.accent).some(symbol => targetSymbols.has(symbol)));
    const examples = config.selectedWords?.length
      ? config.selectedWords.flatMap(word => {
        const example = availableExamples.find(item => item.word === word);
        return example ? [example] : [];
      }).slice(0, 12)
      : targetSounds.length
        ? (() => {
          const required: typeof availableExamples = [];
          const usedWords = new Set<string>();
          for (const sound of targetSounds) {
            const candidates = seededShuffle(availableExamples.filter(example => tokenizeIpa(example.ipa, config.accent).includes(sound.symbol) && !usedWords.has(example.word)), `${seed}:target:${sound.id}`);
            const chosen = candidates[0];
            if (chosen) { required.push(chosen); usedWords.add(chosen.word); }
          }
          const remaining = seededShuffle(availableExamples.filter(example => !usedWords.has(example.word)), seed);
          return [...required, ...remaining].slice(0, Math.max(count, targetSounds.length));
        })()
        : seededShuffle(availableExamples, seed).slice(0, count);
    return examples.map((example, index) => {
      const direction = config.direction === "both"
        ? (index % 2 === 0 ? "ipa-to-word" : "word-to-ipa")
        : (config.direction ?? "ipa-to-word");
      return {
        id: `item-${index + 1}`,
        direction,
        prompt: direction === "ipa-to-word" ? `/${example.ipa}/` : example.word,
        expected: direction === "ipa-to-word" ? example.word : `/${example.ipa}/`,
      };
    });
  }

  if (config.mode === "compare") {
    const availablePairs = getIpaMinimalPairs(config.accent).filter(pair => !targetSymbols.size || targetSymbols.has(pair.leftSymbol) || targetSymbols.has(pair.rightSymbol));
    const seedParity = seed.split("").reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0) % 2;
    const makeItem = (pair: IpaMinimalPair, index: number, forcedTarget?: string): IpaPracticeItem => {
      const useLeft = forcedTarget ? pair.leftSymbol === forcedTarget : (index + seedParity) % 2 === 0;
      const target = forcedTarget ?? (useLeft ? pair.leftSymbol : pair.rightSymbol);
      return {
        id: `item-${index + 1}`,
        prompt: `Which word contains /${target}/?`,
        expected: useLeft ? pair.left.word : pair.right.word,
        target,
        options: [pair.left.word, pair.right.word],
        pair,
      };
    };
    const selectedPairs = config.selectedPairs?.length
      ? config.selectedPairs.flatMap(key => {
        const pair = availablePairs.find(item => ipaPairKey(item) === key);
        return pair ? [pair] : [];
      }).slice(0, 12)
      : seededShuffle(availablePairs, seed).slice(0, count);
    if (!config.selectedPairs?.length && targetSounds.length) {
      const required = targetSounds.flatMap((sound, index) => {
        const pair = seededShuffle(availablePairs.filter(item => item.leftSymbol === sound.symbol || item.rightSymbol === sound.symbol), `${seed}:target:${sound.id}`)[0];
        return pair ? [makeItem(pair, index, sound.symbol)] : [];
      });
      const total = Math.max(count, targetSounds.length);
      const remaining = seededShuffle(availablePairs, seed).map(pair => makeItem(pair, 0, pair.leftSymbol && targetSymbols.has(pair.leftSymbol) ? pair.leftSymbol : pair.rightSymbol));
      return [...required, ...remaining].slice(0, total).map((item, index) => ({ ...item, id: `item-${index + 1}` }));
    }
    return seededShuffle(selectedPairs, seed).map((pair, index) => makeItem(pair, index));
  }

  const mode = config.sortMode ?? "kind";
  const buckets = mode === "kind" ? ["Vowel", "Consonant"] : mode === "voicing" ? ["Voiced", "Voiceless"] : ["Monophthong", "Diphthong", "R-colored vowel", "Consonant"];
  const sounds = IPA_CHARTS[config.accent];
  const selected = config.selectedSounds?.length
    ? config.selectedSounds.flatMap(id => {
      const sound = sounds.find(item => item.id === id);
      return sound && buckets.includes(sortBucket(sound, mode)) ? [sound] : [];
    }).slice(0, 12)
    : targetSounds.length
      ? targetSounds.filter(sound => buckets.includes(sortBucket(sound, mode))).slice(0, 12)
    : buckets.flatMap(bucket => seededShuffle(sounds.filter(sound => sortBucket(sound, mode) === bucket), `${seed}:${bucket}`).slice(0, Math.ceil(count / buckets.length)));
  return seededShuffle(selected, seed).slice(0, config.selectedSounds?.length ? selected.length : count).map((sound, index) => ({
    id: `item-${index + 1}`,
    prompt: `Place /${sound.symbol}/ in its group.`,
    expected: sortBucket(sound, mode),
    target: sound.symbol,
    options: buckets.filter(bucket => sounds.some(item => sortBucket(item, mode) === bucket)),
    sortMode: mode,
    cue: sound.cue,
  }));
}

export function normalizeIpaPracticeAnswer(value: string, direction: IpaPracticeItem["direction"]): string {
  return direction === "word-to-ipa" ? normalizeIpaAnswer(value) : normalizeWordAnswer(value);
}

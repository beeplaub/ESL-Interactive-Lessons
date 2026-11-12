import type { IpaAccent } from "@/lib/ipa/chart";

export type IpaVowelContrastWord = {
  spelling: string;
  spellingMarkup: string;
  ukIpa: string;
  ukSoundId: string;
  usIpa: string;
  usSoundId: string;
  sourceUrl: string;
  partOfSpeech?: string;
  targetSyllableIndex: number;
};

export type IpaVowelContrastPair = {
  sourcePairNumber: number;
  left: string;
  right: string;
  sourceContrast: string;
};

// Cambridge IPA is stored using the chart's established UK/US symbol conventions.
export const IPA_VOWEL_CONTRAST_WORDS: IpaVowelContrastWord[] = [
  {
    "spelling": "back",
    "spellingMarkup": "b[a]ck",
    "ukIpa": "bæk",
    "ukSoundId": "trap",
    "usIpa": "bæk",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/back",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bad",
    "spellingMarkup": "b[a]d",
    "ukIpa": "bæd",
    "ukSoundId": "trap",
    "usIpa": "bæd",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bad",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "band",
    "spellingMarkup": "b[a]nd",
    "ukIpa": "bænd",
    "ukSoundId": "trap",
    "usIpa": "bænd",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/band",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bard",
    "spellingMarkup": "b[ar]d",
    "ukIpa": "bɑːd",
    "ukSoundId": "palm",
    "usIpa": "bɑrd",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bard",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bat",
    "spellingMarkup": "b[a]t",
    "ukIpa": "bæt",
    "ukSoundId": "trap",
    "usIpa": "bæt",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bat",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bean",
    "spellingMarkup": "b[ea]n",
    "ukIpa": "biːn",
    "ukSoundId": "fleece",
    "usIpa": "bin",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bean",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "beat",
    "spellingMarkup": "b[ea]t",
    "ukIpa": "biːt",
    "ukSoundId": "fleece",
    "usIpa": "bit",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/beat",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "beck",
    "spellingMarkup": "b[e]ck",
    "ukIpa": "bek",
    "ukSoundId": "dress",
    "usIpa": "bɛk",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/beck",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bed",
    "spellingMarkup": "b[e]d",
    "ukIpa": "bed",
    "ukSoundId": "dress",
    "usIpa": "bɛd",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bed",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bend",
    "spellingMarkup": "b[e]nd",
    "ukIpa": "bend",
    "ukSoundId": "dress",
    "usIpa": "bɛnd",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bend",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bet",
    "spellingMarkup": "b[e]t",
    "ukIpa": "bet",
    "ukSoundId": "dress",
    "usIpa": "bɛt",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bet",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bid",
    "spellingMarkup": "b[i]d",
    "ukIpa": "bɪd",
    "ukSoundId": "kit",
    "usIpa": "bɪd",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bid",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bin",
    "spellingMarkup": "b[i]n",
    "ukIpa": "bɪn",
    "ukSoundId": "kit",
    "usIpa": "bɪn",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bin",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bird",
    "spellingMarkup": "b[ir]d",
    "ukIpa": "bɜːd",
    "ukSoundId": "nurse",
    "usIpa": "bɝd",
    "usSoundId": "nurse",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bird",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bit",
    "spellingMarkup": "b[i]t",
    "ukIpa": "bɪt",
    "ukSoundId": "kit",
    "usIpa": "bɪt",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bit",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bock",
    "spellingMarkup": "b[o]ck",
    "ukIpa": "bɒk",
    "ukSoundId": "lot",
    "usIpa": "bɑk",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bock",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "born",
    "spellingMarkup": "b[or]n",
    "ukIpa": "bɔːn",
    "ukSoundId": "thought",
    "usIpa": "bɔrn",
    "usSoundId": "thought",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/born",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "boss",
    "spellingMarkup": "b[o]ss",
    "ukIpa": "bɒs",
    "ukSoundId": "lot",
    "usIpa": "bɑs",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/boss",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bought",
    "spellingMarkup": "b[ough]t",
    "ukIpa": "bɔːt",
    "ukSoundId": "thought",
    "usIpa": "bɑt",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bought",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "brayed",
    "spellingMarkup": "br[ay]ed",
    "ukIpa": "breɪd",
    "ukSoundId": "face",
    "usIpa": "breɪd",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bray",
    "partOfSpeech": "verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bread",
    "spellingMarkup": "br[ea]d",
    "ukIpa": "bred",
    "ukSoundId": "dress",
    "usIpa": "brɛd",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bread",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "buck",
    "spellingMarkup": "b[u]ck",
    "ukIpa": "bʌk",
    "ukSoundId": "strut",
    "usIpa": "bʌk",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/buck",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bud",
    "spellingMarkup": "b[u]d",
    "ukIpa": "bʌd",
    "ukSoundId": "strut",
    "usIpa": "bʌd",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bud",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bun",
    "spellingMarkup": "b[u]n",
    "ukIpa": "bʌn",
    "ukSoundId": "strut",
    "usIpa": "bʌn",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bun",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "bus",
    "spellingMarkup": "b[u]s",
    "ukIpa": "bʌs",
    "ukSoundId": "strut",
    "usIpa": "bʌs",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/bus",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "but",
    "spellingMarkup": "b[u]t",
    "ukIpa": "bʌt",
    "ukSoundId": "strut",
    "usIpa": "bʌt",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/but",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "calm",
    "spellingMarkup": "c[a]lm",
    "ukIpa": "kɑːm",
    "ukSoundId": "palm",
    "usIpa": "kɑm",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/calm",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "cap",
    "spellingMarkup": "c[a]p",
    "ukIpa": "kæp",
    "ukSoundId": "trap",
    "usIpa": "kæp",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/cap",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "cheap",
    "spellingMarkup": "ch[ea]p",
    "ukIpa": "tʃiːp",
    "ukSoundId": "fleece",
    "usIpa": "tʃip",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/cheap",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "chip",
    "spellingMarkup": "ch[i]p",
    "ukIpa": "tʃɪp",
    "ukSoundId": "kit",
    "usIpa": "tʃɪp",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/chip",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "cob",
    "spellingMarkup": "c[o]b",
    "ukIpa": "kɒb",
    "ukSoundId": "lot",
    "usIpa": "kɑb",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/cob",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "cod",
    "spellingMarkup": "c[o]d",
    "ukIpa": "kɒd",
    "ukSoundId": "lot",
    "usIpa": "kɑd",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/cod",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "code",
    "spellingMarkup": "c[o]de",
    "ukIpa": "kəʊd",
    "ukSoundId": "goat",
    "usIpa": "koʊd",
    "usSoundId": "goat",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/code",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "come",
    "spellingMarkup": "c[o]me",
    "ukIpa": "kʌm",
    "ukSoundId": "strut",
    "usIpa": "kʌm",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/come",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "cooed",
    "spellingMarkup": "c[oo]ed",
    "ukIpa": "kuːd",
    "ukSoundId": "goose",
    "usIpa": "kud",
    "usSoundId": "goose",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/coo",
    "partOfSpeech": "verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "cop",
    "spellingMarkup": "c[o]p",
    "ukIpa": "kɒp",
    "ukSoundId": "lot",
    "usIpa": "kɑp",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/cop",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "cot",
    "spellingMarkup": "c[o]t",
    "ukIpa": "kɒt",
    "ukSoundId": "lot",
    "usIpa": "kɑt",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/cot",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "could",
    "spellingMarkup": "c[ou]ld",
    "ukIpa": "kʊd",
    "ukSoundId": "foot",
    "usIpa": "kʊd",
    "usSoundId": "foot",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/could",
    "partOfSpeech": "modal verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "cub",
    "spellingMarkup": "c[u]b",
    "ukIpa": "kʌb",
    "ukSoundId": "strut",
    "usIpa": "kʌb",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/cub",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "cup",
    "spellingMarkup": "c[u]p",
    "ukIpa": "kʌp",
    "ukSoundId": "strut",
    "usIpa": "kʌp",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/cup",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "cut",
    "spellingMarkup": "c[u]t",
    "ukIpa": "kʌt",
    "ukSoundId": "strut",
    "usIpa": "kʌt",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/cut",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "deem",
    "spellingMarkup": "d[ee]m",
    "ukIpa": "diːm",
    "ukSoundId": "fleece",
    "usIpa": "dim",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/deem",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "dim",
    "spellingMarkup": "d[i]m",
    "ukIpa": "dɪm",
    "ukSoundId": "kit",
    "usIpa": "dɪm",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/dim",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "dock",
    "spellingMarkup": "d[o]ck",
    "ukIpa": "dɒk",
    "ukSoundId": "lot",
    "usIpa": "dɑk",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/dock",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "doll",
    "spellingMarkup": "d[o]ll",
    "ukIpa": "dɒl",
    "ukSoundId": "lot",
    "usIpa": "dɑl",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/doll",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "duck",
    "spellingMarkup": "d[u]ck",
    "ukIpa": "dʌk",
    "ukSoundId": "strut",
    "usIpa": "dʌk",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/duck",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "dull",
    "spellingMarkup": "d[u]ll",
    "ukIpa": "dʌl",
    "ukSoundId": "strut",
    "usIpa": "dʌl",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/dull",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "fan",
    "spellingMarkup": "f[a]n",
    "ukIpa": "fæn",
    "ukSoundId": "trap",
    "usIpa": "fæn",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/fan",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "feel",
    "spellingMarkup": "f[ee]l",
    "ukIpa": "fiːl",
    "ukSoundId": "fleece",
    "usIpa": "fil",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/feel",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "feeling",
    "spellingMarkup": "f[ee]ling",
    "ukIpa": "ˈfiː.lɪŋ",
    "ukSoundId": "fleece",
    "usIpa": "ˈfi.lɪŋ",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/feeling",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "feet",
    "spellingMarkup": "f[ee]t",
    "ukIpa": "fiːt",
    "ukSoundId": "fleece",
    "usIpa": "fit",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/feet",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "fen",
    "spellingMarkup": "f[e]n",
    "ukIpa": "fen",
    "ukSoundId": "dress",
    "usIpa": "fɛn",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/fen",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "fill",
    "spellingMarkup": "f[i]ll",
    "ukIpa": "fɪl",
    "ukSoundId": "kit",
    "usIpa": "fɪl",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/fill",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "filling",
    "spellingMarkup": "f[i]lling",
    "ukIpa": "ˈfɪl.ɪŋ",
    "ukSoundId": "kit",
    "usIpa": "ˈfɪl.ɪŋ",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/filling",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "fit",
    "spellingMarkup": "f[i]t",
    "ukIpa": "fɪt",
    "ukSoundId": "kit",
    "usIpa": "fɪt",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/fit",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "fond",
    "spellingMarkup": "f[o]nd",
    "ukIpa": "fɒnd",
    "ukSoundId": "lot",
    "usIpa": "fɑnd",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/fond",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "food",
    "spellingMarkup": "f[oo]d",
    "ukIpa": "fuːd",
    "ukSoundId": "goose",
    "usIpa": "fud",
    "usSoundId": "goose",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/food",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "fool",
    "spellingMarkup": "f[oo]l",
    "ukIpa": "fuːl",
    "ukSoundId": "goose",
    "usIpa": "ful",
    "usSoundId": "goose",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/fool",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "foot",
    "spellingMarkup": "f[oo]t",
    "ukIpa": "fʊt",
    "ukSoundId": "foot",
    "usIpa": "fʊt",
    "usSoundId": "foot",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/foot",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "freight",
    "spellingMarkup": "fr[eigh]t",
    "ukIpa": "freɪt",
    "ukSoundId": "face",
    "usIpa": "freɪt",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/freight",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "fret",
    "spellingMarkup": "fr[e]t",
    "ukIpa": "fret",
    "ukSoundId": "dress",
    "usIpa": "frɛt",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/fret",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "full",
    "spellingMarkup": "f[u]ll",
    "ukIpa": "fʊl",
    "ukSoundId": "foot",
    "usIpa": "fʊl",
    "usSoundId": "foot",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/full",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "fund",
    "spellingMarkup": "f[u]nd",
    "ukIpa": "fʌnd",
    "ukSoundId": "strut",
    "usIpa": "fʌnd",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/fund",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "gas",
    "spellingMarkup": "g[a]s",
    "ukIpa": "ɡæs",
    "ukSoundId": "trap",
    "usIpa": "ɡæs",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/gas",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "gate",
    "spellingMarkup": "g[a]te",
    "ukIpa": "ɡeɪt",
    "ukSoundId": "face",
    "usIpa": "ɡeɪt",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/gate",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "gem",
    "spellingMarkup": "g[e]m",
    "ukIpa": "dʒem",
    "ukSoundId": "dress",
    "usIpa": "dʒɛm",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/gem",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "get",
    "spellingMarkup": "g[e]t",
    "ukIpa": "ɡet",
    "ukSoundId": "dress",
    "usIpa": "ɡɛt",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/get",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "green",
    "spellingMarkup": "gr[ee]n",
    "ukIpa": "ɡriːn",
    "ukSoundId": "fleece",
    "usIpa": "ɡrin",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/green",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "grin",
    "spellingMarkup": "gr[i]n",
    "ukIpa": "ɡrɪn",
    "ukSoundId": "kit",
    "usIpa": "ɡrɪn",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/grin",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "guess",
    "spellingMarkup": "g[ue]ss",
    "ukIpa": "ɡes",
    "ukSoundId": "dress",
    "usIpa": "ɡɛs",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/guess",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "ham",
    "spellingMarkup": "h[a]m",
    "ukIpa": "hæm",
    "ukSoundId": "trap",
    "usIpa": "hæm",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/ham",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "hard",
    "spellingMarkup": "h[ar]d",
    "ukIpa": "hɑːd",
    "ukSoundId": "palm",
    "usIpa": "hɑrd",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/hard",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "heal",
    "spellingMarkup": "h[ea]l",
    "ukIpa": "hiːl",
    "ukSoundId": "fleece",
    "usIpa": "hil",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/heal",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "heard",
    "spellingMarkup": "h[ear]d",
    "ukIpa": "hɜːd",
    "ukSoundId": "nurse",
    "usIpa": "hɝd",
    "usSoundId": "nurse",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/heard",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "hem",
    "spellingMarkup": "h[e]m",
    "ukIpa": "hem",
    "ukSoundId": "dress",
    "usIpa": "hɛm",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/hem",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "hill",
    "spellingMarkup": "h[i]ll",
    "ukIpa": "hɪl",
    "ukSoundId": "kit",
    "usIpa": "hɪl",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/hill",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "hood",
    "spellingMarkup": "h[oo]d",
    "ukIpa": "hʊd",
    "ukSoundId": "foot",
    "usIpa": "hʊd",
    "usSoundId": "foot",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/hood",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "hop",
    "spellingMarkup": "h[o]p",
    "ukIpa": "hɒp",
    "ukSoundId": "lot",
    "usIpa": "hɑp",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/hop",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "hope",
    "spellingMarkup": "h[o]pe",
    "ukIpa": "həʊp",
    "ukSoundId": "goat",
    "usIpa": "hoʊp",
    "usSoundId": "goat",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/hope",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "hot",
    "spellingMarkup": "h[o]t",
    "ukIpa": "hɒt",
    "ukSoundId": "lot",
    "usIpa": "hɑt",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/hot",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "hut",
    "spellingMarkup": "h[u]t",
    "ukIpa": "hʌt",
    "ukSoundId": "strut",
    "usIpa": "hʌt",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/hut",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "jam",
    "spellingMarkup": "j[a]m",
    "ukIpa": "dʒæm",
    "ukSoundId": "trap",
    "usIpa": "dʒæm",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/jam",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "kip",
    "spellingMarkup": "k[i]p",
    "ukIpa": "kɪp",
    "ukSoundId": "kit",
    "usIpa": "kɪp",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/kip",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "knit",
    "spellingMarkup": "kn[i]t",
    "ukIpa": "nɪt",
    "ukSoundId": "kit",
    "usIpa": "nɪt",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/knit",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "lack",
    "spellingMarkup": "l[a]ck",
    "ukIpa": "læk",
    "ukSoundId": "trap",
    "usIpa": "læk",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/lack",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "land",
    "spellingMarkup": "l[a]nd",
    "ukIpa": "lænd",
    "ukSoundId": "trap",
    "usIpa": "lænd",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/land",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "leak",
    "spellingMarkup": "l[ea]k",
    "ukIpa": "liːk",
    "ukSoundId": "fleece",
    "usIpa": "lik",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/leak",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "leaking",
    "spellingMarkup": "l[ea]king",
    "ukIpa": "ˈliː.kɪŋ",
    "ukSoundId": "fleece",
    "usIpa": "ˈli.kɪŋ",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/leak",
    "partOfSpeech": "verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "leave",
    "spellingMarkup": "l[ea]ve",
    "ukIpa": "liːv",
    "ukSoundId": "fleece",
    "usIpa": "liv",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/leave",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "lend",
    "spellingMarkup": "l[e]nd",
    "ukIpa": "lend",
    "ukSoundId": "dress",
    "usIpa": "lɛnd",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/lend",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "lick",
    "spellingMarkup": "l[i]ck",
    "ukIpa": "lɪk",
    "ukSoundId": "kit",
    "usIpa": "lɪk",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/lick",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "licking",
    "spellingMarkup": "l[i]cking",
    "ukIpa": "ˈlɪk.ɪŋ",
    "ukSoundId": "kit",
    "usIpa": "ˈlɪk.ɪŋ",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/licking",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "live",
    "spellingMarkup": "l[i]ve",
    "ukIpa": "lɪv",
    "ukSoundId": "kit",
    "usIpa": "lɪv",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/live",
    "partOfSpeech": "verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "lock",
    "spellingMarkup": "l[o]ck",
    "ukIpa": "lɒk",
    "ukSoundId": "lot",
    "usIpa": "lɑk",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/lock",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "look",
    "spellingMarkup": "l[oo]k",
    "ukIpa": "lʊk",
    "ukSoundId": "foot",
    "usIpa": "lʊk",
    "usSoundId": "foot",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/look",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "luck",
    "spellingMarkup": "l[u]ck",
    "ukIpa": "lʌk",
    "ukSoundId": "strut",
    "usIpa": "lʌk",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/luck",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "Luke",
    "spellingMarkup": "L[u]ke",
    "ukIpa": "luːk",
    "ukSoundId": "goose",
    "usIpa": "luk",
    "usSoundId": "goose",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/luke",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "main",
    "spellingMarkup": "m[ai]n",
    "ukIpa": "meɪn",
    "ukSoundId": "face",
    "usIpa": "meɪn",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/main",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "man",
    "spellingMarkup": "m[a]n",
    "ukIpa": "mæn",
    "ukSoundId": "trap",
    "usIpa": "mæn",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/man",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "mass",
    "spellingMarkup": "m[a]ss",
    "ukIpa": "mæs",
    "ukSoundId": "trap",
    "usIpa": "mæs",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/mass",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "mate",
    "spellingMarkup": "m[a]te",
    "ukIpa": "meɪt",
    "ukSoundId": "face",
    "usIpa": "meɪt",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/mate",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "meal",
    "spellingMarkup": "m[ea]l",
    "ukIpa": "mɪəl",
    "ukSoundId": "near",
    "usIpa": "mil",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/meal",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "men",
    "spellingMarkup": "m[e]n",
    "ukIpa": "men",
    "ukSoundId": "dress",
    "usIpa": "mɛn",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/men",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "mess",
    "spellingMarkup": "m[e]ss",
    "ukIpa": "mes",
    "ukSoundId": "dress",
    "usIpa": "mɛs",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/mess",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "met",
    "spellingMarkup": "m[e]t",
    "ukIpa": "met",
    "ukSoundId": "dress",
    "usIpa": "mɛt",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/met",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "mill",
    "spellingMarkup": "m[i]ll",
    "ukIpa": "mɪl",
    "ukSoundId": "kit",
    "usIpa": "mɪl",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/mill",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "mock",
    "spellingMarkup": "m[o]ck",
    "ukIpa": "mɒk",
    "ukSoundId": "lot",
    "usIpa": "mɑk",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/mock",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "mod",
    "spellingMarkup": "m[o]d",
    "ukIpa": "mɒd",
    "ukSoundId": "lot",
    "usIpa": "mɑd",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/mod",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "much",
    "spellingMarkup": "m[u]ch",
    "ukIpa": "mʌtʃ",
    "ukSoundId": "strut",
    "usIpa": "mʌtʃ",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/much",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "mud",
    "spellingMarkup": "m[u]d",
    "ukIpa": "mʌd",
    "ukSoundId": "strut",
    "usIpa": "mʌd",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/mud",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "neat",
    "spellingMarkup": "n[ea]t",
    "ukIpa": "niːt",
    "ukSoundId": "fleece",
    "usIpa": "nit",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/neat",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "not",
    "spellingMarkup": "n[o]t",
    "ukIpa": "nɒt",
    "ukSoundId": "lot",
    "usIpa": "nɑt",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/not",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "note",
    "spellingMarkup": "n[o]te",
    "ukIpa": "nəʊt",
    "ukSoundId": "goat",
    "usIpa": "noʊt",
    "usSoundId": "goat",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/note",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pack",
    "spellingMarkup": "p[a]ck",
    "ukIpa": "pæk",
    "ukSoundId": "trap",
    "usIpa": "pæk",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pack",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pan",
    "spellingMarkup": "p[a]n",
    "ukIpa": "pæn",
    "ukSoundId": "trap",
    "usIpa": "pæn",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pan",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pat",
    "spellingMarkup": "p[a]t",
    "ukIpa": "pæt",
    "ukSoundId": "trap",
    "usIpa": "pæt",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pat",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pate",
    "spellingMarkup": "p[a]te",
    "ukIpa": "peɪt",
    "ukSoundId": "face",
    "usIpa": "peɪt",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pate",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "peak",
    "spellingMarkup": "p[ea]k",
    "ukIpa": "piːk",
    "ukSoundId": "fleece",
    "usIpa": "pik",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/peak",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "peck",
    "spellingMarkup": "p[e]ck",
    "ukIpa": "pek",
    "ukSoundId": "dress",
    "usIpa": "pɛk",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/peck",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pen",
    "spellingMarkup": "p[e]n",
    "ukIpa": "pen",
    "ukSoundId": "dress",
    "usIpa": "pɛn",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pen",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pet",
    "spellingMarkup": "p[e]t",
    "ukIpa": "pet",
    "ukSoundId": "dress",
    "usIpa": "pɛt",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pet",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pick",
    "spellingMarkup": "p[i]ck",
    "ukIpa": "pɪk",
    "ukSoundId": "kit",
    "usIpa": "pɪk",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pick",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pin",
    "spellingMarkup": "p[i]n",
    "ukIpa": "pɪn",
    "ukSoundId": "kit",
    "usIpa": "pɪn",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pin",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pit",
    "spellingMarkup": "p[i]t",
    "ukIpa": "pɪt",
    "ukSoundId": "kit",
    "usIpa": "pɪt",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pit",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pool",
    "spellingMarkup": "p[oo]l",
    "ukIpa": "puːl",
    "ukSoundId": "goose",
    "usIpa": "pul",
    "usSoundId": "goose",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pool",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "pull",
    "spellingMarkup": "p[u]ll",
    "ukIpa": "pʊl",
    "ukSoundId": "foot",
    "usIpa": "pʊl",
    "usSoundId": "foot",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/pull",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "raid",
    "spellingMarkup": "r[ai]d",
    "ukIpa": "reɪd",
    "ukSoundId": "face",
    "usIpa": "reɪd",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/raid",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "red",
    "spellingMarkup": "r[e]d",
    "ukIpa": "red",
    "ukSoundId": "dress",
    "usIpa": "rɛd",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/red",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "reed",
    "spellingMarkup": "r[ee]d",
    "ukIpa": "riːd",
    "ukSoundId": "fleece",
    "usIpa": "rid",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/reed",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "rid",
    "spellingMarkup": "r[i]d",
    "ukIpa": "rɪd",
    "ukSoundId": "kit",
    "usIpa": "rɪd",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/rid",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "road",
    "spellingMarkup": "r[oa]d",
    "ukIpa": "rəʊd",
    "ukSoundId": "goat",
    "usIpa": "roʊd",
    "usSoundId": "goat",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/road",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "rob",
    "spellingMarkup": "r[o]b",
    "ukIpa": "rɒb",
    "ukSoundId": "lot",
    "usIpa": "rɑb",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/rob",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "robe",
    "spellingMarkup": "r[o]be",
    "ukIpa": "rəʊb",
    "ukSoundId": "goat",
    "usIpa": "roʊb",
    "usSoundId": "goat",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/robe",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "rod",
    "spellingMarkup": "r[o]d",
    "ukIpa": "rɒd",
    "ukSoundId": "lot",
    "usIpa": "rɑd",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/rod",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sack",
    "spellingMarkup": "s[a]ck",
    "ukIpa": "sæk",
    "ukSoundId": "trap",
    "usIpa": "sæk",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sack",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "said",
    "spellingMarkup": "s[ai]d",
    "ukIpa": "sed",
    "ukSoundId": "dress",
    "usIpa": "sɛd",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/said",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sail",
    "spellingMarkup": "s[ai]l",
    "ukIpa": "seɪl",
    "ukSoundId": "face",
    "usIpa": "seɪl",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sail",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sat",
    "spellingMarkup": "s[a]t",
    "ukIpa": "sæt",
    "ukSoundId": "trap",
    "usIpa": "sæt",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sat",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sate",
    "spellingMarkup": "s[a]te",
    "ukIpa": "seɪt",
    "ukSoundId": "face",
    "usIpa": "seɪt",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sate",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "seat",
    "spellingMarkup": "s[ea]t",
    "ukIpa": "siːt",
    "ukSoundId": "fleece",
    "usIpa": "sit",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/seat",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "seating",
    "spellingMarkup": "s[ea]ting",
    "ukIpa": "ˈsiː.tɪŋ",
    "ukSoundId": "fleece",
    "usIpa": "ˈsi.t̬ɪŋ",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/seat",
    "partOfSpeech": "verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "seen",
    "spellingMarkup": "s[ee]n",
    "ukIpa": "siːn",
    "ukSoundId": "fleece",
    "usIpa": "sin",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/seen",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sell",
    "spellingMarkup": "s[e]ll",
    "ukIpa": "sel",
    "ukSoundId": "dress",
    "usIpa": "sɛl",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sell",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "set",
    "spellingMarkup": "s[e]t",
    "ukIpa": "set",
    "ukSoundId": "dress",
    "usIpa": "sɛt",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/set",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sheep",
    "spellingMarkup": "sh[ee]p",
    "ukIpa": "ʃiːp",
    "ukSoundId": "fleece",
    "usIpa": "ʃip",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sheep",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "ship",
    "spellingMarkup": "sh[i]p",
    "ukIpa": "ʃɪp",
    "ukSoundId": "kit",
    "usIpa": "ʃɪp",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/ship",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "shooed",
    "spellingMarkup": "sh[oo]ed",
    "ukIpa": "ʃuːd",
    "ukSoundId": "goose",
    "usIpa": "ʃud",
    "usSoundId": "goose",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/shoo",
    "partOfSpeech": "verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "should",
    "spellingMarkup": "sh[ou]ld",
    "ukIpa": "ʃʊd",
    "ukSoundId": "foot",
    "usIpa": "ʃʊd",
    "usSoundId": "foot",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/should",
    "partOfSpeech": "modal verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sick",
    "spellingMarkup": "s[i]ck",
    "ukIpa": "sɪk",
    "ukSoundId": "kit",
    "usIpa": "sɪk",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sick",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "side",
    "spellingMarkup": "s[i]de",
    "ukIpa": "saɪd",
    "ukSoundId": "price",
    "usIpa": "saɪd",
    "usSoundId": "price",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/side",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sin",
    "spellingMarkup": "s[i]n",
    "ukIpa": "sɪn",
    "ukSoundId": "kit",
    "usIpa": "sɪn",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sin",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sit",
    "spellingMarkup": "s[i]t",
    "ukIpa": "sɪt",
    "ukSoundId": "kit",
    "usIpa": "sɪt",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sit",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sitting",
    "spellingMarkup": "s[i]tting",
    "ukIpa": "ˈsɪt.ɪŋ",
    "ukSoundId": "kit",
    "usIpa": "ˈsɪt̬.ɪŋ",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sitting",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sleep",
    "spellingMarkup": "sl[ee]p",
    "ukIpa": "sliːp",
    "ukSoundId": "fleece",
    "usIpa": "slip",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sleep",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sleeping",
    "spellingMarkup": "sl[ee]ping",
    "ukIpa": "ˈsliː.pɪŋ",
    "ukSoundId": "fleece",
    "usIpa": "ˈsli.pɪŋ",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sleeping",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "slip",
    "spellingMarkup": "sl[i]p",
    "ukIpa": "slɪp",
    "ukSoundId": "kit",
    "usIpa": "slɪp",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/slip",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "slipping",
    "spellingMarkup": "sl[i]pping",
    "ukIpa": "ˈslɪp.ɪŋ",
    "ukSoundId": "kit",
    "usIpa": "ˈslɪp.ɪŋ",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/slip",
    "partOfSpeech": "verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sock",
    "spellingMarkup": "s[o]ck",
    "ukIpa": "sɒk",
    "ukSoundId": "lot",
    "usIpa": "sɑk",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sock",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "song",
    "spellingMarkup": "s[o]ng",
    "ukIpa": "sɒŋ",
    "ukSoundId": "lot",
    "usIpa": "sɑŋ",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/song",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "soot",
    "spellingMarkup": "s[oo]t",
    "ukIpa": "sʊt",
    "ukSoundId": "foot",
    "usIpa": "sʊt",
    "usSoundId": "foot",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/soot",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "steal",
    "spellingMarkup": "st[ea]l",
    "ukIpa": "stiːl",
    "ukSoundId": "fleece",
    "usIpa": "stil",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/steal",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "still",
    "spellingMarkup": "st[i]ll",
    "ukIpa": "stɪl",
    "ukSoundId": "kit",
    "usIpa": "stɪl",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/still",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "stock",
    "spellingMarkup": "st[o]ck",
    "ukIpa": "stɒk",
    "ukSoundId": "lot",
    "usIpa": "stɑk",
    "usSoundId": "palm",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/stock",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "stoke",
    "spellingMarkup": "st[o]ke",
    "ukIpa": "stəʊk",
    "ukSoundId": "goat",
    "usIpa": "stoʊk",
    "usSoundId": "goat",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/stoke",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "stuck",
    "spellingMarkup": "st[u]ck",
    "ukIpa": "stʌk",
    "ukSoundId": "strut",
    "usIpa": "stʌk",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/stuck",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "suck",
    "spellingMarkup": "s[u]ck",
    "ukIpa": "sʌk",
    "ukSoundId": "strut",
    "usIpa": "sʌk",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/suck",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "suit",
    "spellingMarkup": "s[ui]t",
    "ukIpa": "suːt",
    "ukSoundId": "goose",
    "usIpa": "sut",
    "usSoundId": "goose",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/suit",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "sung",
    "spellingMarkup": "s[u]ng",
    "ukIpa": "sʌŋ",
    "ukSoundId": "strut",
    "usIpa": "sʌŋ",
    "usSoundId": "strut",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/sung",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "tack",
    "spellingMarkup": "t[a]ck",
    "ukIpa": "tæk",
    "ukSoundId": "trap",
    "usIpa": "tæk",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/tack",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "tan",
    "spellingMarkup": "t[a]n",
    "ukIpa": "tæn",
    "ukSoundId": "trap",
    "usIpa": "tæn",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/tan",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "tap",
    "spellingMarkup": "t[a]p",
    "ukIpa": "tæp",
    "ukSoundId": "trap",
    "usIpa": "tæp",
    "usSoundId": "trap",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/tap",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "tech",
    "spellingMarkup": "t[e]ch",
    "ukIpa": "tek",
    "ukSoundId": "dress",
    "usIpa": "tɛk",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/tech",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "teen",
    "spellingMarkup": "t[ee]n",
    "ukIpa": "tiːn",
    "ukSoundId": "fleece",
    "usIpa": "tin",
    "usSoundId": "fleece",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/teen",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "ten",
    "spellingMarkup": "t[e]n",
    "ukIpa": "ten",
    "ukSoundId": "dress",
    "usIpa": "tɛn",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/ten",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "tin",
    "spellingMarkup": "t[i]n",
    "ukIpa": "tɪn",
    "ukSoundId": "kit",
    "usIpa": "tɪn",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/tin",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "tip",
    "spellingMarkup": "t[i]p",
    "ukIpa": "tɪp",
    "ukSoundId": "kit",
    "usIpa": "tɪp",
    "usSoundId": "kit",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/tip",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "trade",
    "spellingMarkup": "tr[a]de",
    "ukIpa": "treɪd",
    "ukSoundId": "face",
    "usIpa": "treɪd",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/trade",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "tread",
    "spellingMarkup": "tr[ea]d",
    "ukIpa": "tred",
    "ukSoundId": "dress",
    "usIpa": "trɛd",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/tread",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "ward",
    "spellingMarkup": "w[ar]d",
    "ukIpa": "wɔːd",
    "ukSoundId": "thought",
    "usIpa": "wɔrd",
    "usSoundId": "thought",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/ward",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "wed",
    "spellingMarkup": "w[e]d",
    "ukIpa": "wed",
    "ukSoundId": "dress",
    "usIpa": "wɛd",
    "usSoundId": "dress",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/wed",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "weighed",
    "spellingMarkup": "w[eigh]ed",
    "ukIpa": "weɪd",
    "ukSoundId": "face",
    "usIpa": "weɪd",
    "usSoundId": "face",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/weigh",
    "partOfSpeech": "verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "who’d",
    "spellingMarkup": "wh[o]’d",
    "ukIpa": "huːd",
    "ukSoundId": "goose",
    "usIpa": "hud",
    "usSoundId": "goose",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/who-d",
    "partOfSpeech": "contraction",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "wood",
    "spellingMarkup": "w[oo]d",
    "ukIpa": "wʊd",
    "ukSoundId": "foot",
    "usIpa": "wʊd",
    "usSoundId": "foot",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/wood",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "wooed",
    "spellingMarkup": "w[oo]ed",
    "ukIpa": "wuːd",
    "ukSoundId": "goose",
    "usIpa": "wud",
    "usSoundId": "goose",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/woo",
    "partOfSpeech": "verb",
    "targetSyllableIndex": 0
  },
  {
    "spelling": "word",
    "spellingMarkup": "w[or]d",
    "ukIpa": "wɜːd",
    "ukSoundId": "nurse",
    "usIpa": "wɝd",
    "usSoundId": "nurse",
    "sourceUrl": "https://dictionary.cambridge.org/pronunciation/english/word",
    "targetSyllableIndex": 0
  }
];

export const IPA_VOWEL_CONTRAST_PAIRS: IpaVowelContrastPair[] = [
  {
    "sourcePairNumber": 1,
    "left": "ship",
    "right": "sheep",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 2,
    "left": "sit",
    "right": "seat",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 3,
    "left": "bit",
    "right": "beat",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 4,
    "left": "fit",
    "right": "feet",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 5,
    "left": "fill",
    "right": "feel",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 6,
    "left": "lick",
    "right": "leak",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 7,
    "left": "live",
    "right": "leave",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 8,
    "left": "bin",
    "right": "bean",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 9,
    "left": "tin",
    "right": "teen",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 10,
    "left": "grin",
    "right": "green",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 11,
    "left": "chip",
    "right": "cheap",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 12,
    "left": "mill",
    "right": "meal",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 13,
    "left": "slip",
    "right": "sleep",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 14,
    "left": "sin",
    "right": "seen",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 15,
    "left": "knit",
    "right": "neat",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 16,
    "left": "pick",
    "right": "peak",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 17,
    "left": "rid",
    "right": "reed",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 18,
    "left": "still",
    "right": "steal",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 19,
    "left": "hill",
    "right": "heal",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 20,
    "left": "dim",
    "right": "deem",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 21,
    "left": "filling",
    "right": "feeling",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 22,
    "left": "licking",
    "right": "leaking",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 23,
    "left": "sitting",
    "right": "seating",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 24,
    "left": "slipping",
    "right": "sleeping",
    "sourceContrast": "/ɪ/–/iː/"
  },
  {
    "sourcePairNumber": 26,
    "left": "full",
    "right": "fool",
    "sourceContrast": "/ʊ/–/uː/"
  },
  {
    "sourcePairNumber": 27,
    "left": "pull",
    "right": "pool",
    "sourceContrast": "/ʊ/–/uː/"
  },
  {
    "sourcePairNumber": 28,
    "left": "look",
    "right": "Luke",
    "sourceContrast": "/ʊ/–/uː/"
  },
  {
    "sourcePairNumber": 29,
    "left": "foot",
    "right": "food",
    "sourceContrast": "/ʊ/–/uː/"
  },
  {
    "sourcePairNumber": 30,
    "left": "soot",
    "right": "suit",
    "sourceContrast": "/ʊ/–/uː/"
  },
  {
    "sourcePairNumber": 31,
    "left": "could",
    "right": "cooed",
    "sourceContrast": "/ʊ/–/uː/"
  },
  {
    "sourcePairNumber": 32,
    "left": "hood",
    "right": "who’d",
    "sourceContrast": "/ʊ/–/uː/"
  },
  {
    "sourcePairNumber": 33,
    "left": "wood",
    "right": "wooed",
    "sourceContrast": "/ʊ/–/uː/"
  },
  {
    "sourcePairNumber": 34,
    "left": "should",
    "right": "shooed",
    "sourceContrast": "/ʊ/–/uː/"
  },
  {
    "sourcePairNumber": 35,
    "left": "bad",
    "right": "bed",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 36,
    "left": "bat",
    "right": "bet",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 37,
    "left": "pat",
    "right": "pet",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 38,
    "left": "man",
    "right": "men",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 39,
    "left": "pan",
    "right": "pen",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 40,
    "left": "sat",
    "right": "set",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 41,
    "left": "ham",
    "right": "hem",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 42,
    "left": "jam",
    "right": "gem",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 43,
    "left": "mass",
    "right": "mess",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 44,
    "left": "gas",
    "right": "guess",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 45,
    "left": "fan",
    "right": "fen",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 46,
    "left": "tan",
    "right": "ten",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 47,
    "left": "pack",
    "right": "peck",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 48,
    "left": "tack",
    "right": "tech",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 49,
    "left": "land",
    "right": "lend",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 50,
    "left": "band",
    "right": "bend",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 51,
    "left": "bid",
    "right": "bed",
    "sourceContrast": "/ɪ/–/e/"
  },
  {
    "sourcePairNumber": 52,
    "left": "pat",
    "right": "pit",
    "sourceContrast": "/æ/–/ɪ/"
  },
  {
    "sourcePairNumber": 53,
    "left": "pan",
    "right": "pin",
    "sourceContrast": "/æ/–/ɪ/"
  },
  {
    "sourcePairNumber": 54,
    "left": "cap",
    "right": "kip",
    "sourceContrast": "/æ/–/ɪ/"
  },
  {
    "sourcePairNumber": 55,
    "left": "tap",
    "right": "tip",
    "sourceContrast": "/æ/–/ɪ/"
  },
  {
    "sourcePairNumber": 56,
    "left": "bat",
    "right": "bit",
    "sourceContrast": "/æ/–/ɪ/"
  },
  {
    "sourcePairNumber": 57,
    "left": "sack",
    "right": "sick",
    "sourceContrast": "/æ/–/ɪ/"
  },
  {
    "sourcePairNumber": 58,
    "left": "back",
    "right": "beck",
    "sourceContrast": "/æ/–/e/"
  },
  {
    "sourcePairNumber": 59,
    "left": "lack",
    "right": "lick",
    "sourceContrast": "/æ/–/ɪ/"
  },
  {
    "sourcePairNumber": 60,
    "left": "pack",
    "right": "pick",
    "sourceContrast": "/æ/–/ɪ/"
  },
  {
    "sourcePairNumber": 61,
    "left": "cut",
    "right": "cot",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 62,
    "left": "hut",
    "right": "hot",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 63,
    "left": "luck",
    "right": "lock",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 64,
    "left": "duck",
    "right": "dock",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 65,
    "left": "buck",
    "right": "bock",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 66,
    "left": "much",
    "right": "mock",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 67,
    "left": "stuck",
    "right": "stock",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 68,
    "left": "suck",
    "right": "sock",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 69,
    "left": "sung",
    "right": "song",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 70,
    "left": "bun",
    "right": "born",
    "sourceContrast": "/ʌ/–/ɔː/"
  },
  {
    "sourcePairNumber": 71,
    "left": "cub",
    "right": "cob",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 72,
    "left": "dull",
    "right": "doll",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 73,
    "left": "come",
    "right": "calm",
    "sourceContrast": "/ʌ/–/ɑː/"
  },
  {
    "sourcePairNumber": 74,
    "left": "fund",
    "right": "fond",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 75,
    "left": "mud",
    "right": "mod",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 76,
    "left": "but",
    "right": "bought",
    "sourceContrast": "/ʌ/–/ɔː/"
  },
  {
    "sourcePairNumber": 77,
    "left": "cup",
    "right": "cop",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 78,
    "left": "bus",
    "right": "boss",
    "sourceContrast": "/ʌ/–/ɒ/"
  },
  {
    "sourcePairNumber": 79,
    "left": "bud",
    "right": "bard",
    "sourceContrast": "/ʌ/–/ɑː/"
  },
  {
    "sourcePairNumber": 80,
    "left": "word",
    "right": "ward",
    "sourceContrast": "/ɜː/–/ɔː/"
  },
  {
    "sourcePairNumber": 81,
    "left": "heard",
    "right": "hard",
    "sourceContrast": "/ɜː/–/ɑː/"
  },
  {
    "sourcePairNumber": 82,
    "left": "bed",
    "right": "bird",
    "sourceContrast": "/e/–/ɜː/"
  },
  {
    "sourcePairNumber": 83,
    "left": "men",
    "right": "main",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 84,
    "left": "sell",
    "right": "sail",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 85,
    "left": "met",
    "right": "mate",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 86,
    "left": "set",
    "right": "sate",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 87,
    "left": "wed",
    "right": "weighed",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 88,
    "left": "red",
    "right": "raid",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 89,
    "left": "get",
    "right": "gate",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 90,
    "left": "pet",
    "right": "pate",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 91,
    "left": "fret",
    "right": "freight",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 92,
    "left": "said",
    "right": "side",
    "sourceContrast": "/e/–/aɪ/"
  },
  {
    "sourcePairNumber": 93,
    "left": "bread",
    "right": "brayed",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 94,
    "left": "tread",
    "right": "trade",
    "sourceContrast": "/e/–/eɪ/"
  },
  {
    "sourcePairNumber": 95,
    "left": "not",
    "right": "note",
    "sourceContrast": "/ɒ/–/əʊ/"
  },
  {
    "sourcePairNumber": 96,
    "left": "cod",
    "right": "code",
    "sourceContrast": "/ɒ/–/əʊ/"
  },
  {
    "sourcePairNumber": 97,
    "left": "rob",
    "right": "robe",
    "sourceContrast": "/ɒ/–/əʊ/"
  },
  {
    "sourcePairNumber": 98,
    "left": "hop",
    "right": "hope",
    "sourceContrast": "/ɒ/–/əʊ/"
  },
  {
    "sourcePairNumber": 99,
    "left": "rod",
    "right": "road",
    "sourceContrast": "/ɒ/–/əʊ/"
  },
  {
    "sourcePairNumber": 100,
    "left": "stock",
    "right": "stoke",
    "sourceContrast": "/ɒ/–/əʊ/"
  }
];

export const IPA_VOWEL_CONTRAST_ACCENTS: IpaAccent[] = ["uk", "us"];

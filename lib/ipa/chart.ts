export type IpaAccent = "uk" | "us";
export type IpaGroup = "monophthong" | "diphthong" | "rhotic" | "consonant";
export type IpaExample = { spelling: string; ipa: string };
export type IpaSound = {
  id: string;
  symbol: string;
  name: string;
  group: IpaGroup;
  voiced: boolean;
  articulation: string;
  cue: string;
  examples: IpaExample[];
  note?: string;
  pair?: string;
};

// Brackets mark spelling spans, including discontinuous spellings such as t[i]m[e].
// These are teaching transcriptions, not a claim that all speakers share one inventory.
export function spellingParts(spelling: string): { text: string; highlighted: boolean }[] {
  return spelling.split(/(\[[^\]]+\])/g).filter(Boolean).map(part => ({
    text: part.startsWith("[") ? part.slice(1, -1) : part,
    highlighted: part.startsWith("["),
  }));
}
export function plainWord(example: IpaExample): string {
  return spellingParts(example.spelling).map(part => part.text).join("");
}
const ex = (spelling: string, ipa: string): IpaExample => ({ spelling, ipa });
const vowel = (id: string, symbol: string, name: string, articulation: string, cue: string, examples: IpaExample[], note?: string, group: IpaGroup = "monophthong"): IpaSound => ({ id, symbol, name, articulation, cue, examples, note, group, voiced: true });

const britishVowels: IpaSound[] = [
  vowel("fleece", "iː", "FLEECE vowel", "High tongue · front · unrounded lips", "Raise the front of your tongue close to the roof of your mouth. Keep your lips relaxed and let the sound flow.", [ex("sh[ee]p", "ʃiːp"), ex("s[ea]t", "siːt"), ex("gr[ee]n", "ɡriːn")], "Compare sheep /iː/ with ship /ɪ/: the tongue position changes as well as the duration."),
  vowel("kit", "ɪ", "KIT vowel", "Near-high tongue · front · relaxed lips", "Relax your tongue slightly lower than for /iː/. Make a brief, relaxed vowel rather than simply shortening /iː/.", [ex("sh[i]p", "ʃɪp"), ex("s[i]t", "sɪt"), ex("m[i]lk", "mɪlk")]),
  vowel("foot", "ʊ", "FOOT vowel", "Near-high tongue · back · loosely rounded lips", "Raise the back of your tongue and round your lips gently. Keep the vowel relaxed.", [ex("g[oo]d", "ɡʊd"), ex("b[oo]k", "bʊk"), ex("p[u]t", "pʊt")], "Book and food have different vowels even though both contain oo."),
  vowel("goose", "uː", "GOOSE vowel", "High tongue · rounded lips", "Raise your tongue and round your lips. Let the vowel continue smoothly without squeezing your lips.", [ex("sh[oo]t", "ʃuːt"), ex("bl[ue]", "bluː"), ex("f[oo]d", "fuːd")], "Tongue position varies between accents; many British speakers use a more central vowel."),
  vowel("dress", "e", "DRESS vowel", "Mid-low tongue · front · unrounded lips", "Open your mouth a little more than for /ɪ/. Keep the front of your tongue raised and your lips unrounded.", [ex("b[e]d", "bed"), ex("r[e]d", "red"), ex("h[ea]d", "hed")], "British dictionaries often write /e/; /ɛ/ is another common transcription of this vowel."),
  vowel("schwa", "ə", "Schwa", "Mid tongue · central · relaxed lips", "Relax your jaw, lips, and tongue. Make a light vowel in an unstressed syllable.", [ex("[a]bout", "əˈbaʊt"), ex("teach[er]", "ˈtiːtʃə"), ex("banan[a]", "bəˈnɑːnə"), ex("sof[a]", "ˈsəʊfə")], "Schwa is unstressed. The same letter can represent a different vowel when stressed."),
  vowel("nurse", "ɜː", "NURSE vowel", "Mid tongue · central · unrounded lips", "Keep your tongue near the centre of your mouth and your lips relaxed. Sustain the vowel without adding an r sound.", [ex("b[ir]d", "bɜːd"), ex("w[or]d", "wɜːd"), ex("n[ur]se", "nɜːs")], "In the American model this is an r-colored vowel /ɝ/."),
  vowel("thought", "ɔː", "THOUGHT vowel", "Mid-low tongue · back · rounded lips", "Lower the back of your tongue and round your lips. Hold the vowel smoothly.", [ex("d[oor]", "dɔː"), ex("th[ough]t", "θɔːt"), ex("l[aw]", "lɔː")]),
  vowel("trap", "æ", "TRAP vowel", "Low tongue · front · unrounded lips", "Open your jaw and keep your tongue toward the front. Keep your lips unrounded.", [ex("c[a]t", "kæt"), ex("b[a]g", "bæɡ"), ex("h[a]t", "hæt")]),
  vowel("strut", "ʌ", "STRUT vowel", "Mid-low tongue · central · unrounded lips", "Keep your lips relaxed and open your mouth moderately. Use a clear stressed vowel.", [ex("[u]p", "ʌp"), ex("c[u]p", "kʌp"), ex("l[o]ve", "lʌv")], "This vowel is stressed, unlike schwa. Some northern British accents use a different vowel here."),
  vowel("palm", "ɑː", "PALM vowel", "Low tongue · back · unrounded lips", "Open your mouth and lower your tongue toward the back. Keep your lips unrounded.", [ex("f[ar]", "fɑː"), ex("p[al]m", "pɑːm"), ex("f[a]ther", "ˈfɑːðə")], "The r in far is not pronounced in this British model unless a vowel follows."),
  vowel("lot", "ɒ", "LOT vowel", "Low tongue · back · rounded lips", "Open your mouth and round your lips slightly. Keep the vowel brief.", [ex("[o]n", "ɒn"), ex("h[o]t", "hɒt"), ex("cl[o]ck", "klɒk")], "The American model usually uses /ɑ/ in these words."),
];
const britishDiphthongs: IpaSound[] = [
  vowel("near", "ɪə", "NEAR glide", "Front vowel → central vowel", "Begin near /ɪ/ and glide toward a relaxed central vowel within one syllable.", [ex("h[ere]", "hɪə"), ex("n[ear]", "nɪə"), ex("[ear]", "ɪə")], "A traditional British transcription. Many contemporary British speakers use a steadier vowel. American English keeps the r.", "diphthong"),
  vowel("face", "eɪ", "FACE glide", "Mid-front vowel → higher front vowel", "Start with a mid-front vowel and glide upward toward /ɪ/. Keep the movement in one syllable.", [ex("w[ai]t", "weɪt"), ex("d[ay]", "deɪ"), ex("r[ai]n", "reɪn")], undefined, "diphthong"),
  vowel("cure", "ʊə", "CURE glide", "Rounded back vowel → central vowel", "Start near /ʊ/ and glide toward a relaxed central vowel in one syllable.", [ex("t[our]ist", "ˈtʊərɪst"), ex("p[ure]", "pjʊə"), ex("c[ure]", "kjʊə"), ex("s[ure]", "ʃʊə")], "A traditional British sound with much variation: many speakers use /ɔː/ in sure. American pronunciations keep the r.", "diphthong"),
  vowel("choice", "ɔɪ", "CHOICE glide", "Rounded back vowel → front vowel", "Begin with rounded lips and move toward /ɪ/, relaxing the rounding as you move.", [ex("b[oy]", "bɔɪ"), ex("c[oi]n", "kɔɪn"), ex("t[oy]", "tɔɪ")], undefined, "diphthong"),
  vowel("goat", "əʊ", "GOAT glide", "Central vowel → rounded back vowel", "Begin with a relaxed central vowel. Glide toward /ʊ/ and round your lips gently.", [ex("sh[ow]", "ʃəʊ"), ex("g[o]", "ɡəʊ"), ex("b[oa]t", "bəʊt")], "The American model starts farther back and is written /oʊ/.", "diphthong"),
  vowel("square", "eə", "SQUARE glide", "Front vowel → central vowel", "Start with an open front vowel and move toward the centre without adding an r sound.", [ex("h[air]", "heə"), ex("ch[air]", "tʃeə"), ex("c[are]", "keə")], "A traditional British transcription. Many speakers use a long, steady /ɛː/. American English keeps the r.", "diphthong"),
  vowel("price", "aɪ", "PRICE glide", "Open vowel → front vowel", "Start with your mouth open. Move your tongue upward and forward toward /ɪ/ in one syllable.", [ex("m[y]", "maɪ"), ex("n[igh]t", "naɪt"), ex("t[i]m[e]", "taɪm")], "In time, the i…e spelling works together to represent this sound.", "diphthong"),
  vowel("mouth", "aʊ", "MOUTH glide", "Open vowel → rounded back vowel", "Start with an open mouth. Glide toward /ʊ/ while rounding your lips.", [ex("c[ow]", "kaʊ"), ex("[ou]t", "aʊt"), ex("h[ou]se", "haʊs")], undefined, "diphthong"),
];

type ConsonantSeed = [string, string, string, boolean, string, string, IpaExample[], string?];
const consonantSeeds: ConsonantSeed[] = [
  ["p", "p", "Lip stop", false, "Both lips · stop", "Close both lips, then release the air. Keep your voice off; avoid adding an uh after it.", [ex("[p]ea", "piː"), ex("cu[p]", "kʌp"), ex("[p]en", "pen")], "b"],
  ["b", "b", "Voiced lip stop", true, "Both lips · stop", "Close both lips and release the air with voice. Avoid adding an extra vowel.", [ex("[b]oat", "bəʊt"), ex("[b]ed", "bed"), ex("ca[b]", "kæb")], "p"],
  ["t", "t", "Tongue-tip stop", false, "Alveolar ridge · stop", "Touch the ridge behind your upper teeth with your tongue tip, then release the air without voice.", [ex("[t]ea", "tiː"), ex("ca[t]", "kæt"), ex("[t]en", "ten")], "d"],
  ["d", "d", "Voiced tongue-tip stop", true, "Alveolar ridge · stop", "Touch the ridge behind your upper teeth and release with voice.", [ex("[d]og", "dɒɡ"), ex("be[d]", "bed"), ex("[d]ay", "deɪ")], "t"],
  ["ch", "tʃ", "CH sound", false, "Behind alveolar ridge · affricate", "Begin with a brief closure like /t/, then release into /ʃ/. Make one joined sound.", [ex("[ch]eese", "tʃiːz"), ex("[ch]air", "tʃeə"), ex("wat[ch]", "wɒtʃ")], "j"],
  ["j", "dʒ", "J sound", true, "Behind alveolar ridge · affricate", "Begin with a brief closure like /d/, then release into /ʒ/ with voice.", [ex("[J]une", "dʒuːn"), ex("[j]am", "dʒæm"), ex("a[ge]", "eɪdʒ")], "ch"],
  ["k", "k", "Back-of-tongue stop", false, "Soft palate · stop", "Raise the back of your tongue to the soft palate. Release the air without voice.", [ex("[c]ar", "kɑː"), ex("[k]ey", "kiː"), ex("ba[ck]", "bæk")], "g"],
  ["g", "ɡ", "Voiced back-of-tongue stop", true, "Soft palate · stop", "Raise the back of your tongue to the soft palate and release with voice.", [ex("[g]o", "ɡəʊ"), ex("ba[g]", "bæɡ"), ex("[g]ame", "ɡeɪm")], "k"],
  ["f", "f", "F sound", false, "Lower lip + upper teeth · fricative", "Touch your lower lip lightly with your upper teeth. Let air flow through without voice.", [ex("[f]ly", "flaɪ"), ex("lea[f]", "liːf"), ex("[ph]one", "fəʊn")], "v"],
  ["v", "v", "V sound", true, "Lower lip + upper teeth · fricative", "Use the same lip-and-teeth position as /f/, adding voice. Feel the gentle vibration.", [ex("[v]ideo", "ˈvɪdiəʊ"), ex("[v]an", "væn"), ex("lo[ve]", "lʌv")], "f"],
  ["th", "θ", "Unvoiced TH", false, "Tongue + teeth · fricative", "Place your tongue lightly between or against your teeth. Blow air gently without voice.", [ex("[th]ink", "θɪŋk"), ex("ba[th]", "bɑːθ"), ex("[th]in", "θɪn")], "dh"],
  ["dh", "ð", "Voiced TH", true, "Tongue + teeth · fricative", "Use the same tongue position as /θ/, with gentle voice. Do not stop the airflow like /d/.", [ex("[th]is", "ðɪs"), ex("[th]ey", "ðeɪ"), ex("mo[th]er", "ˈmʌðə")], "th"],
  ["s", "s", "S sound", false, "Alveolar ridge · fricative", "Bring your tongue close to the ridge behind your upper teeth. Send air through a narrow gap without voice.", [ex("[s]ee", "siː"), ex("bu[s]", "bʌs"), ex("[s]un", "sʌn")], "z"],
  ["z", "z", "Z sound", true, "Alveolar ridge · fricative", "Use the same tongue position as /s/ and add voice. Keep the airflow continuous.", [ex("[z]oo", "zuː"), ex("bu[zz]", "bʌz"), ex("ro[s]e", "rəʊz")], "s"],
  ["sh", "ʃ", "SH sound", false, "Behind alveolar ridge · fricative", "Move your tongue slightly back from /s/ and round your lips gently. Let air flow without voice.", [ex("[sh]all", "ʃæl"), ex("fi[sh]", "fɪʃ"), ex("[sh]oe", "ʃuː")], "zh"],
  ["zh", "ʒ", "ZH sound", true, "Behind alveolar ridge · fricative", "Use the tongue position of /ʃ/ and add voice. Keep it continuous rather than starting with /d/.", [ex("televi[si]on", "ˈtelɪvɪʒən"), ex("mea[s]ure", "ˈmeʒə"), ex("vi[si]on", "ˈvɪʒən")], "sh"],
  ["m", "m", "Lip nasal", true, "Both lips · nasal", "Close your lips and let your voice resonate through your nose.", [ex("[m]an", "mæn"), ex("su[m]", "sʌm"), ex("[m]oon", "muːn")]],
  ["n", "n", "Tongue-tip nasal", true, "Alveolar ridge · nasal", "Touch the ridge behind your upper teeth with your tongue. Let air and voice pass through your nose.", [ex("[n]ow", "naʊ"), ex("su[n]", "sʌn"), ex("[n]et", "net")]],
  ["ng", "ŋ", "NG sound", true, "Soft palate · nasal", "Raise the back of your tongue to the soft palate and let voice pass through your nose. Sing ends with /ŋ/, without an extra /ɡ/.", [ex("si[ng]", "sɪŋ"), ex("ri[ng]", "rɪŋ"), ex("lo[ng]", "lɒŋ")]],
  ["h", "h", "H sound", false, "Glottis · fricative", "Let a light breath flow through your open mouth into the next vowel. Avoid adding friction at the back of your tongue.", [ex("[h]at", "hæt"), ex("[h]ot", "hɒt"), ex("[h]and", "hænd")]],
  ["l", "l", "L sound", true, "Alveolar ridge · lateral approximant", "Touch the ridge behind your upper teeth with your tongue tip. Let air flow around its sides.", [ex("[l]ove", "lʌv"), ex("[l]eg", "leɡ"), ex("[l]ight", "laɪt")]],
  ["r", "r", "R sound", true, "Postalveolar · approximant", "Raise or bunch your tongue without touching the roof of your mouth. Keep the air flowing; do not trill.", [ex("[r]ed", "red"), ex("[r]ain", "reɪn"), ex("[r]un", "rʌn")]],
  ["w", "w", "W sound", true, "Lips + soft palate · approximant", "Round your lips and raise the back of your tongue, then glide directly into the following vowel.", [ex("[w]et", "wet"), ex("[w]e", "wiː"), ex("[w]in", "wɪn")]],
  ["y", "j", "Y sound", true, "Hard palate · approximant", "Raise the front of your tongue close to the hard palate, then glide into the next vowel.", [ex("[y]es", "jes"), ex("[y]ou", "juː"), ex("[y]ear", "jɪə")]],
];
const consonants: IpaSound[] = consonantSeeds.map(([id, symbol, name, voiced, articulation, cue, examples, pair]) => ({ id, symbol, name, voiced, articulation, cue, examples, pair, group: "consonant", ...(id === "r" ? { note: "The teaching symbol /r/ usually represents the English approximant [ɹ]. British r is normally pronounced before a vowel; General American also pronounces it after vowels." } : {}) }));

// Explicit accent transcriptions avoid mechanically changing every occurrence of a letter.
const americanWords: Record<string, string> = {
  sheep: "ʃip", seat: "sit", green: "ɡrin", shoot: "ʃut", blue: "blu", food: "fud", bed: "bɛd", red: "rɛd", head: "hɛd", banana: "bəˈnænə", sofa: "ˈsoʊfə", door: "dɔr", thought: "θɔt", law: "lɔ", far: "fɑr", palm: "pɑm", father: "ˈfɑðɚ", show: "ʃoʊ", go: "ɡoʊ", boat: "boʊt", pea: "pi", pen: "pɛn", tea: "ti", ten: "tɛn", dog: "dɑɡ", cheese: "tʃiz", chair: "tʃɛr", watch: "wɑtʃ", June: "dʒun", car: "kɑr", key: "ki", leaf: "lif", phone: "foʊn", video: "ˈvɪdioʊ", bath: "bæθ", mother: "ˈmʌðɚ", see: "si", zoo: "zu", rose: "roʊz", shoe: "ʃu", television: "ˈtɛləvɪʒən", measure: "ˈmɛʒɚ", moon: "mun", net: "nɛt", long: "lɔŋ", hot: "hɑt", leg: "lɛɡ", wet: "wɛt", we: "wi", yes: "jɛs", you: "ju", year: "jɪr",
};
const americanBase = [...britishVowels, ...britishDiphthongs, ...consonants]
  .filter(sound => !["lot", "near", "square", "cure", "nurse"].includes(sound.id))
  .map(sound => ({ ...sound, examples: sound.examples.map(example => ({ ...example, ipa: americanWords[plainWord(example)] ?? example.ipa })) }));
const americanOverrides: Record<string, Partial<IpaSound>> = {
  fleece: { symbol: "i" }, goose: { symbol: "u" }, dress: { symbol: "ɛ", note: "American transcriptions commonly use /ɛ/. British teaching charts often write /e/." },
  thought: { symbol: "ɔ", note: "Many American speakers merge this vowel with /ɑ/: cot and caught then sound alike. Both patterns are normal." },
  palm: { symbol: "ɑ", name: "PALM / LOT vowel", note: "General American normally uses /ɑ/ in hot and father. Many speakers also use it in thought.", examples: [ex("h[o]t", "hɑt"), ex("f[a]ther", "ˈfɑðɚ"), ex("p[al]m", "pɑm")] },
  goat: { symbol: "oʊ", cue: "Start with a rounded back vowel and glide toward /ʊ/, keeping the movement in one syllable.", articulation: "Back vowel → higher rounded vowel", note: "The British teaching model writes this glide /əʊ/." },
};
const americanRhotic = [
  vowel("nurse", "ɝ", "Stressed R-colored vowel", "Central vowel · r-colored · stressed", "Bunch or curl your tongue slightly to give the vowel r-coloring. Keep your lips relaxed and avoid touching the roof of your mouth.", [ex("b[ir]d", "bɝd"), ex("n[ur]se", "nɝs"), ex("w[or]d", "wɝd")], "Also transcribed /ɜr/. This is the stressed member of the r-colored pair.", "rhotic"),
  vowel("letter", "ɚ", "Unstressed R-colored vowel", "Central vowel · r-colored · unstressed", "Make a light central vowel with r-coloring. Keep this unstressed syllable less prominent than the stressed one.", [ex("teach[er]", "ˈtitʃɚ"), ex("moth[er]", "ˈmʌðɚ"), ex("bett[er]", "ˈbɛtɚ")], "Also transcribed /ər/. Listed separately as a useful sound card, rather than a claim about the number of American phonemes.", "rhotic"),
];
export const IPA_CHARTS: Record<IpaAccent, IpaSound[]> = {
  uk: [...britishVowels, ...britishDiphthongs, ...consonants],
  us: [...americanBase.map(sound => ({ ...sound, ...americanOverrides[sound.id] })), ...americanRhotic],
};
export const IPA_ACCENTS = {
  uk: { label: "British English", short: "UK", lang: "en-GB", description: "Traditional Southern British teaching model", note: "44 traditional teaching symbols. Some modern British vowels differ; /ɪə/, /eə/ and especially /ʊə/ vary between speakers." },
  us: { label: "American English", short: "US", lang: "en-US", description: "General American teaching model", note: "41 sound cards, including stressed and unstressed r-colored vowels. This is a teaching display, not a universal phoneme count. Regional mergers and variations are normal." },
} as const;

export type IpaRecording = { src: string; reviewedBy: string; reviewedAt: string; source: string };
export type IpaAudioManifest = Partial<Record<IpaAccent, Record<string, { sound?: IpaRecording; words?: Record<string, IpaRecording> }>>>;

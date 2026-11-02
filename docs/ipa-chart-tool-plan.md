# Interactive IPA Chart Tool — Phase 1 Plan

**Product type:** Open learner reference/practice tool, not a lesson activity or course assessment.
**Proposed route:** `/ipa-chart`
**Navigation:** Learner sidebar, under **Practice**, near AI Tutor; include the same destination in the mobile learner menu.
**Phase boundary:** Phase 1 is an interactive chart, sound models, and sound/word detail. Learner recording, automated assessment, saved pronunciation progress, and AI coaching belong to Phase 2.

## 1. Product goal

Give any learner a fast, browsable reference to English phonemes. Let them switch between a clearly defined British English model and American English model, see vowels and consonants in a phonemic chart, play a reviewed audio model, and understand how a phoneme appears in an example word. The chart should work as a useful tool without requiring course enrollment or an assigned activity.

## 2. Important inventory decision

The “44 sounds” figure is a common teaching convention, usually describing a particular English pronunciation model. It is not one universal inventory shared by British and American English. The vowels and some phonemic contrasts differ by accent and by the exact variety chosen. A chart should therefore name its reference varieties and explain that pronunciation varies among speakers.

For an initial editorial baseline, use **Standard Southern British English (SSBE)** and **General American (GA)**, with a phoneme inventory reviewed by an English phonetics specialist. Keep the 44-sound teaching inventory as the SSBE/reference convention if the reviewed source supports it. Do not force the GA chart to contain 44 by relabeling sounds. Show each chart's inventory count and describe it as a selected teaching model. Record accepted allophones and common regional variants in the sound detail, not as contradictory errors.

Before content entry, resolve and document:

- Which precise accent model is called “British” and “American” in the interface.
- Which vowels are phonemes for each model, including rhotic vowels and mergers.
- Which allophonic or regionally variable pronunciations are mentioned but not counted as separate chart phonemes.
- Which IPA transcription convention and example-word variants are used.

## 3. Phase 1 learner experience

1. Learner opens **IPA Chart** from the Practice group in desktop or mobile navigation.
2. A compact introduction explains what phonemic symbols represent and notes that accent models vary.
3. Learner selects **British English** or **American English**. The selection updates the chart, voice samples, example words, and inventory count together.
4. Learner uses category tabs/filters: **All sounds**, **Vowels**, **Consonants**; optional grouped navigation for monophthongs, diphthongs, and consonant families.
5. Phonemes appear as large, touch-friendly selectable tiles in a conventional vowel quadrilateral and consonant grid. Each tile includes the IPA symbol and a small play affordance.
6. Selecting a tile marks it as active and opens a detail panel. The selected symbol appears larger, with the sound label, category, voiced/voiceless status where relevant, a short articulation/description, model audio, and example word(s).
7. In the example word, highlight the exact grapheme or graphemes representing the target phoneme. Include a note when spelling-to-sound correspondence is irregular or varies.
8. Learner can play the whole example word separately from the isolated/carrier sound model. The mock may use sample interactions; the production audio will be curated assets.

## 4. Visual and interaction requirements

### Chart structure

- Vowels are arranged by tongue height/frontness in the recognizable vowel trapezoid. Distinguish monophthongs from diphthongs by visual treatment and a legend.
- Consonants are arranged by place and manner of articulation, with voiceless/voiced pairs adjacent where feasible. Show other consonants separately.
- Rhotic/variety-specific vowels can use an explicitly labeled section when they do not fit the same vowel chart cleanly.
- Category labels and symbol names remain visible or available through accessible labels; color is never the only carrier of meaning.
- Responsive layout: on narrow screens, preserve logical grouping and tap targets; allow horizontal scrolling only for the chart region if a stacked presentation would be clearer.

### Color system

- Vowels and consonants have distinct semantic hues, drawn from BrenUp design tokens.
- Within vowels, monophthongs and diphthongs use related light/deep shades or a second non-color cue (badge/shape/label).
- Voiced and voiceless consonants use an additional visible state such as paired labels, border treatment, or small badge. Avoid multiplying shades until combinations become unreadable.
- Meet contrast requirements for text and focus indicators in both light and dark surrounding surfaces. Provide a text legend and do not rely on hue alone.

### Selected-sound panel

Show:

- IPA symbol, e.g. `/iː/`.
- Human-readable sound label and feature/category.
- Play control and speaking model label, e.g. “British English model” or “General American model”.
- One or two familiar example words.
- A marked-up word with target spelling letters highlighted, not merely the whole word underlined.
- A short sound-placement explanation, written for the learner's CEFR range.
- A short note where useful about accent variation or spelling irregularity.

The learner's requested recording/practice flow is explicitly out of Phase 1. The UI can show a modest “Speaking practice — coming in Phase 2” affordance only if it does not suggest recording is already enabled.

## 5. Audio plan

### Asset generation and editorial QA

Use Gemini text-to-speech as a **candidate audio-generation tool**, not as the final authority on phonetic correctness. Current Gemini TTS supports controllable single- and multi-speaker generated audio and allows guidance for accent, pace, and style ([official Gemini TTS documentation](https://ai.google.dev/gemini-api/docs/speech-generation)). However, an isolated IPA symbol is not a dependable spoken prompt: a TTS model may read the symbol name, add a schwa, or produce an unnatural sound in isolation. Use carefully designed carrier syllables/words, allow the symbol-to-sound relationship to be checked by a pronunciation specialist, and record the approved model and transcript for every asset.

Recommended production workflow:

1. Prepare an editorial asset manifest per phoneme: model variety, IPA, example word, highlighted letters, prompt/transcript, target speaker/style, source/model, and review state.
2. Generate candidate isolated or carrier-phrase audio plus a natural example-word recording for each variety.
3. Listen to each candidate against the intended variety and target phoneme; reject outputs with wrong vowels, stress, added syllables, or drift from the requested model.
4. Have a qualified pronunciation editor approve the spoken realization and the example/transcription pair. Where TTS cannot reliably produce the target, commission a recorded human model.
5. Normalize audio volume and trim silence without cutting the phoneme onset or offset. Keep source and approved masters; export web-optimized assets.
6. Store audio as static, versioned assets on the existing media/CDN path. Do not generate TTS on each learner click; playback should be quick, consistent, and inexpensive.
7. Provide attribution/source and review date in the content manifest. Re-review when replacing a model or voice.

Phase 1 does not need a live Gemini generation endpoint. It needs a reviewed, stable audio library. This avoids exposing model keys, adding latency/cost, and presenting unverified phonetic content to learners.

## 6. Content model

Keep chart data in a version-controlled, schema-validated dataset rather than embedding content in UI components. Suggested fields:

```ts
type PhonemeEntry = {
  id: string;
  variety: "SSBE" | "GA";
  ipa: string;
  label: string;
  category: "VOWEL" | "CONSONANT";
  vowelType?: "MONOPHTHONG" | "DIPHTHONG";
  voicing?: "VOICED" | "VOICELESS" | "NOT_APPLICABLE";
  place?: string;
  manner?: string;
  chartPosition: { group: string; row?: number; column?: number };
  description: string;
  examples: Array<{
    word: string;
    ipa: string;
    targetSpellingSegments: string[];
    audioAsset: string;
  }>;
  phonemeAudioAsset: string;
  variants?: string[];
  editorialStatus: "DRAFT" | "REVIEWED" | "PUBLISHED";
  sourceNotes?: string;
};
```

Validate that each referenced audio path exists, IDs are unique within a variety, highlighted spelling segments occur in the example word, chart positions are valid, and published entries have reviewer approval. Avoid automatically generating IPA or claims about voiced/voiceless status without editorial verification.

## 7. Platform implementation plan

1. **Route and access:** Add `/ipa-chart` as a learner-facing reference tool with no course or assignment dependency. Follow the app's existing learner-shell conventions. Clarify whether logged-out visitors should also access it; the learner-menu requirement guarantees access for learners but does not alone define anonymous access.
2. **Navigation:** Add an **IPA Chart** entry to `components/LearnerSidebar.tsx` in Practice, and the matching mobile drawer link in `components/LearnerAppShell.tsx`. Add an active route key and breadcrumb/title handling. Reuse established icons and semantic tokens.
3. **Dataset:** Add reviewed variety-specific JSON/TypeScript data and audio files. Keep British and American selection state at the page level so the chart, detail, examples, and audio never become out of sync.
4. **Chart UI:** Build keyboard-accessible vowel and consonant chart components with selected state, playback controls, and responsive behavior. Use buttons with labels such as “Play /iː/, long vowel, British English”; ensure arrow/navigation behavior is predictable.
5. **Detail panel:** Render pronunciation notes and selectively highlighted spelling sequences safely from structured data. Include a clear no-selection state and a selected state.
6. **Phase boundary:** Do not write learner recording or scoring into quiz/lesson activities. Keep the public chart independent. Phase 2 may add optional microphone recording and practice history after separate design and assessment decisions.
7. **Content governance:** Only reviewed entries/audio are visible as published chart content. Preserve source provenance, version dataset changes, and obtain editorial sign-off for inventory and audio.

## 8. Accessibility, quality, and acceptance criteria

- Learner can switch variety and category entirely by keyboard and screen reader.
- Active phoneme has a visible focus/selection treatment independent of color.
- Audio controls have clear accessible names and distinguish sound-model from example-word playback.
- The chart remains usable on phone, tablet, and desktop; selected details remain discoverable without hover.
- Color distinctions pass contrast checks; labels and icons redundantly encode categories.
- Every published symbol, label, example, highlighted spelling segment, and audio is reviewed against the stated variety.
- British/US changes update the full content context in one action; no stale detail or stale audio remains selected.
- Inventory count reflects the declared teaching model and is not hard-coded as 44 for both accents.
- The tool is reachable from desktop and mobile learner Practice navigation without course enrollment.
- No recording or learner voice data is collected in Phase 1.

## 9. Delivery sequence

### Phase 1A — Editorial specification

Select SSBE and GA definitions, source a reputable reference inventory for each, decide IPA conventions and example words, and get a pronunciation specialist to review the inventories and sound prompts. Build the asset manifest.

### Phase 1B — Static UI prototype

Implement the responsive route and mock dataset/audio placeholders. Add the chart/detail interactions and desktop/mobile Practice navigation. Review the chart against the complete design on small screens and keyboard-only navigation.

### Phase 1C — Audio and content integration

Generate/record candidate assets, obtain editorial approval, add approved assets to static hosting, then connect them to the chart. Replace all mock entries with the reviewed inventory.

### Phase 1D — Release checks

Run repository typecheck, lint, and production build; check mobile/desktop layout, keyboard/screen-reader labels, each audio asset, accent switching, category filters, and chart inventory counts. Have a pronunciation specialist do a final content review before release.

### Phase 2 — Speaking practice (deferred)

Add optional learner recording, replay, guided self-monitoring, feedback, and progress only after deciding privacy, retention, scoring, and how accent variation/uncertainty will be handled. The chart and its audio library should remain useful without Phase 2.

## 10. Key risks and controls

| Risk | Control |
|---|---|
| Treating “44 sounds” as universal | Label the chosen accent varieties and show reviewed, variety-specific counts. |
| TTS pronounces an IPA glyph name or gives a poor isolated sound | Generate candidates using phonetic context; require expert listening review; use human recordings when needed. |
| Learner misreads highlighted spelling as a one-letter/one-sound rule | Highlight exact spelling segment and add irregular correspondence notes. |
| Colors become confusing for overlapping categories | Use a restrained palette plus textual/shape cues; test contrast. |
| Scope expands into an assessment product | Keep microphone practice and learner scoring explicitly in Phase 2. |
| Route accidentally inherits paid/course restrictions | Treat this as an open reference tool in the learner shell, independent of course enrollment; make anonymous access an explicit product decision. |

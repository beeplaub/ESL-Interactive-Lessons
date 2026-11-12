# Sound Surge — Game Plan

**Status:** Concept and storyboard only. This document is a planning artifact; the game has not been implemented.

**Working name:** Sound Surge
**Product area:** Standalone game in BrenUp Games, separate from lesson activities.
**Primary source:** The current interactive IPA Chart and its approved, accent-specific phoneme audio.

## 1. Purpose

Sound Surge is a fast, replayable sound-recognition arcade game. The learner hears a phoneme and reacts by choosing the matching IPA gate while a runner moves forward automatically. The game should feel like a small arcade experience, not another sequence of quiz cards or a new IPA transcription exercise.

The first version should reuse the existing chart inventory, phoneme identifiers, accent choice, and approved sound recordings. It should not depend on a new dictionary, word-stress dataset, learner speech recording, AI assessment, or phrase-level recordings.

## 2. Experience goals

- Make listening and phoneme recognition the core skill.
- Give the learner an immediate, visible consequence for each choice: gate clear, combo rise, shield loss, or round end.
- Keep each attempt short enough to replay, while varying sound order and distractors so repeated rounds do not feel identical.
- Use the chart as the source of truth so reviewed chart sounds can become game content without maintaining a second sound list.
- Keep the visual style close to the supplied storyboard: deep indigo game world, violet glows, coral actions, clean white labels, and a friendly runner.
- Be explicit that the score reflects correct sound identification and timing; it is not a pronunciation-quality score.

## 3. Relationship to existing experiences

Sound Surge is a standalone game, not a lesson activity.

- **IPA Practice Lab** supports transcription, sound comparison, and phoneme sorting.
- **Listen & Build IPA** asks learners to hear a word and construct its IPA sequence.
- **Echo Vault / IPA Sound Quest** is a question-led adventure with decode, transcription, and sound-identification challenges.
- **IPA Snakes and Ladders** uses question answers to move across a board.

Sound Surge should use a continuous arcade lane loop: automatic forward movement, approaching gates, quick sound recognition, combos, and escalating pace. It should not become another transcription round or board game.

## 4. Chart data and audio

### Reuse from the IPA Chart

- Chart sound ID and IPA symbol.
- British or American accent selection.
- Approved audio for the selected phoneme and accent.
- Optional chart example words, IPA transcriptions, and example-word audio for post-round review.
- Current chart inventory and active/inactive state, subject to the chart's existing rules.

### Audio rules

- Play only the approved chart phoneme clip for the selected accent.
- Do not use browser speech synthesis, TTS, or another fallback voice.
- If a phoneme has no usable approved clip for the selected accent, leave it out of that round's candidate pool. Do not show a playback error or silently substitute another sound.
- Load the game sound manifest once per game session and reuse the returned chart assets during the round.
- Do not upload learner audio; Sound Surge does not need a microphone.

### Candidate pool

Build candidate sounds from active chart entries with valid approved audio for the selected accent. A round should select one correct sound and plausible distractors from that same accent. Distractors should be distinct symbols and, where possible, acoustically confusable sounds. Avoid impossible rounds where symbols repeat or no valid target exists.

## 5. Game loop

1. Learner selects British or American English. British may be the initial default, consistent with the current chart/game conventions.
2. Learner starts a run. Score, combo, and shields initialize at zero, zero, and the configured starting value.
3. The runner moves forward automatically. A target phoneme clip plays, with a replay control available before the gate reaches the decision point.
4. Several IPA-symbol gates approach in separate lanes. The learner taps the lane containing the sound heard.
5. On a correct choice, the runner passes through the gate, the gate clears with a short animation, points are added, and the combo increases.
6. On a wrong or late choice, the learner loses a shield and the combo resets. A short, clear visual cue identifies the correct chart sound after the response.
7. Speed and distractor difficulty increase gradually. The run ends when the learner completes the round or loses all shields.
8. The results screen shows score, best streak, correct-answer rate, and sounds to review. Review cards can replay the approved phoneme and show a chart example word if one is available.
9. Learner can replay immediately with a newly randomized sound sequence.

## 6. Storyboard screen specification

The current concept image is a four-panel, two-column by two-row storyboard. It is a visual direction, not a pixel-perfect production spec.

### Screen 1 — Start

- Deep indigo rounded panel with a small violet `1. START` badge at the upper-left.
- Large centered `Sound Surge` title; `Surge` receives the coral accent.
- Decorative multicolor sound-wave artwork below the title.
- British/American segmented control near the lower third of the screen.
- Large coral `Start Game` button at the bottom.
- No gameplay score or runner on this screen.

### Screen 2 — Listen

- Small `2. LISTEN` step badge at the upper-left.
- Shields/lives at the upper-left of the play HUD; score at the upper-right.
- Target audio control near the upper-center.
- Three luminous IPA gates in separate lanes, approaching the runner. The storyboard shows `/s/`, `/ʃ/`, and `/θ/` as an example set.
- Runner is viewed from behind near the bottom-center and moves toward the decision point.
- Learner selects a gate by tapping its lane.

**Important refinement:** The concept image displays the target glyph `/ʃ/` at the same time as the candidate gates. That reveals the answer and undermines audio recognition. Before implementation, decide whether to show only a waveform/replay button before the choice and reveal the symbol after the answer. Recommended default: keep the IPA target hidden until after the learner chooses.

### Screen 3 — Tap & Streak

- Same HUD and lane positions as the Listen screen to avoid layout shifts.
- Correct gate bursts or opens with violet/coral particle effects.
- Runner visibly passes through the selected lane.
- Combo badge appears above the cleared gate; score increases and shields stay intact.
- Incorrect choice gives brief, non-punitive feedback, costs one shield, and resets combo.
- Animation must respect reduced-motion settings.

### Screen 4 — Review

- Calm results card with total score and best streak across the top.
- `Missed Sounds` section with small review cards, each containing IPA symbol, replay control, and an optional chart example word.
- Coral `Play Again` action at the bottom.
- The storyboard's `Score: 300` and `Score: 600` are illustrative only. Production runs start at zero and award points only after correct responses.

## 7. Scoring and difficulty

### Scoring principles

- Score a response by matching the chosen gate's sound ID to the target sound ID.
- Award a base score for a correct choice and a modest streak bonus for consecutive correct answers.
- Do not award language proficiency, transcription, or pronunciation-accuracy marks.
- Show the target symbol after the answer so a wrong response becomes a small learning moment.
- Late responses should be treated consistently: either count as a miss or remove the opportunity without an extra penalty. Choose one rule during refinement.

### Difficulty progression

- Early rounds: slower approach speed and visually distinct sounds.
- Later rounds: slightly faster approach, more distractors, or closer sound contrasts.
- Keep the number of gates readable, especially on narrow screens; do not rely on color alone to distinguish correctness.
- Consider distinct short modes later (e.g. relaxed practice and timed arcade). Do not add multiple modes until the main loop is fun and understandable.

## 8. Engagement and replayability

Use player-facing game feedback rather than an accumulating question list:

- Fast gate-clear animation and clear haptic/visual response where supported.
- Combo meter and personal best streak.
- Short rounds and instant replay.
- Randomized sound order and distractors from the selected chart pool.
- Gradual speed curve, with a fair chance to replay a target sound.
- Optional milestones or cosmetic unlocks can be considered later; they must not block learning content or require a backend economy.

Do not add social rankings, daily pressure, streak-loss penalties, or paid power-ups in the first version.

## 9. Controls, accessibility, and responsive layout

- Mobile: large, separated lane targets that can be tapped with one thumb; keep audio replay and shields visible without scrolling.
- Desktop: support mouse, keyboard lane keys, and accessible focus states.
- Provide keyboard alternatives and semantic labels for each IPA gate.
- Use text/symbols and shape/animation cues in addition to color.
- Respect `prefers-reduced-motion`; provide a calmer gate transition and disable decorative looping animation.
- Ensure audio can be replayed, prevent overlapping clips, and show a clear playing state.
- Avoid tiny IPA glyphs, especially for symbols that look similar.

## 10. Data, privacy, and resource footprint

- No learner recording, transcript, speech recognition, or AI assessment.
- No learner audio upload to R2, Supabase, Vercel, or another service.
- The game needs chart reads and public/approved media playback only. Do not create a high-frequency server loop; movement, scoring, gates, and animations run in the browser.
- Personal best can initially remain in browser storage. Decide later whether cross-device progress is needed before adding database writes.
- Fetch chart data/audio manifest at game start and reuse it during the run instead of requesting it for every gate.

## 11. Open decisions for future refinement

1. Hide the target IPA symbol before the choice, or show it only after the answer? Recommended: hidden before choice.
2. How many gates should appear at once on mobile: two or three? The storyboard uses three.
3. Does one mistake cost a shield immediately, or should the first mistake only reset the combo?
4. What should end a round: a fixed number of gates, all shields lost, or both?
5. Should learners be able to replay the sound once freely, or should replay cost time only?
6. Should British/American be selected once per run or switchable between runs only?
7. Which chart sounds have enough perceptually suitable distractors for fair rounds?
8. Should personal best be local-only in the first version?
9. What original character art/animation source should be used in production?

## 12. Suggested implementation sequence — when approved later

1. Refine this plan and settle the open decisions.
2. Confirm sound manifest behavior, eligible sounds, distractor rules, and accent coverage against the live chart data.
3. Build a small playable browser prototype with one accent and a short fixed round.
4. Review the real layout on mobile and desktop; adjust the runner/gate timing and symbol readability.
5. Add randomized rounds, shields, combos, gradual difficulty, and the review screen.
6. Verify missing-audio behavior, accessibility, reduced motion, and that the game does not upload learner data or call server functions per frame.
7. Only then consider adding it as a standalone BrenUp Game.

**Next refinement note:** Revisit Word Stress Studio in a later pronunciation-planning session. It requires a curated multisyllabic word set, syllable boundaries, stress patterns, and reviewed model audio beyond the current chart inventory.

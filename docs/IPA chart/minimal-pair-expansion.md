# IPA Chart Minimal-Pair Expansion — Review Queue

## Status

This is the reviewed inventory and import plan transcribed from the user-provided list and updated with the user's clarifications. The database schema is live, and a creator-only idempotent importer is prepared. The complete 99-pair/185-word source set is in `lib/ipa/vowel-contrast-expansion.ts`; the import has not been run yet.

The source list describes the IPA as mainly British English. The reviewed catalog contains a separate Cambridge UK and US pronunciation for each unique spelling, plus an accent-specific target sound assignment. Syllable count, syllable boundaries, and lexical stress should be generated from each verified IPA transcription by the existing parser. Per the user's clarification, these are **target-vowel contrast pairs**: consonants, including final consonants, may differ if the intended vowel contrast is correct. Pair 25 (biting / beating) is removed.

## Data design notes

- Keep a stable pair ID and an explicit relationship between the two word IDs. A word catalog row alone does not preserve which pair it belongs to.
- The current sound-discrimination code derives candidate pairs by comparing phoneme-token sequences and keeps pairs differing in exactly one token. Therefore, a listed pair may not appear if its IPA, sound assignment, or syllable notation is inconsistent.
- The current catalog can store multiple sound-linked pronunciations per word and accent, but only one default pronunciation per word and accent. Import planning must handle a word reused in more than one pair without duplicating the word row.
- Check normalized spelling against active and archived records before import; reuse existing rows and reactivate archived matches instead of creating duplicates.
- Generate word audio only after the spelling, UK/US IPA, sound assignment, pair relation, and syllable data have been reviewed.

## Saved data model

- `ipa_chart_words` remains the one canonical row per normalized spelling. Repeated words such as *bed*, *pack*, and *lick* must point back to that row.
- `ipa_chart_word_pronunciations` remains the reusable accent-specific source of truth. Its new `source_url`, `part_of_speech`, and `target_syllable_index` columns record the dictionary entry, disambiguating POS when needed (for example, *live* as a verb), and the zero-based syllable containing the target vowel. The existing trigger derives `syllable_data` from IPA, so count, syllable segments, and stress stay alongside each pronunciation automatically.
- `ipa_chart_vowel_contrast_pairs` records the stable pair identity and source-list order. `ipa_chart_vowel_contrast_pair_pronunciations` links the exact UK or US pronunciation row on each side. Each accent-specific pair link is stored only when its target-vowel sound IDs differ.
- These are curated **target-vowel contrasts**, not necessarily strict minimal pairs. The activity should read the explicit pair links instead of trying to infer pair membership by comparing complete IPA strings. This keeps *foot/food* and other accepted coda differences usable without producing accidental pairs.
- Audio remains a separate reviewed asset. Pair data can be prepared now; an audio activity should expose a pair only when both accent-matched word recordings are approved.

## Review flags found in the supplied list

- Pair 29, **foot / food**, differs in its final consonant as well as its target vowel. The user confirmed that this is acceptable; retain it as a target-vowel contrast.
- Pair 70, **bun / born**, and pair 79, **bud / bard**, have an additional coda /r/ in American English. Under the user's target-vowel rule, both are retained as curated vowel contrasts; do not label them strict minimal pairs.
- Pair 25, **biting / beating**, is removed at the user's direction; *biting* has /aɪ/ in its first stressed syllable, not the listed /ɪ/ contrast.
- Pair 12, **mill / meal**, remains a target-vowel contrast in both accents, but Cambridge gives *meal* UK /mɪəl/ and US /miːl/. The UK side therefore maps KIT / NEAR; the US side maps KIT / FLEECE. The importer stores those actual accent-specific transcriptions and sound IDs.
- Several entries are uncommon, inflected, contracted, or potentially awkward as standalone learner vocabulary (for example *bock*, *mod*, *kip*, *who’d*, *cooed*, *sate*, *pate*). Their IPA is verified against the linked Cambridge entry; their later inclusion in a learner activity can be decided separately.
- UK and US pronunciations were reviewed separately; all 99 curated pairs have distinct target-vowel IDs in both accent charts.

After removing pair 25, the set has **99 pairs and 185 unique spellings**. The existing catalog check found 18 active matches and no archived matches, so import will create 167 word rows and reuse 18. The 99 pair rows yield 198 accent-specific pair links because all supplied contrasts remain distinct in both accents. Repeated spellings are represented once. The user confirmed that *foot/food* stays despite its final-consonant difference. Cambridge gives *bard* UK /bɑːd/ versus US /bɑːrd*. See [foot](https://dictionary.cambridge.org/pronunciation/english/foot), [food](https://dictionary.cambridge.org/pronunciation/english/food), [bard](https://dictionary.cambridge.org/pronunciation/english/bard), and [meal](https://dictionary.cambridge.org/pronunciation/english/meal).

## Fit with the current chart and activity code

- The chart's sound IDs are accent-specific. British /e/ is mapped to the US chart /ɛ/, British /ɒ/ to US /ɑ/, British /ɔː/ to US /ɔ/, and British /əʊ/ to US /oʊ/, with each word checked against its Cambridge US pronunciation.
- The word catalog stores spelling, per-accent IPA, target sound ID, spelling markup, and generated syllable/stress data. The new pair registry preserves the exact reviewed pair IDs separately.
- The current sound-discrimination endpoint discovers chart examples whose IPA token sequences differ by exactly one phoneme. That is narrower than the user's target-vowel contrast rule and would omit pairs such as *foot/food*. It does not preserve the supplied pair curation, so cataloging these words alone can surface unintended pairs or miss intended ones.
- The legacy expansion importer assumes fixed batches of six words for each sound section. This list has 185 unique spellings and crosses many vowel contrasts, so it needs a dedicated reviewed batch format or importer path; it should not be appended to that fixed six-word layout blindly.
- The sound-discrimination endpoint currently requires reviewed audio URLs before it returns a pair. Audio generation can happen later, but the exact pair registry and word/audio links should be ready first.

## Supplied pair inventory

The target contrast is copied from the user's source list and verified for UK and US IPA. Pair 25 is excluded; accepted coda differences remain curated vowel contrasts.

| ID | Word A | Word B | Supplied contrast | Review |
|---:|---|---|---|---|
| 1 | ship | sheep | /ɪ/–/iː/ | verified UK + US |
| 2 | sit | seat | /ɪ/–/iː/ | verified UK + US |
| 3 | bit | beat | /ɪ/–/iː/ | verified UK + US |
| 4 | fit | feet | /ɪ/–/iː/ | verified UK + US |
| 5 | fill | feel | /ɪ/–/iː/ | verified UK + US |
| 6 | lick | leak | /ɪ/–/iː/ | verified UK + US |
| 7 | live | leave | /ɪ/–/iː/ | verified UK + US |
| 8 | bin | bean | /ɪ/–/iː/ | verified UK + US |
| 9 | tin | teen | /ɪ/–/iː/ | verified UK + US |
| 10 | grin | green | /ɪ/–/iː/ | verified UK + US |
| 11 | chip | cheap | /ɪ/–/iː/ | verified UK + US |
| 12 | mill | meal | /ɪ/–/iː/ | verified UK + US |
| 13 | slip | sleep | /ɪ/–/iː/ | verified UK + US |
| 14 | sin | seen | /ɪ/–/iː/ | verified UK + US |
| 15 | knit | neat | /ɪ/–/iː/ | verified UK + US |
| 16 | pick | peak | /ɪ/–/iː/ | verified UK + US |
| 17 | rid | reed | /ɪ/–/iː/ | verified UK + US |
| 18 | still | steal | /ɪ/–/iː/ | verified UK + US |
| 19 | hill | heal | /ɪ/–/iː/ | verified UK + US |
| 20 | dim | deem | /ɪ/–/iː/ | verified UK + US |
| 21 | filling | feeling | /ɪ/–/iː/ | verified UK + US |
| 22 | licking | leaking | /ɪ/–/iː/ | verified UK + US |
| 23 | sitting | seating | /ɪ/–/iː/ | verified UK + US |
| 24 | slipping | sleeping | /ɪ/–/iː/ | verified UK + US |
| 25 | biting | beating | /ɪ/–/iː/ | removed at user's direction |
| 26 | full | fool | /ʊ/–/uː/ | verified UK + US |
| 27 | pull | pool | /ʊ/–/uː/ | verified UK + US |
| 28 | look | Luke | /ʊ/–/uː/ | verified UK + US |
| 29 | foot | food | /ʊ/–/uː/ | accepted: target vowel is the focus; final consonant may differ |
| 30 | soot | suit | /ʊ/–/uː/ | verified UK + US |
| 31 | could | cooed | /ʊ/–/uː/ | verified UK + US |
| 32 | hood | who’d | /ʊ/–/uː/ | verified UK + US |
| 33 | wood | wooed | /ʊ/–/uː/ | verified UK + US |
| 34 | should | shooed | /ʊ/–/uː/ | verified UK + US |
| 35 | bad | bed | /æ/–/e/ | verified UK + US |
| 36 | bat | bet | /æ/–/e/ | verified UK + US |
| 37 | pat | pet | /æ/–/e/ | verified UK + US |
| 38 | man | men | /æ/–/e/ | verified UK + US |
| 39 | pan | pen | /æ/–/e/ | verified UK + US |
| 40 | sat | set | /æ/–/e/ | verified UK + US |
| 41 | ham | hem | /æ/–/e/ | verified UK + US |
| 42 | jam | gem | /æ/–/e/ | verified UK + US |
| 43 | mass | mess | /æ/–/e/ | verified UK + US |
| 44 | gas | guess | /æ/–/e/ | verified UK + US |
| 45 | fan | fen | /æ/–/e/ | verified UK + US |
| 46 | tan | ten | /æ/–/e/ | verified UK + US |
| 47 | pack | peck | /æ/–/e/ | verified UK + US |
| 48 | tack | tech | /æ/–/e/ | verified UK + US |
| 49 | land | lend | /æ/–/e/ | verified UK + US |
| 50 | band | bend | /æ/–/e/ | verified UK + US |
| 51 | bid | bed | /ɪ/–/e/ | verified UK + US |
| 52 | pat | pit | /æ/–/ɪ/ | verified UK + US |
| 53 | pan | pin | /æ/–/ɪ/ | verified UK + US |
| 54 | cap | kip | /æ/–/ɪ/ | verified UK + US |
| 55 | tap | tip | /æ/–/ɪ/ | verified UK + US |
| 56 | bat | bit | /æ/–/ɪ/ | verified UK + US |
| 57 | sack | sick | /æ/–/ɪ/ | verified UK + US |
| 58 | back | beck | /æ/–/e/ | verified UK + US |
| 59 | lack | lick | /æ/–/ɪ/ | verified UK + US |
| 60 | pack | pick | /æ/–/ɪ/ | verified UK + US |
| 61 | cut | cot | /ʌ/–/ɒ/ | verified UK + US |
| 62 | hut | hot | /ʌ/–/ɒ/ | verified UK + US |
| 63 | luck | lock | /ʌ/–/ɒ/ | verified UK + US |
| 64 | duck | dock | /ʌ/–/ɒ/ | verified UK + US |
| 65 | buck | bock | /ʌ/–/ɒ/ | verified UK + US |
| 66 | much | mock | /ʌ/–/ɒ/ | verified UK + US |
| 67 | stuck | stock | /ʌ/–/ɒ/ | verified UK + US |
| 68 | suck | sock | /ʌ/–/ɒ/ | verified UK + US |
| 69 | sung | song | /ʌ/–/ɒ/ | verified UK + US |
| 70 | bun | born | /ʌ/–/ɔː/ | verified UK + US |
| 71 | cub | cob | /ʌ/–/ɒ/ | verified UK + US |
| 72 | dull | doll | /ʌ/–/ɒ/ | verified UK + US |
| 73 | come | calm | /ʌ/–/ɑː/ | verified UK + US |
| 74 | fund | fond | /ʌ/–/ɒ/ | verified UK + US |
| 75 | mud | mod | /ʌ/–/ɒ/ | verified UK + US |
| 76 | but | bought | /ʌ/–/ɔː/ | verified UK + US |
| 77 | cup | cop | /ʌ/–/ɒ/ | verified UK + US |
| 78 | bus | boss | /ʌ/–/ɒ/ | verified UK + US |
| 79 | bud | bard | /ʌ/–/ɑː/ | verified UK + US |
| 80 | word | ward | /ɜː/–/ɔː/ | verified UK + US |
| 81 | heard | hard | /ɜː/–/ɑː/ | verified UK + US |
| 82 | bed | bird | /e/–/ɜː/ | verified UK + US |
| 83 | men | main | /e/–/eɪ/ | verified UK + US |
| 84 | sell | sail | /e/–/eɪ/ | verified UK + US |
| 85 | met | mate | /e/–/eɪ/ | verified UK + US |
| 86 | set | sate | /e/–/eɪ/ | verified UK + US |
| 87 | wed | weighed | /e/–/eɪ/ | verified UK + US |
| 88 | red | raid | /e/–/eɪ/ | verified UK + US |
| 89 | get | gate | /e/–/eɪ/ | verified UK + US |
| 90 | pet | pate | /e/–/eɪ/ | verified UK + US |
| 91 | fret | freight | /e/–/eɪ/ | verified UK + US |
| 92 | said | side | /e/–/aɪ/ | verified UK + US |
| 93 | bread | brayed | /e/–/eɪ/ | verified UK + US |
| 94 | tread | trade | /e/–/eɪ/ | verified UK + US |
| 95 | not | note | /ɒ/–/əʊ/ | verified UK + US |
| 96 | cod | code | /ɒ/–/əʊ/ | verified UK + US |
| 97 | rob | robe | /ɒ/–/əʊ/ | verified UK + US |
| 98 | hop | hope | /ɒ/–/əʊ/ | verified UK + US |
| 99 | rod | road | /ɒ/–/əʊ/ | verified UK + US |
| 100 | stock | stoke | /ɒ/–/əʊ/ | verified UK + US |

## Import preparation checklist

- [x] Verify Cambridge UK and US IPA for every unique spelling. For inflected forms without their own Cambridge pronunciation page, derive the form from the Cambridge base-verb entry and preserve that source link.
- [x] Confirm all 99 pairs have target-vowel contrasts in both accents; consonants may differ.
- [x] Assign each pronunciation to its accent-specific chart sound and highlight the target spelling.
- [x] Check the 185 spellings against active and archived catalog records: 18 active matches and no archived matches.
- [x] Confirm IPA parsing produces syllable count, boundaries, and stress data automatically.
- [x] Preserve each pair relation explicitly for future learner activities.
- [x] Prepare a protected, retry-safe admin importer; new records remain inactive until their accent links are complete. The import does not generate audio.
- [ ] Run the creator-only import workflow after this code is available in the app, then verify live counts, pair links, accent IPA, and generated syllable data.

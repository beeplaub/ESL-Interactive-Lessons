# Lesson Player Templates — Implementation Plan

**Status:** Implemented locally on `main`; verification passed; awaiting push  
**Companion brief:** [Lesson Player Templates and Autoplay — Work Order](./lesson-player-template-and-autoplay-work-order.md)
**Scope:** Creator authoring, four lesson templates, conversion and publishing rules, learner player sequence, progress, narration timing, and compatibility

## 1. Purpose

Turn the approved product work order into a repository-specific implementation sequence. This plan maps the requested behavior to BrenUp's current Next.js, Supabase, lesson builder, player, and progress code.

## Implementation update

The implementation follows the later product decision to preserve the existing creator slide list and Learn/Practice editor tabs. Creators do not choose a template during lesson creation. A setting controls whether the learner sees the existing slide-by-slide flow or all Learn slides followed by Practice. Learn-only and Practice-only outcomes are resolved from the content present at publish time. The original four-template architecture below is retained as the planning baseline; where it conflicts with this update, this update describes the shipped local behavior.

The current lesson flow remains the compatibility baseline. Existing lessons must open as **Learn And Practice (LAP)**, and implementation must preserve course placement, access control, slide and activity records, learner attempts, notes, media, and publishing behavior.

## 2. Product rules this plan implements

| Template | Learner sequence | Autoplay |
|---|---|---|
| **LAP — Learn And Practice** | Each authored slide has Learn and Practice tabs. Learners choose when to move between them and between slides. | No autoplay setting. |
| **LTP — Learn Then Practice** | All Learn slides, a system-owned Start Practicing screen, then all Practice slides. | Available for the Learn phase only. The phase boundary requires a learner click; Practice stays manual. |
| **LO — Learn Only** | Learn slides only; normal lesson completion after the final slide. | Available throughout the Learn sequence. |
| **PO — Practice Only** | Practice slides only; learners advance at their own pace. | No autoplay setting. |

All four templates begin with the same system-owned start screen design, outside authored lesson content. It shows the lesson title and a slide-sized visual area. The button says **Start Learning** for LAP, LTP, and LO, and **Start Practicing** for PO. Creators cannot edit or remove this screen.

Additional rules:

- New lesson authoring layout follows the selected template. LTP has separate Learn and Practice lists; LO and PO expose only their respective content areas.
- LTP creation does not require Learn-to-Practice links. One Practice slide maps to one Learn slide; a Learn slide may have multiple Practice slides or none.
- LTP-to-LAP conversion opens the link modal when mappings are missing. Every Practice slide must be linked before conversion completes. The modal is also available from lesson settings.
- LAP-to-LTP conversion uses the existing Learn/Practice pairs directly. Previously saved links are reused on later switches.
- Switching LAP/LTP to LO/PO hides the other content type but preserves it. Switching back can restore it.
- At publish, a combined lesson containing only Learn offers **Publish as LO** or **Return and add Practice**. A combined lesson containing only Practice offers **Publish as PO** or **Return and add Learn**. Both choices require creator confirmation. An empty lesson cannot publish. Learners see no missing-content message.
- If an LTP lesson has no Practice, the same publish confirmation offers LO or a return to add Practice. Publishing as LO requires explicit confirmation.
- Narration-duration autoplay advances one second after narration ends; when narration is missing, it uses the confirmed 30-second fallback. Fixed-duration autoplay waits for the longer of the configured duration and the narration duration, so it never cuts narration off.
- During autoplay, learners can navigate backward or forward; the selected slide becomes the new autoplay position. An inline Play/Pause control sits beside player navigation. Pause stops narration and preserves the remaining slide time; Resume continues from the same point. Manual navigation while paused keeps autoplay paused.

## 3. Current repository architecture

### Creator path

- `app/admin/lessons/new/page.tsx` creates a visual lesson shell through `createVisualLesson` in `app/admin/lessons/actions.ts`; the action creates a draft and an initial slide.
- `app/admin/lessons/[id]/builder/page.tsx` checks lesson access, then loads lesson, slides, Learn blocks, Practice activities, and course/outcome data.
- `components/LessonBuilderWorkspace.tsx` is the main builder. It has slide-level Learn/Practice preview modes, slide ordering, editing, preview, lesson settings, and publish controls.
- `app/admin/lessons/actions.ts` contains slide/block/activity mutations, lesson setting updates, and publishing actions. Mutations call `requireLessonAccess`.

### Learner path

- `app/lessons/[lessonId]/page.tsx` enforces authentication, course placement and enrollment rules, sequential unlocking, and published-lesson access. It loads the lesson, slides, blocks, activities, progress, attempts, and narration.
- `components/BuilderLessonPlayer.tsx` is the active lesson player. It renders the slide rail, Learn/Practice tabs, activities, notes, attempts, navigation, timer, and completion UI. `components/LessonPlayer.tsx` is not the component used by this route.
- `app/api/lessons/[lessonId]/progress/route.ts` saves `current_slide_number`, completion, and notes after checking the authenticated user and `userCanOpenLesson`. On completion it updates course progress and assessment rollups.
- `lesson_audio_files` is associated with slides by `slide_id`; the learner route resolves narration URLs and passes a `slideId → URL` map to `BuilderLessonPlayer`.

### Current data model constraints

- `lessons` has no template or autoplay columns today.
- `slides` is ordered by `slide_number`. A slide can own both Learn blocks (`lesson_blocks.slide_id`) and Practice activities (`lesson_slide_activities.slide_id`). This is how LAP is currently represented.
- `lesson_blocks` and `lesson_slide_activities` have stable row IDs and are used by assessment evidence and learner attempts. Do not recreate those records as a side effect of changing templates.
- `lesson_progress` currently stores a slide number rather than a stable player step. That is insufficient to resume inside a split Learn/Practice phase sequence without an adapter or additive progress fields.
- `BuilderLessonPlayer` is also reused by `components/whiteboard/LiveLessonStage.tsx` and instant live lessons. New standalone start screens and autoplay must not accidentally take control away from live-classroom navigation.

## 4. Recommended architecture

### 4.1 Store template and autoplay configuration on the lesson

Add a migration with a checked `lesson_template` value (`LAP`, `LTP`, `LO`, `PO`) defaulting to `LAP`. The migration must backfill or default every existing lesson to LAP without touching its slide, activity, block, course, or progress rows.

Store autoplay configuration on the lesson for templates that support it:

- `autoplay_enabled` (default off)
- `autoplay_mode` (`FIXED_DURATION` or `NARRATION_DURATION`)
- `autoplay_duration_seconds` for fixed mode

The 30-second missing-narration fallback is a product constant, not another mode or content row. Do not store start-screen settings: the start screens are mandatory, player-owned UI.

Database checks and server validation must reject unsupported combinations: LAP and PO cannot have autoplay enabled; LTP autoplay applies to Learn only; LO autoplay applies to Learn slides.

### 4.2 Add a stable phase-item layer

Do not overload `slide_number` as both creator order and learner step identity. Add a small lesson phase-item table as an adapter between existing content slides and template-specific presentation. Each item should have a stable ID, `lesson_id`, `slide_id`, content role (`LEARN`, `PRACTICE`, or compatibility `BOTH`), and position within its phase.

This layer supports both cases without duplicating content:

- A current LAP slide can back a Learn item and a Practice item that both reference the same `slides.id`.
- A new LTP lesson can use separate slides and phase items for each Learn and Practice entry.
- LO and PO use only the matching item role.
- The learner player derives ordered `PlayerStep` values from the phase items and template. System start and phase screens are step types in memory only, not database slides.

Add a link table for Practice phase item → Learn phase item. Enforce one Practice item per link, allow many Practice items to point to the same Learn item, and validate that both items belong to the same lesson. Use stable phase-item IDs, never slide position or slide number, for the mapping.

The first implementation task should be a short schema spike to validate this additive phase-item approach against slide insertion/reordering, narration attachment, and existing assessment relations before writing the final migration. If the spike finds that a phase-item table would duplicate too much existing structure, retain this stable-ID/phase-order contract and choose the smallest equivalent schema.

### 4.3 Build one normalized player sequence

Add a pure server/client-shared sequence resolver that accepts template, phase items, links, and source slides and returns a typed sequence, such as:

- `START_SCREEN`
- `LEARN_STEP`
- `START_PRACTICING`
- `PRACTICE_STEP`
- `LESSON_COMPLETE`

The resolver owns ordering and eligibility rules. Creator preview and learner playback must consume the same resolver so they cannot show different sequences.

For LAP, a presentation step groups one Learn item with zero or more linked Practice items. For LTP, emit all Learn items, a start-practice step only when Practice exists, then Practice items in order. LO emits Learn items only. PO emits Practice items only. A lesson with neither content type cannot publish.

### 4.4 Progress by stable player location

Keep `lesson_progress.current_slide_number` for compatibility. Add fields sufficient to resume by stable content and phase, such as `current_phase_item_id` plus the current view/phase. On read:

1. Prefer the new stable phase location when present.
2. For older progress rows, resolve `current_slide_number` against the LAP sequence.
3. If the saved item no longer exists, choose the nearest valid step and preserve completion/notes.

Built-in start screens do not count as authored progress. LAP tab changes remain within the same slide and should not mark a new slide complete. Completion is saved only at the end of the resolved sequence. Course completion and assessment rollups continue to run through the existing progress endpoint.

## 5. Detailed implementation sequence

### Phase 0 — Lock repository-level contracts

1. Record the existing behavior and call sites listed in Section 3.
2. Search all consumers of `slides.slide_number`, `lesson_progress.current_slide_number`, and `BuilderLessonPlayer` before modifying their semantics.
3. Confirm the new phase-item schema can coexist with `slides`, `lesson_blocks`, `lesson_slide_activities`, `lesson_audio_files`, learner attempts, and live-room slide selection.
4. Keep the migration additive. Do not rewrite course placements, lesson IDs, quiz IDs, attempts, or media paths.

**Exit condition:** The phase-item/link model and progress compatibility path are written down before the first migration is committed.

### Phase 1 — Database and generated types

1. Add `lesson_template` with default LAP and check constraint.
2. Add autoplay fields and constraints for the supported modes.
3. Create phase-item and Practice-to-Learn link tables with foreign keys, indexes, unique constraints, timestamps, and updated-at triggers where appropriate.
4. Enable RLS. Admin/authorized creator writes must follow existing lesson-access rules; learner reads are limited to published lessons. Do not widen published content access.
5. Add progress location fields while retaining `current_slide_number`.
6. Backfill LAP phase items for existing non-deleted slides. For each legacy slide, derive Learn and Practice presence from existing blocks and activities; preserve empty sides and stable source IDs. Create an automatic link for legacy paired sides.
7. Regenerate or update `types/database.types.ts` and verify migration ordering/idempotence.

**Exit condition:** Existing lesson rows resolve to the same LAP sequence before and after the migration, with no child-row rewrite.

### Phase 2 — Domain types, validation, and server actions

1. Define shared template, phase, autoplay, and player-step types in the lesson domain layer.
2. Implement the pure sequence resolver and template-content validators.
3. Add authorized server actions for template/settings changes and link edits. Every mutation rechecks `requireLessonAccess` and verifies all referenced IDs belong to the same lesson.
4. Save conversion template choice and mapping changes atomically. If the operation cannot be one transaction, design explicit rollback/retry behavior before release.
5. Validate publication server-side, not only in the UI. Route every publish entry point—including the header action and `MetadataForm` status field—through the same validation path.
6. Return structured publish outcomes for the creator confirmation dialog: publish current template, confirm LO/PO publication, or return to add missing content. Do not publish or send notifications before confirmation.
7. Preserve the existing notification behavior after a successful status transition.

**Exit condition:** Direct requests cannot bypass mapping, template compatibility, or publish-content rules.

### Phase 3 — Creator template workflow

1. Add a four-option template selector to the visual builder and new-lesson creation workflow. Existing lessons load as LAP.
2. Keep a single `LessonBuilderWorkspace`, but switch the authoring layout by template:
   - LAP: existing paired slide timeline and Learn/Practice tabs.
   - LTP: independent ordered Learn and Practice phase lists.
   - LO: Learn-only list and editor.
   - PO: Practice-only list and editor.
3. Keep editing on the existing content components: Learn blocks use `LessonBlockPreview` and block controls; Practice uses `InLessonActivitiesEditor` and existing activity actions.
4. Add phase-specific add, reorder, duplicate, trash, restore, and preview operations. Ensure position changes do not mutate the mapping key.
5. Add the autoplay panel only for LTP and LO. LAP and PO must not render an autoplay switch or timing controls.
6. Add an explicit no-Practice notice for LTP. This is creator-only UI; it must never appear in learner content.
7. Preview all four templates through the same player sequence resolver, including phase-boundary screens.

**Exit condition:** A creator can create a draft in each template and preview the exact learner sequence without changing the published learner route.

### Phase 4 — Conversion and mapping workflow

1. LAP → LTP: preserve Learn/Practice source content and phase ordering; create/reuse phase items and seed links from the existing per-slide pairing. No mapping modal is required.
2. LTP → LAP: if every Practice item already has a saved link, group it under its Learn item directly. If any link is missing, open the mapping modal before completing the template switch.
3. Mapping modal layout:
   - compact, scrollable Learn picker on the left and Practice picker on the right;
   - visible title/number and small preview for each selected item, with an expand option;
   - central **Link** action, enabled only when both items are selected;
   - after linking, advance to the next unlinked Practice item and suggest a Learn item;
   - show counts and linked/unlinked state; permit relink, unlink, undo, keyboard selection, and mobile stacked layout;
   - all Practice items must be linked exactly once before conversion completes; a Learn item may have zero or multiple Practice items.
4. Add the same mapping editor under lesson settings so existing mappings can be reviewed or corrected.
5. LAP/LTP → LO/PO: switch the learner presentation to the selected content role; hide but retain the other role and any links.
6. LO/PO → combined: open the selected builder as a draft and let the creator add the missing content. At publish, use the same symmetric content-type confirmation rules as LAP/LTP.
7. LO ↔ PO: retain source content; if the selected target lacks its content type, do not publish an empty target. Offer publish in the source Only template or return to add target content.
8. Canceling conversion or mapping leaves the previous template, saved links, and content unchanged.

**Exit condition:** All conversions are reversible at the presentation level and never silently delete content.

### Phase 5 — Learner start and phase screens

1. Add a player-owned start screen before the first authored item in all four templates. It shows the lesson title and uses the slide-area proportions.
2. Use the template-aware button label: Start Learning for LAP/LTP/LO; Start Practicing for PO.
3. Add the second player-owned screen only at an LTP Learn→Practice boundary when Practice items exist. Require a learner click on **Start Practicing**.
4. If publishing resolves to LO or PO, use that Only sequence and omit the LTP boundary screen.
5. Do not give built-in screens database slide IDs, activity records, progress counts, or analytics as if they were creator content.
6. Keep the fixed design system-owned and not editable in lesson settings.

**Exit condition:** Built-in screens appear at the right boundaries and cannot be inserted, reordered, deleted, or edited by a creator.

### Phase 6 — Player sequence and navigation

1. Extend the `/lessons/[lessonId]` data loader to fetch template settings, phase items, links, and the stable progress location.
2. Resolve a normalized player sequence on the server or through the shared resolver, then pass only learner-safe data to `BuilderLessonPlayer`.
3. Keep the current slide renderer and activity renderer. Select Learn blocks or Practice activities based on the resolved step, and aggregate multiple Practice items under a LAP Learn step without changing activity IDs.
4. Update next/previous, slide rail, mobile swipe, keyboard, deep-link (`slide`, `tab`, `activity`), retake, review, and completion controls to operate on player steps.
5. Map old `?slide=` and saved slide-number links to the correct current sequence. For LAP, preserve the selected tab when possible; for LTP, resolve to the matching Learn or Practice phase item.
6. On every step transition, save stable progress and continue to call the current course completion/assessment recalculation path only when the lesson is actually complete.
7. Preserve score aggregation, attempt history, notes keyed by original slide IDs, activity draft state, and per-activity evidence.
8. Add a player-context boundary: the new start screens and autoplay apply to the standalone lesson route. Keep live-classroom and instant-live teacher-controlled navigation on their existing path unless product explicitly expands scope.

**Exit condition:** Existing LAP lessons resume at their saved location; new phase templates resume by stable phase-item ID.

### Phase 7 — Autoplay engine

1. Implement autoplay only for LTP Learn items and all LO items. Do not expose or run autoplay in LAP or PO.
2. Start autoplay only after the learner selects the system start-screen button, satisfying the browser's user-gesture requirement for narration.
3. Fixed mode: use the creator-selected duration, but never advance before active narration ends. Effective step duration is `max(configured duration, narration duration)`; with no narration, use configured duration.
4. Narration mode: advance one second after the narration ends; when narration is absent, use the confirmed 30-second fallback.
5. Handle narration loading, failed playback, tab visibility, manual pause/resume, manual next/previous, retake, and unmount cleanup without duplicate timers.
6. Practice never auto-advances. The LTP phase boundary always pauses for **Start Practicing**.
7. Use the requested right-to-left transition for automatic step changes; honor reduced-motion preferences and avoid remounting activity state unnecessarily.

**Exit condition:** One timer/audio state machine owns advancement; no stale timer can move a learner after they pause, navigate manually, or leave the lesson.

### Phase 8 — Publish validation and Only-template fallback

1. Before publishing LAP/LTP, count Learn and Practice content by phase item, not by empty slide shell.
2. If only Learn exists, show **Switch to LO and publish** or **Return and add Practice**. If only Practice exists, show **Switch to PO and publish** or **Return and add Learn**.
3. If neither exists, block publish and direct the creator to add content.
4. After explicit confirmation, update template and status as one operation, then send existing publish notifications.
5. Preserve hidden content when switching to LO or PO; do not delete child rows or links.
6. Ensure the learner route receives the final published Only template and never sees a missing-content notice.

**Exit condition:** No publish route bypasses the confirmation or creates an empty public lesson.

### Phase 9 — Compatibility and rollout

1. Backfill old lessons to LAP and default autoplay off.
2. Keep course-item IDs, positions, assessment weights, outcome mappings, sequential unlocking, and paid/free-preview checks unchanged.
3. Preserve lesson, slide, activity, assessment, quiz, attempt, and media IDs/URLs. Keep existing AI lesson generation and draft/publish rules unchanged.
4. Keep creator permission rules and fresh server authorization checks on all new actions.
5. Keep live-classroom behavior stable through an explicit player context or adapter.
6. Add a feature rollout switch if needed to stage the new authoring UI while existing published LAP lessons remain readable.
7. Log template and conversion errors without writing learner private data or narration secrets.

**Exit condition:** The new templates can be enabled for creators while the existing learner flow continues to resolve as LAP.

## 6. File-level implementation map

| Area | Likely files |
|---|---|
| New lesson selection and builder layout | `app/admin/lessons/new/page.tsx`, `app/admin/lessons/actions.ts`, `components/LessonBuilderWorkspace.tsx` |
| Builder data loading | `app/admin/lessons/[id]/builder/page.tsx` |
| Template/settings/conversion/publish actions | `app/admin/lessons/actions.ts` and a focused lesson-template domain module |
| Learner data loading and course access | `app/lessons/[lessonId]/page.tsx` |
| Sequence resolver and player UI | New `lib/lessonPlayerSequence.ts` (proposed), `components/BuilderLessonPlayer.tsx`, `components/LessonContentTabs.tsx` |
| Narration timing | `components/BuilderLessonPlayer.tsx` and `NarrationPill` in the same component; `app/api/lessons/[lessonId]/narration/[slideId]/route.ts` only if metadata behavior needs adjustment |
| Progress persistence | `app/api/lessons/[lessonId]/progress/route.ts`, `types/database.types.ts`, progress loading in the lesson route |
| Database/RLS/types | New additive migration in `supabase/migrations/`, then `types/database.types.ts` |
| Reusable creator modal | New focused component near `components/LessonBuilderWorkspace.tsx`; use the existing `BuilderModalLayer` |

`components/LessonPlayer.tsx` is not on the current standalone lesson route; verify its remaining consumers before editing it. Avoid broad changes to shared renderer code that also serves live classroom.

## 7. Data safety and authorization requirements

- Never delete hidden Learn or Practice content during template selection.
- Link by stable IDs and validate both endpoints belong to the same lesson.
- Do not change course placements, published status, slide/activity IDs, assessment evidence, learner attempts, or media URLs as a side effect of previewing or canceling conversion.
- New server actions must use `requireLessonAccess` (or the appropriate existing fresh check) before service-role writes.
- New phase/link tables need RLS policies for creator/admin writes and published learner reads. Test policies with both draft and published lessons.
- Keep `ai_instruction` and other creator-only activity fields out of learner payloads as the current lesson route does.
- Do not write directly to production data as a migration substitute; migrations must be additive and reviewable.

## 8. Verification plan for the eventual feature implementation

No code checks are run for this planning document. When implementing the feature, verify the following through focused tests and the repository-required checks:

### Sequence and conversion cases

- Existing LAP with 1 Learn + 1 Practice pair still renders the same tabs and order.
- LAP → LTP renders all Learn items, boundary screen, then Practice items; no creator mapping step is required.
- LTP with ten Learn and five Practice items: links can target any Learn; multiple practices can share one Learn; every Practice is assigned before LAP conversion; unpaired Learn is allowed.
- LTP → LAP cancel leaves template and links unchanged; complete conversion groups activities under mapped Learn slides.
- LAP/LTP → LO/PO hides but retains the other content; switching back restores it.
- Only Learn / only Practice publish dialogs have correct choices, require confirmation, and never show missing-content copy to learners.
- LO ↔ PO cannot publish an empty target; original content remains available.
- PO/LTP/LAP/LO sequence order and their autoplay availability match the product matrix.

### Progress and learner state

- Existing progress rows resolve from `current_slide_number`; new rows persist stable phase-item IDs.
- Resume at Learn item, LTP phase boundary, Practice item, and completed state.
- Retake/review, deep links, course sequence unlocking, and course completion still work.
- Notes, attempts, scores, assessment evidence, and unsaved Practice responses remain attached to their original IDs.
- Start and phase screens do not count as authored progress or trigger lesson completion.

### Autoplay and media

- LAP and PO have no autoplay control and never auto-advance.
- LTP only auto-advances Learn; Practice requires learner navigation. LO auto-advances Learn.
- Narration mode: narration end + one second; absent narration uses 30 seconds.
- Fixed mode: short narration waits for fixed duration; longer narration finishes first; narration is never cut off.
- Pause, manual navigation, tab hiding, failed media, and unmount clear/resume timers correctly.
- Reduced-motion preferences disable or shorten the sweep without blocking navigation.

### Security and required checks

- Unauthorized creators cannot change template, links, autoplay, or publish state.
- Draft lesson content remains unreadable to learners; published content and link rows are readable only under existing access rules.
- Run `npm run typecheck`, `npm run lint`, and `npm run build` before accepting the implementation, as required by `AGENTS.md`.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Existing progress stores only slide numbers | Add stable player-step progress and keep a legacy fallback mapper. |
| LTP's independent lists do not fit the current paired-slide shape | Add a phase-item layer rather than changing content block/activity identity. |
| Mapping becomes invalid after reorder/delete | Map stable item IDs; on delete, require relink before LAP publish/conversion. |
| Publish fallback is bypassed by another status form/action | Centralize validation in the server publishing path and route all UI controls through it. |
| Autoplay timer races with narration or manual input | Use one cancellable state machine and `max(fixed, narration)` timing rule. |
| Shared player changes disrupt live classes | Isolate standalone lesson behavior behind explicit player context and regression-check live consumers. |
| Hidden content is accidentally lost | Template changes update visibility/sequence only; no child-row deletion. |

## 10. Decisions to confirm during implementation review

These do not block the product concept, but need concrete values before their UI or schema is finalized:

1. Fixed-duration minimum, maximum, and default; whether the duration is lesson-wide or per Learn item.
2. Final supporting copy and visual treatment for the fixed start screen.
3. Exact resume behavior when a learner returns to a built-in screen or LTP boundary.
4. Whether changing a published lesson's template requires a preview/confirmation before the change is saved.
5. The scope of the start screen/autoplay in live-classroom playback; this plan keeps the standalone route as the initial scope.

## 11. Implementation completion criteria

The feature is ready for review when all four templates can be created, previewed, converted under the rules above, published through validated creator flows, and played with correct progress/resume behavior; existing LAP lessons and course access remain intact; required typecheck, lint, and build checks pass; and the final user-facing changes are documented.

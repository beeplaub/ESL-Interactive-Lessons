# Lesson Player Templates and Autoplay — Work Order

**Status:** Product brief captured; implementation has been built locally  
**Audience:** Product, design, and engineering
**Scope:** Lesson templates, creator workflow, learner playback, start screens, and autoplay settings

## 1. Goal

Make the lesson player more flexible by letting course creators choose how learning and practice are sequenced. Preserve the current slide-by-slide experience, add a lesson-wide learning phase followed by a practice phase, and give creators optional control over how slides advance.

This document records the requested behavior and the decisions made during planning. The implementation later narrowed the creator workflow to the existing slide list plus a lesson setting; see the implementation plan for that update.

## 2. Template options

### Template A — Learn And Practice (LAP)

This is the current format. Each authored slide contains two tabs:

1. **Learn** — the teaching content for that slide.
2. **Practice** — practice directly connected to the teaching content on that slide.

Learners can move between the two tabs on each slide. This format suits creators who want learners to practise each concept immediately after learning it.

### Template B — Learn Then Practice (LTP)

This is the proposed new format. It separates the lesson into two consecutive phases:

1. **Learning phase:** all Learn slides appear first.
2. **Practice phase:** all corresponding Practice slides appear afterward.

For a lesson with ten Learn/Practice pairs, the learner sees ten learning slides followed by ten practice slides: twenty authored content slides in total. Each slide presents only its phase's content; there are no Learn and Practice tabs on these slides.

The practice slides should retain a clear relationship to the relevant learning content. The intended initial ordering is the same sequence as the learning phase: Learn 1–10, then Practice 1–10.

### Template C — Learn Only (LO)

This format contains Learn slides only. Learners move through the learning sequence without Practice content. Autoplay is available for LO, using either fixed duration or narration duration.

### Template D — Practice Only (PO)

This format contains Practice slides only. Learners move through the practice sequence at their own pace. Autoplay is not available for PO.

### How the templates share content rules

LO inherits the **Learn** content and narration behavior used by LAP's Learn tabs and LTP's learning phase. Its autoplay behavior follows LTP's learning phase.

PO inherits the **Practice** content, activity rendering, and learner-controlled progression used by LAP's Practice tabs and LTP's practice phase. It has no autoplay and no learning-to-practice transition screen.

This keeps the same Learn content behaving consistently wherever it appears, and the same Practice content behaving consistently wherever it appears. The selected template controls which content is shown and in what sequence.

## 3. Recommended creator workflow

Use one lesson builder with a lesson-level **Template** setting, rather than maintaining two separate builders. The selected template changes how the existing Learn and Practice content is arranged and previewed. This keeps authoring familiar while allowing the player to present the lesson in either sequence.

The creator workflow should be:

1. Create or open a lesson in the existing builder.
2. Choose **Learn And Practice (LAP)**, **Learn Then Practice (LTP)**, **Learn Only (LO)**, or **Practice Only (PO)**.
3. The builder changes its authoring layout to match the selected template: paired Learn/Practice slides for LAP; separate ordered phases for LTP; Learn-only slides for LO; Practice-only slides for PO.
4. For **Learn Then Practice (LTP)**, create and review the Learn and Practice phases independently. Slide linking is not required while creating an LTP lesson.
5. Configure autoplay when it is available for the selected template. The player start screens are fixed and are not creator settings.
6. Preview the learner experience, including phase transitions and autoplay, before saving or publishing through the existing workflow.

The builder should make the selected template visible and explain its learner-facing sequence. A single builder is the recommended starting point. Reconsider separate builders only if the content models or editing workflows become materially different.

### Converting an LTP lesson to LAP

Creating an **LTP** lesson does not require the creator to link Practice slides to Learn slides. The creator can arrange the two phases freely and work in the format's natural flow.

If the creator later changes that lesson to **LAP**, open a slide-linking modal before applying the new template. The creator can also open the same modal from the lesson settings to review or change links later.

The modal should provide:

- A compact, vertically scrollable Learn slide picker on the left and Practice slide picker on the right. Each side shows the selected slide's number and a small preview; selecting or scrolling to another item updates that preview.
- A **Link** button between the two pickers. It is enabled after one Learn slide and one Practice slide are selected.
- A visible linked/unlinked state and mapping progress, so the creator can see which Practice slides still need a Learn slide.
- Start on the first unlinked Practice slide. After **Link**, advance to the next unlinked Practice slide and a suggested Learn slide; the creator can scroll either picker to choose a different match.
- A simple way to change or remove a link, and a final review before applying the conversion.
- Slide titles or clear labels alongside slide numbers. The small previews should be expandable so creators can inspect content that is hard to identify in a thumbnail.
- Keyboard-accessible selection and linking controls; the interaction must not depend on dragging or touch scrolling alone. On narrow screens, stack the two pickers while keeping the selected pair visible.

Use stable slide IDs for the saved links, not slide positions or numbers. A Practice slide can link to one Learn slide; a Learn slide can have multiple linked Practice slides or none. In LAP, multiple linked Practice slides appear together in that Learn slide's Practice tab, in their existing order. A Learn slide with no linked Practice content remains a Learn-only slide, with no empty Practice tab.

Do not complete the conversion while any Practice slide is unlinked. This keeps all authored practice in the lesson and makes the creator resolve every placement instead of silently dropping content. For example, with ten Learn slides and five Practice slides, the creator links each of the five Practice slides to the intended Learn slide; the remaining Learn slides stay Learn-only. If all five are cumulative, the creator can link them to the final Learn slide.

Since lessons may contain many slides, keep the mapping progress visible and allow creators to revisit an earlier link without losing unsaved selections. If the product later offers automatic link suggestions, show them as editable suggestions for creator review; never silently treat slide order or matching counts as proof of the correct relationship.

Once the links are saved, later switches between LAP and LTP can reuse them without repeating the mapping step. Changing the template and saving the links should be one reviewable operation; canceling the modal leaves the lesson in its original template.

### Converting a LAP lesson to LTP

The reverse conversion should be direct because each existing LAP slide already contains its Learn and Practice content together. Reflow the Learn content into the learning phase and the Practice content into the practice phase, preserving their existing order and identifiers. Do not open the mapping modal for this direction.

After a creator has linked an LTP lesson and converted it to LAP, retain those links. If the creator switches back to LTP, restore the ordered phases without asking them to link again. Reopen the mapping modal only when an LTP-to-LAP conversion has Practice slides with no saved links.

### Conversion paths for LO and PO

The conversion paths below separate confirmed rules from decisions still needed. When LAP/LTP changes to LO or PO, show only the selected content type but hide and retain the other content so a later switch can restore it.

| From → To | Content that can carry over | Rule or decision point |
|---|---|---|
| LAP ↔ LTP | Both Learn and Practice content | Defined above; LTP → LAP requires linking each Practice slide to one Learn slide. |
| LAP/LTP → LO | Learn content | Show Learn content; hide and retain Practice content so it can be restored if the creator switches back. |
| LAP/LTP → PO | Practice content | Show Practice content; hide and retain Learn content so it can be restored if the creator switches back. |
| LO → LAP/LTP | Learn content | Allow the creator into the target builder and provide Practice authoring. At publish, if Practice is still absent, offer LO publication or return to add Practice. |
| PO → LAP/LTP | Practice content | Allow the creator into the target builder and provide Learn authoring. At publish, if Learn is still absent, offer PO publication or return to add Learn. |
| LO ↔ PO | Source content is preserved but the target content type is absent | At publish, offer to publish under the source Only template or return and add the target content type before publishing under the selected template. |

For any conversion, preserve source content and stable slide IDs unless the creator explicitly removes content. The target template should not silently discard the content it does not display.

## 4. Learner experience

### Fixed lesson start screen

Every lesson begins with the same system-controlled start screen design, regardless of template. It is part of the player, not lesson content, and the creator cannot remove or edit its design.

The screen shows the lesson title and includes a visual area with the same proportions as the lesson's slide area. A coral action button opens the first authored slide. Use **Start Learning** for LAP, LTP, and LO; use **Start Practicing** for PO. Autoplay begins only after this learner action.

### Learn Then Practice (LTP) transition

At the end of the final learning slide in **Learn Then Practice (LTP)**, show a second built-in player screen before the first practice slide. It uses the same general system-owned design and includes a coral **Start Practicing** button.

The learner must select the button to enter practice. This transition screen is not a creator-authored slide. Practice content does not autoplay in either template; learners advance through practice manually.

If a creator tries to publish an LAP or LTP lesson that contains Learn content but no Practice content, show a confirmation popup offering **Switch to LO and publish** or return to the selected combined template and **Add Practice**. If it contains Practice content but no Learn content, offer **Switch to PO and publish** or return and **Add Learn**. Switch and publish as LO or PO only after creator confirmation. If the creator chooses to add missing content, keep the selected LAP/LTP template and let them continue editing. Do not publish a lesson with neither Learn nor Practice content. Learners see no missing-content message; confirmed publication uses the appropriate LO or PO experience.

### Progress and navigation

The player should make the current phase and progress easy to understand. In **Learn Then Practice (LTP)**, learners should be able to tell when they have completed learning and entered practice. LO and PO have no phase-boundary screen. Progress should account consistently for authored slides; for a ten-Learn plus ten-Practice LTP lesson, the proposed total is 20 content slides, excluding built-in interstitials.

Existing lesson navigation, resuming, and completion behavior should be reviewed so that adding built-in screens does not mark a lesson complete early, skip authored content, or break saved progress.

## 5. Autoplay settings

Autoplay is available in **LTP** learning slides and throughout **LO**. It is not available in **LAP** or **PO**. LAP remains learner-controlled: autoplay there would either skip the slide's Practice opportunity or switch tabs without knowing when the learner has finished practising. PO practice remains learner-controlled.

When enabled for LTP or LO, the creator chooses one timing mode:

- In LTP, autoplay advances through the learning phase only. The **Start Practicing** screen requires a learner click, and the practice phase stays manual.
- In LO, autoplay advances through the Learn slides. After the final slide, the lesson completes normally.
- While autoplay is running, learners can use Previous/Next, swipe, or slide navigation to move in either direction. The newly selected slide becomes the current autoplay position and its own narration/timing starts; autoplay continues forward from there.
- Provide a visible Play/Pause control in the player's bottom navigation beside slide navigation. Pause stops both narration and slide timing while keeping the current slide. Resume continues narration and the remaining time on that slide. Manual slide changes while paused keep autoplay paused.

### Fixed slide duration

The creator sets a duration. The player advances automatically after that duration, whether or not the slide has narration. The requested initial transition is a simple right-to-left horizontal sweep.

### Match narration duration

The player uses the current slide's narration duration. When narration ends, the player advances to the next slide after a one-second delay. If narration is missing, use a **30-second fallback** so the lesson still advances. This fallback does not add another autoplay mode.

In fixed-duration mode, never change slides before the narration finishes. The effective wait is the longer of the fixed duration and the narration duration. If there is no narration, use the fixed duration. In narration-duration mode, let the full narration finish, then wait one second before advancing.

The creator should be able to preview the selected mode and timing.

## 6. Motion and playback expectations

- Start with a simple right-to-left slide transition; more transition styles can be developed later.
- Keep the transition short and consistent so it does not obscure slide content.
- Practice content is manual in all applicable templates and does not autoplay.
- Do not let autoplay silently discard an unfinished learner response on any slide where timed advancement is enabled.
- The Play/Pause control sits inline with Previous/Next and slide selection rather than floating over slide content. It is available only in an autoplay-enabled Learn phase.
- While autoplay is running, manual Previous/Next, swipe, and slide selection remain available. Changing slides resets timing and starts the selected slide's narration when present; autoplay then continues forward from the selected slide.
- Pause stops narration and timing without changing the current slide. Resume continues from the same narration position and the remaining slide time. Practice remains manual.
- Respect reduced-motion preferences and keep manual navigation available.

## 7. Settings summary

| Setting | Scope | Requested options |
|---|---|---|
| Lesson template | Lesson | Learn And Practice (LAP); Learn Then Practice (LTP); Learn Only (LO); Practice Only (PO) |
| Lesson start screen | Player behavior | Required, fixed system screen on every lesson; **Start Learning** for LAP/LTP/LO, **Start Practicing** for PO |
| Autoplay | Lesson | On / Off; available for LTP learning slides and LO only; hidden for LAP and PO |
| Autoplay timing | Lesson | Fixed slide duration; Match narration duration |
| Fixed duration | Lesson | Creator-selected duration; valid range and default to be decided |
| Slide transition | Player behavior | Initial default: right-to-left sweep |
| Phase transition | Learn Then Practice (LTP) | Required system screen; learner selects **Start Practicing** |

## 8. Confirmed decisions and remaining questions

1. **Naming:** The selected template labels are **Learn And Practice (LAP)** for the current format and **Learn Then Practice (LTP)** for the proposed format.
2. **Conversion direction:** Both LAP-to-LTP and LTP-to-LAP conversion are in scope. LAP-to-LTP reflows known Learn/Practice pairs directly; LTP-to-LAP opens the mapping modal when links are missing.
3. **LTP-to-LAP mapping rules:** Creating an LTP lesson does not require links. One Learn slide may have multiple linked Practice slides or none; each Practice slide links to exactly one Learn slide before conversion completes. A Practice slide cannot link to multiple Learn slides. Links use stable slide IDs and remain available from lesson settings.
4. **LAP behavior with no Practice:** A Learn slide with no linked practice remains Learn-only and has no empty Practice tab.
5. **Missing content at publish:** For LAP/LTP with only Learn content, ask the creator to confirm publishing as LO or return to add Practice. For LAP/LTP with only Practice content, ask them to confirm publishing as PO or return to add Learn. Do not publish an empty lesson. The learner sees no missing-content notice.
6. **30-second no-narration fallback:** Confirmed default when narration-duration mode is selected and a slide has no narration.
7. **Duration controls:** Choose the fixed-duration minimum, maximum, default, and whether one duration applies to every slide.
8. **Start screen visual details:** Confirm supporting text and background treatment. The screen is always present and not creator-editable.
9. **Progress and resume:** Confirm how a learner resumes at a built-in screen or phase boundary.
10. **Existing lessons:** Existing lessons default to LAP. Decide whether changing a lesson's template requires a preview or confirmation.
11. **Only-template conversions:** When LAP/LTP changes to LO or PO, hide the content type that the target does not show but retain it so it can be restored by switching back. LO and PO can enter a combined-template builder as drafts and add the missing content. If the selected template has only one content type at publish time, ask the creator to publish under the matching Only template or return to add the missing type. The same confirmation applies to LO ↔ PO.
12. **Availability:** Confirm whether these settings are available to all creators or restricted by existing creator permissions.

## 9. Compatibility and safety requirements

Implementation must preserve current lesson content, slide and activity identifiers, learner progress, media and narration URLs, creator permissions, and existing authorization checks. Template selection should affect presentation and sequence without unintentionally changing content ownership or publishing state.

Keep the current slide-by-slide experience as the default for existing lessons unless a migration decision explicitly says otherwise. Any conversion or migration path should be reviewable, reversible where practical, and should not silently overwrite creator-authored content.

## 10. Suggested delivery sequence

1. Confirm the decisions in Section 8.
2. Design the creator's template and playback settings, plus learner previews for both templates.
3. Define the lesson sequence and settings data shape while preserving existing lesson and activity references.
4. Implement the shared builder workflow and template-specific player sequence.
5. Add built-in start and phase-transition screens.
6. Add autoplay modes, narration timing, and the initial slide transition.
7. Verify existing lessons, new lessons in both templates, progress/resume behavior, and interactive practice behavior before release.

## 11. Acceptance criteria

- A creator can select **Learn And Practice (LAP)**, **Learn Then Practice (LTP)**, **Learn Only (LO)**, or **Practice Only (PO)** in the lesson builder and preview its learner sequence.
- The builder layout follows the selected template: paired slides for LAP, separate ordered phases for LTP, Learn-only slides for LO, and Practice-only slides for PO.
- LO uses the same Learn content and narration behavior as LAP/LTP and follows LTP's Learn autoplay rules.
- PO uses the same Practice activity rendering and manual progression as LAP/LTP Practice content; it has no autoplay or phase-transition screen.
- Creating an LTP lesson does not require slide linking.
- Switching LAP to LTP directly separates existing Learn and Practice content into the two phases; switching back reuses saved links.
- Changing an LTP lesson to LAP opens a link modal with compact Learn and Practice previews, vertical selection, a central Link action, and visible mapping status; the same modal is available from lesson settings.
- A Learn slide may have multiple linked Practice slides or none; each Practice slide must link to one Learn slide before conversion completes.
- LAP groups each Learn slide's linked Practice slides in that slide's Practice tab and shows Learn-only slides without an empty Practice tab.
- Canceling LTP-to-LAP mapping leaves the lesson and its content in the original LTP state; completing conversion does not discard any Practice slide.
- The existing template continues to show Learn and Practice tabs per slide.
- The new template presents all learning slides first and all corresponding practice slides afterward.
- All four templates begin with the same fixed, system-controlled start screen design; creators cannot remove or edit it.
- LTP presents a system-controlled **Start Practicing** screen at the phase boundary, and the learner must select it.
- Autoplay is available for LTP learning slides and LO slides; the autoplay option is hidden for LAP and PO.
- LO completes normally after its final Learn slide; PO practice slides remain manual.
- Practice content does not autoplay in any template.
- A LAP/LTP lesson with only Learn prompts the creator to switch to LO and publish or return to add Practice; one with only Practice prompts them to switch to PO and publish or return to add Learn. Both require confirmation; learners see no missing-content message.
- When switching LO ↔ PO, the creator can publish in the source Only template or return to add the target content type; the system never publishes an empty target lesson.
- Fixed-duration autoplay never interrupts narration: the slide remains until both the configured timer and any narration have finished. Narration-duration mode advances one second after narration ends, or after the 30-second fallback when narration is missing.
- Autoplay and transitions do not silently lose learner work or break lesson progress and resume behavior.
- Existing lesson content, identifiers, media references, permissions, and publishing state remain intact.

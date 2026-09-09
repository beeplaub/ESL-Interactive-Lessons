# Live classroom review — 9 September 2026

The classroom is a course-owned slide deck. A slide references a canonical lesson slide or owns a collaborative whiteboard. Teaching content and assessment IDs must remain canonical.

## Changes in this review

- Removed duplicate classroom branding, slogans, and decorative mountains.
- Widened the slide rail, wrapped titles, separated reorder/remove controls, and used application theme tokens.
- Aligned slide-list, activity control, chat/poll, voice-note and live-evidence access with active/completed course enrollment, preserving roster and teacher access.
- Allowed teacher activity controls to use imported canonical activities, and validated evidence against classroom slide references.
- Replaced periodic-only slide refresh with classroom invalidation broadcasts and authorized reloads.
- Added slides are selected immediately after the server accepts them; failed writes are visible and do not silently close the picker.
- Switched lesson rendering to explicit selected-slide state with request cancellation, loading/error states, and stable player identity. Canonical lesson and activity IDs are retained.
- Added independent whiteboard documents per slide. Existing shared content is preserved on the first existing whiteboard; the legacy document remains intact for compatibility.
- Made reordering transactional under a deferred unique constraint, with complete-list validation.
- Fixed removal of the selected slide after its foreign key is cleared.
- Put Point and Laser in the main toolbar, accelerated cursor updates, and highlighted the object under a shared cursor. Cursor positions are scoped to the whiteboard page.
- Added direct editing for text, sticky notes, and word cards; no text-entry dialog. Drawing shortcuts: V select, P pen, H highlighter, T text, E eraser, L laser.
- Enabled local slide navigation in completed-class review mode without changing the shared active slide.
- Configured JaaS to be available when its server credentials exist, unless explicitly disabled. A missing configuration is now visible in the call panel.

## Verification

- TypeScript, ESLint and production build.
- Fifteen actual-route tests, including activity controls, session state, chat/polls and voice-note access: course enrollment without roster membership, canonical slide references, roster membership, outsider/signed-out denial, and denial of learner writes.
- Database rollback checks: independent page prompts, reverse slide ordering, invalid slide ID rejection and student inability to unlock a board. All temporary changes rolled back.
- Verified that the production learner browser now receives the slide list that was previously empty.
- Verified the deployed teacher classroom layout in the browser.

## Operational dependency and limits

Production Vercel had no JAAS_APP_ID, JAAS_KEY_ID or JAAS_PRIVATE_KEY. The owner must enter these securely in Vercel production settings and redeploy before a call can be verified. No secret values were read or copied.

The sample class ended during verification. Simultaneous live interaction and an actual two-person JaaS call still need an active test session. Do not treat compilation or access tests as evidence of measured latency on different networks.

A whiteboard keeps the existing per-page limits of 250 objects and a 2 MB document. Pointer movement is ephemeral; durable edits retain revision checks. Conflicting edits are rejected rather than silently replacing another participant’s work.

# Instant classroom: shared stage and board

## Interface

- Fixed, centered drawing rail on desktop; horizontally scrollable drawing rail beneath the board on small screens.
- Separate slate/glass bottom rail with icon-above-label controls. Teacher: mic, camera, share, whiteboard, image, end/restart. Learner: mic, camera, share, image, leave.
- Copy link is teacher-only. Teacher selects gallery images for the shared stage; learner gallery thumbnails are read-only.
- Rich board text uses Tiptap, with the same rendered document while editing and viewing. Bold, italic, underline, color, size, lists and paragraph alignment are available. Enter inserts a paragraph. Double-click existing text to edit; use Select to move it.
- Images are first-class board objects. Select and drag; use the small corner handle to resize. Aspect ratio is preserved unless Shift is held.
- Both roles can zoom/pan the board and shared media locally.

## Synchronization

`instant_live_state` stores the latest board separately from the active stage and presenter lease. Reloads and late arrivals read this snapshot. The teacher saves completed changes with optimistic board revision checks. Incremental previews travel over Realtime while writing or dragging; saved snapshots remain authoritative.

The stage lease is acquired with a compare-and-swap on the state revision. Only one participant can present a screen, camera, or image at a time. Teachers can explicitly return to the whiteboard to stop the current presentation. Media presenters renew their lease every 20 seconds; an abandoned lease expires after 60 seconds. Pausing preserves stage state and disables local media tracks. Restart resumes the timer and re-enables existing tracks. A browser reload cannot restore permission to capture a screen or camera: the presenter must select it again.

The presence list collapses connections by authenticated user ID, keeping the latest session. Media peers use session IDs, so a reload makes a fresh connection rather than addressing an obsolete peer. Realtime transport uses a readiness handshake before creating offers, serialized signal handling, perfect negotiation, queued early ICE candidates, and bounded ICE restarts. Video attaches its stream when its element mounts as well as when the stream changes.

Each user publishes only on their own authorized `instant-peer:<room>:<user>` topic. RLS prevents another member from publishing as the teacher. Shared presence has a separate room topic. All durable mutations require fresh server authentication and membership checks.

## Gallery privacy

`instant_live_assets` holds image ownership and storage references. Both new tables deny direct authenticated/anonymous table access. API routes return the teacher's complete gallery or the learner's own uploads. An image endpoint allows the owner, the teacher, or a member viewing an image currently shown on the stage/board. Raw storage paths are not sent to clients. Uploads use existing R2 storage, are normalized to WebP, accept up to 4 MB source files, and are capped at 40 per uploader per class. Source pixels are capped and resized to 1920 × 1400.

## Media and cost boundaries

No paid conferencing provider or TURN subscription is added. Audio, screen capture (including browser-supported shared audio), and optional presenter camera use browser WebRTC. One camera presentation occupies the shared stage; this is not a multi-camera grid.

Direct WebRTC has no application per-minute media fee, but it does not provide unlimited bandwidth or guaranteed connectivity. Restrictive networks may require TURN. Screen capture and shared audio availability depend on browser/OS support; mobile browsers can usually view a shared screen even when they cannot initiate capture. Teacher upload bandwidth grows with the number of learners. Vercel, Supabase and R2 usage remains subject to the account's quotas. The existing 10-learner pilot cap remains.

## Verification

Local verification uses the actual React classroom, Tiptap editor, board validator and RTCPeerConnection implementation in two isolated Chrome clients. The signaling/backend fixture uses synthetic accounts and data. Checks cover late arrival during screen sharing, learner reload and count deduplication, board restoration, learner presentation and locking, optional camera reception, timer pause/resume, retained formatting, image move/resize, undo/redo, gallery visibility and small-screen overflow. This verifies browser behavior, not production network traversal or Supabase round trips.

Database verification confirms RLS and revoked client table privileges. Required repository checks: typecheck, lint, production build and diff whitespace checks. Production Comet inspection was unavailable because browser host access was restricted by policy.

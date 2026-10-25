# Instant Live Class

## Status

Planning specification. This document describes the first implementation of a creator-started, temporary live classroom. It is not a record of an implemented feature.

## Product decision

Instant Live Class is an audio-first classroom for small, live teaching sessions. A creator starts a room, copies a short share link, teaches with live voice, and ends the room. Signed-in learners can join without being enrolled in a course.

The first release deliberately excludes live camera video and recording. The classroom keeps the existing BrenUp visual language and reuses existing authentication, chat, whiteboard, lesson/content rendering, and creator authorization patterns where they fit.

## Supported first-release scope

- One creator per room.
- Up to ten learners per room.
- Live microphone conversation.
- Creator screen sharing.
- Existing collaborative whiteboard.
- Creator-uploaded image display.
- Existing lesson or activity content display where the current renderer can be mounted safely.
- Live chat and participant list.
- Creator microphone mute/unmute and learner microphone status.
- Creator controls to mute or remove a learner.
- Temporary room with an expiring, unguessable join code.
- No course-enrollment requirement for a signed-in learner.
- No camera button, camera tile, camera permission, recording, transcription, replay, or persistent classroom media.

## Explicitly deferred

- Camera video.
- Recording and replay.
- Automatic transcription or AI summaries.
- Breakout rooms.
- Scheduling and recurring classes.
- Anonymous or signed-out joining.
- Permanent classroom history.
- Advanced moderation and attendance reports.
- Paid media relay infrastructure unless real pilot usage demonstrates the need.

## Visual specification

The attached classroom mockup is the visual reference. The implementation should preserve its proportions, hierarchy, dark classroom shell, rounded panels, and control placement while removing all camera elements.

### Application shell

- Full viewport dark BrenUp navy background.
- Top header spans the full content width.
- Main content is divided into a large stage and a right drawer.
- Bottom controls remain visually separate from the stage.
- Use existing semantic theme tokens rather than introducing a new color system.

### Top header

From left to right:

1. BrenUp logo and wordmark.
2. Thin vertical divider.
3. Class title: `Instant Live Class` or the creator's custom title.
4. Green status pill containing a live dot and `Live`.
5. Participant icon and current count.
6. Flexible empty space.
7. `Copy link` button with link icon.
8. Settings button.
9. Full-screen button.

The copy action must provide visible confirmation such as `Copied` and must not expose internal database IDs in the URL.

### Stage

- The central stage is the largest region.
- It uses a slightly lighter charcoal panel with rounded corners.
- The initial state is an empty whiteboard.
- Screen share, uploaded image, lesson content, or the whiteboard occupies this same stage region.
- Stage content must not include a camera tile.
- A small loading, connection, or permission state may overlay the stage without changing its layout.

### Left tool rail

The rail sits inside the stage on the left edge and contains compact icon buttons:

- Select or pointer.
- Whiteboard.
- Share screen.
- Upload image.
- Lesson/activity content.
- More tools when additional existing classroom tools are available.

The active tool uses the CTA color. Inactive controls use soft white or gray. Every icon has an accessible label and tooltip. On mobile, the rail becomes a compact horizontal tool strip.

### Right drawer

The drawer contains two tabs:

- `Chat`: scrollable messages, learner initials or avatars, timestamps, message composer, and send button.
- `People`: creator first, learners below, microphone status, and creator-only mute/remove controls.

The active tab uses the CTA color and a visible underline. The drawer collapses into a mobile bottom sheet. No camera status or camera permission indicator appears in People.

### Bottom controls

The teacher control bar contains, in this order:

- Microphone toggle.
- Share screen.
- Whiteboard.
- Upload image.
- Lesson/activity content.
- More.
- Separator.
- `End class` warning button.

The learner control bar contains microphone, chat, raise hand if supported by the existing classroom flow, and leave. Learners do not see End class or creator-only publishing tools.

The microphone control must show three states: permission needed, live/unmuted, and muted. The control must release the local microphone when the user leaves, the room ends, or the page unmounts.

## User flows

### Creator starts a room

1. Creator opens Instant Live Class from Creator Tools.
2. Creator enters an optional class title.
3. Creator selects `Start class`.
4. The server authenticates the creator and creates a temporary room.
5. The UI opens the classroom with the whiteboard selected and empty.
6. The UI displays the share link and a Copy link action.
7. The creator grants microphone permission only when choosing to speak.

### Learner joins

1. Learner opens the full share link or enters the short room code.
2. BrenUp requires an authenticated account.
3. The server checks that the room exists, is live, has not expired, and accepts the learner.
4. Learner sees a join screen with the class title, creator name, microphone permission option, and Join button.
5. Learner joins with microphone off by default.
6. The learner receives the current stage state and can listen, chat, and request to speak according to room rules.

### Live conversation

- Audio is transmitted through a browser WebRTC connection.
- Supabase Realtime carries signaling and small classroom events only.
- Microphone mute changes the local WebRTC audio track and broadcasts status.
- The creator may mute or remove a learner through an authorized server action.
- Chat and whiteboard events use the existing classroom authorization model.

### Screen sharing

1. Creator selects Share screen.
2. The browser shows its native screen/window/tab picker.
3. The selected display track is published to the room.
4. Learners see the shared screen in the main stage.
5. When the creator stops sharing, the stage returns to the selected whiteboard or content state.
6. The app must never capture or store the screen as a recording.

### Creator ends the room

1. Creator selects End class.
2. The UI requires confirmation.
3. The server marks the room ended and rejects future joins.
4. The app stops local microphone and screen tracks.
5. Realtime subscriptions close.
6. Learners see a class-ended state and are disconnected.

## Technical architecture

### Media plane

Use browser WebRTC for live audio and the creator's screen-share track. Media should travel peer-to-peer where possible. BrenUp must not route audio or screen frames through Supabase database writes, Realtime broadcasts, or Vercel request bodies.

The first pilot may use public STUN configuration. A TURN relay is a future reliability dependency for users behind restrictive NATs or firewalls. The app must detect a failed connection and show a useful connection message rather than silently presenting a working-looking microphone button.

### Signaling and classroom state

Supabase Realtime is used for:

- WebRTC offer, answer, and ICE candidate exchange.
- Room join/leave presence.
- Microphone status.
- Chat messages or invalidation events, following existing classroom patterns.
- Whiteboard invalidation and small collaborative events.

Signaling messages must be short-lived, scoped to the room, and rejected for users who are not currently authorized members. WebRTC media itself must never be trusted as proof of room membership.

### Server authorization

Every room action must perform fresh server-side authorization. The browser must not decide whether a user is the creator, whether a room is live, or whether a learner can remove another participant.

The server must enforce:

- Authenticated creator ownership.
- Authenticated learner access.
- Room state: `LIVE` or `ENDED`.
- Maximum participant count.
- Room expiry and idle cleanup.
- Creator-only end, mute, remove, and stage controls.
- No recording or transcription routes for this room type.

## Suggested data model

Add a dedicated temporary-room model rather than changing lesson or quiz records.

### `instant_live_rooms`

- `id`: internal UUID.
- `join_code`: unique grouped uppercase code; never derived from a user ID.
- `creator_id`: authenticated creator ID.
- `title`: optional display title.
- `status`: `LIVE` or `ENDED`.
- `created_at`.
- `expires_at`.
- `ended_at`.
- `max_participants`: default 10 learners plus creator.

Participant presence should remain ephemeral in Realtime unless the existing classroom system already has an appropriate transient presence pattern. Do not store a recording, media blob, or full audio history.

Any migration must be provided as a separate file for the owner to apply to Supabase. Existing lessons, quizzes, activities, enrollments, and RLS policies must remain unchanged.

## Room-code design

The visible link may use this shape:

`/live/join/B7QK-4N2P-X9MD`

The code must be generated using a cryptographically secure random source, use an ambiguity-safe alphabet where practical, and be validated server-side. A room code becomes invalid when the room ends or expires. Reusing an ended code for a new room should be avoided.

## Free-tier operating plan

The planned pilot is small enough to begin without a new paid service:

- Vercel hosts the application and short API requests.
- Supabase handles auth, room records, Realtime signaling, chat, and whiteboard events.
- Browser WebRTC handles audio and screen sharing.
- Existing R2 handling is used only for explicitly uploaded images.
- No media recording or server-side media processing.

The principal cost risk is TURN relay bandwidth. Direct WebRTC connections may work for most users, but not every network. A free-only pilot must accept that some users may receive a connection warning until a TURN provider is added. Room limits, usage counters, and a clear feature flag should prevent unexpected expansion.

## Failure states

The interface must distinguish:

- Microphone permission denied.
- Microphone already in use by another application.
- Screen-share permission denied.
- Signaling connection lost.
- WebRTC connection failed.
- Room ended.
- Room expired.
- Room full.
- Learner not signed in.
- Creator removed the learner.

Each state should provide a short explanation and an actionable recovery where possible. A disabled microphone icon must not be presented as proof that audio is connected.

## Security and privacy requirements

- Require authentication for every join.
- Use short-lived room authorization and unguessable codes.
- Do not put course IDs, learner IDs, names, or private data in the join code.
- Enforce creator and learner permissions on the server.
- Rate-limit room creation, joins, chat, and signaling abuse.
- Do not record, transcribe, or persist audio or screen-share frames.
- Stop local media tracks on leave, end, tab close, and authorization loss.
- Do not expose service-role keys or provider secrets in browser code.
- Avoid logging private chat content or media metadata unnecessarily.

## Implementation phases

### Phase 1: room and shell

- Add the temporary room migration and RLS.
- Add creator start/end actions.
- Add secure join link and authenticated learner join.
- Build the responsive shell from the visual specification.
- Mount the empty whiteboard and existing chat/people UI.

### Phase 2: audio

- Add WebRTC peer connection management.
- Add Supabase signaling.
- Add permission, mute, reconnect, and cleanup states.
- Add creator mute/remove behavior.
- Test with one creator and two learners first.

### Phase 3: screen and content

- Add creator screen sharing.
- Reuse existing whiteboard state and renderer.
- Add image upload to the stage.
- Mount lesson/activity display only after verifying it does not alter canonical lesson state.

### Phase 4: pilot hardening

- Add room expiry and abandoned-room cleanup.
- Add participant and message limits.
- Add connection diagnostics without collecting media.
- Test desktop, tablet, mobile, restrictive networks, reconnects, and simultaneous joins.

## Acceptance criteria

- A creator can start and end a temporary room.
- A signed-in learner can join by link or code without course enrollment.
- A learner cannot join an ended, expired, full, or unauthorized room.
- Creator and learners can speak live with microphone controls.
- The app visibly reports permission and connection failures.
- Creator screen share appears on the learner stage and stops cleanly.
- Whiteboard, chat, people, and existing content controls work without camera controls.
- No audio, screen-share frame, recording, or transcript is persisted.
- Ending a class disconnects participants and invalidates the link.
- The layout matches the approved reference on desktop, tablet, and mobile.
- Existing lesson, quiz, live-class, enrollment, and learner flows remain unchanged.

## Verification checklist

Before release, run:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`
- Existing live classroom checks.
- Database migration and RLS checks.
- Browser tests for creator start/end, learner join, room expiry, room full, mute, removal, screen share, reconnect, and mobile layout.
- A real two-browser audio test.
- A real two-browser screen-share test.
- A small pilot test with the intended class size.

Compilation and mocked signaling are not evidence that real microphone or screen-sharing connections work. At least one real browser-to-browser test is required before calling the feature operational.

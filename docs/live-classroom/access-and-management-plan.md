# Live Classes: Access, Dashboards, Scheduling, and Migration Plan

**Status:** Product and implementation plan only. No application code or database schema has been changed by this document.

## Goal

Make the newer Instant Live Class engine easy to find and use for learners, teachers, and platform administrators. Add code-based joining, reliable teacher room recovery, a global admin control center, scheduled classes with course invitations, and a safe path to retire the older course live-class experience only after the new experience reaches feature parity.

The newer engine remains the destination for audio, screen sharing, whiteboard, media, chat, lessons/quizzes, and room controls. The older `live_sessions` experience must continue working during development and migration.

## Current-state inspection

| Area | Current implementation | Gap to address |
|---|---|---|
| Instant class creation | Creator Tools has an instant start form; `POST /api/instant-live/rooms` creates a temporary room with a secure grouped code. | The creator is sent directly into the room. There is no durable dashboard list of active, paused, or upcoming Instant rooms to return to. |
| Share link and code | `/live/join/[code]` resolves a 12-character grouped code to a room. | There is no learner-facing page where someone can enter a code manually. The code route redirects to the internal room ID after lookup. |
| Room lifecycle | `instant_live_rooms` supports `LIVE`, `PAUSED`, and `ENDED`, heartbeat-based pause, resume, and a 15-minute pause window. | Teacher recovery currently depends on finding the old link; the dashboard should be the reliable recovery path. Lifecycle transitions need to be explicit in every dashboard and join state. |
| Room access | Signed-in learners can join an unlocked live instant room without course enrollment. A locked room can place learners in a waiting list. | Invite audiences and course-based invitations are not yet part of the instant-room creation/scheduling workflow. |
| Teacher/admin dashboard | `/admin/live-classes` lists legacy `live_sessions` for classes the staff member manages and offers schedule/create controls. Instant rooms are not included. | Teachers need a unified view that includes their Instant rooms. Platform admins need a separately authorized global view across all live rooms. |
| Learner dashboard | `/live-classes` lists legacy course sessions for the learner’s class memberships and course enrollments. | It does not list Instant rooms or provide a quick join-by-code action. Upcoming Instant invitations need to appear here. |
| Scheduling | Legacy `live_sessions` already has scheduled sessions, calendar, class/course association, and learner notifications. | The current Instant room record is temporary and cannot be scheduled. Reuse the scheduling concepts, but do not silently convert or mutate legacy sessions. |
| Roles | `requireStaff` allows staff roles; `requireAdmin` and `isPlatformAdmin` identify platform admins. | All-class operational authority must be platform-admin-only and checked freshly on the server for every action. School admins and teachers must remain scoped. |
| Data security | Instant room migration enables RLS; browser room mutations go through authenticated server routes. | Admin-wide room summaries and moderation controls must not be exposed through broad client table access or a permissive RLS policy. |

## Product decisions

1. **One learner-facing access point.** Keep `/live-classes` as the learner destination, add a prominent “Join with a code” action, show invited upcoming sessions, and surface eligible live classes. Direct share links continue to work.
2. **One teacher live-class workspace.** Upgrade `/admin/live-classes` into the teacher’s management dashboard. Keep its existing calendar and scheduled-session functions, but add Instant rooms and a clear distinction between the newer room engine and any legacy session still in use.
3. **A separate global admin control center.** Add an admin-only view, such as `/admin/live-classes/monitor`, for all live and paused rooms. Do not make global room data visible to ordinary teachers or school admins.
4. **Use stable public codes, not internal UUIDs, as the human join credential.** Full links and manually entered codes both resolve server-side. Continue requiring sign-in. A code is active only while the room is eligible for joining; ended or expired rooms cannot be reopened by learners.
5. **Keep existing live classes operational until parity and migration are proven.** Do not replace `/live/[id]`, existing course session records, or legacy links during the first phases.

## Proposed learner experience

### `/live-classes`

- A compact top section with **Join with a code** and a manual code field accepting pasted or typed codes with or without hyphens/spaces.
- Normalize input, validate format, and submit to a server endpoint. Return clear states: invalid code, ended/expired, not yet open, paused, full, waiting for teacher approval, or ready to join.
- Do not reveal whether a code belongs to a particular teacher, course, or learner until the user is authenticated and authorized to see that room.
- Separate **Live now**, **Upcoming**, and **Past / completed** sections. Keep invited classes easy to identify and show date/time in the learner’s local timezone.
- Live unlocked rooms have a clear **Join** action. Locked rooms explain that entry is pending approval. Upcoming rooms show class name, teacher, time, duration, and invitation context.
- Include the existing course-owned live sessions during transition. Mark their engine internally and route each to its existing correct player; do not mix the two player implementations accidentally.

### Join flow

1. Learner opens a complete link or enters a code.
2. If signed out, preserve the intended room/code through authentication and return to the join flow after sign-in.
3. Server resolves the code, checks room status/expiry/capacity, membership or invitation rules, and any lock/waiting-room state.
4. Present a small join preview with class title, host, status, and a **Join class** action. Do not automatically create duplicate participant rows on refresh; membership remains keyed by room and user.
5. After join, initialize the existing Instant Live engine and current shared stage state.

## Proposed teacher dashboard

### Layout and navigation

Use the app’s established admin workspace styling. At the top, show a clear page title and two primary actions: **Start instant class** and **Schedule class**. Below, show concise summary cards for **Live**, **Paused**, and **Upcoming**. Add tabs or filters for Live, Upcoming, Past, and Drafts, plus search and date filters where useful.

### Live and paused room cards

Each card should include title, engine/type badge, status, elapsed time or next scheduled time, participant count, and last activity. Available actions:

- **Rejoin / Resume**: return the owner to their current room using the room ID resolved from the owner’s authorized dashboard record. This remains visible while the room is live or within its pause recovery window.
- **Copy link** and **Copy code** with clear confirmation.
- **Pause**, **Resume**, and **End** with confirmation for destructive end.
- **Manage access** for lock/unlock and waiting learners.
- For an expired/ended room, show a terminal state and offer **Start a new class**. Do not revive a stale code.

The dashboard must show a room the teacher accidentally left by closing a tab, provided the room is still in the supported pause window. It should distinguish **Paused — resume available until [time]** from **Ended**. If the pause window expires, the server closes the room; the teacher may start a new room but cannot resume the old one.

### Scheduling flow

Scheduling should be a guided dialog or page with only the needed fields:

- Title and optional short description.
- Date, start time, timezone, and duration.
- Audience: selected course(s), selected class(es), or selected individual learners when permitted.
- Access mode: invited learners only / anyone signed in with the link. Default to invited learners for course sessions and explicit confirmation for link-based open access.
- Optional waiting room/locked entry.
- Optional lesson or quiz attachment only if the current Instant engine can load it reliably; otherwise mark as a later phase and do not offer a nonfunctional control.
- Preview recipients before sending invitations.

On schedule, create an upcoming item that does not yet accept room participants. Send in-app notifications to the selected audience and show the scheduled class in both teacher and invited learner dashboards. Support edit, reschedule, cancel, copy invitation link, and start-now. A room code should become joinable only at the configured opening window, or when the teacher explicitly starts early.

## Proposed platform-admin control center

### Access and scope

- Route guarded with `requireAdmin()` on the page and every API/action. Do not use `requireStaff()` for global operations.
- Query only the minimal operational fields needed. Do not include chat contents, board payloads, private uploads, or learner records in the overview.
- Teachers see only rooms they own. School admins remain within their organization/class scope. Platform admins may see all rooms.

### Admin dashboard

- Live room count, paused room count, upcoming scheduled count, and active participants.
- Search/filter by status, teacher, date, and room code; show title, host, created/scheduled time, participant count, lock/waiting status, and last heartbeat.
- **Enter as admin** opens the same room UI with a conspicuous admin-support banner and read-only-by-default behavior. Any administrative intervention is separately authorized and audited.
- **Pause room** and **End room** are available to platform admins. End requires confirmation and immediately invalidates join access and broadcasts the terminal state.
- Avoid a global “mute all” or hidden impersonation feature in the initial version. If support needs participant moderation, use explicit audited actions and disclose them in the room.
- Record admin intervention metadata: admin ID, room ID, action, timestamp, and optional reason. Keep it outside learner-visible chat and never record audio/video.

## Data and service architecture plan

### Keep the existing engines distinct behind a normalized application view

The repository contains two paths: legacy course-owned `live_sessions` and newer temporary `instant_live_rooms`. Initially, expose both through a server-side normalized dashboard model, for example `LiveClassListItem`, with `engine`, `status`, `owner`, `scheduledAt`, `joinTarget`, and supported actions. This lets the UI be unified without changing legacy rows or routing.

For scheduled Instant classes, prefer a durable schedule entity or carefully extended Instant room lifecycle rather than creating a live room weeks in advance. Before selecting the final schema, decide whether an upcoming booking should:

- be a scheduled record that creates a fresh `instant_live_rooms` row when the teacher starts, or
- be an Instant room row in a `SCHEDULED` state that transitions once to `LIVE`.

Recommended default: **separate scheduled booking and active room identity**, linked by a foreign key when started. This avoids treating a future booking as an active joinable room, supports rescheduling/cancellation cleanly, and ensures the join code has a short active lifetime. Reuse or adapt existing course/class invitation tables only after verifying their semantics; do not overload `live_sessions` with Instant-specific lifecycle fields.

Potential additions, subject to migration review:

- `instant_live_bookings`: owner, title, description, scheduled start, duration, timezone, access mode, lock flag, status, course/class references, created/updated timestamps, and optional started room ID.
- `instant_live_booking_invitees`: booking ID, user ID, invitation status, notification timestamps, and uniqueness on booking/user.
- Optional `instant_live_admin_audit`: room/booking ID, admin ID, action, reason, timestamp.

Avoid storing a duplicate list of all enrolled users in JSON. Keep invitees relational for authorization and efficient recipient lookups. Store only data necessary for class access and delivery.

### Authorization and RLS

- All mutations go through server actions/API routes with fresh auth/profile role checks.
- Owner actions check `creator_id`; class/course-based access checks current enrollment or roster policy at join time, with a documented rule for whether access remains after unenrollment.
- Platform admin checks use trusted profile/app authorization data, never user-editable metadata.
- Database RLS remains enabled. Admin-wide reporting should use a server-only privileged client after strict `requireAdmin()`; do not add broad authenticated SELECT policies for convenience.
- Code lookup should avoid distinguishable error timing/messages that enable code enumeration. Rate-limit attempts by account and IP where infrastructure permits, log abuse signals, and avoid returning internal room UUIDs before authorization.
- Join codes should be generated cryptographically, ambiguity-safe, and unique. Consider a longer/random code or rate-limiting before reducing entropy. Expired/ended codes are never recycled.
- Include idempotency/uniqueness for booking notifications and room starts so refresh/retries do not duplicate bookings, participants, or notifications.

### Realtime and lifecycle

- Supabase Realtime is for room events and invalidation only; never relay audio, screen frames, or PDFs through database/realtime payloads.
- Use server-owned status transitions for `SCHEDULED → LIVE → PAUSED → LIVE` or terminal `ENDED/CANCELLED`; validate each transition.
- Keep heartbeat recovery and 15-minute pause expiry authoritative on the server. Add a scheduled cleanup mechanism only if current request-driven expiry is insufficient; do not rely solely on a browser timer.
- Dashboard cards should update using lightweight polling/realtime invalidation and always re-fetch authorized server state before sensitive actions.
- Participant counts should be based on deduplicated participant identity and freshness; reconnects must update an existing participant rather than incrementing a second logical person.

## Replacing the previous live-class experience

This is a controlled migration, not a one-step UI removal.

1. **Inventory and parity matrix:** map old live-session features, permissions, routes, analytics, notifications, attachments, and historical review behavior to the newer engine. Identify anything not yet supported.
2. **Unified entry points:** dashboards show both engines with explicit routing. New instant classes use the new engine; existing legacy links keep working.
3. **Pilot:** enable Instant scheduling and joining for selected staff/classes behind a server-controlled feature flag. Measure join success, reconnection, audio, screen share, moderation, and support issues without collecting media.
4. **Parity:** complete required teacher, learner, and admin capabilities. Migrate only future sessions that can be safely represented; do not rewrite completed session history or IDs.
5. **Default switch:** make the new engine the default for newly created classes after owner approval and successful pilot. Keep legacy routes available for existing sessions.
6. **Retirement:** remove legacy creation/navigation only after active legacy sessions have ended, data and access audits pass, historical links have a documented destination, and rollback has been tested. Preserve or archive legacy data rather than deleting it.

## Delivery phases

### Phase 0 — Product and security decisions

- Confirm code format and rate limits, whether invited learners can join early, schedule timezone rules, whether teachers can invite individuals outside their course, booking cancellation rules, and admin enter-room permissions.
- Build the old/new feature parity checklist and migration rollback criteria.

### Phase 1 — Learner access

- Add manual code-entry UI on `/live-classes`.
- Add secure code resolution/join endpoint and preserve redirect through sign-in.
- Present actionable status messages and prevent expired, ended, full, or unauthorized joins.
- Surface currently live unlocked rooms only when the learner has a valid direct link/code or invitation; do not expose a public directory of rooms.

### Phase 2 — Teacher Instant room dashboard

- Add owner-scoped active/paused room data and rejoin/resume controls to `/admin/live-classes` or a dedicated Instant tab.
- Include copy link/code, status, participant count, pause deadline, access lock, and end controls.
- Verify a teacher can recover a room after closing the classroom tab and cannot access another teacher’s room.

### Phase 3 — Scheduling and invitations

- Add booking schema/migration, RLS, invitee model, and idempotent notification actions.
- Add schedule/edit/reschedule/cancel/start-now workflows.
- Add upcoming invited bookings to learner dashboard and class notifications.
- Gate room creation and code activation to the allowed start window or explicit start-now.

### Phase 4 — Platform-admin control center

- Add strict admin-only global monitoring and audited pause/end actions.
- Add admin room entry with a visible support role and explicit permissions.
- Test that teachers, school admins, and learners cannot enumerate or operate on global rooms.

### Phase 5 — Pilot, parity, and replacement

- Run an invited pilot; track operational metadata only (join outcomes, connection states, room lifecycle, support actions), not media content.
- Compare both engines against the parity matrix; fix blockers and prepare rollback.
- Switch new class creation to the new engine only after pilot sign-off.
- Retire old creation flows only after existing sessions/history remain reachable and rollback is proven.

## Acceptance checklist

### Learners

- Can join from a copied link or by typing/pasting a code.
- Are returned to the intended join flow after authentication.
- Receive clear, non-leaking responses for invalid, expired, ended, full, paused, scheduled, locked, and removed states.
- See only rooms they are invited/authorized to access; reconnect/reload does not duplicate their participant identity.
- See upcoming invitations and local-time schedule details.

### Teachers

- Can see and re-enter their own live room from the dashboard after tab closure during the pause recovery window.
- Can distinguish live, paused, ended, upcoming, and cancelled classes.
- Can schedule, edit, reschedule, cancel, invite, copy link/code, start early, and start on time within their allowed class/course scope.
- Cannot see or control another teacher’s private rooms unless explicitly granted by role policy.

### Platform admins

- Can see global live/paused/upcoming counts and minimal operational details.
- Can enter, pause, and end any active room through server-authorized and audited actions.
- Cannot accidentally expose chat, uploaded private media, or recordings in monitoring views.
- All admin-only actions reject unauthorized roles even if the UI is bypassed.

### Reliability and compatibility

- Existing `/live/[id]` legacy sessions, links, permissions, and historical data remain functional through rollout.
- Room codes are unique, unguessable, rate-limited, and invalid after terminal end/expiry.
- Pause expiry is enforced server-side; stale client state cannot resurrect an ended room.
- Scheduling and joining are idempotent under reloads/retries.
- Every migration includes rollback/forward-compatibility review, RLS review, and owner-applied SQL instructions where required.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Room codes are guessed or shared outside the intended group | High-entropy codes, authentication, rate limits, optional locking/waiting room, server checks, expiry, and abuse monitoring. |
| Admin view becomes a data leak or accidental impersonation path | Platform-admin-only route/actions, minimum fields, visible support mode, audit trail, and no hidden identity impersonation. |
| New schedule model conflicts with legacy `live_sessions` | Normalize in server code first; keep separate storage and IDs; do not migrate legacy rows in the first release. |
| Teacher closes the tab and loses access | Owner dashboard lookup by authenticated creator ID; pause recovery window; clear resume deadline and ended state. |
| Duplicate invites, bookings, or participants after retries | Unique constraints and idempotency keys; upsert participants by room/user. |
| Notification or schedule timezone confusion | Store UTC instants plus the chosen IANA timezone for display; test DST and local-time conversions. |
| Instant class grows beyond pilot resource assumptions | Preserve room capacity controls and monitor aggregate realtime/relay usage; enforce room limits independently of UI. |
| Premature legacy retirement breaks class links/history | Feature-flagged rollout, explicit parity checklist, keep old routes, pilot, and tested rollback before retirement. |

## Recommended order

Build in this order: **learner code entry → teacher room recovery dashboard → scheduled booking and invitations → admin control center → pilot and parity → legacy replacement**. This gives immediate access improvements while keeping the broadest administrative authority and data migration work behind the safer foundations.

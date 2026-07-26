# BrenUp Live Classroom Delivery Board

This board is deliberately kept beside the implementation so the classroom
becomes one coherent product, rather than a collection of disconnected tools.

## Foundation

- [x] Session data model, access controls, scheduling, roster, attendance, event log
- [x] Live Classes staff navigation and schedule/list dashboard
- [x] Teacher-controlled shared lesson player
- [x] Student shared lesson player with locked navigation and recovery polling
- [x] Teacher-to-student slide synchronization through Supabase Realtime broadcasts

## MVP Interaction Layer

- [x] Realtime-style presence and participant status with heartbeat recovery
- [x] Hand raises and help requests
- [x] Everyone chat and teacher-private messages
- [x] Temporary group assignment and private group chat
- [x] Group-chat moderation: remove messages and open/close group chat
- [x] Teacher activity controls: open, close, extend, reset, reveal answers
- [x] Teacher-controlled visible session timer
- [x] Timed live activities with teacher open, extend, close, and learner countdown states
- [x] Learner presence, live slide location, and submitted-activity monitoring
- [x] Teacher-created live polls: MCQ, true/false, word cloud, emoji, rating
- [x] Secure live voice notes with session-scoped storage and teacher moderation
- [ ] Voice-note transcripts/captions (requires a speech-to-text provider)

## Classroom Operations

- [x] Live Classes dashboard: upcoming, live, drafts, completed, and scheduling
- [x] Scheduled-class calendar view
- [ ] Session settings, duplicate, cancel, invitations, and participant management
- [x] Temporary automatic breakout groups with teacher overview
- [ ] Manual group membership management and breakout-room controls
- [ ] Built-in meeting provider adapter and external-link fallback
- [ ] Live student mobile command bar: chat, hand, notes, more

## Evidence, Replay, And Reporting

- [ ] Dual-write live activity responses as reusable assessment evidence
- [ ] Attendance, participation, activity accuracy, speaking-time, and slide-difficulty analytics
- [ ] Session replay timeline for slides, chat, polls, voice, and teacher actions
- [ ] Course/class reporting and export-ready live-session reports

## AI And Advanced Classroom

- [ ] Teacher AI actions: questions, activities, polls, explanations, homework, exit tickets
- [ ] Pronunciation feedback in live activities
- [ ] Collaborative whiteboard and annotations
- [ ] Advanced analytics, accessibility review, load testing, and offline/reconnect UX

## Release Gates

- [ ] All new data tables have RLS verified for student, teacher, school admin, and platform admin
- [ ] Keyboard navigation, WCAG AA contrast, loading/empty/error/reconnect states
- [ ] Mobile and tablet verification for teacher and student workspaces
- [ ] Production build, lint, typecheck, and manual multi-user session test pass

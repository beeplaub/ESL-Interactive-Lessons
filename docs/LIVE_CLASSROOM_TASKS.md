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

- [ ] Realtime presence, participant status, hand raises, and help requests
- [ ] Everyone, group, and teacher-private chat with moderation controls
- [ ] Teacher activity controls: open, close, extend, reset, reveal answers
- [ ] Timed live activities and learner progress monitoring
- [ ] Teacher-created live polls: MCQ, true/false, word cloud, emoji, rating
- [ ] Voice notes with secure storage and accessible transcripts/captions where available

## Classroom Operations

- [ ] Calendar views: upcoming, live, past, and drafts
- [ ] Session settings, duplicate, cancel, invitations, and participant management
- [ ] Temporary/manual breakout groups with teacher overview
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

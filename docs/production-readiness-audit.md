# BrenUp Production Readiness Audit

Updated: 2026-07-25

## Verified baseline

- `npm run typecheck`: passes.
- `npm run lint`: passes with three warnings and no errors.
- `npm run build`: passes and generates all current App Router routes.
- The working tree was clean at the start of this audit.
- `main` and `origin/main` currently point to the same commit.

## Active product areas

BrenUp currently contains:

- Learner authentication, profiles, level testing, quizzes, lessons, courses, progress, badges, leaderboard, wishlist, notifications, language profile, certificates, and course payments.
- Staff tools for courses, lessons, quizzes, media, users, organizations, classes, assignments, submissions, analytics, OBE, and AI Studio.
- Visual lesson, quiz, and course builders.
- A content library with copy/reuse history.
- OBE entities for course outcomes, lesson outcomes, skills, learning targets, assessment items, attempts, responses, and course mappings.
- AI configuration, usage records, saved drafts, lesson generation, feedback, and roleplay sessions.
- Teacher/school readiness tables for organizations, classes, members, and assignments.

## Architecture boundaries to preserve

1. Existing lesson, quiz, course, progress, attempt, certificate, and assessment IDs must remain stable.
2. The visual builders are the preferred authoring path. Legacy parsing code should remain isolated until the old data is safely retired.
3. Content-library copies must remain independent snapshots and retain source metadata.
4. OBE metadata is an assessment layer. It must not be embedded into content-block rendering or future Image + Text blocks.
5. The service-role client is server-only. Every action using it must authenticate the caller and check role/ownership before mutating data.
6. Learner-facing pages must never expose draft, deleted, private, or organization-restricted content.

## Migration ledger note

The repository contains two different migrations named `028`:

- `028_add_inference_detection_type.sql`
- `028_add_new_activity_types.sql`

There is also a later jump to `035_fix_assessment_attempts_foreign_keys.sql`. These files must not be renamed casually because some may already have been run manually in Supabase. Before introducing another migration, record its exact filename, execution date, and Supabase project status in the deployment checklist. New migrations should use an unambiguous date-based or otherwise unique identifier.

## Authorization model

The current application has three useful server-side gates:

- `requireAdmin()` for platform-wide administration.
- `requireStaff()` for staff areas.
- `requireCourseAccess()`, `requireLessonAccess()`, and `requireQuizAccess()` for creator-owned content.

Middleware is useful for fast session routing, but it is not the final authorization boundary. Server pages and server actions must continue to make the authoritative role and ownership checks.

## Phase 0 follow-up checklist

- Maintain a single migration ledger before the next schema change.
- Keep role and ownership checks in shared helpers rather than duplicating them in actions.
- Add regression tests for learner, teacher, school-admin, and platform-admin access before subscription work.
- Add regression tests for published versus draft/deleted content visibility.
- Add a safe error/logging convention for server actions.
- Review service-role calls in high-risk mutations before exposing teacher self-service.
- Consolidate duplicated legacy paths only after the active builder paths are covered by tests.

## Current non-blocking warnings

- Two unused ESLint suppression comments in `app/admin/content-library/actions.ts`.
- One raw `<img>` warning in `components/QuizPlayer.tsx`.

These do not block deployment, but they should be cleaned during the next focused refactor rather than mixed into unrelated product work.

## Next build phase

The next implementation phase should be the teacher workspace and ownership foundation. It should introduce no payment logic yet. It will give teachers a reliable home for their courses, lessons, quizzes, media, drafts, submissions, usage, and settings while reusing the existing builder and authorization helpers.

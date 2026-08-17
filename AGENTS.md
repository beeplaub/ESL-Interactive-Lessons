# BrenUp Local AI And Coding Rules

## Repository

BrenUp is a Next.js, TypeScript, Supabase, R2, and Tailwind ESL learning platform. Preserve existing learner flows, creator permissions, RLS, course placements, lesson IDs, quiz IDs, and media URLs. Never read, print, commit, or send `.env.local`, service-role keys, R2 secrets, or learner private data.

## Required checks

Run `npm run typecheck`, `npm run lint`, and `npm run build` before accepting a change. Keep changes small and reviewable. AI-generated lessons, quizzes, courses, and blog content are drafts until a creator explicitly saves or publishes them.

## AI rules

The existing `callGemini` path owns caching, duplicate-generation locks, credits, validation, and telemetry. Extend it rather than creating a second AI pipeline. Production AI generation uses the configured cloud providers and must preserve the existing fallback and privacy rules.

Generated ESL content must be CEFR-appropriate, editable, schema-validated, and checked for answer correctness. Do not let model output alter permissions, publishing state, RLS, or unrelated records.

## UI and data safety

Use existing components and semantic design tokens. Server actions and API routes must enforce fresh authorization. Keep content blocks and activity data compatible with the current lesson and quiz renderers. Do not hand-edit database records as a substitute for a creator workflow.

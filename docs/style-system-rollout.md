# BrenUp Unified Style System Rollout

This checklist is the source of truth for the production design migration. It is intentionally additive: content, permissions, data, and learning flows must not change.

## Foundation

- [x] Audit current theme architecture and hard-coded palette usage.
- [x] Define a semantic, versioned platform theme contract.
- [x] Add a legacy-token bridge so existing screens inherit the platform theme safely.
- [x] Separate primary text tokens from dark-surface tokens.
- [x] Migrate the dominant legacy palette roles across learner and creator screens.
- [x] Convert application UI colours to semantic roles. Intentional literals remain only in the default palette, third-party marks, and creator-selected content swatches.

## Control Centre

- [x] Expand the platform style schema for surfaces, feedback, navigation, charts, and effects.
- [x] Rebuild `/admin/style` into grouped, admin-readable controls with draft previews.
- [x] Add theme export/import, per-token reset, and an admin-readable impact map.
- [x] Add named, restorable theme snapshots.
- [x] Add revision comparison and a richer component preview gallery.
- [x] Add a token-usage explorer so administrators can see what each control affects.

## Shared Components

- [x] Centralize root tokens, typography roles, density, radius, and elevation variables.
- [x] Route custom component shadows through the shared elevation token.
- [x] Convert learner sidebar and footer to semantic navigation tokens.
- [x] Convert global button, card, and focus primitives to semantic tokens.
- [x] Convert admin navigation to semantic tokens.
- [ ] Convert creator-shell primitives.

## Learner Experience

- [x] Migrate dashboard, courses, course detail, quizzes, quiz player, lesson player, and level test to semantic surface, feedback, and elevation roles.
- [x] Migrate leaderboard, profile, achievements, tasks, assignments, calendar, language profile, and live classes to semantic feedback and progress roles.
- [ ] Complete desktop, tablet, mobile, loading, error, and empty-state QA across every learner route.

## Creator Experience

- [ ] Migrate admin dashboard, course/lesson/quiz builders, OBE, organizations, and live-class workspace.
- [ ] Verify compact creator density and high-information screens.

## Production QA

- [x] Remove remaining non-media raw application colours. Intentional source defaults, third-party marks, and creator-selected swatches are documented exceptions.
- [x] Verify keyboard focus, contrast, reduced motion, and high-contrast readability through global semantic safeguards and Style Center contrast checks.
- [x] Run lint, typecheck, and production build.

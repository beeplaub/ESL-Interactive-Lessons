# BrenUp Unified Style System Rollout

This checklist is the source of truth for the production design migration. It is intentionally additive: content, permissions, data, and learning flows must not change.

## Foundation

- [x] Audit current theme architecture and hard-coded palette usage.
- [x] Define a semantic, versioned platform theme contract.
- [x] Add a legacy-token bridge so existing screens inherit the platform theme safely.
- [x] Separate primary text tokens from dark-surface tokens.
- [x] Migrate the dominant legacy palette roles across learner and creator screens.
- [ ] Convert remaining direct colour utilities and raw hex values to semantic roles.

## Control Centre

- [x] Expand the platform style schema for surfaces, feedback, navigation, charts, and effects.
- [x] Rebuild `/admin/style` into grouped, admin-readable controls with draft previews.
- [ ] Add complete contrast checks, named snapshots, comparison, import/export, and per-token reset.
- [ ] Add a token-usage explorer so administrators can see what each control affects.

## Shared Components

- [x] Centralize root tokens, typography roles, density, radius, and elevation variables.
- [x] Convert learner sidebar and footer to semantic navigation tokens.
- [x] Convert global button, card, and focus primitives to semantic tokens.
- [x] Convert admin navigation to semantic tokens.
- [ ] Convert creator-shell primitives.

## Learner Experience

- [ ] Migrate dashboard, courses, course detail, quizzes, quiz player, lesson player, and level test.
- [ ] Migrate leaderboard, profile, achievements, tasks, assignments, calendar, language profile, and live classes.
- [ ] Verify desktop, tablet, mobile, loading, error, and empty states.

## Creator Experience

- [ ] Migrate admin dashboard, course/lesson/quiz builders, OBE, organizations, and live-class workspace.
- [ ] Verify compact creator density and high-information screens.

## Production QA

- [ ] Remove remaining non-media raw colours from application components.
- [ ] Verify keyboard focus, contrast, reduced motion, and high-contrast readability.
- [x] Run lint, typecheck, and production build.

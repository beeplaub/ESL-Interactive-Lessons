# Vercel CPU Baseline — 3 November 2026

**Source:** Vercel dashboard in the user's Comet browser. Read-only inspection; no Vercel settings or application code were changed.

## 30-day usage window

The dashboard was set to **Last 30 Days (4 October–2 November, Vercel local display)** and filtered to the `esl-interactive-lessons` project.

- Fluid Active CPU: **4 hours 16 minutes** for the project.
- The team dashboard showed the temporary allowance as **3×, until 3 December**. The normal allowance shown was 4 hours, with the temporary total at 12 hours.
- The usage is therefore about 36% of the temporary 12-hour allowance, but about 7% above the normal 4-hour allowance. The temporary increase gives time to investigate; it does not show that normal usage is sustainable.
- The dashboard graph showed daily CPU variation, with several recent days notably higher than the early October baseline. The overview does not attribute those daily totals to routes or activities.

## Route-level view available on the account

Vercel Observability was set to **Last 12 hours**. On that window the Functions view showed:

- 1.1K function invocations, 0% errors, and 0% timeouts.
- Active CPU P75: 117 ms across functions; average memory: 248 MB of 2.05 GB; CPU throttle P75: 11%; cold starts: 4.1%.
- The route table was sorted by aggregate Active CPU. The first rows were:

| Route | Invocations | Active CPU |
|---|---:|---:|
| `/admin/lessons/[id]/builder` | 37 | 9 s |
| `/admin/courses/[id]/builder` | 40 | 1.63 s |
| `/courses` | 51 | 1.4 s |
| `/quizzes` | 51 | 1.38 s |
| `/account` | 9 | 1.28 s |
| `/` | 5 | 1.02 s |
| `/lessons/[lessonId]` | 4 | 920 ms |
| `/api/push/worker` | 25 | 920 ms |
| `/blog` | 38 | 903 ms |
| `/api/lessons/[lessonId]/narration/[slideId]` | 12 | 810 ms |

The live-related route search in this same 12-hour window found `/live-classes` at 8 invocations / 472 ms and `/admin/live-classes/[id]` at 1 invocation / 195 ms. This is not representative evidence of a busy live class: no live-class API route appeared in the observed results during that window.

## Data limitations

- This account's free Observability view allowed **12 hours** of Function route data. The 24-hour and 3-, 7-, 14-, and 30-day views were marked as requiring paid Observability. Therefore the 30-day CPU total cannot be reliably split by route from this view.
- Middleware showed 1.3K invocations in the 12-hour window, but its duration chart was explicitly marked **Demo Data** and its request-path examples did not reconcile with the invocation total. Do not use those example paths or timing values as account evidence.
- These numbers are a point-in-time dashboard snapshot and will age. Re-read the dashboard before making an implementation or allowance decision.

## What this supports

1. Keep the first step read-only: establish route-specific measurements during an actual lesson-building session and live class, because the current route window lacks those workloads.
2. The lesson builder is the clearest current route to examine first, but the 9-second aggregate over 37 requests is only a 12-hour observation, not proof it dominates monthly CPU.
3. Avoid bulk prefetch or unconditional stale refreshes: the budget objective is fewer Vercel function executions and less aggregate Active CPU.
4. Use the 30-day chart to select high-CPU days, then compare the app activity schedule/class records (without exposing learner data) to understand correlation. The chart alone cannot prove the cause.
5. Do not change middleware based on the Demo Data breakdown. Any changes require trustworthy measurements and a separate implementation request.

## Read-only source audit performed after the dashboard review

- `middleware.ts` already uses Supabase `getClaims()` rather than `getUser()` and matches almost every non-static request. Keep this security behavior intact; the dashboard's Middleware request-path breakdown was not trustworthy enough to justify narrowing the matcher.
- `app/layout.tsx` awaits `getPlatformStyle()` on every render. That function makes an admin-client query for the global style settings. The layout also renders `SiteHeader`, which calls Supabase `getUser()`. These are plausible repeated-work candidates, but the current Vercel route data does not prove how much monthly CPU they contribute.
- `components/whiteboard/useWhiteboard.ts` previously polled `/api/live/[session]/board` every second even when Supabase Realtime was connected; Realtime events also trigger a debounced refresh. The local implementation now polls every 15 seconds while connected and every 5 seconds while disconnected, skips hidden tabs and in-flight saves, and refreshes immediately on Realtime status changes, browser reconnect, and tab visibility. This reduces the timer cadence from 60 requests/minute to at most 4 while connected, and 12 while disconnected; real request/CPU savings remain unmeasured until a live class.
- Live-class state refreshes every 15 seconds for learners and every 2.5 seconds for admin support. Waiting-room status polls every 2.5 seconds, and the admin live monitor calls `router.refresh()` every 12 seconds. These loops should pause when their page is hidden and be evaluated against freshness/reconnect requirements before modification.
- Route loading boundaries already exist for many high-use paths, including courses, quizzes, lessons, account, admin, and the lesson builder. The global fallback remains a centered spinner; existing route-specific boundaries use skeletons or spinners. A branded CSS-only motion/message layer could improve perceived speed without adding Vercel function requests, but it would not itself reduce CPU.
- Next `<Link>` is widely used, alongside 31 native `<a>` occurrences across TSX files. The native anchors include deliberate external/new-tab/download/print cases; classify same-origin navigation before replacing any of them.

## Local optimization changes

- **Whiteboard fallback polling:** implemented locally as described above. No authorization, mutation, endpoint, or cache behavior changed. Not yet deployed at the time of this note.
- **Hidden-tab polling:** waiting-room admission polling, the admin live-monitor refresh, and the AI Studio auto-refresh now stop while their tab is hidden and refresh immediately when the tab becomes visible again. These are local request-reduction changes; workload savings are not yet measured.

## Next low-risk actions

1. When a real live class occurs, record the route CPU/invocations during a known time window. Do the same during lesson building. Keep this passive: no extra polling or instrumentation is required.
2. Review the polling changes in a real class and compare route invocations/Active CPU with equivalent prior usage. Confirm reconnects, hidden-tab return, admission, and missed-event recovery.
3. Defer changing middleware matching, root session rendering, or cache policy until there is comparable workload data and a focused preview review. These changes can affect authorization or stale content.

## Focused cache and session audit task list

This checklist records cache-related follow-up; the polling optimizations above are separate local changes.

1. **Classify root layout data.** Confirm whether `getPlatformStyle()` is identical for all visitors. If it is global shared presentation data, evaluate a short-lived server data cache with a version/tag invalidated by both style save and restore. If style varies by school, organization, or user, partition its cache by that scope or keep that part uncached. Never let a cached style value carry authorization decisions.
2. **Separate the header shell from identity.** Keep branding and navigation structure stable, and identify the smallest session-aware area that needs the result of `SiteHeader`'s `getUser()`. Do not cache user objects across learners. Compare fresh `getUser()` with the already-used `getClaims()` path only if the server-side security contract is equivalent; preserve logout, account switching, and redirects.
3. **Keep middleware authorization authoritative.** It already verifies claims on nearly all non-static requests. Avoid removing matcher coverage or relying on a client-side cached role. Any proposed exception must be a truly public/static asset and be verified against the existing protected route guards.
4. **Classify route data before caching.** Public published catalog/blog/docs fields may be candidates for shared caching; learner enrollment, progress, quiz attempts, permissions, live room/presence, and creator drafts are private or rapidly changing and must remain freshly authorized. Separate public display fields from private access state instead of caching entire page responses.
5. **Define invalidation before adding a cache.** List every write that changes a cached value (publish/edit/delete, style save/restore). Wire invalidation to the existing authorized server action only after the list is complete. Test that the prior value is replaced promptly after each mutation.
6. **Measure a cache hit as avoided work.** In preview, verify the second public request is served from the intended cache and does not invoke the server function. Verify stale entries refresh once, not on every navigation. Compare function invocations and Active CPU, not only perceived speed.
7. **Handle account lifecycle safely.** If any read-only private display snapshot is later considered, key it by authenticated user, clear it on logout/account switch, and never use it to authorize an action. Test learner-to-learner and learner-to-teacher transitions before release.
8. **Stop if the safety or cost case is unclear.** Keep current behavior when scope partitioning, invalidation, or measurable function savings cannot be demonstrated. Review cache work separately from polling changes.

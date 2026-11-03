# BrenUp Cache, Navigation, and Loading UX Plan

**Status:** Plan only; no code has been changed.
**Prepared:** 3 November 2026
**Goal:** Make repeat navigation feel immediate while reducing—not increasing—Vercel Function CPU and preserving current access control and data correctness.

Related CPU and release gates are in [the Vercel CPU Optimization Plan](./vercel-cpu-optimization-plan.md).

## 1. The requested learner experience

The owner describes this behavior:

1. On a first visit, the page loads normally and safe display data is saved locally.
2. On a later visit, show that saved view immediately.
3. Refresh it only when it is stale or invalidated, then update the view in the background.
4. Prepare likely next pages before the learner clicks, so navigation has little or no wait.

The established term for showing cached data while refreshing stale data is **stale-while-revalidate (SWR)**. In BrenUp it needs to combine several caches, not one blanket “cache every page” switch.

## 2. What the current app already does

- Next.js `<Link>` automatically prefetches visible links in production. In Next.js 15, a static route can be prefetched fully, but a dynamic route is commonly prefetched only to its nearest `loading.tsx` boundary.
- BrenUp already has route loading components for several high-use areas, including courses, quizzes, lessons, account, admin, level test, and IPA chart; the generic root fallback is a spinner.
- The root layout includes an async server header that calls Supabase `getUser()` and fetches platform style from Supabase. This is repeated work for dynamic navigations, but it does not prevent every route from being static.
- The production build checked for this plan reports `/docs` and generated `/blog/[slug]` articles as SSG. It reports `/`, `/blog`, `/courses`, and `/lessons` as dynamic. Verify those outcomes against Vercel cache logs; do not try to rework routes already served statically unless production evidence shows a problem.
- The app registers a service worker for push notifications. Do not assume that this is a persistent page cache or replace its behavior without checking push and scope behavior.

Next.js documents automatic prefetching, partial prefetch at loading boundaries, and its in-memory Router Cache in the [Next.js 15 Prefetching Guide](https://nextjs.org/docs/15/app/guides/prefetching) and [Caching Guide](https://nextjs.org/docs/15/app/guides/caching). That in-memory cache is not a persistent copy across browser restarts.

## 3. Recommended cache layers

| Layer | What to cache | Expected benefit | Vercel CPU effect |
|---|---|---|---|
| Static assets/CDN | Versioned JS/CSS/fonts/icons and approved public media | Reuse across navigation and app restarts | Usually avoids app function work for the cached asset. |
| Full Route Cache / ISR | Public pages whose output is shared across users | Cached HTML/RSC response instead of repeated rendering | Strongest route-level reduction when Vercel serves a cache HIT. |
| Next Data Cache | Shared public data such as published catalogs, blog/docs data, and global style settings | Avoid repeating the same Supabase query and render preparation | Reduces repeated server data work; invalidate on writes. |
| Next Router Cache | Current-session route segments and prefetched loading states | Fast same-tab navigation and back/forward behavior | Can skip some server round trips within the session. |
| Browser persistent data cache | Explicitly allowlisted display-data snapshots, not arbitrary page HTML/RSC | Fast return after closing and reopening the app | Can skip a server request while entry remains fresh; background refresh must not run on every visit. |

### Cache policy by data type

| Data | Recommended behavior |
|---|---|
| Public docs, blog, marketing content, published catalog metadata | Static/ISR or shared Data Cache with finite TTL and creator-triggered invalidation. |
| Public lesson/course description and media metadata | Cache shared fields; separate access, enrollment, and progress checks from the public data. |
| Global design/theme settings | Data Cache with a tag; invalidate immediately after save or restore. |
| Learner profile, progress, quiz attempts, tasks, entitlements, and school membership | Never shared through CDN. A persistent client snapshot is considered only after identity/access rules are designed; server actions always use fresh checks. |
| Live class/whiteboard, waiting-room admission, presence, quiz submit, payments, auth/session | Fetch fresh for sensitive reads and all mutations. Do not replay cached state as authoritative. |
| AI generation and media mutations | Never trigger through prefetch/cache. Preserve existing cache locks, credits, validation, and idempotency. |

## 4. How a safe repeat visit should work

### First visit

1. Deliver static app shell and immutable assets from the CDN.
2. Render a page-level loading boundary immediately for dynamic content.
3. Fetch current page data once, using existing protected API/server logic.
4. Save only an allowlisted data snapshot, including schema/content version, data timestamp, and the relevant cache namespace.

### Revisit while data is fresh

1. Render from the local data cache without calling Vercel again.
2. Do not perform a background refresh just because the route was opened; that would create extra Function CPU and defeat the objective.
3. Mutations update or invalidate the related cache from the authoritative server response.

### Revisit after data is stale

1. Render a safe cached view immediately where policy permits.
2. Issue **one deduplicated** refresh for that resource in the background; replace the view on success.
3. If the server says the user is unauthenticated, no longer authorized, or the item is removed, discard that cache entry and show the current login/access state.
4. Disable actions that depend on current state until authorization and fresh server state are confirmed.

### First visit after account switch or logout

Never show the prior user's private snapshot. Partition any allowed private cache by authenticated user and clear it on logout/account change. Public content may remain shared. Do not rely on local cached role or entitlement data for access control.

## 5. Prefetch without CPU fan-out

1. Keep default Next.js prefetch for normal visible `<Link>` routes unless production metrics show wasted work.
2. Do not set `prefetch={true}` broadly for all dynamic/private pages and do not load every link simultaneously.
3. For a few high-probability destinations, prefetch only after hover, keyboard focus, touch intent, or a short idle period. Limit concurrent prefetches and cancel obsolete work.
4. Prefer prefetching a public static route or its code/loading shell. Do not prefetch live room data, admin/student records, AI generation, PDF/audio transformations, or mutation routes.
5. Measure prefetch invocations and Function CPU. Keep it only if the full learner session uses less CPU than click-triggered loading.

## 6. Root shell and public rendering changes

1. Make the root layout contain static branding, fonts, CSS, and shell only where that can be done without changing the routes already confirmed as SSG. Remove or isolate repeated server-side session fetching from dynamic navigation paths; move account/session display into a small client session-aware component only after login/logout and role behavior are preserved.
2. Cache platform style as shared data, with explicit invalidation in the existing save/restore actions.
3. Audit `app/page.tsx` and each public route for its own cookie/auth access. Removing root-layout dynamic dependencies alone will not make a page static if the page itself reads session data. Prioritize the dynamic homepage, blog list, courses, and lessons routes; retain existing SSG for docs and generated blog articles.
4. Preserve current signed-in landing behavior. Any redirect optimization must not become an authorization check; `/admin`, learner pages, APIs, and server actions keep their current fresh permission guards.
5. Use public shared data for static/ISR output, and keep personalized access/progress in separately authorized dynamic components or endpoints.

Do not apply `Cache-Control: public` to a response that varies by session/cookie. Invalidate route/data tags after blog/course/lesson publication and platform style changes. Verify actual `x-vercel-cache` outcomes in production logs.

## 7. Loading experience: immediate, useful, and lightweight

### Behavior

- Navigation should react immediately: show the destination page's loading state as soon as the transition begins instead of a blank canvas.
- Use a branded progress animation with short, friendly messages, for example: “Getting your next lesson ready”, “Warming up your practice”, or “Your learning space is opening”. Avoid repeated or distracting jokes.
- Use route-appropriate messaging for a lesson, quiz, live class, or creator workspace. Keep the message short and secondary to the content skeleton.
- Use CSS transform/opacity animation, not a large Lottie/video/JS animation bundle. Respect `prefers-reduced-motion`; provide a static state.
- Do not show a made-up percentage. Use indeterminate animation unless real progress is available.
- Add nested `Suspense`/loading boundaries around the slowest sections so the header, page title, and stable content can render while a data panel loads.

### Cost boundary

The loader is client-side presentation and must not call an API. A spinner/animation improves perceived speed but does not count as CPU saved. CPU savings come from static/cache HITs, fewer server invocations, and less synchronous work.

## 8. Phased implementation and validation

### Phase 1 — Verify current behavior

- Fresh production build: inspect prerendered routes and dynamic route reasons.
- Browser/WebView trace: measure click-to-first-feedback, click-to-content, server round trips, cache status, route CPU and invocation counts.
- Confirm whether same-origin navigation uses Next `<Link>` or full page reload; inspect all 21 native `<a href>` cases and keep true external/download links intact.
- Baseline logged-out public page, learner pages, and teacher/admin page separately.

### Phase 2 — Shared shell and public cache

- Decouple root session-aware header and cache global style.
- Restore static/ISR delivery for public routes that can safely be shared.
- Add narrowly scoped tags/invalidation and confirm published changes appear promptly.

### Phase 3 — Repeat-visit data cache

- Add a small, versioned, size-bounded browser cache for explicitly allowlisted display data; use IndexedDB for persistence across app restarts, not full HTML/RSC payload replay.
- Start with public data; add per-user read-only snapshots only after data classification and logout/account-switch clearing are proven.
- Cache hits within freshness window make no Vercel request. Stale entries cause one deduplicated background request, not a refresh on every opening.
- Never let local data approve access, publish content, submit an answer, record progress, or change payment/live state.

### Phase 4 — Navigation and loading polish

- Preserve Next default prefetch for useful links; add only limited intent prefetch after checking CPU budget.
- Add/adjust loading boundaries and CSS loader for high-use routes.
- Verify Android WebView, low-bandwidth/slow-network, reduced-motion, and offline/error behavior.

### Phase 5 — Tune live-class CPU separately

- Reduce the one-second whiteboard HTTP fallback while Realtime is healthy; retain fast event-triggered refresh and bounded recovery polling.
- Tune waiting-room and admin refresh intervals only after admission/state freshness tests.
- Compare active CPU and invocations per learner-minute and per class-hour.

## 9. Acceptance criteria

- **CPU:** A cache hit must avoid the intended server function. Fresh-cache revisits must not issue a refresh. Stale refreshes are deduplicated. Total route CPU and invocations for an equivalent learner session do not increase; target a measurable aggregate reduction and projected usage below 80% of the confirmed normal monthly allowance.
- **Navigation:** Cached public routes show content promptly; dynamic routes show a branded loading state immediately and stream current content as it arrives. Measure p50/p75 before and after; do not promise identical timing on every device/network.
- **Security:** Test logged-out → learner → logout → different learner → teacher/admin transitions; revoked access; deep links; stale cache eviction; and fresh authorization on every protected action.
- **Freshness:** Test public publish/edit/delete, global style save/restore, learner progress updates, quiz attempts, and live class changes.
- **Platform:** Test desktop browser and Android WebView, service-worker registration/push, full reload, back/forward, app relaunch, and a slow/offline connection.
- **App quality:** Run `npm run typecheck`, `npm run lint`, and `npm run build` after implementation; compare Vercel route CPU, invocations, cache HIT/MISS, and user-visible navigation timings.

## 10. Limits and trade-offs

- “Every page, fully current, instant after app relaunch” cannot be guaranteed: a new page/cache miss needs a network response, and some protected state must be checked fresh.
- Persistent user-specific snapshots are technically possible but should not include access decisions or sensitive learning records by default. Showing stale private content before authorization is not acceptable.
- A stale view plus an immediate background refresh on every visit improves perceived speed but does not necessarily lower CPU. This plan instead skips refresh while cache is fresh and refreshes only expired/invalidated data.
- Prefetching all visible and hidden destinations can increase Vercel CPU; it is deliberately limited and measured.
- Service Worker caching of all Next.js RSC/navigation/API responses is not recommended. Cache only explicit asset/data allowlists and keep push behavior intact.

## References

- [Next.js 15 Prefetching](https://nextjs.org/docs/15/app/guides/prefetching)
- [Next.js 15 Caching](https://nextjs.org/docs/15/app/guides/caching)
- [Next.js Link API](https://nextjs.org/docs/15/app/api-reference/components/link)
- [Vercel Active CPU behavior](https://vercel.com/docs/functions/usage-and-pricing)
- [Vercel route-level CPU and invocation metrics](https://vercel.com/docs/query/monitoring/monitoring-reference)

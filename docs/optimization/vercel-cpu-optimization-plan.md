# BrenUp Vercel CPU Optimization Plan

**Status:** Polling items in Phase B are implemented locally; remaining items are plans. No Vercel settings have been changed.
**Prepared:** 3 November 2026
**Purpose:** Lower BrenUp's measured Vercel Function CPU while preserving learner, creator, authorization, and AI behavior. Coordinate this with the navigation/cache/loading plan in this folder.

## 1. Goal and constraints

Vercel has reportedly restored the project and granted a three-times CPU allowance for 30 days. Treat that as time to measure and improve; confirm the exact dates and normal allowance in Vercel. The lasting goal is to fit normal usage with headroom, not to consume the temporary allowance.

The codebase is Next.js 15 App Router with Supabase, Cloudflare R2, live-class APIs, Gemini/other AI integrations, and a Mac-hosted Ollama gateway. Preserve current authorization checks, RLS, lesson/quiz identities, AI caching/credit/validation/telemetry, and media URLs.

### CPU versus function runtime

Function wall time is how long the request takes end to end. Active CPU is the part spent executing code. On Vercel Fluid Compute, waiting for database, AI-provider, or other network responses is not Active CPU time. Therefore:

- Shortening a slow database wait may improve learner experience without materially lowering Active CPU.
- Reducing repeated invocations, auth work, parsing, transforms, loops, and serialization can lower Active CPU.
- `maxDuration` is a timeout ceiling, not a CPU-reduction control.
- Cache and prefetch changes must be measured for both CPU and invocations. A cache that refreshes on every page entry can improve perceived speed while leaving CPU unchanged or increasing it.

Vercel describes Active CPU, route-level Function CPU Time, invocation counts, and runtime logs in its [Function pricing](https://vercel.com/docs/functions/usage-and-pricing), [Monitoring Reference](https://vercel.com/docs/query/monitoring/monitoring-reference), and [Runtime Logs](https://vercel.com/docs/logs/runtime).

## 2. Code-grounded candidates

These are hypotheses to verify with Vercel route metrics, not claims that each is currently a top CPU consumer.

| Candidate | Current code behavior | Why investigate |
|---|---|---|
| Root layout and session header | `app/layout.tsx` reads shared platform-style settings from Supabase; `components/SiteHeader.tsx` calls Supabase `getUser()`. | Shared root work can affect dynamic navigations. The production build checked for this plan shows that `/docs` and generated `/blog/[slug]` articles are already SSG, while `/`, `/blog`, `/courses`, and `/lessons` are dynamic. Preserve the routes already static and investigate the dynamic ones individually. |
| Middleware | `middleware.ts` matches nearly every non-static request and calls Supabase `getClaims()`. API handlers and protected pages also perform their own checks. | Repeated claim verification may accumulate across high traffic. Any narrowing must preserve canonical-host behavior, login redirects, and route-level fresh authorization. |
| Live whiteboard recovery | `components/whiteboard/useWhiteboard.ts` polls every second even though Supabase Realtime is the fast path. `/api/live/[id]/board` authenticates and runs database lookups to return board state. | Repeated polls add function invocations and repeated CPU work per poll. This is a clear request-volume candidate; database waiting itself is not Active CPU. |
| Waiting room and live monitor | Waiting room polls every 2.5 seconds; the admin monitor refreshes the full route every 12 seconds; the live state view refreshes periodically. | Frequent polls/page refreshes can cause unnecessary server rendering and function calls, especially when several learners are connected. |
| Shared/public content | Docs use static params and blog pages declare five-minute revalidation; the home/catalog routes query Supabase. | Verify whether production actually returns static/ISR cache hits. Cache only public, shared data and invalidate it after publishing or editing. |
| Media/CPU-heavy handlers | Routes include image/audio/PDF processing and large body parsing; Reel Machine is a separate local Mac/Python workflow. | Profile CPU per route before changing implementation. External AI inference is often mostly I/O wait; local parsing/processing is the part to measure. |

## 3. Phased work

### Phase A — Establish a trustworthy baseline

1. Confirm Vercel's normal and temporary CPU allowances, the promo expiry, whether Fluid Compute is active, and the dashboard's CPU definition for this team.
2. In Vercel Observability/Usage, record Function CPU Time, invocations, error rate, and CPU by route over representative days. Separate middleware from application functions where the dashboard allows it.
3. Capture a representative workload: ordinary learner navigation, one real live class with the expected participant count, one lesson-builder session, and any known high-use media/assessment route.
4. Record per-workload route invocations and CPU, not only response duration. Use privacy-safe route and timing data; do not log learner content, tokens, or secrets.
5. Rank routes by cumulative CPU contribution (invocation volume × CPU per invocation) and identify the small set contributing most of the total. Start changes there.

### Phase B — Low-risk reductions in repeated work

1. **Live whiteboard (implemented locally):** Realtime remains the immediate update path. The HTTP poll now runs every 15 seconds while connected and every 5 seconds while disconnected; it pauses on hidden tabs and refreshes immediately on events, reconnect, browser online, and visibility return. Board authorization and mutation rules are unchanged. Compare equivalent live-class metrics before claiming CPU savings.
2. **Other live polling (partially implemented locally):** waiting-room admission polling, admin live-monitor refresh, and AI Studio auto-refresh pause on hidden tabs and refresh immediately when visible again. Replacing full refreshes with targeted updates or changing visible-tab cadence remains deferred pending freshness validation.
3. **Middleware:** use route-level CPU data to decide whether to exclude paths from middleware's Supabase claim check. API handlers and server pages retain their own fresh auth checks. Do not remove checks to gain speed. Preserve the apex-to-`www` redirect and `/.well-known/assetlinks.json` exception.
4. **Root shell:** separate session-aware header work from the static root shell and cache the global style settings with explicit invalidation after save/restore. Keep the current signed-in landing and role behavior; never use stale cached role data to authorize a route.

### Phase C — Cache without increasing Vercel load

Follow [the cache/navigation design](./cache-navigation-and-loading-ux-plan.md):

- Use Vercel CDN/Next Full Route Cache or ISR for public, shared routes where safe. A cache HIT should avoid invoking the page function.
- Cache shared Supabase query results explicitly with Next's supported data-cache APIs and tags; Supabase SDK calls are not automatically cached merely because they run in a Server Component.
- Invalidate tags/paths only after corresponding creator mutations (publish/edit/delete), platform-style changes, and other writes that affect that public data.
- For previously viewed client data, serve a still-fresh local cache without a server call. When expired, issue one deduplicated refresh in the background. Do not background-fetch every cached page on every visit.
- Do not prefetch all destinations at once. Keep automatic Next `<Link>` prefetch where its production behavior is useful; add intent prefetch only to a small number of high-probability, safe destinations. Disable/avoid speculative fetch for expensive private routes, live rooms, AI generation, and actions.
- Compare added prefetch CPU/invocations with reduced click-time requests. Remove prefetch behavior if aggregate CPU rises.

### Phase D — Reduce CPU inside measured hot functions

For the few routes shown by baseline to contribute substantial Active CPU:

1. Profile synchronous code: JSON/form parsing, validation of large payloads, repeated transformations, image/audio/PDF processing, large result assembly, and serialization.
2. Avoid repeating the same lookup/transform within one request; parallelize independent I/O only where it does not change authorization or mutation order. Parallelization mostly improves wall time, so validate CPU separately.
3. Keep payloads and result sets bounded; paginate large admin/content results and select only fields required for rendering.
4. Keep heavy media transforms out of interactive request paths where a safe browser-side or existing media service path can handle them. Do this only for measured hotspots and preserve upload validation and R2 ownership.
5. Preserve the existing `callGemini` pipeline, cache locks, credit accounting, validation, fallback/privacy rules, and telemetry. Do not create a second AI pipeline. Do not treat long Gemini/Ollama response wait as CPU-heavy without route CPU evidence.
6. Do not raise or lower `maxDuration` as a CPU optimization. Set it only to match a real operation's timeout needs.

### Phase E — Loading experience with no server-side animation cost

Use the separate loading design: CSS/browser-only lightweight animation, short messages, route-specific loading boundaries, and nested streaming fallbacks. Do not add a server request for the animation, fake numeric progress, or a heavy client animation bundle. This is a perceived-speed improvement; it must not be reported as CPU saved unless metrics prove it.

## 4. Measurement gates and acceptance

Implement one optimization group at a time on a preview deployment, then compare equivalent route traffic and workloads before merging/deploying.

**Success criteria:**

- Aggregate Function CPU is measurably lower for the same representative workload; no prefetch/cache change increases total CPU or invocations without a clear and accepted learner benefit.
- Projection at ordinary monthly traffic fits within the confirmed normal CPU allowance with a recommended 20% buffer. If baseline data cannot support that conclusion, report what remains unknown rather than claiming success.
- Live classroom update latency, reconnect recovery, waiting-room admission, login/logout, role gates, page freshness, creator publish invalidation, and media/AI flows remain correct.
- Public static/ISR routes show cache hits; private pages and APIs do not expose another user's cached content.
- Add appropriate route-level loading UI and confirm it appears immediately on slow navigation without creating extra server work.

The repository's required release checks are `npm run typecheck`, `npm run lint`, and `npm run build`. Any production release stays on Vercel; this plan does not begin a hosting migration.

## 5. Main risks and safeguards

- **Cache leaks:** never use shared CDN cache for cookies, learner progress, role decisions, quiz attempts, admin data, signed media, or live-class state.
- **Staleness:** use explicit allowlists, finite freshness periods, and write-triggered invalidation. Make private actions depend on fresh server checks.
- **CPU rebound:** prefetch and stale refresh can add work. Bound, deduplicate, and measure them; no eager fan-out across all links.
- **Behavior regressions:** preserve fresh authorization, Supabase RLS, deep links, Android WebView behavior, service-worker scope, cache busting, and AI controls.
- **Unproven percentage:** no code review can promise a fixed CPU reduction without real Vercel route metrics. The goal is a repeatable before/after result and headroom under the normal allowance.

## References

- [Vercel Active CPU pricing and billing behavior](https://vercel.com/docs/functions/usage-and-pricing)
- [Vercel Function CPU and invocation metrics](https://vercel.com/docs/query/monitoring/monitoring-reference)
- [Vercel runtime logs and route details](https://vercel.com/docs/logs/runtime)
- [Next.js 15 caching guide](https://nextjs.org/docs/15/app/guides/caching)
- [Next.js 15 prefetching guide](https://nextjs.org/docs/15/app/guides/prefetching)

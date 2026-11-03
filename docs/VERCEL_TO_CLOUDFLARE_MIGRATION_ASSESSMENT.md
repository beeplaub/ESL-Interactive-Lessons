# BrenUp: Vercel to Cloudflare Migration Assessment

**Assessment date:** 3 November 2026
**Scope:** Codebase and platform compatibility review for moving the BrenUp Next.js application from Vercel to Cloudflare. This is an assessment only; no app code, deployment, DNS, Supabase data, or account settings were changed.

## Executive summary

**A Cloudflare migration is technically possible, but it is not a drop-in hosting change and cannot yet be called “no compromise.”** BrenUp is a full-stack Next.js application, so the relevant Cloudflare target is **Workers**, not a Pages static export. Cloudflare currently recommends Vinext for new Next.js-on-Workers projects, but it is in beta and its existing-project guide is centered on Next.js 16. The repository currently runs Next.js **15.5.19**. The Cloudflare OpenNext adapter documents support for current Next.js 15 minor releases and most of the features BrenUp uses, making it a reasonable first compatibility-spike candidate for this version; that does not prove every BrenUp route or package will work unchanged.

The strongest migration risks are:

1. **Workers Free CPU limit:** Free allows 10 ms of CPU per invocation, not a monthly pool of CPU hours. Cloudflare itself says SSR and heavier requests can use 10–20 ms. This could fail on ordinary dynamic pages before the daily request limit is reached. A Cloudflare Paid Workers plan has a much higher per-invocation CPU limit, but it is not zero cost.
2. **Node-host-specific features:** Reel Machine uses `child_process`, Python, Ollama on localhost, and persistent local files. Those capabilities cannot be assumed to work inside a Worker and should remain on a separate Mac/service or be redesigned. Current Vercel-specific feature gates also need replacing with explicit configuration before changing hosts.
3. **Large/long-running creator workflows:** AI, voiceover, speech, PDF, media upload, and cleanup code includes Node-runtime routes, request bodies up to 25–30 MB, and Vercel `maxDuration` values up to 300 seconds. These require route-by-route adapter, memory, CPU, and timeout validation.
4. **Filesystem and native-package assumptions:** knowledge content is discovered by traversing the local filesystem; PDF.js is loaded from `node_modules`; Reel Machine reads and writes local files; and one API uses native `sharp`. A Worker’s filesystem is virtual/ephemeral, and native Node add-ons and subprocess execution are not a safe portability assumption.
5. **Operations and identity:** Supabase, R2, Firebase, AI providers, Cloudflare TURN, and the existing notification scheduler can remain external services, but secrets, OAuth callbacks, canonical-domain behavior, cron ownership, storage CORS, and realtime flows must be checked in a staging deployment.

**Recommendation:** Do not switch production DNS or treat a free Workers deployment as a fix for Vercel’s reported CPU pause yet. First run a non-production compatibility spike with the current Next.js 15.5 app, measure real Worker CPU per dynamic request, and validate the high-risk paths below. Keep the existing Cloudflare notification-scheduler Worker separate unless there is a deliberate redesign; it currently calls the production app and does not host it.

## What was reviewed

The repository review covered the Next.js and package configuration, deployment and cron configuration, middleware/authentication, the app/API route inventory, runtime and duration declarations, environment-variable *references* (names/categories only), local filesystem/process use, storage and media paths, Supabase clients, AI/speech integrations, and the existing Cloudflare scheduler. It did not read `.env.local`, secret values, service-role credentials, private learner records, or the live Cloudflare/Vercel account dashboards. The user-reported Vercel pause and CPU-hours figure are treated as context, not independently verified account telemetry.

Current code facts relevant to the decision:

- The installed Next.js version is **15.5.19**; the app uses the App Router and React 19.
- There are **80** `app/api/**/route.ts` handlers. Many are dynamic/authenticated endpoints; the application is not a static-export candidate without major feature removal.
- `middleware.ts` refreshes/verifies Supabase auth cookies, enforces login redirects for protected routes, applies role-based landing redirects, and canonicalizes `brenup.com` to `www.brenup.com` while exempting the Android asset-links document.
- `next.config.mjs` sets Server Actions’ body limit to **30 MB** and configures output tracing for PDF.js files.
- `vercel.json` defines four scheduled paths. In addition, `cloudflare/notification-scheduler/` contains a deployed-style Worker configuration with a 15-minute Cron Trigger; that Worker calls `https://www.brenup.com/api/cron/notifications` with an authorization header. It is a scheduler, not the Next.js host.
- The code references Supabase, R2 through the S3-compatible API, Firebase Admin/web push, Brevo, Google/Gemini, Groq, OpenRouter, Azure Speech, JaaS/Jitsi, Cloudflare TURN, and a local Kokoro/Ollama toolchain. Moving the web runtime does not automatically move these services or their data.
- Two application locations branch on `process.env.VERCEL`; one disables local Reel Machine behavior on Vercel, and another blocks a local Ollama-only path. A Cloudflare deployment would not set that Vercel marker, so these gates could take the wrong branch after migration.

## Migration risk register

### 1. Hosting model and Next.js adapter — **High, first gate**

BrenUp depends on server rendering, route handlers, Server Actions, middleware, dynamic pages, and scheduled server work. Cloudflare Pages’ Next.js guide is for static exports; Cloudflare directs full-stack Next.js applications toward Workers. Static-exporting BrenUp would remove or materially alter login, creator workflows, APIs, and dynamic learner experiences.

Cloudflare’s current Next.js guide recommends **Vinext**, which reimplements the Next API surface on Vite and is marked beta. Its current existing-app path is aimed at Next.js 16. The app here is Next.js 15.5.19. The Cloudflare OpenNext adapter’s feature matrix lists App Router, Route Handlers, RSC, SSR, Server Actions, middleware, streaming, and ISR as supported, with a note that Node.js middleware is not supported. OpenNext’s Cloudflare documentation says current Next.js 15 minor releases are supported. This points to an OpenNext compatibility spike for the present version, while keeping Vinext as a later option after its compatibility with this app/version is demonstrated.

**Must prove:** the exact lockfile dependencies build under the chosen adapter; all pages and API routes are emitted; dynamic rendering and Server Actions work; middleware cookie mutation/redirect semantics match; streaming routes work; and static/build assets are included. Do not infer compatibility only from a successful compile.

### 2. CPU quota and the reason for leaving Vercel — **Critical if Workers Free is required**

Cloudflare Workers Free currently limits each HTTP invocation to **10 ms CPU** and the account to **100,000 requests per day**. Network waiting is not counted as CPU, but SSR, JWT work, parsing, serialization, and other synchronous work is. Cloudflare’s limits page notes that heavier authentication, SSR, or payload parsing commonly uses 10–20 ms. A request that exceeds the free CPU limit can fail even if the account has used very little total CPU that day.

This is not a monthly four-hour CPU-hours pool and is not directly comparable to Vercel’s account/project CPU accounting. The arithmetic upper bound of 100,000 invocations × 10 ms is about 16 minutes 40 seconds of CPU per day, but that is **not** a shared allowance: every individual invocation still has its own 10 ms cap. The app’s dynamic learner/admin pages and authenticated middleware must therefore be measured on Workers Free before considering it a fix.

Workers Paid currently has 30 million CPU milliseconds included in its listed monthly allowance, default 30 seconds per invocation, and configurable per-invocation CPU up to five minutes. It also changes request allowances/pricing. If paid use is acceptable, compare its monthly usage model with Vercel and measure real CPU; do not assume a free tier will absorb the same workload.

### 3. Node.js APIs, native modules, and subprocesses — **High**

Cloudflare Workers has a growing Node.js compatibility layer, but it is a subset of Node.js; an import shim does not guarantee an API is functional. The repository includes:

- `lib/reels-server.ts`: `node:child_process` spawn, local Python, filesystem reads/writes, generated output directories, and localhost Ollama checks. This is an explicitly local/Mac workflow and should stay outside the app Worker or move to a separate container/service. The Worker filesystem is not durable shared storage. Current Vercel checks based on `process.env.VERCEL` must become an explicit deployment/feature setting so Cloudflare cannot accidentally expose or attempt the local engine.
- `app/api/creator-tools/reels/images/route.ts`: native `sharp` processing plus filesystem writes. This endpoint requires redesign/offload (for example, a supported image service/WASM approach and durable object storage) or should remain local-only.
- `app/api/creator-tools/reels/files/route.ts` and the other Reel routes: filesystem-backed file serving and range reads; these cannot rely on deployment-local persistent disk.
- `lib/knowledge-base.ts`: walks `content/docs` and `content/blog` using `fs.readdirSync` at runtime. Since this is repository-owned static content, prefer build-time indexing/embedding or a tested static-asset packaging strategy; do not rely on an on-disk repo tree being present at runtime.
- `app/api/pdfjs/route.ts`, `app/api/pdfjs-worker/route.ts`, `app/pdfjs/[file]/route.ts`, `lib/pdfParser.ts`: PDF parsing and file reads from traced `node_modules` paths. Confirm the adapter bundles the required PDF.js assets and that memory/CPU stay within the target plan. Worker `fs` is virtual and file handling has different persistence semantics.
- `lib/liveCalling.ts` uses Node crypto signing for JaaS tokens; `lib/ai/efficiency.ts` and speech/AI code use Node crypto/Buffer. These APIs are supported in Workers compatibility mode, but the package/runtime combination still needs an integration build/test.

**Scope decision:** treat Reel Machine as excluded from “same app behavior” unless the user explicitly wants a separate hosting redesign. Keep its Mac/local-engine handoff or move it to a dedicated Node/Python service. This is not a reason to migrate the rest of BrenUp, but it is a real feature boundary.

### 4. Request CPU, long operations, uploads, and memory — **High**

The code has Vercel `maxDuration` declarations of 60–300 seconds for speech, AI, creator, and cleanup paths. Examples include AI creator-agent, voiceover, conversation/reel script generation, lesson builder, quizzes, and roleplay. Cloudflare HTTP requests can remain open while a connected client waits, but this does not remove the configured CPU ceiling. Cloudflare Paid’s default CPU limit is 30 seconds and can be increased up to five minutes; Free is still 10 ms CPU. Adapter handling of Next’s `maxDuration` is not a safe assumption—configure/verify the Worker CPU limit directly and test client disconnect/retry behavior.

Several paths accept and buffer meaningful payloads: speech and narration routes accept up to 25 MB, pronunciation assessment up to 8 MB, roleplay recordings up to 25 MB, some live-class assets parse files/PDFs, and Server Actions allow 30 MB. Cloudflare’s current request-body limit on Free/Pro account plans is 100 MB, so its ingress ceiling is not the only concern. In-memory `formData()`, `arrayBuffer()`, `Buffer` copies, conversion, and AI responses can pressure the Worker’s 128 MB memory limit and consume CPU. Test representative largest files, concurrent uploads, PDF pages, and downstream provider timeouts.

Large media already uses R2 through `lib/storage/mediaStorage.ts`; retain that data plane. Confirm R2 CORS, signed URLs, S3 compatibility, media custom-domain cache headers, and browser direct-upload flow. Keep uploads direct to R2 where the current flow supports it rather than proxying large bytes through the app Worker.

### 5. AI and speech integrations — **High for creator/learner features**

AI and speech endpoints combine Supabase authorization/credit checks, remote provider requests, response validation, audio buffering, and sometimes local-only fallbacks. Providers include Gemini/Google, Groq, OpenRouter, Azure Speech, JaaS, and the Kokoro/Ollama service. Remote I/O wait generally does not consume Workers CPU, but parsing/encoding and rendering do; request duration, provider timeouts, client disconnects, and retries still matter. The local Ollama `127.0.0.1` path refers to the Worker’s runtime environment, not the creator’s Mac, so it must remain gated as local-only. Preserve existing AI cache/duplicate-generation/credit/telemetry behavior; the host migration should not introduce a second generation path.

**Must prove:** one representative call per provider route; voiceover preview/save/attach; learner pronunciation assessment and transcription; roleplay; AI creator flow; upload to R2; and retry/idempotency behavior. Confirm environment secrets are provisioned as Worker secrets and never placed in public variables.

### 6. Supabase auth, authorization, cookies, and OAuth — **High, security-sensitive**

The app uses `@supabase/ssr` in server and browser clients, a root middleware that refreshes auth cookies and verifies claims, server actions and API handlers that perform fresh user/staff checks, and privileged server-side Supabase operations. This architecture can remain on Supabase; a hosting migration should not require moving tables, RLS, or learner records.

The risk is behavioral/configuration parity: ensure the adapter passes `Cookie` and `Set-Cookie` correctly through middleware/redirects and Server Actions; do not weaken the current `requireUser`/`requireStaff` checks; keep admin/service credentials server-only; and preserve `www.brenup.com` as the same canonical origin if possible. If staging or production hostnames change, update Supabase Auth Site URL/redirect allowlists, Firebase authorized domains, OAuth provider callback settings, and any CORS allowlists. If the public host remains the same and only its Cloudflare routing changes, these identity allowlists may not need a production URL change, but still test login, refresh, reset-password, native sign-in, and invite flows.

### 7. Domain, middleware, caching, static content, and PWA — **Medium–High**

The Cloudflare-managed domain is a migration advantage: the public hostname can potentially remain `www.brenup.com`, preserving cookies and links. But DNS/Worker routing must be staged carefully. Verify the apex-to-www 308 behavior, exception for `/.well-known/assetlinks.json`, TLS, API paths, robots/sitemap/RSS URLs, reset/invite links, and push-notification URLs. Preserve service-worker scope and cache versioning under the same origin; test upgrade from cached client bundles.

The code uses `revalidatePath` widely, a blog ISR interval (`revalidate = 300`), static params for docs/blog, and a dynamic docs search route. OpenNext lists ISR support, but cache storage/invalidation across Worker instances must be configured and verified; Vercel Data Cache behavior is not automatically portable. Avoid caching authenticated dashboards, learner-specific pages, or private media. The root page uses one `next/image` import. Cloudflare’s OpenNext matrix says image optimization is supported through Cloudflare Images, so confirm whether current output relies on Vercel’s built-in optimizer and choose an explicit supported configuration.

### 8. Cron and background work — **Medium–High**

Current schedules in `vercel.json`:

| Route | Current schedule | Main concern |
|---|---:|---|
| `/api/cron/cleanup-roleplay-recordings` | Daily 03:00 UTC | Preserve authenticated cleanup, object deletion and idempotency. |
| `/api/cron/cleanup-instant-live-media` | Daily 05:00 UTC | Route declares 60-second Vercel duration; measure work and retries. |
| `/api/creator-tools/voiceover/cleanup` | Daily 04:00 UTC | Node runtime; verify R2/Supabase cleanup. |
| `/api/cron/notifications` | Daily 02:00 UTC in Vercel config | Also invoked by the existing Cloudflare scheduler every 15 minutes. Confirm intended ownership and avoid duplicate dispatch. |

The Cloudflare scheduler is configured separately with `BRENUP_ORIGIN=https://www.brenup.com` and a required secret. If the app moves but keeps that hostname, the scheduler can continue calling it after DNS/Worker routing changes. If the origin changes, update it and verify secrets. The three cleanup cron schedules still need a Cloudflare Cron Trigger or another scheduler. Cloudflare Free currently allows five Cron Triggers per account, but the 15-minute existing trigger already uses one; count every other Worker’s Cron Triggers in the account before assuming room. Cloudflare cron jobs have their own CPU and execution constraints, and the Free per-trigger CPU cap is also 10 ms. Add alerting/health checks and retain an idempotency plan before disabling Vercel schedules.

### 9. Third-party services and network behavior — **Medium**

Keep Supabase, R2, Firebase/FCM, Brevo, AI providers, Azure Speech, JaaS, and TURN as external integrations initially. Confirm outbound HTTPS/TLS and required headers, package support for the Worker runtime, rate limiting, timeout handling, and provider allowlists. Cloudflare TURN credential issuance and peer-to-peer WebRTC media should remain a client/external-service flow; do not route live media through a Next.js Worker. Test Supabase Realtime channels, live class state, device push, lesson audio, signed/private R2 media, and Cloudflare TURN from the new app host.

### 10. Build/deploy workflow, observability, and rollback — **Medium–High**

The project currently has standard `next dev`, `next build`, and `next start` scripts, no root app Worker config, and no OpenNext/Vinext config. `cloudflare/notification-scheduler/wrangler.jsonc` is for the scheduler only. A separate app build/deploy setup must be added only after choosing an adapter. Keep Vercel production intact during validation; use a temporary Worker hostname first. Deploy a representative production build, verify logs/CPU/error metrics, and validate the custom hostname only after parity. Have a DNS rollback plan that can restore Vercel without changing Supabase/R2 data or publishing duplicate cron runs.

The Worker bundle also needs a size/startup review. Cloudflare currently lists a 64 MiB uncompressed Worker-size ceiling and 1-second startup limit; statically included content and dependencies can affect both. Measure the adapter output, not only `next build` output.

## Hosting and service boundary

| Component | Current location/behavior | Cloudflare migration treatment |
|---|---|---|
| Next.js site/API | Vercel, Next 15.5.19 | Candidate for Cloudflare Workers via a Next adapter; must pass app-specific compatibility and CPU checks. |
| Notification schedule | Existing Cloudflare Worker, every 15 minutes | Keep separate initially; change origin only if hostname changes; check overlap with Vercel notification cron. |
| Other three scheduled cleanups | Vercel Cron | Recreate as Cron Triggers or keep a separate scheduler; preserve auth, idempotency, monitoring. |
| Database/auth | Supabase | Keep in place; migrate Worker secrets and test cookies, redirects, RLS-preserving server authorization. |
| Media | Cloudflare R2 via S3 API and `media.brenup.com` | Can remain; verify credentials, CORS, signed URL behavior, and direct upload. |
| Local Reel Machine | Mac/Python/Ollama/local filesystem | Exclude from Worker or redesign as a separate Node/Python service with durable storage. |
| AI, speech, push, video/live providers | External APIs/services | Keep external; test outbound requests, timeouts, secrets, realtime/browser flows. |

## Recommended decision process

### Phase 1 — Non-production adapter spike

1. Preserve the current lockfile and Next.js 15.5.19 initially. Evaluate OpenNext against this version; do not silently combine a Next upgrade and hosting migration.
2. Build to a temporary Workers hostname with no production DNS cutover. Provision only staging credentials, never copy secret values into the repository.
3. Check adapter output includes all API routes, middleware, docs/blog assets, PDF.js resources, and static assets; inspect Worker bundle size and startup report.
4. Measure CPU for unauthenticated/static routes, Supabase-authenticated navigations, learner lesson/quiz, course page, admin page, common Server Actions, and route handlers. On Free, stop early if normal dynamic requests exceed 10 ms.
5. Run full file upload/audio/PDF/AI route checks using representative maximum supported payload sizes and concurrency.

### Phase 2 — Feature parity and operations

1. Prove auth cookies, refresh, redirects, role gates, OAuth callback, password reset, and account/invite flows.
2. Prove R2 media upload/playback/signed access, Supabase Realtime, Web Push, TURN credential issuance, and live room state.
3. Port cron triggers and check the existing scheduler/notification overlap; test health rows, retries, and duplicate dispatch protection.
4. Resolve Reel Machine, knowledge-base file discovery, PDF.js packaging, image optimization, and all `process.env.VERCEL` branches.
5. Verify cache revalidation/ISR, docs/blog, RSS/sitemap, service-worker update, Android asset-links route, and canonical-domain redirects.

### Phase 3 — Cutover gate

Cut over only after all required routes pass on the chosen paid/free plan and the project owner accepts any explicitly excluded feature or changed behavior. Keep Vercel config/deployment available for rollback. Change Cloudflare DNS/Worker route only with a defined revert path; then update scheduler origin and disable old cron ownership without running two dispatchers concurrently.

## Go/no-go checklist

| Gate | Status | Go condition |
|---|---|---|
| Full-stack Next.js adapter for current version | **Open** | Production-like build and routes verified; version/adapter choice is supported. |
| Workers Free CPU suitability | **High risk / Open** | Real SSR/auth CPU stays below 10 ms per invocation with headroom, or paid plan is accepted. |
| Node-runtime route compatibility | **Open** | Every route tested; incompatible paths redesigned/offloaded or explicitly excluded. |
| Reel Machine boundary | **Known incompatibility** | Remains local/separate and Vercel-specific flags replaced before moving. |
| Filesystem/PDF/docs assets | **Open** | Static content and PDF.js are packaged/tested; no reliance on persistent Worker disk. |
| Supabase auth and security | **Open** | Cookie refresh, redirects, role/authorization paths and callbacks pass without policy changes. |
| Upload, AI, speech, media | **Open** | Max payload, memory, provider timeout, R2, and retry flows pass. |
| Cron parity | **Open** | All four schedules owned exactly once; health and failure recovery proven. |
| DNS/domain and PWA | **Open** | Same-origin paths, TLS, `.well-known`, canonical redirect, push, and SW upgrade verified. |
| Rollback | **Open** | Vercel rollback path and cron de-duplication procedure documented. |

## Final conclusion

Cloudflare Workers is a valid **candidate** for hosting BrenUp’s full-stack Next.js app; Cloudflare Pages static hosting is not an equivalent replacement. The existing Cloudflare notification Worker and domain are useful infrastructure, but they do not remove the migration work. The primary decision is whether BrenUp can run within the intended Workers plan: the Free plan’s 10 ms per-request CPU ceiling is a significant concern for this app’s authenticated SSR, while the Paid plan offers more CPU but changes the cost profile. Reel Machine must remain local or move to a separate service, and PDF/content packaging, AI/speech routes, cron, auth, R2, and live features need staged proof before a production cutover.

### Sources

- [Cloudflare: Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare: OpenNext adapter support matrix](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
- [OpenNext Cloudflare adapter and supported Next.js versions](https://opennext.js.org/cloudflare)
- [Cloudflare: Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare: Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare: Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [Cloudflare: `node:fs` runtime behavior](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/)
- [Cloudflare: Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare: Next.js on Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
- [Supabase: SSR authentication for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)

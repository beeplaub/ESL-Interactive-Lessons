# BrenUp Optimization Plans

This folder collects the Vercel CPU and learner-navigation optimization work, its plans, and implementation status. Polling reductions are implemented in the release changes; CPU impact remains unmeasured until a comparable live-class workload is available.

## Current context

- On 3 November 2026, the project owner reported that Vercel restored the account and granted three times the usual CPU allowance for 30 days. This is user-reported account information and should be verified in Vercel before setting a final budget.
- The immediate objective is to keep BrenUp on Vercel, reduce measured Function CPU, and make returning to previously visited pages feel faster without increasing Vercel work through indiscriminate prefetching.
- The ordinary allowance, expiry date, and actual route-level CPU baseline must be read from the Vercel dashboard. A temporary allowance is not the optimization target.

## Plans

- [Vercel CPU, function-runtime, cache, and navigation optimization plan](./vercel-cpu-optimization-plan.md)
- [Persistent cache, page navigation, and loading experience design](./cache-navigation-and-loading-ux-plan.md)
- [Vercel CPU baseline from the Comet dashboard](./vercel-cpu-baseline-2026-11-03.md)

## Decision history

1. Vercel restored service and provided a temporary CPU increase, so the immediate plan shifted from urgent hosting migration to measuring and optimizing the current Vercel deployment.
2. The owner described a desired repeat-visit experience: show a previously loaded view quickly, refresh it in the background, and prepare likely next destinations before the learner clicks.
3. The agreed design direction is selective stale-while-revalidate: use CDN/ISR for public content, safe client-side reuse for previously loaded content, and fresh authorization for protected routes/actions. Do not prefetch every link at once.
4. Loading feedback should use a lightweight, branded browser animation and short learner-facing messages; it must not add server functions or heavy JavaScript animation work.

## Status

The whiteboard fallback, waiting-room admission poll, admin live-monitor refresh, and AI Studio auto-refresh now pause or slow work as described in the baseline report. No Vercel production settings, Supabase data, RLS, AI-generation flow, or authorization rules have been changed. The cache, middleware, root-shell, and loading-experience work remains planned.

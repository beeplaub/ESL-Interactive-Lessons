# Architecture Decision Record: BrenUp Android App Native Shell & Web UI Delivery

- **Status:** Proposed (Phase 0 Exit Gate Review)
- **Date:** 2026-10-26
- **Authors:** BrenUp Team / AI Engineering Assistant
- **Target Application ID:** `com.brenup.app` (Subject to confirmation at Phase 0 exit gate)

---

## 1. Context & Business Drivers

BrenUp is an interactive ESL learning platform powered by Next.js 15 (App Router, dynamic server rendering, Server Actions, API routes, middleware session refresh), Supabase (PostgreSQL, Auth, RLS, Realtime signaling), Cloudflare R2 (media and assets), and WebRTC (peer-to-peer live classrooms with real-time audio/video/screen sharing/whiteboard).

The objective is to deliver a **production-ready Android app** that:
1. Gives learners and creators full access to the complete product across courses, lessons, interactive quizzes, practice library, creator admin workspaces, and live classes.
2. Preserves the single authoritative backend (Vercel + Supabase + R2) and enforces all RLS policies, permissions, and media paths without duplicating backend infrastructure.
3. Unlocks Android-native capabilities that standard mobile browsers restrict (specifically Android `MediaProjection` for full-device/app-window screen capture during live classes, hardware-accelerated WebRTC, background lifecycle, native file pickers, and back navigation).
4. Satisfies the product requirement: **Reflect approved BrenUp web UI changes deployed to Vercel in the installed Android app without requiring a Google Play Store release whenever technically and policy-compliant, while keeping native code, permissions, and native shell updates securely managed through Google Play releases.**
5. Complies with all Google Play Store policies (target API level, developer program policies regarding executable code delivery, WebView safety, and user data privacy).

---

## 2. Technical Audit of Existing Web Architecture

### 2.1 Next.js 15 Server-Side Rendering & Routing
- **Dynamic Server Rendering:** Almost all routes (`/lessons/[id]`, `/courses`, `/quizzes/[id]`, `/dashboard`, `/admin/*`, `/live/*`) rely on dynamic server-rendered components, cookie inspection via Next.js headers/cookies, and `@supabase/ssr`.
- **Static Export Incompatibility:** Next.js `output: 'export'` cannot statically bundle this codebase because routes rely on dynamic cookies, Server Actions with body size limits, dynamic SSR parameters, and dynamic API endpoints (`/api/*`). Attempting to convert the entire app to a statically exported SPA would break authentication, dynamic metadata, creator permissions, and server actions.
- **Middleware & Session Refresh:** `middleware.ts` runs on incoming HTTP requests to validate Supabase auth tokens, refresh access cookies, and redirect unauthenticated or role-restricted traffic.

### 2.2 Live Classroom & WebRTC
- **Signaling:** Handled via Supabase Realtime channels (`room_${id}`).
- **Media Paths:** Peer-to-peer direct WebRTC (`RTCPeerConnection`) with STUN/TURN. Large audio/video/screen streams do not pass through Vercel Functions or Supabase Realtime egress, keeping cloud costs strictly within free quotas.
- **Screen Sharing:** Currently calls `navigator.mediaDevices.getDisplayMedia(...)`. On mobile Chrome / Android WebViews, `getDisplayMedia` is frequently unavailable, disabled, or limited to in-tab capture rather than full-device/app window projection. Android-native `MediaProjection` with a foreground service is required to enable full screen sharing.

---

## 3. Evaluation of Native Runtime Options

| Option | Evaluation & Fit |
| :--- | :--- |
| **A. Capacitor (Packaged Local Static Bundle)** | Standard Capacitor packages a static `dist/` directory. Because BrenUp uses Next.js 15 App Router with SSR and Server Actions, bundling a static export is technically incompatible without rewriting the entire frontend as a client-only SPA. Furthermore, bundled assets cannot reflect Vercel UI updates without a new Google Play release. |
| **B. Native Kotlin Rewrite** | Rewriting 500+ TypeScript React components (complex quiz builders, Tiptap editors, 3D Canvas WordVerse, canvas whiteboard) in Jetpack Compose would be high risk, take months, duplicate logic, and completely forfeit Vercel-driven instant UI updates. |
| **C. Hybrid Native Shell + Remote Vercel Web UI + Native Bridge (Selected)** | Capacitor/Android native shell hosting an authorized first-party WebView pointed at the production Vercel deployment (`https://www.brenup.com`). A typed, secure JavaScript bridge interface exposes Android-native capabilities (`MediaProjection` screen capture, file pickers, device hardware controls) to the web client. Approved web changes on Vercel reflect instantly in the app, while the native shell and permissions remain under Google Play control. |

---

## 4. Google Play Policy & Security Compliance

### 4.1 Remote Web Content Policy Compliance
- **Google Play Developer Policy (Device and Network Abuse / Malicious Behavior):** Apps may load web content via WebView provided the app does not download executable binary code (DEX/APK/native binaries) to bypass Play Store review, and does not alter the core functionality stated in its store listing. Loading first-party web UI that represents the stated product (BrenUp ESL platform) from an approved, verified first-party domain via HTTPS is fully compliant.
- **Strict Domain Origin Allowlist:** The native shell will strictly allowlist `https://www.brenup.com` (and authorized first-party preview/staging origins). Any external navigation (e.g. documentation links, third-party auth, external resources) will be intercepted and launched in the system browser via Android Intent, never allowing untrusted websites access to the native bridge.
- **Cleartext Traffic Blocked:** `android:usesCleartextTraffic="false"` is enforced. Only TLS 1.3/1.2 HTTPS connections are permitted.

### 4.2 Security & Authentication
- Supabase session cookies and storage are managed inside the secure WebView sandbox.
- Sensitive server credentials (`SUPABASE_SERVICE_ROLE_KEY`, Cloudflare R2 secrets, AI provider keys) remain strictly on Vercel server-side runtimes. No server secrets are embedded in the Android package.
- The JavaScript bridge interface is strictly typed, minimal, and validates caller origins.

---

## 5. UI Update Matrix

| Change Type | Vercel Deployment Update (No Play Release) | New Play Build / Store Release Required | Rationale |
| :--- | :---: | :---: | :--- |
| **Server-side API routes & Server Actions** | **Yes** | No | Executes directly on Vercel cloud runtime. |
| **Lesson, Quiz, & Course Content / DB Models** | **Yes** | No | Delivered via Supabase and Vercel dynamic SSR. |
| **Web UI, Styles, React Components, Layouts** | **Yes** | No | Rendered and served directly from Vercel to the app's secure WebView. |
| **Live Classroom Web UI & Whiteboard Features** | **Yes** | No | Live classroom React components update dynamically. |
| **Android Permissions (Microphone, Foreground Service)** | No | **Yes** | Declared in `AndroidManifest.xml` and reviewed by Google Play. |
| **MediaProjection Native Capture Service** | No | **Yes** | Compiled Kotlin/Java code inside the APK/AAB package. |
| **App Icons, Splash Screens, Native App Name** | No | **Yes** | Bundled within the Android app package resources. |
| **Target SDK / Gradle / Capacitor Runtime Updates** | No | **Yes** | Native Android platform level changes. |

---

## 6. Resource Quotas & Free-Tier Budget Baseline

1. **Vercel:**
   - Incremental traffic from Android app users is identical to mobile web users. Server actions and SSR compute times remain unchanged.
   - Vercel Bandwidth & Function Invocations remain protected by keeping large media transfers on Cloudflare R2 and WebRTC media streams peer-to-peer.
2. **Supabase:**
   - Realtime connections and messages will scale with active concurrent live sessions. Egress is minimized because only signaling, chat, and whiteboard JSON packets pass through Supabase channels.
   - Database reads and Auth sessions use the existing pooler and JWT validation.
3. **Cloudflare R2:**
   - Audio/video files and lesson assets are fetched directly from R2 via pre-signed/public URLs with zero egress fees, avoiding Vercel bandwidth costs.
4. **Device Resource Impact:**
   - MediaProjection screen capture runs hardware-accelerated video encoders (H.264 / VP8) via WebRTC.
   - Foreground service displays an active notification to alert users of active screen capture, complying with Android battery and transparency guidelines.

---

## 7. Platform Prerequisites & Machine Status

- **Android Studio:** Installed at `/Applications/Android Studio.app`.
- **Bundled JDK:** Available at `/Applications/Android Studio.app/Contents/jbr/Contents/Home` (OpenJDK 25).
- **Android SDK:** Configured through Android Studio under `~/Library/Android/sdk`.
- **Target SDK Version:** Target SDK 35 (Android 15) / preparing for 36 (Android 16 for upcoming Google Play requirements).
- **Application ID:** `com.brenup.app`.

---

## 8. Phased Implementation Roadmap

- **Phase 0:** Audit & Architecture Decision Record (this document) + Confirmation of Application ID.
- **Phase 1:** Android Project Foundation (Capacitor + Android Gradle project scaffolding, app icons, splash screen, safe area config, navigation/back handler, offline error screen).
- **Phase 2:** Full BrenUp Experience Verification (Auth, Courses, Quizzes, Creator workspaces, Realtime, Media).
- **Phase 3:** Android Native Integrations (MediaProjection screen capture service for live classes, typed JS bridge, camera/mic permissions, Android file picker).
- **Phase 4:** Security Hardening & Performance (Origin allowlist, intent filter, SSL error handling, lifecycle recovery).
- **Phase 5:** Verification (Typecheck, Lint, Build, Gradle compilation, test matrix).
- **Phase 6:** Google Play Release Preparation (Unsigned/Release AAB setup, Play store checklist, privacy declarations).

# BrenUp AI Local Gateway

This document defines the private connection contract for the admin-only BrenUp AI assistant.

## Topology

```text
https://www.brenup.com/admin/brenup-ai
  -> BrenUp server-side admin proxy
  -> https://ai-agent.brenup.com (Cloudflare Tunnel)
  -> Mac Mini gateway (loopback only)
  -> DeepSeek Harness
  -> Ollama
```

The browser must never call Ollama, the Harness, or a local Mac port directly. Only the
server-side BrenUp proxy may call the tunnel hostname.

## BrenUp environment variables

Configure these as server-only variables in Vercel and in the local development environment
(never use `NEXT_PUBLIC_`):

```text
BRENUP_AI_GATEWAY_URL=https://ai-agent.brenup.com
BRENUP_AI_GATEWAY_SECRET=<long-random-shared-secret>
```

The secret is sent only from the BrenUp server to the gateway in an Authorization header.
It must not be printed, committed, or exposed to the browser.

## Start the local boundary

The repository includes a dependency-free gateway skeleton at
`/Users/bren/Documents/ESL App/scripts/brenup-ai-gateway.mjs`. Run it on the Mac Mini after
confirming the Harness release's local chat endpoint:

```text
BRENUP_AI_GATEWAY_SECRET=<same-long-random-shared-secret> \
BRENUP_HARNESS_CHAT_URL=http://127.0.0.1:<harness-chat-port>/<chat-path> \
BRENUP_OLLAMA_MODEL=<installed-ollama-model> \
node scripts/brenup-ai-gateway.mjs
```

The gateway binds to `127.0.0.1` by default. `BRENUP_HARNESS_CHAT_URL` is deliberately
explicit rather than guessed: the official Harness developer preview may expose different
local endpoints between releases. The gateway forwards only the validated message, mode, and
optional session ID; it does not provide Harness with database credentials or repository
secrets.

## Gateway contract

### Health

`GET /health`

Expected response:

```json
{
  "status": "ok",
  "connected": true,
  "model": "<local Ollama model name>",
  "harness": "<Harness status>"
}
```

The endpoint must be reachable only through the tunnel and must not expose model details,
environment variables, filesystem paths, or secrets.

### Chat

`POST /chat`

Headers:

```text
Content-Type: application/json
Authorization: Bearer <shared-secret>
```

Body:

```json
{
  "message": "Which courses have incomplete OBE mappings?",
  "mode": "audit",
  "sessionId": "optional-local-session-id"
}
```

Allowed modes are `research`, `audit`, `review`, and `code-review`. The gateway must reject
unknown modes, messages larger than 12,000 characters, unauthenticated requests, and any
request that asks for writes, secrets, arbitrary SQL, deployment, or destructive shell work.

Expected response:

```json
{
  "answer": "Read-only analysis completed. No BrenUp records were changed.",
  "sessionId": "optional-local-session-id",
  "tools": ["get_obe_audit"],
  "readOnly": true
}
```

The response must contain aggregate or pseudonymous data only. Do not pass emails, phone
numbers, passwords, auth tokens, raw learner answers, private messages, recordings, guardian
reports, payment information, or R2 credentials to the model.

## Local gateway rules

- Bind the gateway to `127.0.0.1`, not `0.0.0.0`.
- Do not publish Ollama port `11434`.
- Do not publish a Harness control port.
- Keep the gateway secret in the Mac environment, not in the repository.
- Permit only the Cloudflare Tunnel ingress to reach the gateway.
- Add a short request timeout and bounded response size.
- Return clear `503` health/chat errors when the Mac, Harness, or Ollama is offline.
- Log only request mode, duration, status, and tool names. Do not log full prompts or responses.

## Safe data boundary

The gateway should expose named read-only tools, never a generic SQL or shell tool:

```text
search_repository
read_safe_repository_file
get_course_overview
get_course_readiness
get_lesson_overview
get_quiz_overview
get_obe_audit
get_assessment_summary
get_media_audit
get_notification_health
get_live_class_summary
```

The first implementation should return aggregate and pseudonymous results. A future expansion
can add teacher-scoped or platform-admin-only data after a separate privacy review.

## Cloudflare Tunnel checklist

1. Create a dedicated tunnel for the Mac Mini.
2. Route only `ai-agent.brenup.com` to the loopback gateway port.
3. Keep DNS and TLS managed by Cloudflare.
4. Do not add a route to `11434` or the Harness UI.
5. Confirm `/health` returns `connected: true` from the Vercel proxy.
6. Stop the gateway and confirm `/admin/brenup-ai` shows Offline.
7. Restart the gateway and confirm the status returns to Connected.

The BrenUp UI and proxy are implemented in the repository. The local Harness endpoint and
Cloudflare tunnel are machine-specific and must be configured on the Mac using the currently
installed Harness release documentation; this file intentionally does not invent an unsupported
Harness port or command.

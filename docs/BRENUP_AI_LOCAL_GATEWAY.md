# BrenUp AI Local Gateway

This document defines the private connection contract for the admin-only BrenUp AI assistant.

## Topology

```text
https://www.brenup.com/admin/brenup-ai
  -> BrenUp server-side admin proxy
  -> https://ai-agent.brenup.com (Cloudflare Tunnel)
  -> Mac Mini gateway (loopback only)
  -> Read-only BrenUp gateway
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

The repository includes a dependency-free gateway at
`/Users/bren/Documents/ESL App/scripts/brenup-ai-gateway.mjs`. It talks directly to Ollama;
DeepSeek Harness is intentionally outside the live path because its preview filesystem/tool
boundary was not reliable enough for a production read-only service.

```text
BRENUP_AI_GATEWAY_SECRET=<same-long-random-shared-secret> \
BRENUP_REPOSITORY_ROOT="/Users/bren/Documents/ESL App" \
BRENUP_OLLAMA_MODEL=qwen2.5:7b \
BRENUP_OLLAMA_URL=http://127.0.0.1:11434/v1 \
node scripts/brenup-ai-gateway.mjs
```

The gateway binds to `127.0.0.1` by default. It exposes named repository and safe live-data
tools, not generic SQL or shell access. Both enforce the approved repository root, block secrets
and private paths, cap results, and never write. The live data bridge runs inside BrenUp's
server-side admin environment; its service-role key never enters the Mac gateway or model.

## Provider selection

The admin UI can select Ollama or DeepSeek per request. Ollama remains local and free. DeepSeek
uses the paid API only when selected and configured.

Configure the DeepSeek key on the Mac without placing it in the repository:

```text
cd "/Users/bren/Documents/ESL App"
zsh scripts/configure-brenup-ai-deepseek.sh
```

The key is stored in macOS Keychain under `brenup-deepseek-api-key`. The browser never receives
it, and it is never sent to the model as prompt content.

## Automatic Mac startup

After the one-time tunnel setup, install the gateway and tunnel as macOS login services:

```text
cd "/Users/bren/Documents/ESL App"
zsh scripts/install-brenup-ai-services.sh
```

The installer stores the gateway secret in macOS Keychain and creates two user launch agents.
It does not place the secret in the repository or in a plist. Logs are written to
`~/Library/Logs/BrenUp/`.

Check the complete service from any terminal:

```text
curl https://ai-agent.brenup.com/health
```

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

Allowed modes are `research`, `audit`, `review`, `code-review`, `coding`, and `content`. The gateway must reject
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

Coding and content modes currently produce drafts and plans only. Production writes, publishing,
deployment, deletion, and private learner-data access remain blocked until an explicit approval
workflow is implemented.

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

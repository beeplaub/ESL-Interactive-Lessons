# Local AI Draft Workflow

BrenUp can use Ollama locally for high-volume first drafts while Gemini remains the production provider.

## Install on the Mac mini

Install Ollama from [ollama.com](https://ollama.com), then run:

```bash
ollama run gemma3:4b
```

Use `gemma3:4b` for lesson, quiz, course, and blog drafts. For repository coding assistance, use:

```bash
ollama run qwen2.5-coder:7b
```

Do not run both models at the same time by default on a 16 GB Mac mini.

## Enable BrenUp local drafts

Add these values to `.env.local`:

```env
AI_LOCAL_PROVIDER_ENABLED=true
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CREATOR_MODEL=gemma3:4b
```

Restart the local Next.js server after changing environment variables. The deployed app ignores this local provider and continues using Gemini.

To return to Gemini locally, use:

```env
AI_LOCAL_PROVIDER_ENABLED=false
AI_PROVIDER=gemini
```

## Operational notes

Ollama must be running on the same Mac as the local BrenUp server. A deployed Vercel app cannot reach `127.0.0.1` on this computer. Local output is always a draft and must be reviewed before publishing. If Ollama is stopped, BrenUp reports the local connection error rather than silently sending the request to Gemini.

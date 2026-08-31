type Provider = "google" | "groq" | "ollama" | "kokoro";

const failures = new Map<string, { count: number; blockedUntil: number }>();
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 45_000;

export function providerAvailable(provider: Provider) {
  const state = failures.get(provider);
  if (!state) return true;
  if (state.blockedUntil <= Date.now()) {
    failures.delete(provider);
    return true;
  }
  return state.count < FAILURE_THRESHOLD;
}

export function providerSucceeded(provider: Provider) {
  failures.delete(provider);
}

export function providerFailed(provider: Provider) {
  const previous = failures.get(provider);
  const count = (previous?.count ?? 0) + 1;
  failures.set(provider, { count, blockedUntil: count >= FAILURE_THRESHOLD ? Date.now() + COOLDOWN_MS : 0 });
}

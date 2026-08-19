import { execFileSync, spawn } from "node:child_process";
import path from "node:path";

const root = "/Users/bren/Documents/ESL App";
const account = execFileSync("/usr/bin/id", ["-un"], { encoding: "utf8" }).trim();
const secret = execFileSync(
  "/usr/bin/security",
  ["find-generic-password", "-a", account, "-s", "brenup-ai-gateway-secret", "-w"],
  { encoding: "utf8" },
).trim();
let deepseekKey = "";
try {
  deepseekKey = execFileSync(
    "/usr/bin/security",
    ["find-generic-password", "-a", account, "-s", "brenup-deepseek-api-key", "-w"],
    { encoding: "utf8" },
  ).trim();
} catch {
  // DeepSeek is optional; Ollama remains available without it.
}

const child = spawn(process.execPath, [path.join(root, "scripts/brenup-ai-gateway.mjs")], {
  env: {
    ...process.env,
    BRENUP_AI_GATEWAY_SECRET: secret,
    BRENUP_REPOSITORY_ROOT: root,
    BRENUP_OLLAMA_MODEL: "qwen2.5:7b",
    BRENUP_OLLAMA_URL: "http://127.0.0.1:11434/v1",
    BRENUP_DEEPSEEK_API_KEY: deepseekKey,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

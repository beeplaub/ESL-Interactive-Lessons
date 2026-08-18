#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.BRENUP_AI_GATEWAY_PORT || 8787);
const secret = process.env.BRENUP_AI_GATEWAY_SECRET;
const model = process.env.BRENUP_OLLAMA_MODEL || "qwen2.5:7b";
const ollamaUrl = (process.env.BRENUP_OLLAMA_URL || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
const repositoryRoot = path.resolve(process.env.BRENUP_REPOSITORY_ROOT || process.cwd());
const startedAt = new Date().toISOString();
const allowedModes = new Set(["research", "audit", "review", "code-review"]);
const blockedPath = /(^|\/)(\.env($|\.)|node_modules|\.next|\.git|secrets?|credentials?|private)(\/|$)|service[-_ ]?role|access[-_ ]?key|secret[-_ ]?key/i;
const maxBodyBytes = 64 * 1024;

if (!secret) throw new Error("BRENUP_AI_GATEWAY_SECRET is required");

function json(response, status, body) { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(body)); }

async function readBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > maxBodyBytes) throw new Error("Request too large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function safePath(relativePath) {
  const normalized = String(relativePath || "").replaceAll("\\", "/").replace(/^\/+/, "");
  const resolved = path.resolve(repositoryRoot, normalized);
  if (resolved !== repositoryRoot && !resolved.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error("Path is outside the approved repository.");
  if (blockedPath.test(normalized)) throw new Error("That path is protected.");
  return resolved;
}

async function walk(directory, files = [], depth = 0) {
  if (depth > 5 || files.length >= 400) return files;
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (files.length >= 400) break;
    const full = path.join(directory, entry.name);
    const relative = path.relative(repositoryRoot, full).replaceAll(path.sep, "/");
    if (blockedPath.test(relative)) continue;
    if (entry.isDirectory()) await walk(full, files, depth + 1);
    else if (/\.(tsx?|jsx?|mjs|cjs|json|md|sql|css)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

async function readSafeFile(relativePath) {
  const full = safePath(relativePath); const stat = await fs.stat(full);
  if (!stat.isFile() || stat.size > 80000) throw new Error("File is missing, not a file, or too large.");
  return { path: path.relative(repositoryRoot, full).replaceAll(path.sep, "/"), content: await fs.readFile(full, "utf8") };
}

async function searchRepository(query) {
  const normalized = String(query || "").trim().slice(0, 120).toLowerCase(); if (!normalized) throw new Error("Search query is required.");
  const matches = [];
  for (const relative of await walk(repositoryRoot)) {
    if (matches.length >= 80) break;
    const text = await fs.readFile(path.join(repositoryRoot, relative), "utf8").catch(() => "");
    text.split(/\r?\n/).forEach((line, index) => { if (matches.length < 80 && line.toLowerCase().includes(normalized)) matches.push({ path: relative, line: index + 1, text: line.slice(0, 300) }); });
  }
  return { query: normalized, matches };
}

const tools = [
  { type: "function", function: { name: "search_repository", description: "Search approved BrenUp text files without exposing secrets.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "read_safe_repository_file", description: "Read one approved BrenUp text file by relative path.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
];

async function runTool(name, args) { if (name === "read_safe_repository_file") return readSafeFile(args?.path); if (name === "search_repository") return searchRepository(args?.query); throw new Error("Tool is not available."); }

async function proxyChat(request, response) {
  if (request.headers.authorization !== `Bearer ${secret}`) return json(response, 401, { error: "Unauthorized" });
  let body; try { body = await readBody(request); } catch { return json(response, 400, { error: "Invalid request body." }); }
  const message = typeof body?.message === "string" ? body.message.trim() : ""; const mode = allowedModes.has(body?.mode) ? body.mode : "research";
  if (!message || message.length > 12000) return json(response, 400, { error: "Enter a message up to 12,000 characters." });
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const messages = [{ role: "system", content: `You are BrenUp's admin-only read-only audit assistant. Use only supplied tools. Never edit files, run shell commands, use web search, access secrets, access private learner data, mutate databases, deploy, commit, or delete anything. Answer directly in chat and state that no BrenUp records changed. Current mode: ${mode}.` }, { role: "user", content: message }];
    let result; const usedTools = [];
    for (let turn = 0; turn < 5; turn += 1) {
      const upstream = await fetch(`${ollamaUrl}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer ollama" }, body: JSON.stringify({ model, messages, tools, tool_choice: "auto", stream: false }), signal: controller.signal });
      if (!upstream.ok) return json(response, upstream.status, { error: await upstream.text() });
      result = await upstream.json(); const assistant = result?.choices?.[0]?.message;
      if (!assistant) return json(response, 502, { error: "The local model returned an invalid response." });
      messages.push(assistant); if (!assistant.tool_calls?.length) break;
      for (const call of assistant.tool_calls) { usedTools.push(call.function?.name || "unknown"); let toolResult; try { toolResult = await runTool(call.function?.name, JSON.parse(call.function?.arguments || "{}")); } catch (error) { toolResult = { error: error instanceof Error ? error.message : "Tool failed." }; } messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult).slice(0, 90000) }); }
    }
    return json(response, 200, { answer: result?.choices?.[0]?.message?.content || "The local model returned no text.", readOnly: true, tools: usedTools });
  } catch (error) { return json(response, 503, { error: error?.name === "AbortError" ? "Local model request timed out." : "Ollama is offline." }); } finally { clearTimeout(timer); }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") { const connected = await fetch(`${ollamaUrl}/models`, { signal: AbortSignal.timeout(1500) }).then((result) => result.ok).catch(() => false); return json(response, 200, { status: "ok", connected, model, repository: repositoryRoot, startedAt }); }
  if (request.method === "POST" && request.url === "/chat") return proxyChat(request, response);
  return json(response, 404, { error: "Not found" });
});

server.listen(port, "127.0.0.1", () => console.log(`BrenUp AI gateway listening on 127.0.0.1:${port}`));

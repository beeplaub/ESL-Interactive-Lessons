#!/usr/bin/env node

import http from "node:http";

const port = Number(process.env.BRENUP_AI_GATEWAY_PORT || 8787);
const secret = process.env.BRENUP_AI_GATEWAY_SECRET;
const harnessChatUrl = process.env.BRENUP_HARNESS_CHAT_URL;
const model = process.env.BRENUP_OLLAMA_MODEL || "local Ollama";
const startedAt = new Date().toISOString();

if (!secret) throw new Error("BRENUP_AI_GATEWAY_SECRET is required");

const allowedModes = new Set(["research", "audit", "review", "code-review"]);
const maxBodyBytes = 64 * 1024;
const maxResponseBytes = 2 * 1024 * 1024;

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function proxyChat(request, response) {
  if (request.headers.authorization !== `Bearer ${secret}`) return json(response, 401, { error: "Unauthorized" });
  if (!harnessChatUrl) return json(response, 503, { error: "Harness chat endpoint is not configured." });
  let body;
  try { body = await readBody(request); } catch { return json(response, 400, { error: "Invalid request body." }); }
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const mode = allowedModes.has(body?.mode) ? body.mode : "research";
  if (!message || message.length > 12000) return json(response, 400, { error: "Enter a message up to 12,000 characters." });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const upstream = await fetch(harnessChatUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, mode, sessionId: typeof body?.sessionId === "string" ? body.sessionId : undefined }),
      signal: controller.signal,
    });
    const reader = upstream.body?.getReader();
    if (!reader) return json(response, upstream.status, { error: "Harness returned no response body." });
    const chunks = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxResponseBytes) return json(response, 502, { error: "Harness response exceeded the safety limit." });
      chunks.push(part.value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    let result;
    try { result = JSON.parse(text); } catch { result = { answer: text }; }
    return json(response, upstream.status, { ...result, readOnly: true });
  } catch (error) {
    return json(response, 503, { error: error?.name === "AbortError" ? "Harness request timed out." : "Harness is offline." });
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return json(response, 200, { status: "ok", connected: Boolean(harnessChatUrl), model, harness: harnessChatUrl ? "configured" : "not configured", startedAt });
  }
  if (request.method === "POST" && request.url === "/chat") return proxyChat(request, response);
  return json(response, 404, { error: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`BrenUp AI gateway listening on 127.0.0.1:${port}`);
});

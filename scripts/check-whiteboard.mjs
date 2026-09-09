// Offline route and payload regression checks. No environment files or user data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url), ts = require("typescript");
function load(file, mocks = {}) {
  const loadedModule = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { module: loadedModule, exports: loadedModule.exports, require: (name) => mocks[name] ?? require(name), crypto: globalThis.crypto, URL, Date, JSON });
  return loadedModule.exports;
}
const board = load("lib/whiteboard.ts");
const item = { id: crypto.randomUUID(), kind: "text", x: 20, y: 30, w: 200, h: 60, text: "Together", color: "#703cf0", revision: 0 };
const payload = () => ({ operation: crypto.randomUUID(), changes: [{ id: item.id, expected: null, value: item }] });
assert.equal(board.boardMutationSchema.safeParse(payload()).success, true);
for (const change of [{ color: "url(javascript:bad)" }, { src: "https://example.com/private.png" }, { src: "data:image/svg+xml;base64,PHN2Zz4=" }, { text: "a".repeat(2001) }, { x: Infinity }, { kind: "script" }, { points: Array(1501).fill([0, 0]) }]) {
  assert.equal(board.boardObjectSchema.safeParse({ ...item, ...change }).success, false);
}
assert.equal(board.boardMutationSchema.safeParse({ ...payload(), changes: [{ id: crypto.randomUUID(), expected: null, value: item }] }).success, false);
assert.equal(board.boardMutationSchema.safeParse({ operation: crypto.randomUUID() }).success, false);
for (const templateItem of board.routineTemplate()) assert.equal(board.boardObjectSchema.safeParse(templateItem).success, true);

function route({ user = "learner", member = true, teacher = false, live = true, error = null } = {}) {
  let calls = 0;
  const db = {
    from(table) {
      const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: table === "live_sessions" ? { class_id: "class", teacher_id: teacher ? user : "teacher", status: live ? "LIVE" : "COMPLETED" } : table === "class_members" ? member ? { id: "member" } : null : null, error: null }) };
      return query;
    },
    rpc: async () => { calls++; return { data: board.EMPTY_BOARD, error: error ? { message: error } : null }; },
  };
  return { get calls() { return calls; }, ...load("app/api/live/[id]/board/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/auth": { getFreshProfile: async () => ({ role: "LEARNER", first_name: "Synthetic" }), isPlatformAdmin: () => false },
    "@/lib/whiteboard": board,
  }) };
}
const params = { params: Promise.resolve({ id: crypto.randomUUID() }) };
for (const [config, body, expected] of [
  [{ user: null }, payload(), 403], [{ member: false }, payload(), 403], [{ live: false }, payload(), 409],
  [{}, { operation: crypto.randomUUID(), settings: { editing: true } }, 403],
  [{}, payload(), 200], [{ teacher: true, member: false }, { operation: crypto.randomUUID(), settings: { editing: true } }, 200],
  [{ error: "Object changed" }, payload(), 409], [{ error: "Board locked" }, payload(), 409],
  [{}, { ...payload(), changes: [{ id: item.id, expected: null, value: { ...item, kind: "script" } }] }, 400],
]) {
  const api = route(config);
  const response = await api.POST({ text: async () => JSON.stringify(body) }, params);
  assert.equal(response.status, expected);
  if (expected === 403 || expected === 400 || (expected === 409 && config.live === false)) assert.equal(api.calls, 0);
}
assert.equal((await route().POST({ text: async () => "x".repeat(1_600_001) }, params)).status, 413);
assert.equal((await route().POST({ text: async () => "{" }, params)).status, 400);
assert.equal((await route({ member: false }).GET({ url: "http://localhost/api/live/test/board" }, params)).status, 403);
const read = await route().GET({ url: "http://localhost/api/live/test/board" }, params);
assert.equal(read.body.teacher, false);
assert.equal(read.body.settings.editing, false);
console.log("Whiteboard checks passed: access, role controls, ended sessions, payload limits, image safety, templates, and conflict responses.");

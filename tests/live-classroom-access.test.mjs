import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual route handlers against a small database adapter. These
// cases protect course enrollment access without weakening teacher-only writes.
function handlers({ enrolled = false, member = false, teacher = false, signedIn = true, routeName = "playlist" } = {}) {
  const session = { id: 'session', class_id: 'class', course_id: 'course', teacher_id: teacher ? 'user' : 'host', status: 'LIVE', active_playlist_item_id: 'slide' };
  const items = [{ id: 'slide', lesson_id: 'canonical-lesson', slide_id: 'canonical-slide', item_type: 'LESSON_SLIDE', position: 0, slide_number: 3, title: 'Slide' }];
  const tables = [];
  const admin = { from(table) {
    tables.push(table);
    const data = table === 'live_sessions' ? session : table === 'course_enrollments' ? enrolled ? { id: 'enrollment' } : null : table === 'class_members' ? member ? { id: 'member' } : null : table === 'live_session_playlist_items' ? items : [];
    const query = { select() { return query; }, eq() { return query; }, in() { return query; }, not() { return query; }, is() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { return Promise.resolve({ data }); }, then(resolve) { return Promise.resolve({ data }).then(resolve); } };
    return query;
  } };
  function load(file) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, Request, Response, URL, require(name) {
      if (name === 'next/server') return { NextResponse: { json: (value, init) => Response.json(value, init) } };
      if (name === '@/lib/supabase/server') return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'user' } : null } }) } }) };
      if (name === '@/lib/supabase/admin') return { createAdminClient: () => admin };
      if (name === '@/lib/auth') return { getFreshProfile: async () => ({ role: 'STUDENT' }), isPlatformAdmin: () => false };
      if (name === '@/lib/liveAccess') return load('lib/liveAccess.ts');
      if (name === '@/lib/livePolls') return load('lib/livePolls.ts');
      throw new Error(`Unexpected dependency: ${name}`);
    } });
    return exports;
  }
  const exports = load(`app/api/live/[id]/${routeName}/route.ts`);
  return { ...exports, tables };
}
const params = { params: Promise.resolve({ id: 'session' }) };
test('enrolled learner sees canonical classroom slides without roster membership', async () => {
  const route = handlers({ enrolled: true });
  const response = await route.GET(new Request('https://example.test'), params);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items[0].lesson_id, 'canonical-lesson');
  assert.equal(body.items[0].slide_id, 'canonical-slide');
  assert.equal(body.activeItemId, 'slide');
  assert.deepEqual(body.sources, []);
  assert.equal(route.tables.includes('course_items'), false);
});
test('class member retains access', async () => assert.equal((await handlers({ member: true }).GET(new Request('https://example.test'), params)).status, 200));
test('outsider cannot read classroom slides', async () => assert.equal((await handlers().GET(new Request('https://example.test'), params)).status, 403));
test('signed-out visitor cannot read classroom slides', async () => assert.equal((await handlers({ signedIn: false }).GET(new Request('https://example.test'), params)).status, 403));
test('enrollment does not grant slide editing powers', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const response = await handlers({ enrolled: true })[method](new Request('https://example.test', { method, body: '{}' }), params);
    assert.equal(response.status, 403);
  }
});

for (const routeName of ['controls', 'state', 'voice', 'interactions']) {
  test(`course-enrolled learner can read ${routeName}`, async () => {
    const response = await handlers({ routeName, enrolled: true }).GET(new Request('https://example.test'), params);
    assert.equal(response.status, 200);
  });
  test(`outsider cannot read ${routeName}`, async () => {
    const response = await handlers({ routeName }).GET(new Request('https://example.test'), params);
    assert.ok([403, 404].includes(response.status));
  });
}
test('learner cannot change teacher activity controls', async () => {
  const response = await handlers({ routeName: 'controls', enrolled: true }).PATCH(new Request('https://example.test', { method: 'PATCH', body: '{"action":"lock","locked":false}' }), params);
  assert.equal(response.status, 403);
});
test('learner cannot read other learners live evidence', async () => {
  const response = await handlers({ routeName: 'evidence', enrolled: true }).GET(new Request('https://example.test'), params);
  assert.equal(response.status, 403);
});

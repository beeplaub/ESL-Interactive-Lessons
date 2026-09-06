import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as learning from '../lib/wordverse-learning.ts';
const source = ts.transpileModule(readFileSync(new URL('../app/wordverse/actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function setup({ current = null, readError = null, published = true, writeError = null, authenticated = true } = {}) {
  let writes = [];
  const admin = { from(table) { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return table === 'wordverse_words' ? { data: published ? { id: 'word', word: 'negotiate' } : null } : { data: current, error: readError }; }, async upsert(value) { writes.push(value); return { error: writeError }; } }; } };
  const exports = {};
  vm.runInNewContext(source, { exports, require(name) { if (name === '@/lib/wordverse-learning') return learning; if (name === 'next/cache') return { revalidatePath() {} }; if (name === '@/lib/auth') return { async requireUser() { if (!authenticated) throw Error('Sign in'); return { user: { id: 'current-user' } }; } }; if (name === '@/lib/supabase/admin') return { createAdminClient: () => admin }; throw Error(name); } });
  return { update: exports.updateWordverseProgress, writes };
}
test('progress rejects unauthenticated, unpublished and invalid requests before writing', async () => {
  for (const options of [{ authenticated: false }, { published: false }]) { const h = setup(options); await assert.rejects(h.update('word', 'review')); assert.equal(h.writes.length, 0); }
  const h = setup();
  await assert.rejects(h.update('word', 'arbitrary'));
  await assert.rejects(h.update('word', 'confidence', 2.5));
  assert.equal(h.writes.length, 0);
});
test('read failure cannot overwrite existing progress with defaults', async () => {
  const h = setup({ readError: { message: 'offline' } });
  await assert.rejects(h.update('word', 'practice_correct'));
  assert.equal(h.writes.length, 0);
});
test('write failure is surfaced to the learner', async () => {
  const h = setup({ writeError: { message: 'offline' } });
  await assert.rejects(h.update('word', 'toggle_saved'));
});
test('confirmed progress preserves existing counts and binds writes to authenticated user', async () => {
  const h = setup({ current: { state: 'LEARNING', saved: true, correct_count: 1, practice_count: 3, view_count: 5 } });
  const result = await h.update('word', 'practice_correct');
  assert.equal(result.state, 'MASTERED');
  assert.equal(result.practice_count, 4);
  assert.equal(result.correct_count, 2);
  assert.equal(result.saved, true);
  assert.equal(h.writes[0].user_id, 'current-user');
});
test('typed answers are scored against published word and scheduled on the server', async () => {
  const correct = setup();
  const result = await correct.update('word', 'practice_answer', undefined, '  NEGOTIATE  ');
  assert.equal(result.correct, true);
  assert.equal(result.correct_count, 1);
  assert.ok(Date.parse(result.next_review_at) > Date.now() + 23 * 3600000);
  const wrong = setup();
  const miss = await wrong.update('word', 'practice_answer', undefined, 'bargain');
  assert.equal(miss.correct, false);
  assert.equal(miss.correct_count, 0);
  assert.ok(Date.parse(miss.next_review_at) > Date.now());
  assert.ok(Date.parse(miss.next_review_at) <= Date.now() + 600000);
});
test('invalid typed answers do not write progress', async () => {
  const h = setup();
  for (const answer of [undefined, '', ' ', 'a'.repeat(201), 42]) await assert.rejects(h.update('word', 'practice_answer', undefined, answer));
  assert.equal(h.writes.length, 0);
});

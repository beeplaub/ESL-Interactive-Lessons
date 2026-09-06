import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReviewDue, matchesWord, nextReviewAt, recallDefinition } from '../lib/wordverse-learning.ts';
const now = Date.parse('2026-09-06T12:00:00Z');
test('review dates progress through intervals, cap at 30 days and retry misses after 10 minutes', () => {
  for (const [count, days] of [[1,1],[2,3],[3,7],[4,14],[5,30],[100,30]]) assert.equal(Date.parse(nextReviewAt(true, count, now)) - now, days * 86400000);
  assert.equal(Date.parse(nextReviewAt(false, 100, now)) - now, 600000);
});
test('future reviews stay out of queue, including misses; mastered words become due on time', () => {
  assert.equal(isReviewDue({ state: 'REVIEW_DUE', next_review_at: nextReviewAt(false, 0, now) }, now), false);
  assert.equal(isReviewDue({ state: 'MASTERED', next_review_at: new Date(now).toISOString() }, now), true);
  assert.equal(isReviewDue({ state: 'REVIEW_DUE', next_review_at: null }, now), true);
  assert.equal(isReviewDue({ state: 'MASTERED' }, now), false);
  assert.equal(isReviewDue(undefined, now), false);
});
test('word scoring normalizes typography without accepting misspellings or synonyms', () => {
  assert.equal(matchesWord('  NeGoTiAtE ', 'negotiate'), true);
  assert.equal(matchesWord('negotiate   down', 'negotiate down'), true);
  assert.equal(matchesWord('one’s', "one's"), true);
  assert.equal(matchesWord('negociate', 'negotiate'), false);
  assert.equal(matchesWord('bargain', 'negotiate'), false);
  assert.equal(matchesWord('', 'negotiate'), false);
});

test('definitions do not reveal the target word or treat punctuation as regex', () => {
  assert.equal(recallDefinition('A price is the amount paid.', 'price'), 'A ____ is the amount paid.');
  assert.equal(recallDefinition('Discuss a price.', 'negotiate'), 'Discuss a price.');
});

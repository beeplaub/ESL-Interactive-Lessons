import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNeighborhood } from '../components/wordverse/graph.ts';
const word = (slug) => ({ id: `uuid-${slug}`, slug, word: slug });
const words = ['negotiate', 'price', 'deal', 'contract', 'terms', 'bargain', 'discount', 'agreement', 'cost', 'rate'].map(word);
const edge = (from, to, strength = 50) => ({ id: `${from}-${to}-${strength}`, source_word_id: `uuid-${from}`, target_word_id: `uuid-${to}`, relationship_type: 'RELATED', strength });
const edges = words.slice(1, 8).map((w, i) => edge('negotiate', w.slug, i * 10));
test('reference layout resolves slugs while preserving UUID-based relationships', () => {
  const result = buildNeighborhood('uuid-negotiate', words, words, edges);
  assert.deepEqual(result.map(n => n.word.slug), ['price', 'deal', 'contract', 'terms', 'bargain', 'discount', 'agreement']);
});
test('parallel and reversed edges do not repeat primary or leaf words', () => {
  const result = buildNeighborhood('uuid-negotiate', words, words, [...edges, edge('price', 'negotiate', 99), edge('price', 'cost'), edge('cost', 'price'), edge('deal', 'cost'), edge('price', 'rate')]);
  const ids = ['uuid-negotiate', ...result.map(n => n.word.id), ...result.flatMap(n => n.leaves.map(l => l.word.id))];
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(result[0].leaves.map(l => l.word.slug), ['cost', 'rate']);
});
test('filters apply to both rings and never fabricate missing reference edges', () => {
  const visible = words.filter(w => !['cost', 'deal'].includes(w.slug));
  const result = buildNeighborhood('uuid-negotiate', visible, words, [edge('negotiate', 'price'), edge('price', 'cost'), edge('price', 'rate')]);
  assert.deepEqual(result.map(n => n.word.slug), ['price']);
  assert.deepEqual(result[0].leaves.map(l => l.word.slug), ['rate']);
  assert.deepEqual(buildNeighborhood('uuid-negotiate', [], words, edges), []);
});
test('unknown targets and self edges cannot create visible nodes', () => {
  assert.deepEqual(buildNeighborhood('uuid-negotiate', words, words, [edge('negotiate', 'missing'), edge('negotiate', 'negotiate')]), []);
});

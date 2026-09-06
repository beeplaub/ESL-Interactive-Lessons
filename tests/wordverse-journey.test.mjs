import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialJourney, journeyReducer } from '../components/wordverse/navigation.ts';
import { buildTopicClusters, clusterWordPosition } from '../components/wordverse/graph.ts';

const visit = (state, location) => journeyReducer(state, { type: 'visit', location });
test('universe → cluster → neighborhood → solar can return to the original entry IDs', () => {
  let state = initialJourney('word-1');
  state = visit(state, { mode: 'cluster', topicId: 'work', wordId: 'word-1' });
  state = visit(state, { mode: 'neighborhood', wordId: 'word-1' });
  state = visit(state, { mode: 'solar', wordId: 'word-1' });
  assert.deepEqual(state.entries.map(e => e.location.mode), ['universe', 'cluster', 'neighborhood', 'solar']);
  const back = journeyReducer(state, { type: 'return', id: 1 });
  assert.equal(back.entries.at(-1), state.entries[1]);
  assert.equal(back.entries.length, 2);
  const next = visit(back, { mode: 'neighborhood', wordId: 'word-2' });
  assert.equal(next.entries.at(-1).id, 4, 'a new visit must not reuse a removed camera bookmark');
});
test('duplicate navigation does not grow history, but changing clusters does', () => {
  let state = initialJourney('word-1');
  assert.equal(visit(state, { mode: 'universe', wordId: 'word-1' }), state);
  state = visit(state, { mode: 'cluster', topicId: 'work', wordId: 'word-1' });
  assert.equal(visit(state, { mode: 'cluster', topicId: 'work', wordId: 'word-2' }), state);
  assert.equal(visit(state, { mode: 'cluster', topicId: 'travel', wordId: 'word-1' }).entries.length, 3);
  assert.equal(journeyReducer(state, { type: 'return', id: -1 }), state);
});
test('long exploration preserves the universe and bounds camera history', () => {
  let state = initialJourney('word-1');
  for (let i = 0; i < 80; i++) state = visit(state, { mode: 'neighborhood', wordId: `word-${i}` });
  assert.equal(state.entries.length, 32);
  assert.equal(state.entries[0].location.mode, 'universe');
  assert.equal(new Set(state.entries.map(e => e.id)).size, 32);
});
test('selection retains the actual node origin for the arrival animation', () => {
  const state = journeyReducer(initialJourney('a'), { type: 'visit', location: { mode: 'neighborhood', wordId: 'b' }, origin: [10, 20, -8], originScale: .08 });
  assert.deepEqual(state.entries.at(-1).origin, [10, 20, -8]);
  assert.equal(state.entries.at(-1).originScale, .08);
});
const topics = [{id:'work',name:'Work',position:0,color:'#56deed'}, {id:'travel',name:'Travel',position:1,color:'invalid'}];
const words = [{id:'a',slug:'a',topic_id:'work',frequency_score:20},{id:'b',slug:'b',topic_id:'travel',frequency_score:70},{id:'c',slug:'c',topic_id:null,frequency_score:50}];
test('topic membership and counts honor filtered words, unknown topics remain reachable', () => {
  const clusters = buildTopicClusters(topics, [...words, words[0]]);
  assert.deepEqual(clusters.map(c => [c.id, c.words.length]), [['work',1],['travel',1],['__other__',1]]);
  const filtered = buildTopicClusters(topics, words.slice(0,1));
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].words[0].id, 'a');
  assert.deepEqual(buildTopicClusters(topics, []), []);
  assert.match(clusters[1].color, /^#[0-9a-f]{6}$/i);
});
test('foreground cluster positions remain finite and spaced for sparse and dense clusters', () => {
  for (const count of [1,2,4,8,12]) {
    const positions = Array.from({length:count}, (_,i) => clusterWordPosition(i,count));
    assert.ok(positions.flat().every(Number.isFinite));
    positions.forEach((a,i) => positions.slice(i+1).forEach(b => assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1]) > 40)));
  }
});

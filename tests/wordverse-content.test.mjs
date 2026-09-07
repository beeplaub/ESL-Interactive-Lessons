import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWordversePack } from '../lib/wordverse-content.ts';
const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const pack = read('../content/wordverse/balanced-advanced.json');
const membership = read('../content/wordverse/oxford-membership.json');
const baseline = read('./fixtures/wordverse-published-slugs-20260907.json');

test('balanced pack contains 240 unique verified additions, with 80 per smaller galaxy', () => {
  const words = validateWordversePack(pack, membership);
  assert.equal(words.length, 240);
  assert.deepEqual(Object.fromEntries(['work','travel','society'].map(t => [t, words.filter(w => w.topic_slug === t).length])), {work:80,travel:80,society:80});
  for (const word of words) assert.ok(!baseline.includes(word.slug), `${word.slug} already exists`);
  assert.equal(new Set(words.map(w => w.definition)).size, 240);
  assert.equal(new Set(words.flatMap(w => w.examples)).size, 240);
  assert.equal(words.filter(w => w.translation && /[\u0980-\u09ff]/.test(w.translation)).length, 240);
  assert.equal(words.filter(w => w.register && w.common_mistakes.length).length, 240);
});

test('every new planet connects through real word references to the existing network', () => {
  const all = new Set([...baseline, ...pack.map(w => w.slug)]);
  const adjacency = new Map([...all].map(id => [id, new Set()]));
  for (const w of pack) for (const related of w.related_slugs) {
    assert.ok(all.has(related), `${w.slug}: unknown target ${related}`);
    adjacency.get(w.slug).add(related); adjacency.get(related).add(w.slug);
  }
  const seen = new Set(baseline), queue = [...baseline];
  while(queue.length) for (const next of adjacency.get(queue.pop())) if (!seen.has(next)) {seen.add(next); queue.push(next);}
  assert.equal(seen.size, all.size, `Unconnected: ${[...all].filter(x => !seen.has(x))}`);
});

test('content validation rejects forged provenance, publishing fields and decorative metadata', () => {
  for (const change of [{cefr_level:'B1'}, {word:'fake word'}, {status:'PUBLISHED'}, {definition:'Synthetic placeholder vocabulary'}, {related_slugs:[pack[0].slug]}, {examples:[]}]) {
    assert.throws(() => validateWordversePack([{...pack[0],...change}], membership));
  }
  assert.throws(() => validateWordversePack([pack[0],pack[0]], membership));
});

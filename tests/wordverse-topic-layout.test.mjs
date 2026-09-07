import {test} from 'node:test';
import assert from 'node:assert/strict';
import {topicLayout,topicEdges,visibleTopicLabels} from '../components/wordverse/topicLayout.ts';
test('all members fit the cluster bounds with separated planets at mobile and desktop aspects', () => {
  for (const count of [1,8,12,28,240,1000]) for (const aspect of [.5,1,2]) {
    const {positions,bounds} = topicLayout(count,aspect);
    assert.equal(positions.length,count);
    positions.forEach((p,i) => {
      assert.ok(p.every(Number.isFinite));
      assert.ok(Math.abs(p[0])+40 < bounds[0]/2 && Math.abs(p[1])+40 < bounds[1]/2);
      for(let j=0;j<i;j++) assert.ok(Math.hypot(p[0]-positions[j][0],p[1]-positions[j][1])>24);
    });
  }
});
test('topic lines retain only real internal semantic edges and deduplicate reverse edges', () => {
  const edge = (a,b) => ({source_word_id:a,target_word_id:b});
  assert.equal(topicEdges(['a','b','c'],[[0,0,0],[20,0,0],[40,0,0]],[edge('a','b'),edge('b','a'),edge('b','outside'),edge('c','c')]).length,6);
});
test('labels avoid collisions and clipping, with more visible as the view spreads out', () => {
  const packed = Array.from({length:5},(_,i)=>({x:100+i*25,y:100,width:80,visible:true}));
  const spread = packed.map((p,i)=>({...p,x:65+i*100}));
  const a=visibleTopicLabels(packed,600,300),b=visibleTopicLabels(spread,600,300);
  assert.ok(b.size>a.size);
  assert.equal(b.size,5);
  assert.equal(visibleTopicLabels([{x:5,y:5,width:100,visible:true}],600,300).size,0);
});

test('published network pagination retrieves beyond the server page limit and fails on partial reads', async () => {
  const {wordversePages} = await import('../lib/wordverse-pages.ts');
  const source = Array.from({length:1201},(_,i)=>i);
  const result = await wordversePages(async (from,to)=>({data:source.slice(from,to+1),error:null}));
  assert.deepEqual(result,source);
  await assert.rejects(wordversePages(async from => from ? {data:null,error:'failed'} : {data:source.slice(0,500),error:null}));
});

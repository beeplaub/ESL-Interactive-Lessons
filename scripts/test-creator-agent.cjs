/* eslint-disable @typescript-eslint/no-require-imports -- Node's CJS loader is used to test TS without adding a runner dependency. */
/* Dependency-free contract tests, using the repository's TypeScript compiler. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) { return originalResolve.call(this, name.startsWith('@/') ? path.join(process.cwd(),name.slice(2)) : name, ...args); };
require.extensions['.ts'] = (module,filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const { applyOperations, newLesson, validateContent, BLOCK_REFERENCES, ACTIVITY_REFERENCES } = require('../lib/ai/agent-contract.ts');
const { LESSON_ACTIVITY_CATALOG } = require('../lib/lessonActivityCatalog.ts');
const shell = () => applyOperations(newLesson({title:'Test lesson',topic:'Shopping',level:'A2'}),[{op:'add',entity:'slide',fields:{title:'First'}}]).document;
test('every supported activity has a validated authoring reference',()=>{
  for(const type of LESSON_ACTIVITY_CATALOG.map(x=>x.type)) {
    const ref=ACTIVITY_REFERENCES.find(x=>x.type===type);assert.ok(ref,type);validateContent('activity',type,ref.data);
  }
});
test('every content block reference is accepted',()=>{for(const ref of BLOCK_REFERENCES)validateContent('block',ref.blockType,ref.content);});
test('create, edit, copy, move and delete preserve unrelated IDs and fields',()=>{
  let doc=shell();
  doc=applyOperations(doc,[{op:'add',entity:'block',slide:1,type:'TEXT',content:{body:'Hello',text_align:'center'}},{op:'add',entity:'slide',fields:{title:'Second'}}]).document;
  const id=doc.slides[0].blocks[0].id;
  doc=applyOperations(doc,[{op:'edit',entity:'block',slide:1,index:1,content:{body:'Updated'}},{op:'copy',entity:'block',slide:1,index:1,toSlide:2}]).document;
  assert.equal(doc.slides[0].blocks[0].id,id);assert.equal(doc.slides[0].blocks[0].content.text_align,'center');assert.notEqual(doc.slides[1].blocks[0].id,id);
  doc=applyOperations(doc,[{op:'move',entity:'block',slide:1,index:1,toSlide:2,position:1}]).document;
  assert.equal(doc.slides[1].blocks[0].id,id);
  const result=applyOperations(doc,[{op:'delete',entity:'block',slide:2,index:1}]);assert.equal(result.needsConfirmation,true);assert.equal(result.document.slides[1].blocks.length,1);assert.equal(doc.slides[1].blocks.length,2);
});
test('lesson edits preserve identity and reject protected fields',()=>{
  const doc=shell(); const changed=applyOperations(doc,[{op:'edit',entity:'lesson',fields:{title:'New title'}}]);assert.equal(changed.document.lesson.id,doc.lesson.id);
  assert.throws(()=>applyOperations(doc,[{op:'edit',entity:'lesson',fields:{status:'PUBLISHED'}}]));
  assert.throws(()=>applyOperations(doc,[{op:'edit',entity:'slide',slide:1,fields:{lesson_id:'other'}}]));
});
test('invalid content and answer keys never produce a mutation',()=>{
  assert.throws(()=>validateContent('activity','MCQ',{prompt:'Choose',questions:[{id:1,text:'Question',options:{A:'One'},answer:'B'}]}));
  assert.throws(()=>validateContent('block','TEXT',{body:'<script>alert(1)</script>'}));
  assert.throws(()=>applyOperations(shell(),[{op:'edit',entity:'block',slide:1,index:999,content:{body:'Wrong target'}}]));
  assert.throws(()=>validateContent('block','UNSUPPORTED',{}));
});
test('bulk clears require confirmation and retain slide IDs',()=>{
  const doc=shell(); const result=applyOperations(doc,[{op:'clear',entity:'slide',slide:1}]);assert.equal(result.needsConfirmation,true);assert.equal(result.document.slides[0].id,doc.slides[0].id);
});

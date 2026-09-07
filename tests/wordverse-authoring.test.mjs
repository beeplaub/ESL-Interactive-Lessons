import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as authoring from '../lib/wordverse-authoring.ts';

const id = '00000000-0000-4000-8000-000000000001';
const word = {...authoring.emptyWord(id),word:'hello',slug:'hello',cefr_level:'A1',definition:'A greeting used when meeting someone.',examples:['Hello, how are you?']};
const source = ts.transpileModule(readFileSync(new URL('../app/admin/wordverse/manage-actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(authorized=true) {
  const calls=[];
  const exports={};
  vm.runInNewContext(source,{exports,require(name){
    if(name==='zod') return {z};
    if(name==='next/cache') return {revalidatePath(){}};
    if(name==='@/lib/auth') return {async requireAdmin(){if(!authorized)throw new Error('Not authorized');}};
    if(name==='@/lib/wordverse-authoring') return authoring;
    if(name==='@/lib/supabase/admin') return {createAdminClient(){return {async rpc(name,args){calls.push({name,args});return {data:id,error:null};}}}};
    throw new Error(name);
  }});
  return {actions:exports,calls};
}
test('manual authoring supports words outside the advanced pack and incomplete drafts',()=>{
  assert.equal(authoring.authorWordSchema.parse(word).cefr_level,'A1');
  assert.equal(authoring.authorWordSchema.parse({...word,definition:'',examples:[]}).examples.length,0);
  assert.ok(authoring.publicationIssues({...word,examples:[]}).length);
  assert.deepEqual(authoring.publicationIssues(word),[]);
});
test('manual fields cannot smuggle publishing state or unsafe audio schemes',()=>{
  assert.throws(()=>authoring.authorWordSchema.parse({...word,status:'PUBLISHED'}));
  assert.throws(()=>authoring.authorWordSchema.parse({...word,audio_url:'javascript:alert(1)'}));
  assert.throws(()=>authoring.galaxySchema.parse({slug:'test',name:'Test',description:'',position:0,status:'PUBLISHED',color:'url(secret)'}));
});
test('every new admin action authenticates before database access',async()=>{
  const {actions,calls}=setup(false);
  for(const fn of Object.values(actions)) await assert.rejects(fn({}),/Not authorized/);
  assert.equal(calls.length,0);
});
test('invalid links and incomplete publications never reach the database',async()=>{
  const {actions,calls}=setup();
  const link={target_word_id:id,relationship_type:'RELATED',strength:60};
  const request={id:null,expected:null,word,links:[link],status:'DRAFT'};
  await assert.rejects(actions.saveManagedWord({...request,id}),/itself/);
  await assert.rejects(actions.saveManagedWord({...request,links:[link,link]}),/duplicate/);
  await assert.rejects(actions.saveManagedWord({...request,status:'PUBLISHED',word:{...word,examples:[]}}),/example/);
  assert.equal(calls.length,0);
});
test('save delegates metadata and connections together with the expected revision',async()=>{
  const {actions,calls}=setup();
  await actions.saveManagedWord({id:null,expected:null,word,links:[],status:'DRAFT'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'wordverse_admin_save');
  assert.equal(calls[0].args.p_word.translation,null);
  assert.equal(calls[0].args.p_status,'DRAFT');
});

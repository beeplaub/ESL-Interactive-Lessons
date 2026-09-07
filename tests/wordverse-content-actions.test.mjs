import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { validateWordversePack } from '../lib/wordverse-content.ts';
import { wordversePages } from '../lib/wordverse-pages.ts';
const pack = JSON.parse(readFileSync(new URL('../content/wordverse/balanced-advanced.json', import.meta.url), 'utf8'));
const membership = JSON.parse(readFileSync(new URL('../content/wordverse/oxford-membership.json', import.meta.url), 'utf8'));
const source = ts.transpileModule(readFileSync(new URL('../app/admin/wordverse/actions.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const candidate = pack.find(w => w.slug === 'accountant');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row = (word, n, status='DRAFT') => {
  const {related_slugs,topic_slug,...content}=word;
  return {...content,id:uuid(n),topic_id:'work-id',status,frequency_score:50,created_at:'now',updated_at:'now'};
};
function setup({authorized=true, words=[], links=[], linkFailure=false}={}) {
  const state = {wordverse_topics:[{id:'work-id',slug:'work'}],wordverse_words:structuredClone(words),wordverse_relationships:structuredClone(links)};
  const writes=[];
  const admin = {from(table) {
    let operation='read',payload,options,filters=[];
    const q={select(){return q},order(){return q},range(){return q},eq(key,value){filters.push(r=>r[key]===value);return q},in(key,values){filters.push(r=>values.includes(r[key]));return q},single(){return q},update(value){operation='update';payload=value;return q},upsert(value,opts){operation='upsert';payload=value;options=opts;return q},then(resolve,reject){
      try {
        if(operation==='read')return Promise.resolve({data:state[table].filter(r=>filters.every(f=>f(r))),error:null}).then(resolve,reject);
        writes.push({table,operation,payload,options});
        if(table==='wordverse_relationships' && linkFailure)return Promise.resolve({data:null,error:{message:'failed'}}).then(resolve,reject);
        if(operation==='upsert')for(const value of payload) {
          const keys=options.onConflict.split(',');
          if(!state[table].some(r=>keys.every(k=>r[k]===value[k])))state[table].push({...value,id:uuid(state[table].length+100)});
        }
        const selected=state[table].filter(r=>filters.every(f=>f(r)));
        if(operation==='update')for(const r of selected)Object.assign(r,payload);
        return Promise.resolve({data:selected,error:null}).then(resolve,reject);
      } catch(error){return Promise.reject(error).then(resolve,reject)}
    }};
    return q;
  }};
  const exports={};
  vm.runInNewContext(source,{exports,require(name){
    if(name==='zod')return {z};
    if(name==='next/cache')return {revalidatePath(){}};
    if(name==='@/lib/auth')return {async requireAdmin(){if(!authorized)throw Error('Not authorized');return {user:{id:'admin'}}}};
    if(name==='@/lib/supabase/admin')return {createAdminClient:()=>admin};
    if(name==='@/lib/wordverse-pages')return {wordversePages};
    if(name==='@/lib/wordverse-content')return {validateWordversePack};
    if(name.endsWith('oxford-membership.json'))return {default:membership};
    if(name.endsWith('balanced-advanced.json'))return {default:pack};
    throw Error(name);
  }});
  return {actions:exports,state,writes};
}

test('all creator mutations require authorization before touching records', async()=>{
  const {actions,writes}=setup({authorized:false});
  await assert.rejects(actions.importWordverseDrafts([candidate]),/Not authorized/);
  await assert.rejects(actions.saveWordverseDraft(uuid(1),candidate),/Not authorized/);
  await assert.rejects(actions.publishWordverseDrafts([uuid(1)]),/Not authorized/);
  assert.equal(writes.length,0);
});
test('draft import is repeatable and preserves existing published IDs and metadata',async()=>{
  const existing={...row(candidate,1,'PUBLISHED'),definition:'Existing reviewed creator definition'};
  const {actions,state}=setup({words:[existing,{id:uuid(2),slug:'expense',status:'PUBLISHED'}]});
  await actions.importWordverseDrafts([candidate]);await actions.importWordverseDrafts([candidate]);
  assert.equal(state.wordverse_words.length,2);
  assert.equal(state.wordverse_words[0].id,uuid(1));
  assert.equal(state.wordverse_words[0].definition,existing.definition);
  assert.equal(state.wordverse_words[0].status,'PUBLISHED');
});
test('connection failures leave imported words as drafts',async()=>{
  const {actions,state}=setup({words:[{id:uuid(2),slug:'expense',status:'PUBLISHED'}],linkFailure:true});
  await assert.rejects(actions.importWordverseDrafts([candidate]),/connections failed/);
  assert.equal(state.wordverse_words.find(w=>w.slug==='accountant').status,'DRAFT');
});
test('publishing rejects disconnected words without any update',async()=>{
  const {actions,writes}=setup({words:[row(candidate,1),{id:uuid(2),slug:'expense',status:'PUBLISHED'}]});
  await assert.rejects(actions.publishWordverseDrafts([uuid(1)]),/Connect accountant/);
  assert.equal(writes.length,0);
});
test('publishing checks stored metadata and publishes a connected valid draft',async()=>{
  const options={words:[row(candidate,1),{id:uuid(2),slug:'expense',status:'PUBLISHED'}],links:[{source_word_id:uuid(1),target_word_id:uuid(2)}]};
  const valid=setup(options);
  await valid.actions.publishWordverseDrafts([uuid(1)]);
  assert.equal(valid.state.wordverse_words[0].status,'PUBLISHED');
  const invalid=setup({...options,words:[{...row(candidate,1),cefr_level:'A1'},options.words[1]]});
  await assert.rejects(invalid.actions.publishWordverseDrafts([uuid(1)]));
  assert.equal(invalid.writes.length,0);
});

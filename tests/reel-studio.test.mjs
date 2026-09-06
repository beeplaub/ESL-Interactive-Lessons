import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import path from 'node:path';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { reelBatchSchema, reelByteRange, reelContentSchema, reelScriptSchema } from '../lib/reels.ts';

const content = { title: 'A tiny adventure', scenes: Array.from({length:4}, () => ({ narration: 'A little traveler found a secret door beneath the old bridge.', caption: 'A secret door', image_prompt: 'A tiny door under a bridge' })) };
const script = { ...content, genre: 'microfiction', topic: 'The secret door' };

test('manual scenes accept short narration but enforce upload IDs and provider-specific voices', () => {
  const manual = { ...script, scenes: [{ caption: 'Hello', narration: 'Welcome.', image_prompt: '', imageAssetId: '11111111-1111-4111-8111-111111111111' }] };
  assert.equal(reelScriptSchema.safeParse(manual).success, true);
  assert.equal(reelScriptSchema.safeParse({ ...manual, scenes: Array(11).fill(manual.scenes[0]) }).success, false);
  assert.equal(reelScriptSchema.safeParse({ ...manual, scenes: [{ ...manual.scenes[0], imageAssetId: '../../secret' }] }).success, false);
  const input = { requestId: crypto.randomUUID(), scripts: [manual], voice: 'Aoede', provider: 'google' };
  assert.equal(reelBatchSchema.safeParse(input).success, false);
  manual.scenes[0].audioGenerationId = crypto.randomUUID();
  assert.equal(reelBatchSchema.safeParse(input).success, true);
  assert.equal(reelBatchSchema.safeParse({ ...input, provider: 'kokoro' }).success, false);
});

test('reel requests reject oversized batches, unsafe voice arguments and invalid scene lengths', () => {
  const input = {requestId:'11111111-1111-4111-8111-111111111111',voice:'af_heart',scripts:[script]};
  assert.equal(reelBatchSchema.safeParse(input).success,true);
  assert.equal(reelBatchSchema.safeParse({...input,voice:'af_heart; rm -rf /'}).success,false);
  assert.equal(reelBatchSchema.safeParse({...input,scripts:Array(6).fill(script)}).success,false);
  assert.equal(reelBatchSchema.safeParse({...input,scripts:[script,script]}).success,false);
  assert.equal(reelContentSchema.safeParse({...content,scenes:content.scenes.slice(1)}).success,false);
});

test('video ranges support seeking and suffix requests while rejecting invalid ranges', () => {
  assert.deepEqual(reelByteRange('bytes=0-99',1000),{start:0,end:99});
  assert.deepEqual(reelByteRange('bytes=900-',1000),{start:900,end:999});
  assert.deepEqual(reelByteRange('bytes=-100',1000),{start:900,end:999});
  assert.deepEqual(reelByteRange('bytes=900-2000',1000),{start:900,end:999});
  for (const value of ['bytes=1000-','bytes=99-1','bytes=-0','bytes=','bytes=0-1,4-5','bytes=NaN-']) assert.equal(reelByteRange(value,1000),null);
});

function loadGemini(fetchResponse, env = {}) {
  const calls=[];
  let reservations=0;
  const exports={};
  const table = { select(){return this;}, eq(){return this;}, maybeSingle:async()=>({data:null}), insert:async()=>({error:null}) };
  const efficiency = {
    stableHash: ()=>'test-hash', defaultCacheTtl:()=>0, featureCredits:()=>2, estimateModelCost:()=>0,
    reserveAiCredits:async()=>{reservations++;return {allowed:true,supported:true};},
    settleAiCredits:async()=>{},releaseAiCredits:async()=>{},releaseAiGeneration:async()=>{},
  };
  const source=ts.transpileModule(fs.readFileSync(new URL('../lib/ai/gemini.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{
    exports, process:{env},console,setTimeout,clearTimeout,AbortSignal,
    fetch:async(url,options)=>{calls.push({url,options});return fetchResponse();},
    require:(name)=> {
      if(name==='@google/genai') return {GoogleGenAI:class {constructor(){throw new Error('Cloud client must not be constructed');}}};
      if(name==='@/lib/supabase/admin') return {createAdminClient:()=>({from:()=>table})};
      if(name==='@/lib/ai/efficiency') return efficiency;
      if(name==='@/lib/ai/providerHealth') return {providerAvailable:()=>true,providerFailed:()=>{},providerSucceeded:()=>{}};
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return {call:exports.callGemini,calls,reservations:()=>reservations};
}
const localArgs={templateKey:'creator_reel_script',variables:{genre:'fiction',topic:'A secret door'},fallbackModel:'qwen2.5:7b',context:{provider:'ollama',userId:'test-creator',userRole:'ADMIN',cache:false},localReelOnly:true,validateResponse:(value)=>reelContentSchema.parse(value)};

test('local generation repairs a schema failure with the validation requirements', async () => {
  let count = 0;
  const engine = loadGemini(() => ({ ok: true, json: async () => ({ response: JSON.stringify(count++ ? content : { ...content, scenes: [] }) }) }));
  assert.equal((await engine.call(localArgs)).title, content.title);
  assert.equal(engine.calls.length, 2);
  assert.match(JSON.parse(engine.calls[1].options.body).prompt, /failed validation/);
});

test('local reel generation uses loopback Ollama and reserves no cloud credits',async()=>{
  const engine=loadGemini(()=>({ok:true,json:async()=>({response:JSON.stringify(content)})}));
  assert.equal((await engine.call(localArgs)).title,content.title);
  assert.deepEqual(engine.calls.map(call=>call.url),['http://127.0.0.1:11434/api/generate']);
  assert.equal(engine.reservations(),0);
});

test('failed local generation never falls back to a paid provider',async()=>{
  const engine=loadGemini(()=>({ok:false}),{GEMINI_API_KEY:'fake',GROQ_API_KEY:'fake',OPENROUTER_API_KEY:'fake'});
  await assert.rejects(engine.call(localArgs));
  assert.deepEqual(engine.calls.map(call=>call.url),['http://127.0.0.1:11434/api/generate']);
  assert.equal(engine.reservations(),0);
});

test('local mode fails closed on hosted deployments and unrelated features',async()=>{
  const hosted=loadGemini(()=>({ok:true}),{VERCEL:'1'});
  await assert.rejects(hosted.call(localArgs));
  assert.equal(hosted.calls.length,0);
  const local=loadGemini(()=>({ok:true}));
  await assert.rejects(local.call({...localArgs,templateKey:'creator_lesson_designer'}));
  assert.equal(local.calls.length,0);
});

test('file downloads require authorization before touching the filesystem and reject traversal',async()=>{
  const exports={};
  let authenticated=false;
  let reads=0;
  const source=ts.transpileModule(fs.readFileSync(new URL('../app/api/creator-tools/reels/files/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  class HttpError extends Error {constructor(message,status=400){super(message);this.status=status;}}
  const require=createRequire(import.meta.url);
  vm.runInNewContext(source,{
    exports,Response,Headers,URL,Uint8Array,
    require:(name)=>{
      if(name==='node:fs/promises') return {readFile:async()=>{reads++;return Buffer.from('video-bytes');}};
      if(name==='node:path') return path;
      if(name==='zod') return {z};
      if(name==='@/lib/reels') return {reelByteRange};
      if(name==='@/lib/reels-server') return {
        reelAccess:async()=>{if(!authenticated)throw new HttpError('Sign in',401);return {user:{id:'creator-a'}};},
        reelError:error=>Response.json({error:error.message},{status:error.status||500}),
        reelFolder:(user,id)=>{assert.equal(user,'creator-a');return `/local/${user}/${id}`;},ReelHttpError:HttpError,
      };
      return require(name);
    },
  });
  const base='http://localhost:3000/api/creator-tools/reels/files';
  assert.equal((await exports.GET(new Request(base+'?batch=samples&reel=001&asset=video'))).status,401);
  assert.equal(reads,0);
  authenticated=true;
  assert.equal((await exports.GET(new Request(base+'?batch=../../secret&reel=001&asset=video'))).status,404);
  assert.equal(reads,0);
  const response=await exports.GET(new Request(base+'?batch=samples&reel=001&asset=video',{headers:{Range:'bytes=0-4'}}));
  assert.equal(response.status,206);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(await response.text(),'video');
});

test('free studio checks fresh staff roles while existing AI feature gates remain enforced',async()=>{
  const exports={};
  let role='LEARNER';
  let signedIn=true;
  const source=ts.transpileModule(fs.readFileSync(new URL('../lib/ai/creatorAccess.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{exports,require:(name)=>{
    if(name==='@/lib/supabase/server')return {createClient:async()=>({auth:{getClaims:async()=>({data:{claims:signedIn?{sub:'creator',user_metadata:{role:'ADMIN'}}:null}})}})};
    if(name==='@/lib/supabase/admin')return {createAdminClient:()=>({from:(table)=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='profiles'?{role}:{enabled:false,allowed_roles:[]}})})})};
    if(name==='@/lib/entitlements')return {getCreatorEntitlements:async()=>({values:{AI_CREATOR:{enabled:true}}})};
    if(name==='@/lib/auth')return {isStaff:value=>['ADMIN','TEACHER','SCHOOL_ADMIN'].includes(value)};
    throw new Error(name);
  }});
  await assert.rejects(exports.getCreatorStaffAccess(),/CREATOR_REQUIRED/);
  role='TEACHER';
  assert.equal((await exports.getCreatorStaffAccess()).profile.role,'TEACHER');
  await assert.rejects(exports.getCreatorAiAccess(),/FEATURE_UNAVAILABLE/);
  signedIn=false;
  await assert.rejects(exports.getCreatorStaffAccess(),/AUTH_REQUIRED/);
});

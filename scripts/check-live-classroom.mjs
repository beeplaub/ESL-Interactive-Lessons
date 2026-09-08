// Offline regression checks. Uses only synthetic data and ephemeral signing keys.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { generateKeyPairSync, verify } from 'node:crypto';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(file, mocks = {}, env = {}) {
  const output = ts.transpileModule(readFileSync(resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(output, { module: loadedModule, exports: loadedModule.exports, require: (name) => name in mocks ? mocks[name] : require(name), process: { env }, Buffer, Date, Set, Map, console, crypto: globalThis.crypto });
  return loadedModule.exports;
}
const polls = load('lib/livePolls.ts');
assert.equal(polls.normalizePollAnswer('MCQ', ['Yes', 'No'], 'Maybe'), null);
assert.equal(polls.normalizePollAnswer('RATING', [], 6), null);
assert.equal(polls.normalizePollAnswer('RATING', [], 3), '3');
assert.equal(polls.normalizePollAnswer('TRUE_FALSE', [], 'True'), 'True');
assert.equal(polls.normalizePollAnswer('WORD_CLOUD', [], ' '.repeat(20)), null);
assert.equal(polls.normalizePollAnswer('WORD_CLOUD', [], 'a'.repeat(81)), null);
assert.equal(polls.normalizePollAnswer('WORD_CLOUD', [], { malicious: 'object' }), null);
assert.equal(polls.summarizePoll(['Yes', 'Yes', 'No']).choices[0].count, 2);
const urls = load('lib/liveMeetingUrl.ts', {}, {});
// URL is a browser/node global; supply it explicitly for this pure module.
const urlSource = ts.transpileModule(readFileSync('lib/liveMeetingUrl.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const urlModule = {exports:{}};
vm.runInNewContext(urlSource, {exports:urlModule.exports, module:urlModule, URL});
assert.equal(urlModule.exports.liveMeetingUrl('javascript:alert(1)'), null);
assert.equal(urlModule.exports.liveMeetingUrl('https://user:password@example.com'), null);
assert.equal(urlModule.exports.liveMeetingUrl('https://call.whatsapp.com/voice/demo').label, 'WhatsApp');
assert.equal(urls.liveMeetingUrl(null), null);
const { privateKey, publicKey } = generateKeyPairSync('rsa', {modulusLength:2048});
const env = { LIVE_CALLING_ENABLED:'true', JAAS_APP_ID:'vpaas-magic-cookie-test', JAAS_KEY_ID:'test/key', JAAS_PILOT_CLASS_ID:'course-class', JAAS_PRIVATE_KEY:privateKey.export({format:'pem',type:'pkcs8'}) };
const calling = load('lib/liveCalling.ts', {'server-only':{}}, env);
assert.equal(calling.liveCallingEnabled("other-class"), true);
assert.equal(calling.liveCallingEnabled("course-class"), true);
for (const teacher of [false,true]) {
  const token = calling.createLiveCallToken('class-one','synthetic-user',teacher);
  const [header,payload,signature]=token.jwt.split('.');
  assert.ok(verify('RSA-SHA256',Buffer.from(`${header}.${payload}`),publicKey,Buffer.from(signature,'base64url')));
  const claims=JSON.parse(Buffer.from(payload,'base64url'));
  assert.equal(claims.context.user.moderator,teacher?'true':'false');
  assert.equal(claims.context.features.recording,false);
  assert.equal(claims.context.features.transcription,false);
  assert.equal(claims.context.room.regex,false);
  assert.notEqual(claims.room,'*');
  assert.equal(claims.exp-claims.nbf,610);
  assert.ok(!payload.includes('synthetic-user'));
  assert.notEqual(claims.context.user.id,'synthetic-user');
  assert.equal(token.roomName,`${env.JAAS_APP_ID}/${claims.room}`);
}
assert.notEqual(calling.createLiveCallToken('class-one','u',false).roomName,calling.createLiveCallToken('class-two','u',false).roomName);
assert.equal(load('lib/liveCalling.ts',{'server-only':{}},{}).liveCallingEnabled(),false);

function database(tables) {
  const writes=[];
  return {writes,from(table) {
    let rows=[...(tables[table]||[])]; const filters=[];
    const query={
      select(){return query;},eq(key,value){filters.push([key,value]); rows=rows.filter(row=>row[key]===value);return query;},
      is(key,value){rows=rows.filter(row=>(row[key]??null)===value);return query;},
      in(key,values){rows=rows.filter(row=>values.includes(row[key]));return query;},
      order(){return query;},limit(){return query;},
      insert(value){writes.push({table,action:'insert',value,filters});return query;},
      upsert(value){writes.push({table,action:'upsert',value,filters});return query;},
      update(value){writes.push({table,action:'update',value,filters});return query;},
      delete(){writes.push({table,action:'delete',filters});return query;},
      maybeSingle(){return Promise.resolve({data:rows[0]||null,error:null});},
      then(done,reject){return Promise.resolve({data:rows,error:null}).then(done,reject);},
    }; return query;
  }};
}
const params={params:Promise.resolve({id:'class-one'})};
function api(file,{user='student',status='LIVE',member=true,role='STUDENT',extra={}}={}) {
  const db=database({live_sessions:[{id:'class-one',class_id:'course-class',teacher_id:'teacher',lesson_id:'lesson',status}],class_members:member?[{id:'member',class_id:'course-class',user_id:user}]:[],...extra});
  const loadedModule=load(file,{'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:user?{id:user}:null}})}})},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/auth':{getFreshProfile:async()=>({role}),isPlatformAdmin:value=>value==='ADMIN'},'@/lib/livePolls':polls,'@/lib/liveCalling':{liveCallingEnabled:()=>true,createLiveCallToken:(_s,_u,teacher)=>({teacher})}});
  return {module:loadedModule,db};
}
for (const [config,expected] of [[{user:null},401],[{member:false},403],[{status:'COMPLETED'},409],[{},200]]) {
  const {module}=api('app/api/live/[id]/call/route.ts',config);
  const result=await module.POST({},params);assert.equal(result.status,expected);
  if(expected===200)assert.equal(result.body.teacher,false);
}
const route='app/api/live/[id]/interactions/route.ts';
const poll={id:'poll',session_id:'class-one',status:'OPEN',poll_type:'MCQ',options:['Yes','No']};
for(const [config,payload,expected] of [
 [{},{action:'createPoll',question:'Try escalation',pollType:'MCQ'},403],
 [{status:'COMPLETED'},{action:'message',body:'No write'},409],
 [{},{action:'answerPoll',pollId:'poll',answer:'invalid'},400],
 [{},{action:'answerPoll',pollId:'poll',answer:'Yes'},200],
 [{},null,400],
]){
 const {module,db}=api(route,{...config,extra:{live_polls:[poll]}});
 const result=await module.POST({json:async()=>payload},params);assert.equal(result.status,expected);
 if(expected!==200)assert.equal(db.writes.length,0);
}
const hands=api(route,{user:'teacher'});
await hands.module.POST({json:async()=>({action:'resolveHand',handId:'other-class-hand'})},params);
assert.ok(hands.db.writes.find(w=>w.table==='live_hand_raises').filters.some(([key,value])=>key==='session_id'&&value==='class-one'));
const raised=api(route);
await raised.module.POST({json:async()=>({action:'hand'})},params);
assert.equal(raised.db.writes.find(w=>w.table==='live_hand_raises').value.resolved_at,null);
for(const revealed of [false,true]){
 const {module}=api(route,{extra:{live_polls:[{...poll,status:revealed?'REVEALED':'OPEN'}],live_poll_answers:[{poll_id:'poll',session_id:'class-one',user_id:'other-student',answer:'Yes'}]}});
 const result=await module.GET({},params);
 assert.equal(Boolean(result.body.pollResults.poll),revealed);
 assert.equal(result.body.ownAnswers.length,0);
}
const controls = api('app/api/live/[id]/controls/route.ts', {user:'teacher',extra:{lesson_slide_activities:[{id:'activity',lesson_id:'lesson',slide_id:'slide'}],live_activity_states:[{session_id:'class-one',activity_id:'activity',closes_at:new Date(Date.now()+600_000).toISOString()}]}});
const extended=await controls.module.PATCH({json:async()=>({action:'activity',activityId:'activity',state:'EXTEND',seconds:120})},params);
assert.equal(extended.status,200);
assert.ok(new Date(controls.db.writes.find(w=>w.table==='live_activity_states').value.closes_at).getTime()>Date.now()+710_000);
const otherActivity=api('app/api/live/[id]/controls/route.ts',{user:'teacher',extra:{lesson_slide_activities:[{id:'activity',lesson_id:'other-lesson',slide_id:'slide'}]}});
assert.equal((await otherActivity.module.PATCH({json:async()=>({action:'activity',activityId:'activity',state:'OPEN'})},params)).status,404);
assert.equal(otherActivity.db.writes.length,0);
for (const sessionId of ['class-one','other-class']) {
 const groupApi=api(route,{user:'teacher',extra:{live_groups:[{id:'group',session_id:sessionId,status:'OPEN'}]}});
 const result=await groupApi.module.POST({json:async()=>({action:'message',channel:'GROUP',groupId:'group',body:'Group feedback'})},params);
 assert.equal(result.status,sessionId==='class-one'?200:400);
 if(sessionId!=='class-one')assert.equal(groupApi.db.writes.length,0);
}
console.log('PASS: poll validation, result visibility, role enforcement, closed-class guards, hand scoping/re-raising, meeting URLs, and signed room-scoped calling tokens. No external services used.');

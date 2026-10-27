// Offline regression: the classroom delivers and renders the real lesson player.
// Uses synthetic fixtures only; no credentials, network, or database mutations.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
function load(file, mocks) {
  const source = ts.transpileModule(readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const loadedModule = {exports:{}};
  vm.runInNewContext(source,{module:loadedModule,exports:loadedModule.exports,require:name=>mocks[name]??require(name),URL,Request,Response,Date,Map,Set,console});
  return loadedModule.exports;
}
const audioId = '11111111-1111-4111-8111-111111111111';
const tables = {
  instant_live_state:[{room_id:'room',stage:'content',content:{kind:'lesson',id:'22222222-2222-4222-8222-222222222222',index:0,reveal:false},revision:1}],
  lessons:[{id:'22222222-2222-4222-8222-222222222222',title:'Synthetic lesson',status:'PUBLISHED',topic:'Greetings',level:'A1',timer_minutes:null}],
  slides:[{id:'slide-one',lesson_id:'22222222-2222-4222-8222-222222222222',title:'Welcome',slide_number:1,section_label:'Introduction',content_order:'LEARN_FIRST'},{id:'slide-two',lesson_id:'22222222-2222-4222-8222-222222222222',title:'Second slide',slide_number:2}],
  lesson_blocks:[{id:'block',lesson_id:'22222222-2222-4222-8222-222222222222',slide_id:'slide-one',position:0,block_type:'TEXT',content:{text:'Hello'}}],
  lesson_slide_activities:[{id:'activity',lesson_id:'22222222-2222-4222-8222-222222222222',slide_id:'slide-one',slide_number:1,activity_type:'MCQ',activity_data:{questions:[],ai_instruction:'private fixture prompt'}}],
  lesson_audio_files:[{id:audioId,lesson_id:'22222222-2222-4222-8222-222222222222',slide_id:'slide-one',label:'narration',storage_provider:'r2',public_url:'https://media.example.test/narration.opus',transcript:'Hello everyone.',glossary:[{word:'hello',meaning:'A greeting'}],source_type:'UPLOADED'}, {id:'legacy',lesson_id:'22222222-2222-4222-8222-222222222222',slide_id:null,linked_slide_number:2,label:'narration',external_url:'https://example.test/second.mp3',source_type:'LINK'}],
  instant_live_activity_responses:[],
};
const admin = {from(table) {
  let rows = [...(tables[table] ?? [])];
  const query = {
    select(){return query;}, order(){return query;},
    eq(key,value){rows=rows.filter(row=>row[key]===value);return query;},
    is(key,value){rows=rows.filter(row=>(row[key]??null)===value);return query;},
    single(){return Promise.resolve({data:rows[0]??null,error:null});},
    maybeSingle(){return query.single();},
    then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);},
  };return query;
}};
let denial = null;
let resolvedMedia = 0;
const route = load('app/api/instant-live/rooms/[id]/content/route.ts', {
  '@/lib/instant-live/server':{roomAccess:async()=>denial?{error:denial}:{admin,user:{id:'synthetic-learner'},creator:false}},
  '@/lib/auth':{getFreshProfile:async()=>({role:'LEARNER'}),isPlatformAdmin:()=>false},
  '@/lib/quizScoring':{},
  '@/lib/storage/mediaStorage':{resolveMediaUrl:async(_admin,media)=>{resolvedMedia++;return media.publicUrl;}},
});
const get = query => route.GET(new Request(`https://example.test/api/instant-live/rooms/room/content${query}`),{params:Promise.resolve({id:'room'})});
const response = await get('');
assert.equal(response.status,200);
const payload = await response.json();
assert.equal(payload.lessonPlayer.slides.length,2);
assert.equal(payload.lessonPlayer.narrationMap['slide-one'],`/api/instant-live/rooms/room/content?audio=${audioId}`);
assert.equal(payload.lessonPlayer.narrationMap['slide-two'],'https://example.test/second.mp3');
assert.equal(payload.lessonPlayer.narrationConfigMap['slide-one'].transcript,'Hello everyone.');
assert.equal(payload.lessonPlayer.activities[0].activity_data.ai_instruction,undefined);
assert.equal(resolvedMedia,0,'Navigation must not regenerate signed URLs and restart narration');
const media = await get(`?audio=${audioId}`);
assert.equal(media.status,307);
assert.equal(media.headers.get('location'),'https://media.example.test/narration.opus');
assert.equal(media.headers.get('cache-control'),'private, no-store');
assert.equal((await get('?audio=33333333-3333-4333-8333-333333333333')).status,404);
assert.equal((await get('?audio=invalid')).status,400);
denial = new Response('Forbidden',{status:403});
assert.equal((await get(`?audio=${audioId}`)).status,403);
assert.equal(resolvedMedia,1,'Denied or unrelated media must never be resolved');

const tabs = load('components/LessonContentTabs.tsx',{});
const player = load('components/BuilderLessonPlayer.tsx',{
  '@/components/LessonContentTabs':tabs,
  '@/components/LessonActivityPanel':{LessonActivityPanel:()=>null,lessonActivityTotalPoints:()=>0,lessonActivityScore:()=>0},
  '@/components/LessonBlockPreview':{LessonBlockPreview:()=>React.createElement('p',null,'Passage fixture')},
  '@/lib/liveSync':{useLiveRefresh:()=>{}},
  '@/components/LiveTeacherToolbar':{LiveTeacherToolbar:()=>null},
  '@/components/GeminiLiveTranslation':{playNarrationTranslation:()=>{}},
  '@/components/NarrationStudyAssist':{narrationGlossary:value=>value??[]},
  '@/lib/assessmentContract':{normalizeDisplayScore:(score,total)=>({score,total})},
});
const html = renderToStaticMarkup(React.createElement(player.BuilderLessonPlayer, {...payload.lessonPlayer,initialProgress:null,instantClass:{api:'/api/instant-live/rooms/room',notesKey:'synthetic',creator:true,paused:false,selection:payload.selection,onSelect:async()=>{},responses:[]}}));
assert.match(html,/<audio[^>]+content\?audio=/);
for (const label of ['Learn','Practice','Read','Glossary','Notes','Previous','Next','Welcome']) assert.ok(html.includes(label),`${label} must be present in the shared player`);
assert.ok(html.includes('Passage fixture'));
assert.ok(!html.includes('href="/courses"'),'Embedded lesson must not navigate out of the class');
console.log('PASS: full lesson payload, narration/legacy links, media authorization, private prompts, and actual player rendering.');

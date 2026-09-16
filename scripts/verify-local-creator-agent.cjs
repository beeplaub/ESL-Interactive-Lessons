/* eslint-disable @typescript-eslint/no-require-imports -- Test harness loads TS with the installed compiler. */
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(process.cwd(),name.slice(2)):name,...args);};
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {newLesson,applyOperations,decisionSchema,decisionFormat,schemaReference,BLOCK_REFERENCES,ACTIVITY_REFERENCES}=require('../lib/ai/agent-contract.ts');
const instructions=fs.readFileSync(path.join(process.cwd(),'lib/ai/creator-agent.ts'),'utf8').match(/export const AGENT_INSTRUCTIONS = `([\s\S]*?)`;/)[1];
const secret=randomUUID(),port=18787;
const gateway=spawn(process.execPath,['scripts/brenup-ai-gateway.mjs'],{env:{...process.env,BRENUP_AI_GATEWAY_PORT:String(port),BRENUP_AI_GATEWAY_SECRET:secret},stdio:['ignore','pipe','inherit']});
const report={steps:[],document:null};
(async()=>{
  await new Promise((resolve,reject)=>{gateway.stdout.once('data',resolve);gateway.once('error',reject);gateway.once('exit',code=>reject(new Error(`Gateway exited ${code}`)));});
  let document=null,feedback=null,references=schemaReference(['TEXT','BULLETS','GRAMMAR','VOCABULARY','MCQ','GAP_FILL','DIALOGUE']);
  const conversation=[{role:'user',content:'Create a complete A2 lesson about shopping with exactly two slides. Slide 1: vocabulary with three words and examples. Slide 2: two MCQ questions, each with four options and a correct answer. Execute the creation and finish when both slides are saved.'}];
  for(let step=0;step<9;step++){
    const started=Date.now();
    const response=await fetch(`http://127.0.0.1:${port}/creator-generate`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},body:JSON.stringify({model:'qwen2.5:7b',role:'You are BrenUp local lesson author. Output only valid JSON. Use the provided tool contract.',schema:decisionFormat(Boolean(document)),message:JSON.stringify({instructions,currentTask:conversation[0].content,nextStep:document?'The lesson already exists. Use edit_lesson to add the requested slides and content. DO NOT create another lesson.':'Create the lesson shell first.',blockTypes:BLOCK_REFERENCES.map(x=>x.blockType),activityTypes:ACTIVITY_REFERENCES.map(x=>x.type),references,conversation,lesson:document?{document,status:'DRAFT'}:null,feedback,sources:[],media:[]})}),signal:AbortSignal.timeout(240000)});
    const raw=await response.json();if(!response.ok)throw new Error(raw.error);
    const action=decisionSchema.parse(JSON.parse(raw.text));
    console.log(JSON.stringify({step:step+1,action:action.action,seconds:Math.round((Date.now()-started)/1000),outputTokens:raw.outputTokens}));
    report.steps.push({action,seconds:(Date.now()-started)/1000});
    fs.writeFileSync('/private/tmp/brenup-local-agent-smoke.json',JSON.stringify(report,null,2));
    try{
      if(action.action==='create_lesson'){document=newLesson(action.arguments);feedback={saved:true,summary:['Created lesson shell'],lessonId:document.lesson.id};}
      else if(action.action==='edit_lesson'){const result=applyOperations(document,action.arguments.operations);document=result.document;feedback={saved:true,summary:result.summary};}
      else if(action.action==='schema'){references=schemaReference(action.arguments.types);feedback={schemasLoaded:action.arguments.types};}
      else if(action.action==='finish')break;
      else throw new Error(`Unexpected action: ${action.action}`);
      conversation.push({role:'assistant',content:JSON.stringify(feedback)});
    }catch(error){feedback={error:error.message};console.log(JSON.stringify(feedback));}
  }
  report.document=document;
  fs.writeFileSync('/private/tmp/brenup-local-agent-smoke.json',JSON.stringify(report,null,2));
  assert.equal(document.slides.length,2,'Exactly two slides');
  assert.equal(document.slides[0].blocks.find(x=>x.block_type==='VOCABULARY').content.entries.length,3);
  assert.equal(document.slides[1].activities.find(x=>x.activity_type==='MCQ').activity_data.questions.length,2);
  console.log('PASS: real local Ollama created a structurally valid lesson from a human prompt. No cloud inference or lesson database writes.');
})().catch(error=>{fs.writeFileSync('/private/tmp/brenup-local-agent-smoke.json',JSON.stringify(report,null,2));console.error(error.message);process.exitCode=1;}).finally(()=>gateway.kill());

"use client";
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { LessonBlockPreview, type PreviewLessonBlock } from "@/components/LessonBlockPreview";
import { LessonActivityPanel } from "@/components/LessonActivityPanel";
import { QuestionCard, type QuizQuestion } from "@/components/QuizPlayer";
import type { Json } from "@/types/database.types";
import type { SharedState } from "@/lib/instant-live/types";

export type ContentSelection = {kind:"lesson"|"quiz";id:string;index:number;reveal:boolean};
type ContentData = {selection:ContentSelection|null;title:string;total:number;revision:number;blocks?:PreviewLessonBlock[];activities?:Array<{id:string;activity_type:string;activity_data:Json}>;question?:QuizQuestion;response?:{answer:unknown;score:number|null;total:number};responses?:Array<{activity_id:string;answers:Json}>;answeredCount?:number};
export function ContentPicker({api,onClose,onChoose}:{api:string;onClose:()=>void;onChoose:(selection:ContentSelection)=>Promise<void>}) {
  const [catalog,setCatalog]=useState<{lessons:Array<{id:string;title:string}>;quizzes:Array<{id:string;title:string}>}>({lessons:[],quizzes:[]});
  const [search,setSearch]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(true);
  useEffect(()=>{const controller=new AbortController();void fetch(`${api}/content?catalog=1`,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);setCatalog(data);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();},[api]);
  return <div className="live-modal-backdrop"><section className="live-feature-panel" role="dialog" aria-modal="true" aria-label="Choose lesson or quiz"><header><h2>Lesson & quiz</h2><button aria-label="Close content picker" onClick={onClose}><X size={18}/></button></header><p>Share your published content. Everyone follows the page you choose.</p><input aria-label="Search lessons and quizzes" placeholder="Search your content…" value={search} onChange={e=>setSearch(e.target.value)}/>{error?<p role="alert">{error}</p>:null}{busy?<p>Loading…</p>:null}{(["lesson","quiz"] as const).map(kind=><div key={kind}><h3>{kind==="lesson"?"Lessons":"Quizzes"}</h3>{catalog[kind==="lesson"?"lessons":"quizzes"].filter(item=>item.title.toLowerCase().includes(search.toLowerCase())).map(item=><button className="live-content-option" disabled={busy} key={item.id} onClick={async()=>{setBusy(true);try{await onChoose({kind,id:item.id,index:0,reveal:false});onClose();}catch(e){setError(e instanceof Error?e.message:"Could not share content.");}finally{setBusy(false);}}}>{item.title}</button>)}</div>)}</section></div>;
}
export function LiveContent({api,revision,creator,paused,onChoose,onNotice}:{api:string;revision:number;creator:boolean;paused:boolean;onChoose:(selection:ContentSelection)=>Promise<void>;onNotice:(message:string)=>void}) {
  const [data,setData]=useState<ContentData|null>(null),[error,setError]=useState("");
  const [answer,setAnswer]=useState<unknown>(null),[sent,setSent]=useState(false),[busy,setBusy]=useState(false);
  const [activityIndex,setActivityIndex]=useState(0);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(`${api}/content`,{signal,cache:"no-store"});const result=await response.json();if(!response.ok)throw new Error(result.error);setData(result);return result as ContentData;
  },[api]);
  useEffect(()=>{const controller=new AbortController();setError("");void load(controller.signal).then(result=>{setAnswer(result.response?.answer??null);setSent(Boolean(result.response));setActivityIndex(0);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[load,revision]);
  // Only the small response count is refreshed during teacher-led practice.
  useEffect(()=>{if(!creator)return;const timer=setInterval(()=>{void load().catch(()=>{});},10000);return()=>clearInterval(timer);},[creator,load]);
  async function navigate(selection:ContentSelection) {setBusy(true);try{await onChoose(selection);}catch(e){onNotice(e instanceof Error?e.message:"Could not change page.");}finally{setBusy(false);}}
  async function submit() {if(!data?.question)return;setBusy(true);try{const response=await fetch(`${api}/content`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"answer",questionId:data.question.id,answer})});const result=await response.json();if(!response.ok)throw new Error(result.error);setSent(true);}catch(e){onNotice(e instanceof Error?e.message:"Could not save answer.");}finally{setBusy(false);}}
  if(error)return <div className="live-content-stage"><p role="alert">{error}</p><button onClick={()=>void load().then(()=>setError("")).catch(e=>setError(e.message))}>Retry</button></div>;
  if(!data?.selection)return <div className="live-content-stage">Loading shared content…</div>;
  const selection=data.selection;
  return <div className="live-content-stage"><header className="live-content-heading"><h2>{data.title}</h2><span>{selection.index+1} / {data.total}</span>{creator?<nav><button disabled={paused||busy||selection.index===0} onClick={()=>void navigate({...selection,index:selection.index-1,reveal:false})}>Previous</button><button disabled={paused||busy||selection.index>=data.total-1} onClick={()=>void navigate({...selection,index:selection.index+1,reveal:false})}>Next</button></nav>:<small>Following your teacher</small>}</header>
    {data.blocks?<LessonBlockPreview blocks={data.blocks} emptyText="This slide contains practice activities."/>:null}
    {data.activities?.length?<><div className="live-content-activities">{data.activities.map((activity,index)=><button key={activity.id} aria-pressed={activityIndex===index} onClick={()=>setActivityIndex(index)}>Practice {index+1}</button>)}</div><p className="live-content-help">Class practice. This does not change course completion or graded attempts.</p><LessonActivityPanel key={data.activities[activityIndex]?.id} activity={data.activities[activityIndex]} previewOnly preserveDraft={false} practiceAnswers={data.responses?.find(r => r.activity_id === data.activities![activityIndex].id)?.answers} onPracticeSave={async answers => {const response=await fetch(`${api}/content`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"practice",activityId:data.activities![activityIndex].id,answers})});if(!response.ok){const result=await response.json();throw new Error(result.error||"Could not save class practice.");}}} onNext={()=>setActivityIndex(i=>Math.min(i+1,data.activities!.length-1))}/></>:null}
    {data.question?<><QuestionCard key={data.question.id} question={data.question} value={answer} submitted={selection.reveal} onChange={value=>{setAnswer(value);setSent(false);}}/>{creator?<div className="live-content-actions"><span>{data.answeredCount??0} responses saved</span><button disabled={busy||paused} onClick={()=>void navigate({...selection,reveal:!selection.reveal})}>{selection.reveal?"Reopen question":"Reveal answers"}</button></div>:<div className="live-content-actions"><button disabled={paused||busy||selection.reveal||sent||answer==null} onClick={()=>void submit()}>{busy?"Saving…":sent?"Answer saved":"Send answer"}</button><span>{selection.reveal?"Your teacher has revealed the answer.":"Your answer is private. Your teacher sees the response count."}</span></div>}</>:null}
  </div>;
}
export async function showContent(api:string,selection:ContentSelection,session:string,revision:number):Promise<SharedState> {
  const response=await fetch(`${api}/content`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"show",selection,session,revision})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not show content.");return data.state;
}

"use client";
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { BookOpen, Check, ChevronRight, ClipboardList, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { BuilderLessonPlayer } from "@/components/BuilderLessonPlayer";
import { QuizPlayer, type QuizQuestion } from "@/components/QuizPlayer";
import type { Json } from "@/types/database.types";
import type { SharedState } from "@/lib/instant-live/types";

export type ContentSelection = {kind:"lesson"|"quiz";id:string;index:number;reveal:boolean;tab?:"learn"|"practice";activityId?:string};
type LessonPlayerData = Pick<ComponentProps<typeof BuilderLessonPlayer>, "lesson" | "slides" | "blocks" | "activities" | "narrationMap" | "narrationConfigMap">;
type ContentData = {selection:ContentSelection|null;title:string;total:number;revision:number;viewerKey?:string;lessonPlayer?:LessonPlayerData;quiz?:{id:string;title:string;level:string|null;topic:string|null;timer_minutes:number|null;questions:QuizQuestion[];pastAttempts:Array<{id:string;score:number;total:number;completedAt:string;answers:Json|null;status:string|null;gradingSource:string|null}>};responses?:Array<{activity_id:string;answers:Json}>};
type ContentCatalogItem = {id:string;title:string;level:string|null;topic:string|null};
export function ContentPicker({api,onClose,onChoose}:{api:string;onClose:()=>void;onChoose:(selection:ContentSelection)=>Promise<void>}) {
  const [catalog,setCatalog]=useState<{lessons:ContentCatalogItem[];quizzes:ContentCatalogItem[]}>({lessons:[],quizzes:[]});
  const [kind,setKind]=useState<"lesson"|"quiz">("lesson");
  const [search,setSearch]=useState("");
  const [level,setLevel]=useState("all");
  const [topic,setTopic]=useState("all");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState<string|null>(null);
  useEffect(()=>{const controller=new AbortController();void fetch(`${api}/content?catalog=1`,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);setCatalog(data);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[api]);
  const items=catalog[kind==="lesson"?"lessons":"quizzes"];
  const levels=[...new Set(items.map(item=>item.level).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b));
  const topics=[...new Set(items.map(item=>item.topic).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b));
  const normalizedSearch=search.trim().toLocaleLowerCase();
  const filtered=items.filter(item=>{
    const matchesSearch=!normalizedSearch||`${item.title} ${item.topic??""} ${item.level??""}`.toLocaleLowerCase().includes(normalizedSearch);
    return matchesSearch&&(level==="all"||item.level===level)&&(topic==="all"||item.topic===topic);
  });
  async function share(item:ContentCatalogItem) {
    setBusyId(item.id);setError("");
    try{await onChoose({kind,id:item.id,index:0,reveal:false});onClose();}
    catch(e){setError(e instanceof Error?e.message:"Could not share this item.");setBusyId(null);}
  }
  return <div className="live-modal-backdrop live-content-picker-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!busyId)onClose();}}>
    <section className="live-feature-panel live-content-picker" role="dialog" aria-modal="true" aria-labelledby="live-content-picker-title">
      <header className="live-content-picker-header"><div><span className="live-content-picker-eyebrow">CLASSROOM LIBRARY</span><h2 id="live-content-picker-title">Share lesson or quiz</h2><p>Choose content for everyone in your live class.</p></div><button className="live-picker-close" aria-label="Close content picker" onClick={onClose} disabled={Boolean(busyId)}><X size={19}/></button></header>
      <div className="live-content-kind-tabs" role="tablist" aria-label="Content type">
        {(["lesson","quiz"] as const).map(value=>{const selected=kind===value;const Icon=value==="lesson"?BookOpen:ClipboardList;const count=catalog[value==="lesson"?"lessons":"quizzes"].length;return <button type="button" role="tab" aria-selected={selected} className={selected?"is-active":""} key={value} onClick={()=>{setKind(value);setLevel("all");setTopic("all");setSearch("");setError("");}}><span className="live-content-kind-icon"><Icon size={19}/></span><span className="live-content-kind-copy"><strong>{value==="lesson"?"Lessons":"Quizzes"}</strong><small>{count} published</small></span><ChevronRight className="live-content-kind-arrow" size={17}/></button>;})}
      </div>
      <div className="live-content-filter-heading"><div><h3>Find content</h3><p>Filter by title, learning level, or topic.</p></div><span><SlidersHorizontal size={15}/>{filtered.length} results</span></div>
      <div className="live-content-search"><Search size={18}/><input aria-label={`Search ${kind==="lesson"?"lessons":"quizzes"}`} placeholder={`Search ${kind} title, topic, or level…`} value={search} onChange={event=>setSearch(event.target.value)}/>{search?<button aria-label="Clear search" onClick={()=>setSearch("")}><X size={15}/></button>:null}</div>
      <div className="live-content-filter-row"><label>Level<select aria-label="Filter by level" value={level} onChange={event=>setLevel(event.target.value)}><option value="all">All levels</option>{levels.map(value=><option key={value} value={value}>{value}</option>)}</select></label><label>Topic<select aria-label="Filter by topic" value={topic} onChange={event=>setTopic(event.target.value)}><option value="all">All topics</option>{topics.map(value=><option key={value} value={value}>{value}</option>)}</select></label><button type="button" className="live-content-reset" onClick={()=>{setSearch("");setLevel("all");setTopic("all");}}>Reset</button></div>
      {error?<p className="live-content-picker-error" role="alert">{error}</p>:null}
      <div className="live-content-results" aria-live="polite">
        {loading?<div className="live-content-picker-empty"><LoaderCircle className="animate-spin" size={20}/>Loading your published content…</div>:filtered.length===0?<div className="live-content-picker-empty"><span className="live-content-empty-icon"><Search size={19}/></span><strong>{items.length?"No matching content":"Nothing published here yet"}</strong><span>{items.length?"Try a different title or clear one of the filters.":`Published ${kind}s will appear here for quick sharing.`}</span></div>:filtered.map(item=><button type="button" className="live-content-result" key={item.id} onClick={()=>void share(item)} disabled={Boolean(busyId)}><span className="live-content-result-icon">{kind==="lesson"?<BookOpen size={18}/>:<ClipboardList size={18}/>}</span><span className="live-content-result-copy"><strong>{item.title}</strong><span>{item.topic||"General practice"}</span></span><span className="live-content-result-meta">{item.level||"All levels"}</span><span className="live-content-result-action">{busyId===item.id?<LoaderCircle className="animate-spin" size={18}/>:<Check size={17}/>}</span></button>)}
      </div>
    </section>
  </div>;
}
export function LiveContent({api,revision,creator,paused,onChoose,onNotice}:{api:string;revision:number;creator:boolean;paused:boolean;onChoose:(selection:ContentSelection)=>Promise<void>;onNotice:(message:string)=>void}) {
  const [data,setData]=useState<ContentData|null>(null),[error,setError]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(`${api}/content`,{signal,cache:"no-store"});const result=await response.json();if(!response.ok)throw new Error(result.error);setData(result);return result as ContentData;
  },[api]);
  useEffect(()=>{const controller=new AbortController();setError("");void load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[load,revision]);
  async function navigate(selection:ContentSelection) {try{await onChoose(selection);}catch(e){onNotice(e instanceof Error?e.message:"Could not change page.");}}
  if(error)return <div className="live-content-stage"><p role="alert">{error}</p><button onClick={()=>void load().then(()=>setError("")).catch(e=>setError(e.message))}>Retry</button></div>;
  if(!data?.selection)return <div className="live-content-stage">Loading shared content…</div>;
  const selection=data.selection;
  return <div className="live-content-stage">{selection.kind === "quiz" && data.quiz ? <>
    <header className="live-content-heading"><h2>{data.quiz.title}</h2><small>{data.quiz.level ?? "Quiz"}{data.quiz.topic ? ` · ${data.quiz.topic}` : ""}</small></header>
    <div className="relative">
      <div className={paused ? "pointer-events-none select-none opacity-60" : undefined} aria-hidden={paused || undefined}>
        <QuizPlayer key={selection.id} quizId={data.quiz.id} questions={data.quiz.questions} pastAttempts={data.quiz.pastAttempts} isGuest={false} timerMinutes={data.quiz.timer_minutes} courseItemId={null} />
      </div>
      {paused ? <div className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-slate-950/55 p-4 text-center text-white backdrop-blur-sm"><div><strong className="text-lg">Class paused</strong><p className="mt-1 text-sm text-white/80">Quiz controls will be available when your teacher resumes.</p></div></div> : null}
    </div>
  </> : null}
    {selection.kind === "lesson" && data.lessonPlayer ? <BuilderLessonPlayer key={selection.id} {...data.lessonPlayer} initialProgress={null} initialSlideNumber={selection.index + 1} initialTab={selection.tab} instantClass={{api,notesKey:data.viewerKey ?? api,creator,paused,selection,onSelect:navigate,responses:data.responses ?? []}} /> : null}
  </div>;
}
export async function showContent(api:string,selection:ContentSelection,session:string,revision:number):Promise<SharedState> {
  const response=await fetch(`${api}/content`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"show",selection,session,revision})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not show content.");return data.state;
}

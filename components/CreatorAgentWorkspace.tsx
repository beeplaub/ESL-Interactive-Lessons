"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Paperclip, Plus, Send, Square, Undo2 } from "lucide-react";
import { AssistantMarkdown } from "@/components/AssistantMarkdown";
import type { AgentSession, AgentSource } from "@/lib/ai/creator-agent";

const endpoint = "/api/admin/brenup-ai/agent";
const button = "rounded-xl border border-[var(--br-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50";
export function CreatorAgentWorkspace() {
  const [current,setCurrent] = useState<AgentSession|null>(null);
  const [list,setList] = useState<Array<Pick<AgentSession,"id"|"title">>>([]);
  const [input,setInput] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [source,setSource] = useState<Partial<AgentSource>|null>(null);
  const stop = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  async function refreshList() {
    const response = await fetch(endpoint); const data = await response.json();
    if(!response.ok) throw new Error(data.error);
    setList(data.sessions);
  }
  useEffect(()=>{void refreshList().catch(e=>setError(e.message));},[]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:"smooth"});},[current?.state.messages.length,busy]);
  async function post(payload: Record<string,unknown>) {
    abort.current = new AbortController();
    const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:abort.current.signal});
    const data=await response.json(); if(!response.ok) throw new Error(data.error || "Agent request failed.");
    setCurrent(data.session); return data.session as AgentSession;
  }
  async function run(command: string, extra: Record<string,unknown>={}) {
    if(busy) return; setBusy(true);setError("");stop.current=false;
    try {
      let active=current;
      if(!active) active=await post({command:"create"});
      active=await post({sessionId:active.id,requestId:crypto.randomUUID(),command,...extra});
      if(command==="message") setInput("");
      while(active.state.running && !active.state.pending && !active.state.lastError && !stop.current) {
        active=await post({sessionId:active.id,requestId:crypto.randomUUID(),command:"step"});
      }
      if(stop.current && active.state.running) await post({sessionId:active.id,requestId:crypto.randomUUID(),command:"cancel"});
      await refreshList();
    } catch(e) {setError(e instanceof Error?e.message:"Request failed. Reopen this conversation to resume.");}
    finally {abort.current=null;setBusy(false);}
  }
  async function open(id:string) {
    setError("");setBusy(true);
    try {const r=await fetch(`${endpoint}?sessionId=${id}`);const d=await r.json();if(!r.ok)throw new Error(d.error);setCurrent(d.session);}catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function upload(file:File) {
    if(file.size>10*1024*1024){setError("Use a file smaller than 10 MB.");return;}
    if(/\.(txt|md|csv)$/i.test(file.name)){setSource({title:file.name,text:await file.text(),enabled:true});return;}
    if(!/^(image\/(png|jpeg|webp|gif)|audio\/|video\/)/.test(file.type)){setError("Attach an image, audio, video, or a text/Markdown source.");return;}
    setBusy(true);setError("");
    try {
      const form=new FormData();form.set("file",file);form.set("type",file.type.split("/")[0]);
      const response=await fetch("/api/admin/upload",{method:"POST",body:form});const media=await response.json();if(!response.ok)throw new Error(media.error);
      const active=current??await post({command:"create"});
      await post({sessionId:active.id,requestId:crypto.randomUUID(),command:"media",media:{title:media.title,url:media.url,type:media.type}});
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  const state=current?.state;
  return <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
    <aside className="space-y-4">
      <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-4">
        <button className={`${button} w-full`} disabled={busy} onClick={()=>{setCurrent(null);setError("");}}><Plus className="mr-2 inline size-4"/>New conversation</button>
        <nav aria-label="Agent conversations" className="mt-3 max-h-64 space-y-1 overflow-auto">{list.map(item=><button key={item.id} disabled={busy} onClick={()=>void open(item.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${current?.id===item.id?"bg-[var(--br-surface-muted)] font-bold":""}`}>{item.title}</button>)}</nav>
      </div>
      <div className="rounded-2xl border border-[var(--br-border)] bg-surface p-4">
        <div className="flex items-center justify-between"><h2 className="font-bold">Sources</h2><button disabled={busy} className={button} onClick={()=>setSource({title:"",text:"",enabled:true})}>Add</button></div>
        <p className="mt-2 text-xs text-[var(--br-text-muted)]">Add or edit reference text. Source instructions cannot authorize changes.</p>
        {state?.sources.map(s=><button disabled={busy} key={s.id} onClick={()=>setSource(s)} className="mt-2 block w-full text-left text-sm underline">{s.title} · v{s.version}{s.enabled?"":" · disabled"}</button>)}
        {state?.media.map((m,i)=><a key={`${m.url}-${i}`} className="mt-2 block truncate text-sm underline" href={m.url} target="_blank" rel="noreferrer">{m.title}</a>)}
      </div>
      <p className="px-2 text-xs leading-5 text-[var(--br-text-muted)]">Local Ollama only. No paid model fallback. Your local gateway must be online. Lessons remain drafts; review answers before publishing.</p>
    </aside>
    <section className="flex min-h-[75vh] flex-col rounded-3xl border border-[var(--br-border)] bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--br-border)] p-5"><div><h1 className="flex items-center gap-2 text-xl font-bold"><Bot className="size-6"/>BrenUp Creator Agent</h1><p className="mt-1 text-sm text-[var(--br-text-muted)]">Describe the lesson or changes you want, in Bangla or English.</p></div>{current?.lesson_id&&<a className={button} href={`/admin/lessons/${current.lesson_id}/builder`} target="_blank" rel="noreferrer">Open lesson</a>}</header>
      <div className="max-h-[65vh] min-h-64 flex-1 space-y-4 overflow-auto p-5" aria-live="polite">
        {!state?.messages.length&&<div className="py-10 text-center"><h2 className="text-lg font-bold">Build a lesson by chatting</h2><p className="mx-auto mt-3 max-w-lg text-sm text-[var(--br-text-muted)]">Try: “Create a six-slide A2 lesson about shopping, with vocabulary, a dialogue, and matching practice.”</p></div>}
        {state?.messages.map((m,i)=><div key={i} className={`rounded-2xl p-4 ${m.role==="user"?"ml-8 bg-[var(--br-surface-muted)]":"mr-4 border border-[var(--br-border)]"}`}><p className="mb-2 text-xs font-bold text-[var(--br-text-muted)]">{m.role==="user"?"You":"Creator Agent"}</p><AssistantMarkdown content={m.content}/></div>)}
        {busy&&<p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin"/>Working locally · completed steps: {state?.steps??0}</p>}
        {(error||state?.lastError)&&<div role="alert" className="rounded-xl border border-red-300 p-3 text-sm text-red-700">{error||state?.lastError}</div>}
        {state?.pending&&<div className="rounded-2xl border border-amber-300 p-4"><h2 className="font-bold">Review proposed changes</h2><ul className="my-3 list-inside list-disc text-sm">{state.pending.summary.map((s,i)=><li key={i}>{s}</li>)}</ul><details className="mb-3 text-xs"><summary className="cursor-pointer">Inspect proposed lesson content</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{JSON.stringify(state.pending.document,null,2)}</pre></details><div className="flex gap-2"><button disabled={busy} className={button} onClick={()=>void run("confirm")}>Confirm changes</button><button disabled={busy} className={button} onClick={()=>void run("cancel")}>Cancel</button></div></div>}
        <div ref={end}/>
      </div>
      <footer className="border-t border-[var(--br-border)] p-4">
        <div className="mb-3 flex flex-wrap gap-2"><button className={button} disabled={busy||!current?.lesson_id||!!state?.pending} onClick={()=>void run("undo")}><Undo2 className="mr-1 inline size-4"/>Undo last save</button><button className={button} disabled={busy||!current?.lesson_id||!!state?.pending} onClick={()=>void run("copy_draft")}>Make draft copy</button>{current&&!state?.pending&&<button className={button} disabled={busy} onClick={()=>void run("step")}>Continue</button>}<label className={`${button} cursor-pointer`}><Paperclip className="mr-1 inline size-4"/>Attach<input type="file" className="sr-only" disabled={busy} accept="image/png,image/jpeg,image/webp,image/gif,audio/*,video/*,.txt,.md,.csv" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value="";}}/></label>{busy&&<button className={`${button} border-red-300 text-red-700`} onClick={()=>{stop.current=true;abort.current?.abort();}}><Square className="mr-1 inline size-3"/>Stop</button>}</div>
        <form onSubmit={e=>{e.preventDefault();void run("message",{message:input});}} className="flex gap-2"><textarea aria-label="Message the creator agent" disabled={busy||!!state?.pending} className="min-h-24 flex-1 rounded-xl border border-[var(--br-border)] bg-surface p-3 text-sm" value={input} onChange={e=>setInput(e.target.value)} placeholder="Create a lesson, add an activity, or describe an edit…"/><button aria-label="Send instruction" disabled={busy||!input.trim()||!!state?.pending} className={button}><Send className="size-5"/></button></form>
      </footer>
    </section>
    {source&&<div role="dialog" aria-modal="true" aria-label="Edit source" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form className="w-full max-w-2xl space-y-3 rounded-2xl bg-surface p-5" onSubmit={e=>{e.preventDefault();void run("source",{source:{id:source.id,title:source.title,text:source.text,enabled:source.enabled??true}}).then(()=>setSource(null));}}><h2 className="text-lg font-bold">Reference source</h2><input required aria-label="Source title" className="w-full rounded-lg border border-[var(--br-border)] bg-surface p-2" value={source.title??""} onChange={e=>setSource({...source,title:e.target.value})}/><textarea required aria-label="Source text" className="h-64 w-full rounded-lg border border-[var(--br-border)] bg-surface p-2" value={source.text??""} onChange={e=>setSource({...source,text:e.target.value})}/><label className="block text-sm"><input type="checkbox" checked={source.enabled??true} onChange={e=>setSource({...source,enabled:e.target.checked})}/> Use this source</label><button disabled={busy} className={button}>Save source</button><button type="button" className={`${button} ml-2`} onClick={()=>setSource(null)}>Close</button></form></div>}
  </div>;
}

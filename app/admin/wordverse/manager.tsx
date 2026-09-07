"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveManagedGalaxy, saveManagedWord, publishManagedWords } from "./manage-actions";
import { emptyWord, listFields, publicationIssues, relationshipTypes, wordContent,
  type AdminGalaxy, type AdminWord, type AuthoringData, type AuthorWord, type Connection } from "@/lib/wordverse-authoring";

const input = "mt-1 w-full rounded-lg border border-[var(--br-border)] bg-surface px-3 py-2 text-strong";
const button = "rounded-lg border border-[var(--br-border)] bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-40";
const panel = "rounded-xl border border-[var(--br-border)] bg-surface p-5";
const title = (s: string) => s.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

export function WordverseManager({ data }: { data: AuthoringData }) {
  const router = useRouter();
  const [tab, setTab] = useState("words");
  const [query, setQuery] = useState("");
  const [galaxy, setGalaxy] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(data.words[0]?.id ?? "new");
  const [dirty, setDirty] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const filtered = data.words.filter(w => (!galaxy || w.topic_id === galaxy) && (!status || w.status === status) && `${w.word} ${w.translation ?? ""} ${w.definition}`.toLowerCase().includes(query.toLowerCase()));
  const current = data.words.find(w => w.id === selected);
  const connectedIds = new Set(data.relationships.flatMap(r => [r.source_word_id, r.target_word_id]));
  const isolated = data.words.filter(w => w.status !== "ARCHIVED" && !connectedIds.has(w.id));
  const navigate = (fn: () => void) => { if (!dirty || window.confirm("Discard unsaved changes?")) { setDirty(false); fn(); } };
  const publish = () => start(async () => {
    try { const result = await publishManagedWords(checked); setMessage(result.message); setChecked([]); router.refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Publication failed."); }
  });
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Galaxies", data.topics.length], ["Published words", data.words.filter(w => w.status === "PUBLISHED").length], ["Draft words", data.words.filter(w => w.status === "DRAFT").length], ["Connections", data.relationships.length]].map(([label,count]) => <div className={panel} key={label}><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{count}</p></div>)}</div>
    <p className="text-sm text-muted">Network check: {isolated.length} words have no connections. {data.words.filter(w => w.status !== "ARCHIVED" && !w.translation?.trim()).length} words need a translation. {isolated.length ? `Unconnected: ${isolated.slice(0,10).map(w => w.word).join(", ")}${isolated.length > 10 ? "…" : ""}` : ""}</p>
    <nav className="flex flex-wrap gap-3" aria-label="Studio sections"><button className={button} aria-pressed={tab === "words"} onClick={() => navigate(() => setTab("words"))}>Words & connections</button><button className={button} aria-pressed={tab === "galaxies"} onClick={() => navigate(() => setTab("galaxies"))}>Galaxies</button><Link className={button} href="/admin/wordverse/preview" target="_blank">Preview saved universe</Link></nav>
    {tab === "galaxies" ? <GalaxyManager data={data} onDirty={setDirty} /> : <>
      <div className="flex flex-wrap items-end gap-3"><label className="flex-1 text-sm">Search words<input className={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Word, Bengali meaning, or definition" /></label><label className="text-sm">Galaxy<select className={input} value={galaxy} onChange={e => setGalaxy(e.target.value)}><option value="">All galaxies</option>{data.topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="text-sm">Status<select className={input} value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{["DRAFT","PUBLISHED","ARCHIVED"].map(s => <option key={s}>{s}</option>)}</select></label><button className={button} onClick={() => navigate(() => setSelected("new"))}>+ New word</button></div>
      <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={pending || dirty} onClick={() => setChecked(filtered.filter(w => w.status === "DRAFT").map(w => w.id))}>Select visible drafts</button><button className={button} disabled={!checked.length || pending || dirty} onClick={publish}>Publish {checked.length} selected drafts</button><button className={button} disabled={!checked.length} onClick={() => setChecked([])}>Clear selection</button><span className="text-sm text-muted">{filtered.length} words</span></div>
      <p role="status" className="text-sm">{pending ? "Publishing…" : message}</p>
      <div className="grid items-start gap-5 lg:grid-cols-[250px_1fr]">
        <div className={`${panel} max-h-[750px] overflow-y-auto`}>{filtered.map(w => <div className="flex items-center gap-2" key={w.id}>{w.status === "DRAFT" ? <input type="checkbox" aria-label={`Select ${w.word} for publication`} checked={checked.includes(w.id)} onChange={e => setChecked(c => e.target.checked ? [...c,w.id] : c.filter(id => id !== w.id))} /> : null}<button className={`my-1 w-full rounded-lg p-3 text-left ${selected === w.id ? "bg-surface-muted" : "hover:bg-surface-muted"}`} onClick={() => navigate(() => setSelected(w.id))}><span className="block font-medium">{w.word}</span><span className="text-xs text-muted">{w.cefr_level ?? "No level"} · {w.status.toLowerCase()}</span></button></div>)}{!filtered.length ? <p className="text-sm text-muted">No words match these filters.</p> : null}</div>
        <WordForm key={`${selected}:${current?.updated_at ?? "new"}`} current={current} data={data} defaultTopic={galaxy || null} onDirty={setDirty} onSaved={id => { setDirty(false); setSelected(id); router.refresh(); }} />
      </div>
    </>}
  </div>;
}

function WordForm({ current, data, defaultTopic, onDirty, onSaved }: { current?: AdminWord; data: AuthoringData; defaultTopic: string | null; onDirty: (v: boolean) => void; onSaved: (id: string) => void }) {
  const [word, setWord] = useState<AuthorWord>(() => current ? wordContent(current) : emptyWord(defaultTopic));
  const [links, setLinks] = useState<Connection[]>(() => data.relationships.filter(r => r.source_word_id === current?.id).map(r => ({ target_word_id: r.target_word_id, relationship_type: r.relationship_type as Connection["relationship_type"], strength: r.strength })));
  const [dirty, setDirty] = useState(false);
  const [targetQuery, setTargetQuery] = useState("");
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<Connection["relationship_type"]>("RELATED");
  const [strength, setStrength] = useState(60);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  useUnsaved(dirty);
  const changed = () => { setDirty(true); onDirty(true); };
  const update = (part: Partial<AuthorWord>) => { setWord(w => ({...w,...part})); changed(); };
  const targets = data.words.filter(w => w.id !== current?.id && w.status !== "ARCHIVED" && w.word.toLowerCase().includes(targetQuery.toLowerCase())).slice(0,100);
  const incoming = data.relationships.filter(r => r.target_word_id === current?.id);
  const issues = publicationIssues(word);
  const save = (status: AdminWord["status"]) => start(async () => {
    setMessage("");
    try {
      const cleaned = { ...word };
      for (const field of listFields) cleaned[field] = cleaned[field].map(s => s.trim()).filter(Boolean);
      const result = await saveManagedWord({ id: current?.id ?? null, expected: current?.updated_at ?? null, word: cleaned, links, status });
      setDirty(false); onDirty(false); setMessage(result.message); onSaved(result.id);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Save failed. Your edits are still here."); }
  });
  return <form className={`${panel} space-y-6`} onSubmit={e => { e.preventDefault(); save(current?.status === "ARCHIVED" ? "DRAFT" : current?.status ?? "DRAFT"); }}>
    <div><h2 className="text-xl font-semibold">{current ? `Edit ${current.word}` : "Create a word planet"}</h2><p className="mt-1 text-sm text-muted">{current?.status === "PUBLISHED" ? "Saving published changes updates the learner word immediately. Save as draft to hide it while editing." : "Save a draft, preview it, then publish when ready."}</p></div>
    <fieldset disabled={pending} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Word<input required className={input} value={word.word} onChange={e => update({ word: e.target.value, ...(!current && word.slug === slugify(word.word) ? { slug: slugify(e.target.value) } : {}) })} /></label><label className="text-sm">Unique slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" className={input} value={word.slug} onChange={e => update({slug:e.target.value})} /></label><label className="text-sm">Galaxy<select className={input} value={word.topic_id ?? ""} onChange={e => update({topic_id:e.target.value || null})}><option value="">Choose a galaxy</option>{data.topics.map(t => <option key={t.id} value={t.id}>{t.name} · {t.status.toLowerCase()}</option>)}</select></label><label className="text-sm">Word class<input list="word-classes" className={input} value={word.word_class ?? ""} onChange={e => update({word_class:e.target.value || null})} /><datalist id="word-classes">{["noun","verb","adjective","adverb","preposition","conjunction","pronoun","interjection","phrase"].map(s => <option key={s} value={s}/>)}</datalist></label><label className="text-sm">CEFR level<select className={input} value={word.cefr_level ?? ""} onChange={e => update({cefr_level:(e.target.value || null) as AuthorWord["cefr_level"]})}><option value="">Choose level</option>{["A1","A2","B1","B2","C1","C2"].map(s => <option key={s}>{s}</option>)}</select></label><label className="text-sm">Frequency score (0–100)<input type="number" min={0} max={100} className={input} value={word.frequency_score} onChange={e => update({frequency_score:Number(e.target.value)})} /></label></div>
      <label className="block text-sm">Definition<textarea className={input} rows={3} value={word.definition} onChange={e => update({definition:e.target.value})} /></label>
      <div className="grid gap-4 sm:grid-cols-2">{(["translation","pronunciation","register","origin","audio_url"] as const).map(key => <label key={key} className="text-sm">{key === "translation" ? "Translation · Bengali meaning" : title(key)}<input type={key === "audio_url" ? "url" : "text"} className={input} placeholder={key === "audio_url" ? "https://…" : ""} value={word[key] ?? ""} onChange={e => update({[key]:e.target.value || null})}/></label>)}</div>
      <div className="grid gap-4 sm:grid-cols-2">{listFields.map(key => <label key={key} className="text-sm">{title(key)} <span className="text-xs text-muted">(one per line)</span><textarea rows={3} className={input} value={word[key].join("\n")} onChange={e => update({[key]:e.target.value.split("\n")})}/></label>)}</div>
      <section className="space-y-3 border-t border-[var(--br-border)] pt-5"><h3 className="font-semibold">Connections to real word planets</h3><p className="text-sm text-muted">Metadata above describes usage. Connections below create navigable links in the universe. Incoming connections are managed from their source word.</p>
        <label className="block text-sm">Find a target word<input className={input} value={targetQuery} onChange={e => {setTargetQuery(e.target.value);setTarget("");}} placeholder="Search existing words…" /></label>
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Target word<select className={input} value={target} onChange={e => setTarget(e.target.value)}><option value="">Choose a word</option>{targets.map(w => <option key={w.id} value={w.id}>{w.word} · {w.status.toLowerCase()}</option>)}</select></label><label className="text-sm">Relationship<select className={input} value={kind} onChange={e => setKind(e.target.value as Connection["relationship_type"])}>{relationshipTypes.map(k => <option key={k} value={k}>{title(k)}</option>)}</select></label><label className="text-sm">Strength<input type="number" min={0} max={100} className={input} value={strength} onChange={e => setStrength(Number(e.target.value))}/></label></div>
        <button type="button" className={button} disabled={!target || links.some(l => l.target_word_id === target && l.relationship_type === kind)} onClick={() => { setLinks(l => [...l,{ target_word_id:target, relationship_type:kind, strength }]); changed(); setTarget(""); }}>Add connection</button>
        {links.map((link,index) => <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-muted p-3" key={`${link.target_word_id}:${link.relationship_type}`}><span className="flex-1 text-sm">→ {data.words.find(w => w.id === link.target_word_id)?.word ?? link.target_word_id} · {title(link.relationship_type)}</span><label className="text-xs">Strength<input aria-label={`Strength for connection ${index+1}`} type="number" min={0} max={100} className={`${input} max-w-24`} value={link.strength} onChange={e => {setLinks(ls => ls.map((l,i) => i===index ? {...l,strength:Number(e.target.value)} : l));changed();}}/></label><button type="button" className={button} onClick={() => {setLinks(ls => ls.filter((_,i) => i!==index));changed();}}>Remove</button></div>)}
        {incoming.length ? <details><summary className="text-sm">{incoming.length} incoming connections</summary><ul className="mt-2 space-y-1 text-sm text-muted">{incoming.map(r => <li key={r.id}>{data.words.find(w => w.id === r.source_word_id)?.word} → this word · {title(r.relationship_type)} · {r.strength}</li>)}</ul></details> : null}
      </section>
    </fieldset>
    <div className="rounded-lg bg-surface-muted p-4 text-sm"><p className="font-medium">Publication readiness</p>{issues.length ? <ul className="mt-2 list-inside list-disc">{issues.map(i => <li key={i}>{i}</li>)}</ul> : <p className="mt-2">Required teaching fields are complete.</p>}<p className="mt-2 text-muted">Publishing also checks the saved galaxy and reachability through published words. Pronunciation, translation and other optional fields may be added later.</p></div>
    <p role="status" className="text-sm">{pending ? "Saving…" : message}</p>
    <div className="flex flex-wrap gap-3"><button className={button} disabled={pending} type="submit">{current?.status === "PUBLISHED" ? "Save published changes" : "Save draft"}</button>{current && current.status !== "DRAFT" ? <button type="button" className={button} disabled={pending} onClick={() => save("DRAFT")}>Save as draft</button> : null}{current?.status === "DRAFT" ? <button type="button" className={button} disabled={pending || issues.length > 0} onClick={() => save("PUBLISHED")}>Save & publish word</button> : null}{current && current.status !== "ARCHIVED" ? <button type="button" className={button} disabled={pending} onClick={() => save("ARCHIVED")}>Archive word</button> : null}{current ? <Link className={button} href={`/admin/wordverse/preview?word=${current.id}`} target="_blank">Preview saved word</Link> : null}</div>
  </form>;
}

function GalaxyManager({ data, onDirty }: { data: AuthoringData; onDirty: (v: boolean) => void }) {
  const [selected, setSelected] = useState(data.topics[0]?.id ?? "new");
  const [dirty,setDirty] = useState(false);
  const current = data.topics.find(t => t.id === selected);
  return <div className="space-y-4"><div className="flex flex-wrap gap-3">{data.topics.map(t => <button className={button} key={t.id} onClick={() => { if (!dirty || window.confirm("Discard unsaved galaxy changes?")) {setDirty(false);onDirty(false);setSelected(t.id);} }}>{t.name} · {data.words.filter(w => w.topic_id === t.id).length}</button>)}<button className={button} onClick={() => {if (!dirty || window.confirm("Discard unsaved galaxy changes?")) {setDirty(false);onDirty(false);setSelected("new");}}}>+ New galaxy</button></div><GalaxyForm key={`${selected}:${current?.updated_at}`} current={current} onDirty={v => {setDirty(v);onDirty(v);}} onSaved={setSelected}/></div>;
}
function GalaxyForm({ current, onDirty, onSaved }: { current?: AdminGalaxy; onDirty:(v:boolean)=>void; onSaved:(id:string)=>void }) {
  const router = useRouter();
  const [galaxy,setGalaxy] = useState(() => ({ name:current?.name ?? "", slug:current?.slug ?? "", color:current?.color ?? "#5ee7ff", position:current?.position ?? 0, description:current?.description ?? "", status:current?.status ?? "DRAFT" }));
  const [dirty,setDirty] = useState(false);
  const [pending,start] = useTransition();
  const [message,setMessage] = useState("");
  useUnsaved(dirty);
  const change = (v:Partial<typeof galaxy>) => {setGalaxy(g => ({...g,...v}));setDirty(true);onDirty(true);};
  return <form className={`${panel} max-w-3xl space-y-4`} onSubmit={e => {e.preventDefault(); start(async () => {try {const result = await saveManagedGalaxy({id:current?.id ?? null,expected:current?.updated_at ?? null,galaxy});setMessage(result.message);setDirty(false);onDirty(false);onSaved(result.id);router.refresh();}catch(error){setMessage(error instanceof Error ? error.message : "Could not save galaxy.");}});}}><h2 className="text-xl font-semibold">{current ? "Edit galaxy" : "Create galaxy"}</h2><fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Name<input required className={input} value={galaxy.name} onChange={e => change({name:e.target.value,...(!current && galaxy.slug === slugify(galaxy.name) ? {slug:slugify(e.target.value)} : {})})}/></label><label className="text-sm">Slug<input required className={input} value={galaxy.slug} onChange={e => change({slug:e.target.value})}/></label><label className="text-sm">Color<input type="color" className={`${input} h-12`} value={galaxy.color} onChange={e => change({color:e.target.value})}/></label><label className="text-sm">Display order<input type="number" min={0} max={10000} className={input} value={galaxy.position} onChange={e => change({position:Number(e.target.value)})}/></label><label className="text-sm sm:col-span-2">Description / learning objective<textarea rows={3} className={input} value={galaxy.description} onChange={e => change({description:e.target.value})}/></label><label className="text-sm">Visibility<select className={input} value={galaxy.status} onChange={e => change({status:e.target.value as AdminGalaxy["status"]})}>{["DRAFT","PUBLISHED","ARCHIVED"].map(s => <option key={s}>{s}</option>)}</select></label></fieldset><p className="text-sm text-muted">Draft and archived galaxies are hidden from learners, including their words. Publishing the galaxy shows its published words; drafts remain private.</p><p role="status" className="text-sm">{pending ? "Saving…" : message}</p><button className={button} disabled={pending}>Save galaxy</button></form>;
}

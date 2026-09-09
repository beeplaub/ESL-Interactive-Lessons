"use client";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ArrowUpRight, BookOpen, Circle, Eraser, Expand, Highlighter, ImagePlus, Lightbulb, LockKeyhole, Maximize2, Minus, MousePointer2, Move, Pencil, Plus, Pointer, Redo2, Shapes, Sparkles, Square, StickyNote, Timer, Trash2, Type, Undo2, UnlockKeyhole, Upload, X } from "lucide-react";
import { LiveMeetingPanel } from "@/components/LiveMeetingPanel";
import { LiveClassTools } from "@/components/LiveClassTools";
import { routineTemplate, type BoardObject } from "@/lib/whiteboard";
import { BoardCanvas, cursorColor, exportBoard, type BoardTool } from "./BoardCanvas";
import { useWhiteboard } from "./useWhiteboard";
import { LivePlaylistPanel, type Item } from "./LivePlaylistPanel";
import { LiveLessonStage } from "./LiveLessonStage";
import "./whiteboard.css";

export type ClassroomSlide = { id: string; slide_number: number; title: string; section_label?: string | null };
const mainTools = [["select", MousePointer2, "Select"], ["pen", Pencil, "Pen"], ["highlighter", Highlighter, "Highlighter"], ["text", Type, "Text"], ["eraser", Eraser, "Eraser"], ["pointer", MousePointer2, "Point"], ["laser", Pointer, "Laser"]] as const;
const extraTools = [["sticky", StickyNote, "Sticky note"], ["rect", Shapes, "Shapes"], ["arrow", ArrowUpRight, "Arrow"], ["text", Type, "Text box"], ["image", ImagePlus, "Image"], ["move", Move, "Move"], ["pointer", MousePointer2, "Pointer"], ["laser", Pointer, "Laser"]] as const;
const inkColors = ["#703cf0", "#24203d", "#05a77c", "#ff6966", "#edae16", "#328de8"];

async function imageData(file: Blob) {
  if (file.size > 10_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG, or WebP image under 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); const scale = Math.min(1, 650 / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const src = canvas.toDataURL("image/jpeg", .7);
    if (src.length > 150000) throw new Error("This picture is too detailed. Try a smaller image.");
    return { src, ratio: image.width / image.height };
  } finally { URL.revokeObjectURL(url); }
}
export function WhiteboardWorkspace({ sessionId, status, lesson, overview, meetingUrl, callingEnabled, slides = [], title = "Live classroom", level, startedAt }: { sessionId: string; status: string; lesson: ReactNode; overview?: ReactNode; meetingUrl?: string | null; callingEnabled: boolean; slides?: ClassroomSlide[]; title?: string; level?: string | null; startedAt?: string | null }) {
  const [activeSlide, setActiveSlide] = useState<Item | null>(null);
  const board = useWhiteboard(sessionId, activeSlide?.item_type === "WHITEBOARD" ? activeSlide.id : null);
  const { objects, settings } = board.document;
  const teacher = board.data?.teacher ?? false;
  const canEdit = Boolean(activeSlide?.item_type === "WHITEBOARD" && board.data?.live && (teacher || settings.editing));
  const [tool, setTool] = useState<BoardTool>("select");
  const [color, setColor] = useState("#703cf0");
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState("Board");
  const [zoom, setZoom] = useState(100);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"template" | "clear" | "timer" | "prompt" | null>(null);
  const [draftText, setDraftText] = useState("");
  const [timerMinutes, setTimerMinutes] = useState(5);
  const svg = useRef<SVGSVGElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const view = activeSlide ? activeSlide.item_type === "WHITEBOARD" ? "board" : "lesson" : "empty";
  const selectedObject = selected ? objects[selected] : null;
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (selected && !objects[selected]) setSelected(null); }, [objects, selected]);
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("textarea, input, button")?.focus();
    return () => previous?.focus();
  }, [dialog]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setDialog(null); setSelected(null); setExpanded(false); } };
    window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape);
  }, []);
  const remaining = settings.timerEnd ? Math.max(0, Math.ceil((settings.timerEnd - now) / 1000)) : settings.timerSeconds;
  const clock = (n: number) => {
    const total = Math.max(0, Math.floor(n));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}` : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };
  const elapsed = startedAt && now ? Math.max(0, (now - new Date(startedAt).getTime()) / 1000) : null;
  function keyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (dialog) {
      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),textarea:not(:disabled)") ?? []);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      return;
    }
    if ((event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]") || !canEdit || board.busy) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); void board.undo(); return; }
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      const shortcuts: Record<string, BoardTool> = { v: "select", p: "pen", h: "highlighter", t: "text", e: "eraser", l: "laser" };
      if (shortcuts[event.key.toLowerCase()]) { event.preventDefault(); setTool(shortcuts[event.key.toLowerCase()]); return; }
    }
    if (!selectedObject) return;
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); void board.change([{ id: selectedObject.id, value: null }]); }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault(); const distance = event.shiftKey ? 10 : 2;
      const item = { ...selectedObject, x: selectedObject.x + (event.key === "ArrowRight" ? distance : event.key === "ArrowLeft" ? -distance : 0), y: selectedObject.y + (event.key === "ArrowDown" ? distance : event.key === "ArrowUp" ? -distance : 0) };
      void board.change([{ id: item.id, value: item }]);
    }
  }
  async function insertImage(file: Blob) {
    try {
      const { src, ratio } = await imageData(file);
      const item: BoardObject = { id: crypto.randomUUID(), revision: 0, kind: "image", x: 400, y: 260, w: 300, h: 300 / ratio, src, color: "#ffffff" };
      if (await board.change([{ id: item.id, value: item }])) { setSelected(item.id); setTool("select"); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not add this image."); }
  }
  async function template() {
    try {
      const items = routineTemplate();
      const values = [...Object.keys(objects).map((id) => ({ id, expected: objects[id].revision, value: null as BoardObject | null })), ...items.map((value) => ({ id: value.id, expected: null, value }))];
      if (await board.mutate({ changes: values, expectedRevision: board.document.revision })) { setDialog(null); setTool("select"); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load the template."); }
  }
  function choose(next: BoardTool) { if (next === "image") upload.current?.click(); else setTool(next); }
  return <div ref={frame} onKeyDown={keyboard} className={`wb-workspace ${expanded ? "wb-expanded" : ""}`}>
    <header className="wb-header"><div className="wb-lesson-title"><small>{level ? `${level} · ` : ""}Learn together</small><strong>{title}</strong></div><div className="wb-live"><i />{status === "LIVE" ? "Live Class" : "Class review"}{elapsed !== null && status === "LIVE" ? ` · ${clock(elapsed)}` : ""}</div><button aria-label={expanded ? "Exit focused classroom" : "Expand classroom"} title="Focus classroom" onClick={() => setExpanded(!expanded)}>{expanded ? <X size={20} /> : <Expand size={20} />}</button></header>
    <div className="wb-layout">
      <nav className="wb-slides" aria-label="Live class slides"><LivePlaylistPanel sessionId={sessionId} teacher={teacher} live={status === "LIVE"} onActive={setActiveSlide} />
      </nav>
      <main className="wb-main">
        <div className="wb-context"><span><i className={board.connected ? "wb-dot" : "wb-dot wb-offline"} />{board.busy ? "Saving…" : board.connected ? "Live connection" : "Connecting · saved board available"}</span><div><button aria-label="Pan board" aria-pressed={tool === "move"} onClick={() => setTool(tool === "move" ? "select" : "move")}><Move size={14} /></button><button onClick={() => setZoom(Math.max(60, zoom - 20))} aria-label="Zoom out"><Minus size={14} /></button><button onClick={() => setZoom(100)} title="Fit board">{zoom}%</button><button onClick={() => setZoom(Math.min(240, zoom + 20))} aria-label="Zoom in"><Plus size={14} /></button><button onClick={() => void frame.current?.requestFullscreen()} aria-label="Full screen"><Maximize2 size={15} /></button></div></div>
        {board.error || notice ? <div className="wb-notice" role="alert">{board.error || notice}<button onClick={() => { setNotice(""); void board.retry(); }}>Retry</button>{board.hasPending ? <button onClick={board.discard}>Discard unsaved edit</button> : <button onClick={() => setNotice("")}>Dismiss</button>}</div> : null}
        {!board.data ? <div className="wb-loading" role="status">Opening your shared whiteboard…</div> : null}
        {view === "empty" ? <div className="wb-loading"><h2>Your classroom is ready</h2><p>{teacher ? "Use Add slide on the left to start a whiteboard or choose a course lesson slide." : "Your teacher will share a slide here shortly."}</p></div> : null}
        <div hidden={view !== "board"}>
          <BoardCanvas key={activeSlide?.id ?? "empty"} objects={objects} tool={tool} color={color} canEdit={canEdit} busy={board.busy} selected={selected} onSelect={setSelected} onChange={board.change} cursors={board.cursors} onCursor={board.cursor} zoom={zoom} svgRef={svg} />
          <div className="wb-toolbar" aria-label="Whiteboard drawing tools">{mainTools.map(([id, Icon, label]) => <button key={id} aria-pressed={tool === id} disabled={(!canEdit && id !== "pointer" && id !== "laser") || !board.data?.live} className={tool === id ? "wb-selected" : ""} onClick={() => choose(id)}><Icon size={23} /><span>{label}</span></button>)}<span className="wb-separator" /><button disabled={!canEdit || !board.undoCount || board.busy} onClick={() => void board.undo()}><Undo2 size={23} /><span>Undo</span></button><button disabled={!teacher || !canEdit || board.busy || !Object.keys(objects).length} onClick={() => setDialog("clear")}><Trash2 size={23} /><span>Clear board</span></button><span className="wb-separator" /><button disabled={!teacher || !board.data?.live} onClick={() => setDialog("timer")} className={settings.timerEnd && remaining === 0 ? "wb-time-up" : ""}><span className="wb-timer"><Timer size={23} /><b>{clock(remaining)}</b></span><span>{settings.timerEnd && remaining === 0 ? "Time’s up!" : "Timer"}</span></button><button disabled={!teacher || !board.data?.live || board.busy} onClick={() => void board.settings({ editing: !settings.editing })}>{settings.editing ? <UnlockKeyhole size={23} /> : <LockKeyhole size={23} />}<span>{settings.editing ? "Lock board" : "Unlock board"}</span></button><button onClick={async () => { try { if (svg.current) await exportBoard(svg.current); } catch { setNotice("Could not export the image. Please try again."); } }}><Upload size={23} /><span>Export</span></button></div>
          <div className="wb-properties"><div className="wb-swatches" aria-label="Ink color">{inkColors.map((ink) => <button key={ink} style={{ background: ink }} aria-label={`Ink ${ink}`} aria-pressed={color === ink} onClick={() => setColor(ink)} />)}</div><span>{canEdit ? "Select and drag to move · corner handle to resize" : "Board locked · you can still point, explore, and export"}</span>{selectedObject && canEdit ? <><button disabled={board.busy} onClick={() => { const copy = { ...selectedObject, id: crypto.randomUUID(), revision: 0, x: selectedObject.x + 25, y: selectedObject.y + 25 }; void board.change([{ id: copy.id, value: copy }]); }}><Redo2 size={15} /> Duplicate</button>{["text", "sticky", "card"].includes(selectedObject.kind) ? <span>Double-click to edit text</span> : null}<button disabled={board.busy} onClick={() => void board.change([{ id: selectedObject.id, value: null }])}>Delete</button></> : null}{tool === "rect" || tool === "ellipse" ? <><button aria-pressed={tool === "rect"} onClick={() => setTool("rect")}><Square size={16} /> Rectangle</button><button aria-pressed={tool === "ellipse"} onClick={() => setTool("ellipse")}><Circle size={16} /> Ellipse</button></> : null}</div>
        </div>
          <div hidden={view !== "lesson"} className="wb-existing-lesson"><LiveLessonStage key={activeSlide?.id ?? "empty"} selection={activeSlide?.item_type === "LESSON_SLIDE" && activeSlide.lesson_id ? activeSlide : null} sessionId={sessionId} initialLesson={lesson} initialLessonId={null} live={status === "LIVE"} role={teacher ? "TEACHER" : "STUDENT"} initialSlideNumber={settings.slide} /></div>
      </main>
      <aside className="wb-sidebar">
        {status === "LIVE" ? <div className="wb-call"><LiveMeetingPanel sessionId={sessionId} meetingUrl={meetingUrl} callingEnabled={callingEnabled} /></div> : null}
        <section className="wb-side-panel"><nav className="wb-tabs" aria-label="Classroom interaction tabs">{["Chat", "Poll", "People", "Board"].map((item) => <button key={item} aria-pressed={tab === item} className={tab === item ? "wb-tab-active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
          <div hidden={tab !== "Board"} className="wb-board-panel"><h2>Board Tools</h2><div className="wb-tool-grid">{extraTools.map(([id, Icon, label]) => <button key={id} aria-pressed={tool === id} disabled={(!canEdit && !["move", "pointer", "laser"].includes(id)) || board.busy} onClick={() => choose(id)}><Icon size={22} /><span>{label}</span></button>)}</div>
            <div className="wb-extra-actions"><button disabled={!canEdit || board.busy} onClick={() => choose("card")}>＋ Word card</button><button disabled={!teacher || !canEdit || board.busy} onClick={() => setDialog("template")}><BookOpen size={14} /> Templates</button></div>
            <h2>Live on Board</h2><div className="wb-people">{board.people.length ? board.people.map((person) => <span key={person.id}><MousePointer2 size={23} fill={cursorColor(person.id)} color={cursorColor(person.id)} />{person.name}{person.id === board.data?.userId ? " (you)" : ""}</span>) : <p>Participants appear as they connect.</p>}</div>
            <h2>Activity Prompt {teacher ? <button aria-label="Edit activity prompt" onClick={() => { setDraftText(settings.prompt); setDialog("prompt"); }} disabled={!canEdit}><Pencil size={13} /></button> : null}</h2><div className="wb-prompt"><Lightbulb size={26} color="#daa523" /><p>{settings.prompt || "What can we discover together?"}</p></div>
            <label className="wb-editing"><b>Open student editing</b><input type="checkbox" role="switch" checked={settings.editing} disabled={!teacher || !board.data?.live || board.busy} onChange={(event) => void board.settings({ editing: event.target.checked })} /></label><p className="wb-help">{settings.editing ? "Students can add, move and edit on this board." : "Only the teacher can change the board. Students can use the pointer."}</p>
          </div>
          <div className="wb-tools" data-panel={tab.toLowerCase()} hidden={tab === "Board"}><LiveClassTools sessionId={sessionId} teacher={teacher} live={status === "LIVE"} />{tab === "People" ? <><div className="wb-people">{board.people.map((person) => <span key={person.id}><MousePointer2 size={16} color={cursorColor(person.id)} />{person.name}</span>)}</div>{overview}</> : null}</div>
        </section>
      </aside>
    </div>
    <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void insertImage(file); event.target.value = ""; }} />
    {dialog ? <div className="wb-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="wb-dialog-title" className="wb-dialog"><button className="wb-dialog-close" aria-label="Close dialog" onClick={() => setDialog(null)}><X size={20} /></button>
      {board.error ? <p role="alert">{board.error}</p> : null}<h2 id="wb-dialog-title">{dialog === "template" ? "Your next teaching moment" : dialog === "clear" ? "Clear the whiteboard?" : dialog === "timer" ? "A little focus time" : "Activity prompt"}</h2>
      {dialog === "prompt" ? <form onSubmit={(event) => { event.preventDefault(); void board.settings({ prompt: draftText }).then((ok) => { if (ok) setDialog(null); }); }}><textarea autoFocus aria-label="Activity prompt" maxLength={500} rows={4} value={draftText} onChange={(event) => setDraftText(event.target.value)} /><button className="wb-primary" disabled={board.busy}>Save prompt</button></form> : null}
      {dialog === "template" ? <><p>Start with the editable sentence activity from your design: correction, word bank, picture prompt, and sentence cards.</p><button className="wb-template-choice" disabled={board.busy} onClick={() => void template()}><Sparkles size={27} /><span><b>My Daily Routine</b><small>Present simple · Practice together</small></span></button><p className="wb-help">This replaces the current board. Undo restores it. Your lesson slides are separate.</p><button onClick={() => { setDialog("clear"); }}>Start with a blank board</button></> : null}
      {dialog === "clear" ? <><p>Remove all drawings, notes, words and pictures from this board. You can undo this while you stay in the classroom.</p><button className="wb-primary" disabled={board.busy} onClick={() => void board.mutate({ changes: Object.values(objects).map((item) => ({ id: item.id, expected: item.revision, value: null })), expectedRevision: board.document.revision }).then((ok) => { if (ok) setDialog(null); })}>Clear board</button></> : null}
      {dialog === "timer" ? <><label>Minutes <input type="number" min="1" max="60" value={timerMinutes} onChange={(event) => setTimerMinutes(Number(event.target.value))} /></label><div className="wb-dialog-actions"><button className="wb-primary" disabled={board.busy || timerMinutes < 1 || timerMinutes > 60} onClick={() => void board.settings({ timerSeconds: Math.round(timerMinutes * 60), timerEnd: Date.now() + Math.round(timerMinutes * 60000) }).then((ok) => { if (ok) setDialog(null); })}>Start for everyone</button><button disabled={board.busy} onClick={() => void board.settings({ timerEnd: null, timerSeconds: remaining }).then((ok) => { if (ok) setDialog(null); })}>Pause</button><button disabled={board.busy} onClick={() => void board.settings({ timerEnd: null, timerSeconds: 300 }).then((ok) => { if (ok) setDialog(null); })}>Reset</button></div></> : null}
    </section></div> : null}
  </div>;
}

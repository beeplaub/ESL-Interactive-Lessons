"use client";
import { memo, useRef, useState, type PointerEvent } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, type BoardObject } from "@/lib/whiteboard";
import type { BoardCursor } from "./useWhiteboard";

export type BoardTool = "card" | "select" | "pen" | "highlighter" | "text" | "eraser" | "sticky" | "rect" | "ellipse" | "arrow" | "image" | "move" | "pointer" | "laser";
export const cursorColor = (id: string) => ["#8548f5", "#0abca5", "#e158cb", "#ec9440", "#3c85e9"][Array.from(id).reduce((n, c) => n + c.charCodeAt(0), 0) % 5];
function lines(text: string, width: number, size: number) {
  return text.split("\n").flatMap((line) => {
    const result: string[] = []; let current = "";
    for (const word of line.split(" ")) {
      if (current && (current.length + word.length + 1) * size * .39 > width) { result.push(current); current = word; }
      else current += `${current ? " " : ""}${word}`;
    }
    result.push(current); return result;
  });
}
export const BoardElement = memo(function BoardElement({ item }: { item: BoardObject }) {
  const { kind, w, h, color } = item;
  const requestedSize = item.size ?? 28;
  const longestLine = Math.max(1, ...(item.text ?? "").split("\n").map((line) => line.length));
  const fontSize = kind === "card" ? Math.min(requestedSize, (w - 20) / (longestLine * .4)) : requestedSize;
  const paper = kind === "sticky" || kind === "card";
  const arrowStart = item.points?.[0] ?? [0, 0];
  const arrowEnd = item.points?.[1] ?? [w, h];
  const angle = Math.atan2(arrowEnd[1] - arrowStart[1], arrowEnd[0] - arrowStart[0]);
  const textLines = kind === "card" ? (item.text ?? "").split("\n") : lines(item.text ?? "", w - (paper ? 24 : 0), fontSize);
  return <g transform={`translate(${item.x} ${item.y})`}>
    {paper ? <rect width={w} height={h} rx={kind === "card" ? 7 : 2} fill={color} stroke={kind === "card" ? "#d7d0ed" : "#00000010"} filter="url(#board-paper-shadow)" /> : null}
    {kind === "rect" ? <rect width={w} height={h} rx="8" fill="transparent" stroke={color} strokeWidth="2" strokeDasharray={item.dashed ? "6 5" : undefined} /> : null}
    {kind === "ellipse" ? <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="transparent" stroke={color} strokeWidth="4" /> : null}
    {kind === "arrow" ? <path d={`M${arrowStart.join(" ")} L${arrowEnd.join(" ")} M${arrowEnd[0] - 20 * Math.cos(angle - .5)} ${arrowEnd[1] - 20 * Math.sin(angle - .5)} L${arrowEnd.join(" ")} L${arrowEnd[0] - 20 * Math.cos(angle + .5)} ${arrowEnd[1] - 20 * Math.sin(angle + .5)}`} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}
    {kind === "pen" || kind === "highlighter" ? <polyline points={item.points?.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeOpacity={kind === "highlighter" ? .3 : 1} strokeWidth={kind === "highlighter" ? 22 : item.size ? item.size / 6 : 4} strokeLinecap="round" strokeLinejoin="round" /> : null}
    {kind === "image" && item.src ? <image href={item.src} width={w} height={h} preserveAspectRatio="xMidYMid meet" /> : null}
    {kind === "text" || paper ? <text fill={paper ? "#241b42" : color} fontFamily="'BrenUp Hand', 'Comic Sans MS', 'Chalkboard SE', cursive" fontSize={fontSize} textAnchor={kind === "card" ? "middle" : "start"}>{textLines.map((line, i) => <tspan key={i} x={kind === "card" ? w / 2 : paper ? 16 : 0} y={(kind === "card" ? Math.max(fontSize, (h - textLines.length * fontSize * 1.2) / 2 + fontSize) : fontSize + (paper ? 13 : 0)) + i * fontSize * 1.2}>{line}</tspan>)}</text> : null}
  </g>;
});
export function BoardCanvas({ objects, tool, color, canEdit, busy, selected, onSelect, onChange, cursors, onCursor, zoom, svgRef }: {
  objects: Record<string, BoardObject>; tool: BoardTool; color: string; canEdit: boolean; busy: boolean; selected: string | null;
  onSelect: (id: string | null) => void; onChange: (items: Array<{ id: string; value: BoardObject | null }>) => Promise<boolean>;
  cursors: Record<string, BoardCursor>; onCursor: (x: number, y: number, laser: boolean) => void;
  zoom: number; svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const [draft, setDraft] = useState<BoardObject | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string; original?: BoardObject } | null>(null);
  const gesture = useRef<{ start: [number, number]; item: BoardObject; resize: boolean } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const pending = useRef<BoardObject | null>(null);
  function position(event: PointerEvent<SVGSVGElement>): [number, number] {
    const matrix = event.currentTarget.getScreenCTM();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix?.inverse());
    return [Math.max(0, Math.min(BOARD_WIDTH, point.x)), Math.max(0, Math.min(BOARD_HEIGHT, point.y))];
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const [x, y] = position(event);
    if (tool === "move" && scroll.current) { pan.current = { x: event.clientX, y: event.clientY, left: scroll.current.scrollLeft, top: scroll.current.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); return; }
    if (tool === "pointer" || tool === "laser") { onCursor(x, y, tool === "laser"); return; }
    if (!canEdit || busy) return;
    const target = (event.target as Element).closest("[data-object]");
    const id = target?.getAttribute("data-object");
    const item = id ? objects[id] : null;
    if (tool === "eraser") { if (item) void onChange([{ id: item.id, value: null }]); return; }
    if (tool === "select") {
      onSelect(item?.id ?? null);
      if (item) { gesture.current = { start: [x, y], item, resize: (event.target as Element).getAttribute("data-resize") === "true" }; setDraft(item); pending.current = item; event.currentTarget.setPointerCapture(event.pointerId); }
      return;
    }
    if (tool === "text" || tool === "sticky" || tool === "card") {
      const created: BoardObject = { id: crypto.randomUUID(), kind: tool, x, y, w: tool === "text" ? 450 : 220, h: tool === "sticky" ? 180 : 80, color: tool === "text" ? color : "#fff4ac", revision: 0, size: 30, text: "" };
      setDraft(created); onSelect(created.id); setEditing({ id: created.id, value: "", original: created }); return;
    }
    if (!["pen", "highlighter", "rect", "ellipse", "arrow"].includes(tool)) return;
    const created: BoardObject = { id: crypto.randomUUID(), kind: tool as BoardObject["kind"], x, y, w: 1, h: 1, color, revision: 0, points: tool === "pen" || tool === "highlighter" ? [[0, 0], [.1, .1]] : undefined };
    gesture.current = { start: [x, y], item: created, resize: false }; pending.current = created; setDraft(created);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (pan.current && scroll.current) { scroll.current.scrollLeft = pan.current.left - event.clientX + pan.current.x; scroll.current.scrollTop = pan.current.top - event.clientY + pan.current.y; return; }
    const [x, y] = position(event);
    if (gesture.current || tool === "select" || tool === "pointer" || tool === "laser") onCursor(x, y, tool === "laser");
    const active = gesture.current;
    if (!active) return;
    const dx = x - active.start[0], dy = y - active.start[1];
    let next: BoardObject;
    if (tool === "select") {
      const w = Math.max(30, active.item.w + dx), h = Math.max(30, active.item.h + dy);
      next = active.resize ? { ...active.item, w, h, ...(active.item.points ? { points: active.item.points.map(([px, py]) => [px * w / active.item.w, py * h / active.item.h] as [number, number]) } : {}) } : { ...active.item, x: active.item.x + dx, y: active.item.y + dy };
    }
    else if (tool === "pen" || tool === "highlighter") {
      const points = pending.current?.points ?? [];
      if (points.length >= 1500) return;
      next = { ...active.item, w: Math.max(1, Math.abs(dx)), h: Math.max(1, Math.abs(dy)), points: [...points, [dx, dy]] };
    } else next = { ...active.item, x: Math.min(x, active.start[0]), y: Math.min(y, active.start[1]), w: Math.max(2, Math.abs(dx)), h: Math.max(2, Math.abs(dy)), ...(tool === "arrow" ? { points: [[Math.max(0, -dx), Math.max(0, -dy)], [Math.max(0, dx), Math.max(0, dy)]] as [number, number][] } : {}) };
    pending.current = next; setDraft(next);
  }
  async function finish() {
    if (editing) return;
    pan.current = null;
    let next = pending.current;
    const original = gesture.current?.item;
    gesture.current = null; pending.current = null;
    if (next && !objects[next.id] && next.points?.length) {
      const minX = Math.min(...next.points.map((p) => p[0])), minY = Math.min(...next.points.map((p) => p[1]));
      const maxX = Math.max(...next.points.map((p) => p[0])), maxY = Math.max(...next.points.map((p) => p[1]));
      next = { ...next, x: next.x + minX, y: next.y + minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY), points: next.points.map(([x, y]) => [x - minX, y - minY]) };
    }
    if (next && JSON.stringify(next) !== JSON.stringify(objects[next.id])) {
      await onChange([{ id: next.id, value: next }]);
    }
    setDraft(null);
  }
  const displayed = Object.values(objects).map((item) => draft?.id === item.id ? draft : item);
  if (draft && !objects[draft.id]) displayed.push(draft);
  async function saveEditing() {
    if (!editing) return;
    const item = objects[editing.id] ?? editing.original;
    setEditing(null);
    if (!item) return;
    if (!editing.value.trim()) { if (objects[item.id]) await onChange([{ id: item.id, value: null }]); setDraft(null); onSelect(null); return; }
    if (editing.value !== item.text) await onChange([{ id: item.id, value: { ...item, text: editing.value } }]);
    setDraft(null);
  }
  return <div ref={scroll} className="wb-board-scroll">
    <svg ref={svgRef} tabIndex={0} className={`wb-canvas wb-tool-${tool}`} style={{ width: `${zoom}%` }} viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} role="img" aria-label="Collaborative whiteboard. Use Select to move objects, or choose a drawing tool." onPointerDown={start} onPointerMove={move} onPointerUp={() => void finish()} onPointerCancel={() => { gesture.current = null; pending.current = null; pan.current = null; setDraft(null); }}>
      <defs><filter id="board-paper-shadow" x="-15%" y="-15%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#584491" floodOpacity=".13" /></filter></defs>
      <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#ffffff" />
      {!displayed.length ? <g pointerEvents="none"><text x="550" y="365" textAnchor="middle" fill="#8059bb" fontSize="34" fontFamily="sans-serif">A little space for big ideas.</text><text x="550" y="415" textAnchor="middle" fill="#8e87a1" fontSize="21" fontFamily="sans-serif">{canEdit ? "Pick a tool, add a word, or start with a template." : "Your teacher is getting the board ready."}</text></g> : null}
      {displayed.map((item) => <g key={item.id} data-object={item.id} onDoubleClick={() => { if (!canEdit || !["text", "sticky", "card"].includes(item.kind)) return; setEditing({ id: item.id, value: item.text ?? "" }); }}><title>{item.text || item.kind}</title><BoardElement item={item} />{editing?.id === item.id && ["text", "sticky", "card"].includes(item.kind) ? <foreignObject x={item.x} y={item.y} width={Math.max(180, item.w)} height={Math.max(70, item.h)} data-export-omit="true"><textarea aria-label="Edit board text" maxLength={2000} autoFocus value={editing.value} onChange={(event) => setEditing((previous) => ({ ...previous, id: item.id, value: event.target.value }))} onBlur={() => void saveEditing()} onPointerDown={(event) => event.stopPropagation()} style={{ width: "100%", height: "100%", resize: "both", border: "2px solid #8550f6", borderRadius: 8, padding: 8, background: "#ffffffee", color: item.kind === "text" ? item.color : "#29215c", fontFamily: "'BrenUp Hand', 'Comic Sans MS', cursive", fontSize: item.size ?? 30, lineHeight: 1.2, outline: "none" }} /></foreignObject> : null}<rect x={item.x} y={item.y} width={item.w} height={item.h} fill="transparent" pointerEvents={editing?.id === item.id ? "none" : tool === "select" || tool === "eraser" ? "all" : "none"} />{selected === item.id && tool === "select" ? <g data-export-omit="true"><rect x={item.x - 4} y={item.y - 4} width={item.w + 8} height={item.h + 8} rx="4" stroke="#8550f6" strokeWidth="2" strokeDasharray="6 4" fill="none" pointerEvents="none" />{canEdit ? <rect data-resize="true" x={item.x + item.w - 5} y={item.y + item.h - 5} width="12" height="12" fill="#8550f6" stroke="white" cursor="nwse-resize" /> : null}</g> : null}</g>)}
      <g pointerEvents="none" data-export-omit="true">{Object.values(cursors).map((cursor) => { const target = [...displayed].reverse().find((item) => cursor.x >= item.x && cursor.x <= item.x + item.w && cursor.y >= item.y && cursor.y <= item.y + item.h); return target ? <rect key={`focus-${cursor.id}`} x={target.x - 5} y={target.y - 5} width={target.w + 10} height={target.h + 10} rx="5" fill="none" stroke={cursorColor(cursor.id)} strokeWidth="3" strokeDasharray="7 4" /> : null; })}{Object.values(cursors).map((cursor) => <g key={cursor.id} transform={`translate(${cursor.x} ${cursor.y})`}>{cursor.laser ? <><circle r="12" fill="#f4546560" /><circle r="5" fill="#ff3250" /></> : <><path d="M0 0L6 24L11 15L21 13Z" fill={cursorColor(cursor.id)} stroke="white" strokeWidth="2" /><rect x="14" y="20" width={Math.max(70, cursor.name.length * 8)} height="25" rx="5" fill={cursorColor(cursor.id)} /><text x="20" y="37" fill="white" fontSize="13" fontFamily="sans-serif">{cursor.name}</text></>}</g>)}</g>
    </svg>
  </div>;
}

export async function exportBoard(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-export-omit]").forEach((el) => el.remove());
  clone.setAttribute("width", String(BOARD_WIDTH * 2)); clone.setAttribute("height", String(BOARD_HEIGHT * 2)); clone.removeAttribute("style"); clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const fontResponse = await fetch("/brand/whiteboard-hand.ttf");
  if (fontResponse.ok) {
    const font = await fontResponse.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(font); });
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `@font-face{font-family:'BrenUp Hand';src:url('${dataUrl}')} `;
    clone.prepend(style);
  }
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = BOARD_WIDTH * 2; canvas.height = BOARD_HEIGHT * 2;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Could not export the board.");
    const download = URL.createObjectURL(png); const a = document.createElement("a"); a.href = download; a.download = `BrenUp-whiteboard-${new Date().toISOString().slice(0, 10)}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(download), 1000);
  } finally { URL.revokeObjectURL(url); }
}
